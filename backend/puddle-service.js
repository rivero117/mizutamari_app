"use strict";

const TURBIDITY_VALUES = new Set(["clear", "cloudy", "muddy"]);
const DEFAULT_RECENT_DAYS = 7;
const DEFAULT_NOW = new Date("2026-07-15T00:00:00+09:00");

function parseDiameterCm(value) {
  if (value === null || value === undefined) return 120;
  const match = String(value).match(/\d+(\.\d+)?/);
  return match ? Number(match[0]) : 120;
}

function diameterToSize(diameterCm) {
  const n = Number(diameterCm || 120);
  if (n < 150) return "small";
  if (n < 300) return "medium";
  return "large";
}

function muddinessToTurbidity(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "cloudy";
  if (n <= 3) return "clear";
  if (n <= 6) return "cloudy";
  return "muddy";
}

function sizeToFishCount(size, review = "") {
  const base = size === "small" ? 1 : size === "medium" ? 3 : 5;
  return (review || "").length > 30 ? base + 1 : base;
}

function parseObservedDate(value, now = new Date()) {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const text = String(value).trim();
  const monthDay = text.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (monthDay) {
    const year = now.getFullYear();
    const month = Number(monthDay[1]) - 1;
    const day = Number(monthDay[2]);
    const parsed = new Date(year, month, day, 12, 0, 0);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const isoDate = new Date(text);
  return Number.isNaN(isoDate.getTime()) ? null : isoDate;
}

function isWithinRecentDays(value, days = DEFAULT_RECENT_DAYS, now = new Date()) {
  const observedAt = parseObservedDate(value, now);
  if (!observedAt) return false;

  const recentDays = Math.max(1, Number(days || DEFAULT_RECENT_DAYS));
  const start = new Date(now);
  start.setDate(start.getDate() - recentDays);
  return observedAt >= start && observedAt <= now;
}

function officialFeatureToPuddle(feature, index, now = new Date()) {
  const [longitude, latitude] = feature.geometry.coordinates;
  const props = feature.properties || {};
  const diameterCm = parseDiameterCm(props["直径"]);
  const size = diameterToSize(diameterCm);
  const createdAt = props["観測日時"] || "";

  return {
    id: `geojson_puddle_${props["No"] || index + 1}`,
    source: "geojson",
    longitude,
    latitude,
    createdAt,
    observedAt: parseObservedDate(createdAt, now)?.toISOString() || "",
    diameterCm,
    size,
    turbidity: muddinessToTurbidity(props["濁り具合"]),
    transparency: muddinessToTurbidity(props["濁り具合"]),
    review: props["水たまりのレビュー"] || "",
    photoDataUrl: props["画像"] || "",
    contestEntry: false,
    fishCount: sizeToFishCount(size, props["水たまりのレビュー"] || ""),
    likes: 0,
    depth: props["水深"] || "",
    traffic: props["周囲の交通量"] || "",
    handWash: props["近くの手洗い場の有無"] || "",
    weather: props["天気予報"] || "",
    note: props["備考"] || "",
    googleMapsUrl: makeGoogleMapsDirectionsUrl({ latitude, longitude })
  };
}

function geoJsonToPuddles(geojson, now = new Date()) {
  if (!geojson || geojson.type !== "FeatureCollection") return [];

  return geojson.features
    .filter((feature) => feature.geometry && feature.geometry.type === "Point")
    .map((feature, index) => officialFeatureToPuddle(feature, index, now));
}

function normalizeQueryValue(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function filterPuddles(puddles, query = {}, now = new Date()) {
  const recentDays = normalizeQueryValue(query.recentDays);
  const turbidity = normalizeQueryValue(query.turbidity);
  const minDiameterCm = Number(normalizeQueryValue(query.minDiameterCm));
  const maxDiameterCm = Number(normalizeQueryValue(query.maxDiameterCm));
  const q = String(normalizeQueryValue(query.q) || "").trim().toLowerCase();

  return puddles.filter((puddle) => {
    if (recentDays !== undefined && !isWithinRecentDays(puddle.createdAt || puddle.observedAt, recentDays, now)) {
      return false;
    }

    if (turbidity && puddle.turbidity !== turbidity) return false;
    if (Number.isFinite(minDiameterCm) && Number(puddle.diameterCm) < minDiameterCm) return false;
    if (Number.isFinite(maxDiameterCm) && Number(puddle.diameterCm) > maxDiameterCm) return false;

    if (q) {
      const haystack = [
        puddle.id,
        puddle.size,
        puddle.turbidity,
        puddle.review,
        puddle.createdAt,
        puddle.note
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    return true;
  });
}

function toMapPin(puddle) {
  return {
    id: puddle.id,
    latitude: puddle.latitude,
    longitude: puddle.longitude,
    size: puddle.size,
    diameterCm: puddle.diameterCm,
    transparency: puddle.transparency || puddle.turbidity,
    turbidity: puddle.turbidity,
    observedAt: puddle.createdAt || puddle.observedAt || "",
    googleMapsUrl: puddle.googleMapsUrl || makeGoogleMapsDirectionsUrl(puddle),
    popup: {
      size: puddle.size,
      diameterCm: puddle.diameterCm,
      transparency: puddle.transparency || puddle.turbidity,
      observedAt: puddle.createdAt || puddle.observedAt || ""
    }
  };
}

function makeGoogleMapsDirectionsUrl(puddle, origin) {
  const destination = `${Number(puddle.latitude)},${Number(puddle.longitude)}`;
  const params = new URLSearchParams({
    api: "1",
    destination,
    travelmode: "walking"
  });

  if (origin && Number.isFinite(Number(origin.latitude)) && Number.isFinite(Number(origin.longitude))) {
    params.set("origin", `${Number(origin.latitude)},${Number(origin.longitude)}`);
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function sanitizeUserPuddle(input, now = new Date()) {
  const longitude = Number(input.longitude);
  const latitude = Number(input.latitude);
  const diameterCm = Number(input.diameterCm || input.sizeCm || 120);

  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    const error = new Error("longitude and latitude are required");
    error.statusCode = 400;
    throw error;
  }

  if (!Number.isFinite(diameterCm) || diameterCm <= 0 || diameterCm > 1000) {
    const error = new Error("diameterCm must be between 1 and 1000");
    error.statusCode = 400;
    throw error;
  }

  const turbidity = TURBIDITY_VALUES.has(input.turbidity) ? input.turbidity : "cloudy";
  const size = diameterToSize(diameterCm);
  const review = String(input.review || "").slice(0, 500);
  const createdAt = now.toISOString();
  const puddle = {
    id: `user_puddle_${now.getTime()}`,
    source: "user",
    longitude,
    latitude,
    createdAt,
    observedAt: createdAt,
    diameterCm,
    size,
    turbidity,
    transparency: input.transparency || turbidity,
    review,
    photoDataUrl: String(input.photoDataUrl || input.cameraPhotoDataUrl || ""),
    contestEntry: Boolean(input.contestEntry),
    fishCount: Number(input.fishCount || sizeToFishCount(size, review)),
    likes: 0,
    depth: String(input.depth || ""),
    traffic: String(input.traffic || ""),
    handWash: String(input.handWash || ""),
    weather: String(input.weather || ""),
    note: String(input.note || "").slice(0, 500)
  };

  return {
    ...puddle,
    googleMapsUrl: makeGoogleMapsDirectionsUrl(puddle)
  };
}

function createArFishOverlay(input = {}) {
  const waterDetected = Boolean(input.waterDetected);
  const confidence = Number(input.confidence || 0);
  const boundingBox = input.boundingBox || null;

  if (!waterDetected || confidence < 0.55 || !boundingBox) {
    return {
      waterDetected: false,
      confidence: Number.isFinite(confidence) ? confidence : 0,
      fish: []
    };
  }

  const fishCount = Math.min(Math.max(Number(input.fishCount || 3), 1), 8);
  const fish = Array.from({ length: fishCount }, (_, index) => ({
    id: `ar_fish_${index + 1}`,
    x: Number(boundingBox.x || 0) + Number(boundingBox.width || 0) * ((index + 1) / (fishCount + 1)),
    y: Number(boundingBox.y || 0) + Number(boundingBox.height || 0) * (index % 2 === 0 ? 0.42 : 0.62),
    scale: 0.8 + index * 0.05,
    rotation: index % 2 === 0 ? -8 : 9
  }));

  return {
    waterDetected: true,
    confidence,
    anchor: {
      type: "screen-space-bounding-box",
      boundingBox
    },
    fish
  };
}

module.exports = {
  DEFAULT_NOW,
  DEFAULT_RECENT_DAYS,
  parseDiameterCm,
  diameterToSize,
  muddinessToTurbidity,
  parseObservedDate,
  isWithinRecentDays,
  geoJsonToPuddles,
  filterPuddles,
  toMapPin,
  makeGoogleMapsDirectionsUrl,
  sanitizeUserPuddle,
  createArFishOverlay
};
