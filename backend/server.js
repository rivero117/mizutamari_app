"use strict";

const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const { URL } = require("url");
const {
  DEFAULT_RECENT_DAYS,
  createArFishOverlay,
  filterPuddles,
  geoJsonToPuddles,
  makeGoogleMapsDirectionsUrl,
  sanitizeSpecPost,
  sanitizeUserPuddle,
  toMapPin,
  toSpecPost
} = require("./puddle-service");

const ROOT_DIR = path.resolve(__dirname, "..");
const FRONTEND_DIR = path.join(ROOT_DIR, "frontend");
const DATA_DIR = path.join(ROOT_DIR, "data");
const SHARED_DIR = path.join(ROOT_DIR, "shared");
const OFFICIAL_GEOJSON_PATH = path.join(DATA_DIR, "mizutamari.geojson");
const USER_PUDDLES_PATH = path.join(DATA_DIR, "user-puddles.json");
const PORT = Number(process.env.PORT || 3000);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".geojson": "application/geo+json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml; charset=utf-8"
};

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(body);
}

function sendText(res, statusCode, message) {
  res.writeHead(statusCode, { "content-type": "text/plain; charset=utf-8" });
  res.end(message);
}

async function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJsonFile(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

async function loadOfficialPuddles() {
  const geojson = await readJsonFile(OFFICIAL_GEOJSON_PATH, {
    type: "FeatureCollection",
    features: []
  });

  return geoJsonToPuddles(geojson);
}

async function loadUserPuddles() {
  return readJsonFile(USER_PUDDLES_PATH, []);
}

async function readRequestJson(req) {
  const chunks = [];
  let total = 0;

  for await (const chunk of req) {
    total += chunk.length;
    if (total > 8 * 1024 * 1024) {
      const error = new Error("request body is too large");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  const body = Buffer.concat(chunks).toString("utf8");
  return body ? JSON.parse(body) : {};
}

async function handleApi(req, res, pathname) {
  if (req.method === "GET" && pathname === "/api/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && pathname === "/api/puddles") {
    const [official, user] = await Promise.all([loadOfficialPuddles(), loadUserPuddles()]);
    const puddles = filterPuddles([...official, ...user], Object.fromEntries(req.urlSearchParams));
    sendJson(res, 200, { puddles });
    return;
  }

  if (req.method === "GET" && pathname === "/api/posts") {
    const [official, user] = await Promise.all([loadOfficialPuddles(), loadUserPuddles()]);
    const puddles = filterPuddles([...official, ...user], Object.fromEntries(req.urlSearchParams));
    sendJson(res, 200, { posts: puddles.map(toSpecPost) });
    return;
  }

  if (req.method === "GET" && pathname === "/api/home/pins") {
    const [official, user] = await Promise.all([loadOfficialPuddles(), loadUserPuddles()]);
    const query = Object.fromEntries(req.urlSearchParams);
    const recentDays = query.recentDays || DEFAULT_RECENT_DAYS;
    const puddles = filterPuddles([...official, ...user], { ...query, recentDays });
    sendJson(res, 200, {
      recentDays: Number(recentDays),
      pins: puddles.map(toMapPin)
    });
    return;
  }

  if (req.method === "POST" && pathname === "/api/puddles") {
    const input = await readRequestJson(req);
    const puddle = sanitizeUserPuddle(input);
    const userPuddles = await loadUserPuddles();
    userPuddles.push(puddle);
    await writeJsonFile(USER_PUDDLES_PATH, userPuddles);
    sendJson(res, 201, { puddle });
    return;
  }

  if (req.method === "POST" && pathname === "/api/posts") {
    const input = await readRequestJson(req);
    const puddle = sanitizeSpecPost(input);
    const userPuddles = await loadUserPuddles();
    userPuddles.push(puddle);
    await writeJsonFile(USER_PUDDLES_PATH, userPuddles);
    sendJson(res, 201, { post: toSpecPost(puddle) });
    return;
  }

  if (req.method === "GET" && pathname.match(/^\/api\/puddles\/[^/]+\/directions$/)) {
    const id = decodeURIComponent(pathname.split("/")[3]);
    const [official, user] = await Promise.all([loadOfficialPuddles(), loadUserPuddles()]);
    const puddle = [...official, ...user].find((item) => item.id === id);

    if (!puddle) {
      sendJson(res, 404, { error: "Puddle not found" });
      return;
    }

    const originLatitude = Number(req.urlSearchParams.get("originLatitude"));
    const originLongitude = Number(req.urlSearchParams.get("originLongitude"));
    const origin =
      Number.isFinite(originLatitude) && Number.isFinite(originLongitude)
        ? { latitude: originLatitude, longitude: originLongitude }
        : null;

    sendJson(res, 200, {
      id: puddle.id,
      googleMapsUrl: makeGoogleMapsDirectionsUrl(puddle, origin)
    });
    return;
  }

  if (req.method === "POST" && pathname === "/api/ar/water-detection") {
    const input = await readRequestJson(req);
    sendJson(res, 200, createArFishOverlay(input));
    return;
  }

  if (req.method === "DELETE" && pathname === "/api/puddles/user") {
    await writeJsonFile(USER_PUDDLES_PATH, []);
    sendJson(res, 200, { ok: true });
    return;
  }

  sendJson(res, 404, { error: "API route not found" });
}

async function serveStatic(req, res, pathname) {
  const requestPath = pathname === "/" ? "/index.html" : pathname;
  const servesData = requestPath.startsWith("/data/");
  const servesShared = requestPath.startsWith("/shared/");
  const baseDir = servesData ? DATA_DIR : servesShared ? SHARED_DIR : FRONTEND_DIR;
  const relativePath = servesData
    ? requestPath.replace(/^\/data/, "")
    : servesShared
      ? requestPath.replace(/^\/shared/, "")
      : requestPath;
  const filePath = path.resolve(baseDir, `.${decodeURIComponent(relativePath)}`);

  if (!filePath.startsWith(baseDir)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  try {
    const file = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "content-type": MIME_TYPES[ext] || "application/octet-stream",
      "cache-control": "no-store"
    });
    res.end(file);
  } catch (error) {
    if (error.code === "ENOENT") {
      sendText(res, 404, "Not found");
      return;
    }
    throw error;
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    req.urlSearchParams = url.searchParams;

    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url.pathname);
      return;
    }

    await serveStatic(req, res, url.pathname);
  } catch (error) {
    console.error(error);
    sendJson(res, error.statusCode || 500, { error: error.message || "Server error" });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Mizutamari app running at http://127.0.0.1:${PORT}`);
});
