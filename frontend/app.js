"use strict";

const GEOJSON_URL = "../data/mizutamari.geojson";
const STORAGE_KEY = "mizutaPosts";
const LEGACY_STORAGE_KEY = "ameato_user_puddle_posts_v11";
const START_CENTER = [134.3612, 33.9742];

const screens = Array.from(document.querySelectorAll("[data-screen]"));
const navButtons = Array.from(document.querySelectorAll("[data-nav]"));
const statusEl = document.getElementById("status");
const arStatusEl = document.getElementById("arStatus");
const dataBox = document.getElementById("dataBox");
const sourceBadge = document.getElementById("sourceBadge");
const puddleCount = document.getElementById("puddleCount");
const playViewBtn = document.getElementById("playViewBtn");
const mapViewBtn = document.getElementById("mapViewBtn");
const filterToggleBtn = document.getElementById("filterToggleBtn");
const filterSummary = document.getElementById("filterSummary");
const homeFilterPanel = document.getElementById("homeFilterPanel");
const minSizeInput = document.getElementById("minSizeInput");
const maxSizeInput = document.getElementById("maxSizeInput");
const transparencyFilterInput = document.getElementById("transparencyFilterInput");
const observedDaysInput = document.getElementById("observedDaysInput");
const resetFiltersBtn = document.getElementById("resetFiltersBtn");
const clickModeBtn = document.getElementById("clickModeBtn");
const locateBtn = document.getElementById("locateBtn");
const addHereBtn = document.getElementById("addHereBtn");
const clearBtn = document.getElementById("clearBtn");
const playerAvatarInput = document.getElementById("playerAvatarInput");
const postForm = document.getElementById("postForm");
const placeText = document.getElementById("placeText");
const diameterInput = document.getElementById("diameterInput");
const transparencyInput = document.getElementById("transparencyInput");
const observedAtInput = document.getElementById("observedAtInput");
const reviewInput = document.getElementById("reviewInput");
const photoInput = document.getElementById("photoInput");
const cancelPostBtn = document.getElementById("cancelPostBtn");
const postCamera = document.getElementById("postCamera");
const arCamera = document.getElementById("arCamera");

let currentView = "play";
let clickMode = false;
let selectedPoint = null;
let draftPinMarker = null;
let playerMarker = null;
let lastKnownPosition = null;
let apiAvailable = false;
let mapReady = false;
let activeCameraStream = null;
let puddles = [];
let allHomePuddles = [];
let officialPuddles = [];
let remoteUserPuddles = [];
let homeFilters = {
  minSize: "",
  maxSize: "",
  transparency: "",
  observedDays: "7"
};

const markers = [];

const map = new maplibregl.Map({
  container: "map",
  center: START_CENTER,
  zoom: 18.4,
  pitch: 45,
  bearing: -20,
  style: {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        maxzoom: 19,
        attribution: "© OpenStreetMap contributors"
      }
    },
    layers: [
      {
        id: "osm",
        type: "raster",
        source: "osm",
        paint: {
          "raster-opacity": 0.56,
          "raster-saturation": -0.35,
          "raster-brightness-min": 0.78,
          "raster-brightness-max": 1
        }
      }
    ]
  }
});

map.addControl(new maplibregl.NavigationControl(), "top-right");
map.on("zoom", updateMarkerScale);
map.on("move", updateMarkerScale);
map.on("click", (event) => {
  if (!clickMode) return;
  placeDraftPin(event.lngLat.lng, event.lngLat.lat);
});

map.on("load", async () => {
  mapReady = true;
  addGeoJsonLayers();
  await loadPuddles();
  setView("play", false);
});

async function loadPuddles() {
  statusEl.textContent = "水たまりデータを読み込み中...";

  try {
    const response = await fetch("/api/puddles", { cache: "no-store" });
    if (!response.ok) throw new Error("API is not available");
    const data = await response.json();
    const apiPuddles = data.puddles || [];
    const localPuddles = loadLocalUserPuddles();
    officialPuddles = apiPuddles.filter((puddle) => puddle.source !== "user");
    remoteUserPuddles = apiPuddles.filter((puddle) => puddle.source === "user");
    puddles = mergePuddleLists(officialPuddles, [...remoteUserPuddles, ...localPuddles]);
    allHomePuddles = puddles;
    apiAvailable = true;
    sourceBadge.textContent = "API";
  } catch {
    const [official, user] = await Promise.all([loadOfficialFromGeoJson(), loadLocalUserPuddles()]);
    officialPuddles = official;
    remoteUserPuddles = [];
    puddles = mergePuddleLists(official, user);
    allHomePuddles = puddles;
    apiAvailable = false;
    sourceBadge.textContent = "Static";
  }

  renderPins(loadAllPosts());
  updateGeoJsonLayer();
  updateDataBox();
  statusEl.textContent = `${puddles.length}個の水たまりを読み込みました。`;
}

async function loadOfficialFromGeoJson() {
  try {
    const response = await fetch(GEOJSON_URL);
    if (!response.ok) throw new Error("GeoJSON load failed");
    return geoJsonToPuddles(await response.json());
  } catch {
    return [];
  }
}

function loadLocalUserPuddles() {
  return loadPosts().map(specPostToPuddle);
}

function saveLocalUserPuddles(userPuddles) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(userPuddles.map(puddleToSpecPost)));
}

function loadPosts() {
  const stored = readPostArray(STORAGE_KEY);
  if (stored.length > 0 || localStorage.getItem(STORAGE_KEY)) return stored.map(normalizeSpecPost).filter(Boolean);

  const legacy = readPostArray(LEGACY_STORAGE_KEY).map(puddleToSpecPost).filter(Boolean);
  if (legacy.length > 0) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy));
  }
  return legacy;
}

function savePost(post) {
  const normalized = normalizeSpecPost(post);
  if (!normalized) throw new TypeError("投稿データの形式が正しくありません。");

  const posts = loadPosts();
  const index = posts.findIndex((item) => item.id === normalized.id);
  if (index >= 0) posts[index] = normalized;
  else posts.push(normalized);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
  return normalized;
}

function loadAllPosts() {
  return mergeSpecPosts(remoteUserPuddles.map(puddleToSpecPost), loadPosts());
}

function mergeSpecPosts(...groups) {
  const byId = new Map();
  groups.flat().forEach((post) => {
    const normalized = normalizeSpecPost(post);
    if (normalized) byId.set(normalized.id, normalized);
  });
  return Array.from(byId.values());
}

function readPostArray(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeSpecPost(post) {
  const lat = Number(post.lat ?? post.latitude);
  const lng = Number(post.lng ?? post.longitude);
  const size = Number(
    typeof post.size === "number" ? post.size : post.diameterCm ?? post.sizeCm ?? 120
  );
  const observedAt = safeIsoDate(post.observedAt || post.createdAt, new Date().toISOString());
  const createdAt = safeIsoDate(post.createdAt || observedAt, observedAt);

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(size)) return null;

  return {
    id: String(post.id || `post-${Date.now()}`),
    lat,
    lng,
    size,
    transparency: normalizeTransparency(post.transparency, post.turbidity),
    observedAt,
    image: String(post.image || post.photoDataUrl || ""),
    comment: String(post.comment || post.review || ""),
    depth: String(post.depth || ""),
    weather: String(post.weather || ""),
    createdAt
  };
}

function safeIsoDate(value, fallback) {
  const date = new Date(value || fallback);
  if (Number.isNaN(date.getTime())) return new Date(fallback).toISOString();
  return date.toISOString();
}

function puddleToSpecPost(puddle) {
  return normalizeSpecPost({
    id: puddle.id,
    lat: puddle.latitude,
    lng: puddle.longitude,
    size: puddle.diameterCm,
    transparency: puddle.transparency,
    turbidity: puddle.turbidity,
    observedAt: puddle.observedAt || puddle.createdAt,
    image: puddle.photoDataUrl,
    comment: puddle.review,
    depth: puddle.depth,
    weather: puddle.weather,
    createdAt: puddle.createdAt
  });
}

function specPostToPuddle(post) {
  const normalized = normalizeSpecPost(post);
  const diameterCm = Number(normalized.size || 120);
  return {
    id: normalized.id,
    source: "user",
    longitude: Number(normalized.lng),
    latitude: Number(normalized.lat),
    createdAt: normalized.observedAt,
    observedAt: normalized.observedAt,
    size: diameterToSize(diameterCm),
    diameterCm,
    transparency: normalized.transparency,
    turbidity: transparencyToTurbidity(normalized.transparency),
    review: normalized.comment,
    photoDataUrl: normalized.image,
    contestEntry: false,
    fishCount: sizeToFishCount(diameterToSize(diameterCm), normalized.comment),
    likes: 0,
    depth: normalized.depth,
    traffic: "",
    handWash: "",
    weather: normalized.weather,
    note: ""
  };
}

function normalizeTransparency(value, turbidity = "cloudy") {
  const numeric = Number(value);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 5) return numeric;
  if (turbidity === "clear") return 5;
  if (turbidity === "muddy") return 1;
  return 3;
}

function transparencyToTurbidity(value) {
  const transparency = normalizeTransparency(value);
  if (transparency >= 4) return "clear";
  if (transparency <= 1) return "muddy";
  return "cloudy";
}

function mergePuddleLists(base, user) {
  const byId = new Map();
  [...base, ...user].forEach((puddle) => {
    if (puddle && puddle.id) byId.set(puddle.id, puddle);
  });
  return Array.from(byId.values());
}

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

function geoJsonToPuddles(geojson) {
  if (!geojson || geojson.type !== "FeatureCollection") return [];

  return geojson.features
    .filter((feature) => feature.geometry && feature.geometry.type === "Point")
    .map((feature, index) => {
      const [longitude, latitude] = feature.geometry.coordinates;
      const props = feature.properties || {};
      const diameterCm = parseDiameterCm(props["直径"]);
      const size = diameterToSize(diameterCm);
      const turbidity = muddinessToTurbidity(props["濁り具合"]);
      const observedAt = parseObservedDate(props["観測日時"])?.toISOString() || "";

      return {
        id: `geojson_puddle_${props["No"] || index + 1}`,
        source: "geojson",
        longitude,
        latitude,
        createdAt: props["観測日時"] || "",
        observedAt,
        size,
        diameterCm,
        turbidity,
        transparency: normalizeTransparency(undefined, turbidity),
        review: props["水たまりのレビュー"] || "",
        photoDataUrl: props["画像"] || "",
        contestEntry: false,
        fishCount: size === "small" ? 1 : size === "medium" ? 3 : 5,
        likes: 0,
        depth: props["水深"] || "",
        traffic: props["周囲の交通量"] || "",
        handWash: props["近くの手洗い場の有無"] || "",
        weather: props["天気予報"] || "",
        note: props["備考"] || ""
      };
    });
}

function makePuddleGeoJson() {
  return {
    type: "FeatureCollection",
    features: puddles.map((puddle) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [puddle.longitude, puddle.latitude]
      },
      properties: {
        id: puddle.id,
        source: puddle.source || "user",
        observedAt: puddle.createdAt || "",
        diameterCm: puddle.diameterCm || "",
        size: puddle.size,
        turbidity: puddle.turbidity,
        review: puddle.review || "",
        fishCount: puddle.fishCount,
        contestEntry: Boolean(puddle.contestEntry),
        likes: puddle.likes || 0,
        depth: puddle.depth || "",
        traffic: puddle.traffic || "",
        handWash: puddle.handWash || "",
        weather: puddle.weather || "",
        note: puddle.note || ""
      }
    }))
  };
}

function updateDataBox() {
  puddleCount.textContent = String(puddles.length);
  dataBox.textContent = JSON.stringify(makePuddleGeoJson(), null, 2);
  updateFilterSummary();
}

function addGeoJsonLayers() {
  map.addSource("puddle-geojson", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] }
  });

  map.addLayer({
    id: "puddle-map-circles",
    type: "circle",
    source: "puddle-geojson",
    paint: {
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["to-number", ["get", "diameterCm"]],
        50,
        5,
        120,
        8,
        240,
        12,
        420,
        18,
        600,
        24
      ],
      "circle-color": [
        "match",
        ["get", "turbidity"],
        "clear",
        "#2BBAA5",
        "cloudy",
        "#93D3AE",
        "muddy",
        "#F9A822",
        "#2BBAA5"
      ],
      "circle-opacity": 0.72,
      "circle-stroke-color": ["case", ["==", ["get", "source"], "geojson"], "#20373B", "#F96635"],
      "circle-stroke-width": ["case", ["==", ["get", "source"], "geojson"], 2, 4]
    }
  });

  map.on("click", "puddle-map-circles", (event) => {
    if (!event.features || !event.features[0]) return;
    const props = event.features[0].properties;
    const puddle = puddles.find((item) => item.id === props.id);
    if (puddle) showPuddlePopup(puddle);
  });
}

function updateGeoJsonLayer() {
  const source = map.getSource("puddle-geojson");
  if (source) source.setData(makePuddleGeoJson());
}

function getPuddleCenter() {
  if (puddles.length === 0) return START_CENTER;
  const sum = puddles.reduce(
    (acc, puddle) => {
      acc.lng += Number(puddle.longitude);
      acc.lat += Number(puddle.latitude);
      return acc;
    },
    { lng: 0, lat: 0 }
  );
  return [sum.lng / puddles.length, sum.lat / puddles.length];
}

function setView(view, animate = true) {
  currentView = view;
  playViewBtn.classList.toggle("active", view === "play");
  mapViewBtn.classList.toggle("active", view === "map");

  const center = lastKnownPosition
    ? [lastKnownPosition.longitude, lastKnownPosition.latitude]
    : getPuddleCenter();

  if (view === "play") {
    setLayerVisibility("puddle-map-circles", "none");
    markers.forEach(({ el }) => {
      el.style.display = "block";
    });
    map.easeTo({ center, zoom: 19.1, pitch: 58, bearing: -28, duration: animate ? 700 : 0 });
    statusEl.textContent = "近い視点で水たまりを探します。";
  } else {
    setLayerVisibility("puddle-map-circles", "visible");
    markers.forEach(({ el }) => {
      el.style.display = "none";
    });
    map.easeTo({ center: getPuddleCenter(), zoom: 16.4, pitch: 0, bearing: 0, duration: animate ? 700 : 0 });
    statusEl.textContent = "上から水たまりを見ています。";
  }

  updateMarkerScale();
}

function setLayerVisibility(layerId, visibility) {
  if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", visibility);
}

function renderPins(posts = loadPosts()) {
  const visibleUserPuddles = posts.filter(isVisiblePost).map(specPostToPuddle);
  const baseSource = allHomePuddles.length > 0 ? allHomePuddles : puddles;
  const basePuddles = baseSource.filter((puddle) => puddle.source !== "user");
  const fallbackBase = basePuddles.length > 0 ? basePuddles : officialPuddles;
  allHomePuddles = mergePuddleLists(fallbackBase, visibleUserPuddles);
  puddles = applyHomeFilters(allHomePuddles);
  renderPuddles();
  updateGeoJsonLayer();
  updateDataBox();
}

function renderPuddles() {
  markers.forEach(({ marker }) => marker.remove());
  markers.length = 0;

  puddles.forEach((puddle) => {
    const el = makePuddleElement(puddle);
    const marker = new maplibregl.Marker({ element: el, anchor: "center" })
      .setLngLat([puddle.longitude, puddle.latitude])
      .addTo(map);
    markers.push({ marker, el, puddle });
  });

  updateMarkerScale();
}

function isVisiblePost(post, now = new Date()) {
  const observedAt = new Date(post.observedAt);
  if (Number.isNaN(observedAt.getTime())) return false;
  const start = new Date(now);
  start.setDate(start.getDate() - 7);
  return observedAt >= start && observedAt <= now;
}

function applyHomeFilters(items) {
  return items.filter((puddle) => {
    const diameterCm = Number(puddle.diameterCm);
    if ((homeFilters.minSize || homeFilters.maxSize) && !Number.isFinite(diameterCm)) return false;
    if (homeFilters.minSize && diameterCm < Number(homeFilters.minSize)) return false;
    if (homeFilters.maxSize && diameterCm > Number(homeFilters.maxSize)) return false;
    if (homeFilters.transparency && Number(puddle.transparency) !== Number(homeFilters.transparency)) {
      return false;
    }
    if (
      homeFilters.observedDays &&
      !isPuddleObservedWithinDays(puddle, Number(homeFilters.observedDays))
    ) {
      return false;
    }
    return true;
  });
}

function isPuddleObservedWithinDays(puddle, days, now = new Date()) {
  const observedAt = parseObservedDate(puddle.observedAt || puddle.createdAt, now);
  if (!observedAt) return false;
  const start = new Date(now);
  start.setDate(start.getDate() - Math.max(1, Number(days || 7)));
  return observedAt >= start && observedAt <= now;
}

function parseObservedDate(value, now = new Date()) {
  if (!value) return null;
  const text = String(value).trim();
  const monthDay = text.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (monthDay) {
    const parsed = new Date(now.getFullYear(), Number(monthDay[1]) - 1, Number(monthDay[2]), 12, 0, 0);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function syncHomeFiltersFromInputs() {
  homeFilters = {
    minSize: minSizeInput.value,
    maxSize: maxSizeInput.value,
    transparency: transparencyFilterInput.value,
    observedDays: observedDaysInput.value
  };
}

function resetHomeFilters() {
  minSizeInput.value = "";
  maxSizeInput.value = "";
  transparencyFilterInput.value = "";
  observedDaysInput.value = "7";
  syncHomeFiltersFromInputs();
  refreshHome();
}

function updateFilterSummary() {
  const parts = [];
  if (homeFilters.minSize) parts.push(`${homeFilters.minSize}cm以上`);
  if (homeFilters.maxSize) parts.push(`${homeFilters.maxSize}cm以下`);
  if (homeFilters.transparency) parts.push(`透明度${homeFilters.transparency}`);
  if (homeFilters.observedDays) parts.push(`${homeFilters.observedDays}日以内`);
  filterSummary.textContent = parts.length > 0 ? parts.join(" / ") : "全件表示";
}

function makePuddleElement(puddle) {
  const el = document.createElement("div");
  el.className = "puddle-marker";
  el.innerHTML = `
    <div class="puddle-scale ${puddle.turbidity}">
      <div class="puddle-ring"></div>
      <div class="puddle-drop">💧</div>
      <div class="puddle-blob"></div>
      <div class="puddle-shine"></div>
      <div class="fish-number">${escapeHtml(puddle.fishCount)}</div>
      ${puddle.contestEntry ? '<div class="contest-badge">🏆</div>' : ""}
    </div>
  `;
  el.addEventListener("click", (event) => {
    event.stopPropagation();
    showPuddlePopup(puddle);
  });
  return el;
}

function updateMarkerScale() {
  const base = zoomScale();
  markers.forEach(({ el, puddle }) => {
    const scaleTarget = el.querySelector(".puddle-scale");
    if (!scaleTarget) return;
    scaleTarget.style.transform = `scale(${base * diameterToScale(puddle.diameterCm)})`;
    scaleTarget.style.opacity = map.getZoom() < 13.5 ? "0.76" : "1";
  });
}

function zoomScale() {
  const z = map.getZoom();
  if (z < 13) return 0.1;
  if (z < 14) return 0.14;
  if (z < 15) return 0.2;
  if (z < 16) return 0.3;
  if (z < 17) return 0.46;
  if (z < 18) return 0.68;
  if (z < 19) return 1;
  if (z < 20) return 1.25;
  return 1.5;
}

function diameterToScale(diameterCm) {
  const diameter = Number(diameterCm || 120);
  return Math.min(Math.max(Math.sqrt(diameter / 120), 0.55), 2.2);
}

function labelTurbidity(turbidity) {
  if (turbidity === "clear") return "すきとおり";
  if (turbidity === "muddy") return "にごり";
  return "ちょいにごり";
}

function makeGoogleMapsDirectionsUrl(puddle) {
  const params = new URLSearchParams({
    api: "1",
    destination: `${Number(puddle.lat ?? puddle.latitude)},${Number(puddle.lng ?? puddle.longitude)}`
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function openGoogleMaps(lat, lng) {
  window.open(makeGoogleMapsDirectionsUrl({ lat, lng }), "_blank", "noopener,noreferrer");
}

function showPuddlePopup(puddle) {
  const photoUrl = normalizePopupPhotoUrl(puddle.photoDataUrl || puddle.image);
  const photoHtml = photoUrl
    ? `<img class="popup-photo" src="${escapeAttribute(photoUrl)}" alt="投稿された水たまりの写真" />`
    : "";
  const html = `
    <strong>${puddle.contestEntry ? "🏆 " : ""}水たまり</strong><br>
    観測日時：${escapeHtml(puddle.observedAt || puddle.createdAt || "不明")}<br>
    大きさ：${escapeHtml(puddle.diameterCm ? `直径 ${puddle.diameterCm}cm` : "不明")}<br>
    透明度：${escapeHtml(formatTransparency(puddle))}<br>
    ${photoHtml}
    <button class="directions-link" type="button" onclick="openGoogleMaps(${Number(puddle.latitude)}, ${Number(puddle.longitude)})">Google Mapで経路を見る</button>
  `;
  new maplibregl.Popup({ offset: 28 }).setLngLat([puddle.longitude, puddle.latitude]).setHTML(html).addTo(map);
}

function formatTransparency(puddle) {
  const transparency = Number(puddle.transparency);
  if (Number.isInteger(transparency) && transparency >= 1 && transparency <= 5) {
    return String(transparency);
  }
  return labelTurbidity(puddle.turbidity);
}

function normalizePopupPhotoUrl(value) {
  const url = String(value || "").trim();
  if (!url) return "";
  if (url.startsWith("data:image/") || url.startsWith("blob:")) return url;
  if (url.startsWith("https://") || url.startsWith("http://")) return url;
  return "";
}

function escapeAttribute(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function placeDraftPin(longitude, latitude) {
  clearDraftPin();
  selectedPoint = { longitude, latitude };

  const el = document.createElement("div");
  el.innerHTML = `
    <div class="draft-pin-card">
      この場所でいい？
      <button type="button">ここに水たまりを作る</button>
    </div>
    <div class="draft-pin-icon">📍</div>
  `;

  el.querySelector("button").addEventListener("click", (event) => {
    event.stopPropagation();
    openPostForm(longitude, latitude);
  });
  el.addEventListener("click", (event) => event.stopPropagation());

  draftPinMarker = new maplibregl.Marker({ element: el, anchor: "bottom" })
    .setLngLat([longitude, latitude])
    .addTo(map);

  map.easeTo({
    center: [longitude, latitude],
    zoom: Math.max(map.getZoom(), 18.8),
    pitch: currentView === "play" ? 58 : 0,
    bearing: currentView === "play" ? -28 : 0,
    duration: 500
  });
  statusEl.textContent = "ピンを刺しました。投稿ボタンで登録できます。";
}

function clearDraftPin() {
  if (!draftPinMarker) return;
  draftPinMarker.remove();
  draftPinMarker = null;
}

function openPostForm(longitude, latitude) {
  selectedPoint = { longitude, latitude };
  placeText.textContent = "投稿位置を取得しました。";
  diameterInput.value = 120;
  transparencyInput.value = "3";
  observedAtInput.value = toDateTimeLocalValue(new Date());
  reviewInput.value = "";
  photoInput.value = "";
  showScreen("post");
}

function closePostForm() {
  selectedPoint = null;
  clearDraftPin();
  showScreen("home");
}

async function submitPost(event) {
  event.preventDefault();

  if (!selectedPoint) {
    placeText.textContent = "現在地を取得中...";
    try {
      selectedPoint = await getCurrentPoint();
    } catch {
      placeText.textContent = "現在地を取得できませんでした。";
      return;
    }
  }

  const diameterCm = Number(diameterInput.value || 120);
  const review = reviewInput.value.trim();
  const observedAt = observedAtInput.value ? new Date(observedAtInput.value) : new Date();
  const draftPost = normalizeSpecPost({
    id: `post-${Date.now()}`,
    lat: selectedPoint.latitude,
    lng: selectedPoint.longitude,
    size: diameterCm,
    transparency: Number(transparencyInput.value),
    observedAt: observedAt.toISOString(),
    image: await readPhotoAsDataUrl(photoInput.files[0]),
    comment: review,
    createdAt: new Date().toISOString()
  });
  if (!draftPost) {
    placeText.textContent = "投稿データの形式が正しくありません。";
    return;
  }

  let post = draftPost;

  if (apiAvailable) {
    try {
      const response = await fetch("/api/posts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draftPost)
      });
      if (!response.ok) throw new Error("Post failed");
      post = (await response.json()).post || draftPost;
    } catch {
      apiAvailable = false;
      sourceBadge.textContent = "Static";
    }
  }

  savePost(post);
  showScreen("home");
  refreshHome();
  statusEl.textContent = `直径${diameterCm}cmの水たまりを投稿しました。`;
}

function toDateTimeLocalValue(date) {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function sizeToFishCount(size, review) {
  let base = size === "small" ? 1 : size === "medium" ? 3 : 5;
  if ((review || "").length > 30) base += 1;
  return base + Math.floor(Math.random() * 2);
}

function readPhotoAsDataUrl(file) {
  return new Promise((resolve) => {
    if (!file) {
      resolve("");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

function locateUserOnly() {
  locateUser((longitude, latitude) => {
    showPlayer(longitude, latitude);
    map.easeTo({ center: [longitude, latitude], zoom: currentView === "play" ? 19.1 : 16.6, duration: 900 });
    statusEl.textContent = "現在地を表示しました。";
  });
}

function locateUserAndOpenForm() {
  locateUser((longitude, latitude) => {
    showPlayer(longitude, latitude);
    openPostForm(longitude, latitude);
  });
}

function locateUser(callback) {
  if (!navigator.geolocation) {
    statusEl.textContent = "このブラウザでは現在地が使えません。";
    return;
  }

  statusEl.textContent = "現在地を取得中... 位置情報を許可してください。";
  navigator.geolocation.getCurrentPosition(
    (pos) => callback(pos.coords.longitude, pos.coords.latitude),
    handleGeoLocationError,
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
}

function getCurrentPoint() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not available"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ longitude: pos.coords.longitude, latitude: pos.coords.latitude }),
      reject,
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

function handleGeoLocationError(err) {
  if (err.code === 1) statusEl.textContent = "位置情報がブロックされています。";
  else if (err.code === 2) statusEl.textContent = "現在地を特定できませんでした。";
  else if (err.code === 3) statusEl.textContent = "現在地取得がタイムアウトしました。";
  else statusEl.textContent = "現在地を取得できませんでした。";
}

function getPlayerEmoji() {
  if (playerAvatarInput.value === "crab") return "🦀";
  if (playerAvatarInput.value === "octopus") return "🐙";
  return "🦐";
}

function getPlayerName() {
  if (playerAvatarInput.value === "crab") return "かに";
  if (playerAvatarInput.value === "octopus") return "たこ";
  return "えび";
}

function showPlayer(longitude, latitude) {
  lastKnownPosition = { longitude, latitude };
  const html = `
    <div class="player-label">${getPlayerName()}</div>
    <div class="player-bubble">${getPlayerEmoji()}</div>
  `;

  if (!playerMarker) {
    const el = document.createElement("div");
    el.className = "player-marker";
    el.innerHTML = html;
    playerMarker = new maplibregl.Marker({ element: el, anchor: "bottom" })
      .setLngLat([longitude, latitude])
      .addTo(map);
  } else {
    playerMarker.getElement().innerHTML = html;
    playerMarker.setLngLat([longitude, latitude]);
  }
}

async function clearUserPuddles() {
  const ok = confirm("自分が追加した投稿だけ消します。公式データは残ります。");
  if (!ok) return;

  if (apiAvailable) {
    try {
      await fetch("/api/puddles/user", { method: "DELETE" });
    } catch {
      apiAvailable = false;
      sourceBadge.textContent = "Static";
    }
  }

  saveLocalUserPuddles([]);
  remoteUserPuddles = [];
  puddles = puddles.filter((puddle) => puddle.source !== "user");
  renderPins([]);
  statusEl.textContent = "自分の投稿を消しました。";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
    .replaceAll("\n", "<br>");
}

function showScreen(screenName) {
  const nextScreen = screens.find((screen) => screen.dataset.screen === screenName);
  if (!nextScreen) return;

  stopCamera();
  screens.forEach((screen) => {
    screen.hidden = screen !== nextScreen;
  });
  navButtons.forEach((button) => {
    const active = button.dataset.nav === screenName;
    button.toggleAttribute("aria-current", active);
  });

  if (screenName === "home") {
    clearDraftPin();
    if (mapReady) {
      map.resize();
      refreshHome();
      setView(currentView, true);
    }
    return;
  }

  if (screenName === "post") {
    observedAtInput.value = observedAtInput.value || toDateTimeLocalValue(new Date());
    startCamera("post");
    return;
  }

  if (screenName === "ar") {
    startCamera("ar");
  }
}

function refreshHome() {
  renderPins(loadAllPosts());
}

async function startCamera(mode) {
  const target = mode === "ar" ? arCamera : postCamera;
  if (!target || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setCameraStatus(mode, "このブラウザではカメラが使えません。");
    return;
  }

  try {
    activeCameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false
    });
    target.srcObject = activeCameraStream;
    await target.play();
    setCameraStatus(mode, mode === "ar" ? "AR" : "カメラ起動中");
  } catch {
    setCameraStatus(mode, "カメラを起動できませんでした。");
  }
}

function stopCamera() {
  if (activeCameraStream) {
    activeCameraStream.getTracks().forEach((track) => track.stop());
    activeCameraStream = null;
  }
  [postCamera, arCamera].forEach((video) => {
    if (video) video.srcObject = null;
  });
}

function setCameraStatus(mode, message) {
  if (mode === "ar" && arStatusEl) arStatusEl.textContent = message;
  if (mode === "post" && placeText) placeText.textContent = message;
}

window.showScreen = showScreen;
window.loadPosts = loadPosts;
window.savePost = savePost;
window.renderPins = renderPins;
window.refreshHome = refreshHome;
window.openGoogleMaps = openGoogleMaps;
window.startCamera = startCamera;
window.stopCamera = stopCamera;

navButtons.forEach((button) => {
  button.addEventListener("click", () => showScreen(button.dataset.nav));
});

filterToggleBtn.addEventListener("click", () => {
  const expanded = filterToggleBtn.getAttribute("aria-expanded") === "true";
  filterToggleBtn.setAttribute("aria-expanded", String(!expanded));
  homeFilterPanel.hidden = expanded;
});

homeFilterPanel.addEventListener("submit", (event) => {
  event.preventDefault();
  syncHomeFiltersFromInputs();
  refreshHome();
  statusEl.textContent = `${puddles.length}個の水たまりを表示しています。`;
});

resetFiltersBtn.addEventListener("click", () => {
  resetHomeFilters();
  statusEl.textContent = `${puddles.length}個の水たまりを表示しています。`;
});

playViewBtn.addEventListener("click", () => setView("play", true));
mapViewBtn.addEventListener("click", () => setView("map", true));
locateBtn.addEventListener("click", locateUserOnly);
addHereBtn.addEventListener("click", locateUserAndOpenForm);
clearBtn.addEventListener("click", clearUserPuddles);
cancelPostBtn.addEventListener("click", closePostForm);
postForm.addEventListener("submit", submitPost);

clickModeBtn.addEventListener("click", () => {
  clickMode = !clickMode;
  document.body.classList.toggle("click-posting", clickMode);
  clickModeBtn.textContent = clickMode ? "クリック投稿モード中" : "地図をクリックして投稿";
  statusEl.textContent = clickMode
    ? "十字カーソルの先に水たまりを登録します。地図をクリックしてください。"
    : "クリック投稿モードを解除しました。";
});

playerAvatarInput.addEventListener("change", () => {
  if (lastKnownPosition) showPlayer(lastKnownPosition.longitude, lastKnownPosition.latitude);
  statusEl.textContent = `自分のすがたを${getPlayerName()}にしました。`;
});
