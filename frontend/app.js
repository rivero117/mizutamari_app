"use strict";

const GEOJSON_URL = "../data/mizutamari.geojson";
const STORAGE_KEY = "mizutaPosts";
const LEGACY_STORAGE_KEY = "ameato_user_puddle_posts_v11";
const START_CENTER = [134.3612, 33.9742];
const THREE_URL = "https://esm.sh/three@0.160.0";
const FBX_LOADER_URL = "https://esm.sh/three@0.160.0/examples/jsm/loaders/FBXLoader.js";
const FISH_MODEL_URL = "./assets/fish/sacabambaspis.fbx";
const FISH_TEXTURE_URL = "./assets/fish/texture.png";

const screens = Array.from(document.querySelectorAll("[data-screen]"));
const navButtons = Array.from(document.querySelectorAll("[data-nav]"));
const statusEl = document.getElementById("status");
const arStatusEl = document.getElementById("arStatus");
const dataBox = document.getElementById("dataBox");
const sourceBadge = document.getElementById("sourceBadge");
const puddleCount = document.getElementById("puddleCount");
const playViewBtn = document.getElementById("playViewBtn");
const mapViewBtn = document.getElementById("mapViewBtn");
const clickModeBtn = document.getElementById("clickModeBtn");
const locateBtn = document.getElementById("locateBtn");
const addHereBtn = document.getElementById("addHereBtn");
const clearBtn = document.getElementById("clearBtn");
const playerAvatarInput = document.getElementById("playerAvatarInput");
const postForm = document.getElementById("postForm");
const placeText = document.getElementById("placeText");
const transparencyInput = document.getElementById("transparencyInput");
const observedAtInput = document.getElementById("observedAtInput");
const photoInput = document.getElementById("photoInput");
const photoLibraryInput = document.getElementById("photoLibraryInput");
const photoLabel = document.getElementById("photoLabel");
const cameraPickBtn = document.getElementById("cameraPickBtn");
const libraryPickBtn = document.getElementById("libraryPickBtn");
const cancelPostBtn = document.getElementById("cancelPostBtn");
const submitPostBtn = document.getElementById("submitPostBtn");
const postCamera = document.getElementById("postCamera");
const arCamera = document.getElementById("arCamera");
const arCanvas = document.getElementById("arCanvas");
const arFallbackFish = document.getElementById("arFallbackFish");
const arReticle = document.getElementById("arReticle");
const arHintEl = document.getElementById("arHint");
const arScreen = document.getElementById("screen-ar");

let currentView = "play";
let clickMode = false;
let selectedPoint = null;
let draftPinMarker = null;
let playerMarker = null;
let lastKnownPosition = null;
let apiAvailable = false;
let mapReady = false;
let activeCameraStream = null;
let cameraStarting = false;
let ar3D = null;
let xrSession = null;
let xrViewerSpace = null;
let xrRefSpace = null;
let xrHitTestSource = null;
let xrHitMatrix = null;
let xrPlaced = false;
let xrLastFailure = "";
let puddles = [];
let officialPuddles = [];
let selectedPhotoFile = null;

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
    puddles = mergePuddleLists(apiPuddles, localPuddles);
    apiAvailable = true;
    sourceBadge.textContent = "API";
  } catch {
    const [official, user] = await Promise.all([loadOfficialFromGeoJson(), loadLocalUserPuddles()]);
    officialPuddles = official;
    puddles = mergePuddleLists(official, user);
    apiAvailable = false;
    sourceBadge.textContent = "Static";
  }

  renderPins(loadPosts());
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

      return {
        id: `geojson_puddle_${props["No"] || index + 1}`,
        source: "geojson",
        longitude,
        latitude,
        createdAt: props["観測日時"] || "",
        size,
        diameterCm,
        turbidity: muddinessToTurbidity(props["濁り具合"]),
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
  const basePuddles = puddles.filter((puddle) => puddle.source !== "user");
  const fallbackBase = basePuddles.length > 0 ? basePuddles : officialPuddles;
  puddles = mergePuddleLists(fallbackBase, visibleUserPuddles);
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
  const html = `
    <strong>${puddle.contestEntry ? "🏆 " : ""}水たまり</strong><br>
    観測日時：${escapeHtml(puddle.createdAt || "不明")}<br>
    大きさ：${escapeHtml(puddle.diameterCm ? `直径 ${puddle.diameterCm}cm` : "不明")}<br>
    透明度：${escapeHtml(labelTurbidity(puddle.turbidity))}<br>
    <button class="directions-link" type="button" onclick="openGoogleMaps(${Number(puddle.latitude)}, ${Number(puddle.longitude)})">Google Mapで経路を見る</button>
  `;
  new maplibregl.Popup({ offset: 28 }).setLngLat([puddle.longitude, puddle.latitude]).setHTML(html).addTo(map);
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

function getSelectedSizeInput() {
  return postForm.querySelector('input[name="size"]:checked');
}

function resetPhotoInputs() {
  selectedPhotoFile = null;
  if (photoInput) photoInput.value = "";
  if (photoLibraryInput) photoLibraryInput.value = "";
  if (photoLabel) photoLabel.textContent = "写真";
}

function validatePostForm() {
  if (!submitPostBtn) return;
  submitPostBtn.disabled = !(selectedPoint && selectedPhotoFile && getSelectedSizeInput() && observedAtInput?.value);
}

function transparencyToSpecValue(level) {
  return Math.min(Math.max(Math.ceil((11 - Number(level || 1)) / 2), 1), 5);
}

function setTransparencyLevel(level) {
  const value = Math.min(Math.max(Number(level || 1), 1), 10);
  if (transparencyInput) {
    transparencyInput.value = String(value);
    transparencyInput.style.setProperty("--transparency-progress", `${((value - 1) / 9) * 100}%`);
  }
  validatePostForm();
}

function setObservedAt(date) {
  const local = new Date(date);
  if (Number.isNaN(local.getTime())) return;
  if (observedAtInput) observedAtInput.value = toDateInputValue(local);
  validatePostForm();
}

async function preparePostLocation() {
  selectedPoint = null;
  validatePostForm();
  if (!navigator.geolocation) {
    placeText.textContent = "位置情報が必要です";
    return;
  }

  placeText.textContent = "位置情報を取得中";
  try {
    selectedPoint = await getCurrentPoint();
    showPlayer(selectedPoint.longitude, selectedPoint.latitude);
    placeText.textContent = "位置を取得しました";
  } catch {
    selectedPoint = null;
    placeText.textContent = "位置情報が必要です";
  }
  validatePostForm();
}

function openPostForm(longitude, latitude) {
  selectedPoint = { longitude, latitude };
  placeText.textContent = "位置を取得しました";
  resetPhotoInputs();
  postForm.querySelectorAll('input[name="size"]').forEach((input) => {
    input.checked = false;
  });
  setTransparencyLevel(1);
  setObservedAt(new Date());
  validatePostForm();
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
    placeText.textContent = "位置情報が必要です";
    validatePostForm();
    return;
  }

  const sizeInput = getSelectedSizeInput();
  if (!selectedPhotoFile || !sizeInput || !observedAtInput.value) {
    validatePostForm();
    return;
  }

  const diameterCm = Number(sizeInput.value);
  const observedAt = new Date(observedAtInput.value);
  const draftPost = normalizeSpecPost({
    id: `post-${Date.now()}`,
    lat: selectedPoint.latitude,
    lng: selectedPoint.longitude,
    size: diameterCm,
    transparency: transparencyToSpecValue(Number(transparencyInput.value)),
    observedAt: observedAt.toISOString(),
    image: await readPhotoAsDataUrl(selectedPhotoFile),
    comment: "",
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
  statusEl.textContent = "水たまりを投稿しました。";
}

function toDateTimeLocalValue(date) {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function toDateInputValue(date) {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
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
    selectedPoint = null;
    if (mapReady) {
      map.resize();
      refreshHome();
      setView(currentView, true);
    }
    return;
  }

  if (screenName === "post") {
    if (!observedAtInput.value) setObservedAt(new Date());
    if (selectedPoint) {
      placeText.textContent = "位置を取得しました";
      validatePostForm();
    } else {
      resetPhotoInputs();
      postForm.querySelectorAll('input[name="size"]').forEach((input) => {
        input.checked = false;
      });
      setTransparencyLevel(1);
      preparePostLocation();
    }
    return;
  }

  if (screenName === "ar") {
    startCamera("ar");
  }
}

function refreshHome() {
  renderPins(loadPosts());
}

async function startCamera(mode, options = {}) {
  const target = mode === "ar" ? arCamera : postCamera;
  if (cameraStarting || (mode === "ar" && xrSession)) return;
  if (!target) {
    setCameraStatus(mode, "このブラウザではカメラが使えません。");
    return;
  }

  cameraStarting = true;
  if (mode === "ar" && !options.skipPlaneDetection) {
    setCameraStatus("ar", "平面検知を準備中");
    const planeArStarted = await startPlaneDetectionAr();
    if (planeArStarted) {
      cameraStarting = false;
      return;
    }
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setCameraStatus(mode, "このブラウザではカメラが使えません。");
    cameraStarting = false;
    return;
  }

  try {
    activeCameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false
    });
    target.srcObject = activeCameraStream;
    await target.play();
    if (mode === "ar") {
      await initAr3D();
      positionArFish(window.innerWidth / 2, window.innerHeight * 0.56, false);
    }
    setCameraStatus(
      mode,
      mode === "ar"
        ? `平面検知非対応 ${xrLastFailure || "この環境では未検出"} タップで仮配置`
        : "カメラ起動中"
    );
  } catch {
    setCameraStatus(mode, "カメラを起動できませんでした。");
  } finally {
    cameraStarting = false;
  }
}

function stopCamera() {
  if (xrSession) {
    const session = xrSession;
    cleanupPlaneDetectionAr();
    session.end().catch(() => {});
  }
  stopActiveCameraStream();
  [postCamera, arCamera].forEach((video) => {
    if (video) video.srcObject = null;
  });
  arScreen.classList.remove("xr-on", "fish-placed");
  setArHint("床や水たまりにスマホを向けてください");
}

function setCameraStatus(mode, message) {
  if (mode === "ar" && arStatusEl) arStatusEl.textContent = message;
  if (mode === "post" && placeText) placeText.textContent = message;
}

function stopActiveCameraStream() {
  if (!activeCameraStream) return;
  activeCameraStream.getTracks().forEach((track) => track.stop());
  activeCameraStream = null;
}

function setArHint(message) {
  if (arHintEl) arHintEl.textContent = message;
}

async function initAr3D() {
  if (ar3D || !arCanvas) return;

  try {
    const [THREE, { FBXLoader }] = await Promise.all([
      import(THREE_URL),
      import(FBX_LOADER_URL)
    ]);
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      canvas: arCanvas
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const scene = new THREE.Scene();
    const screenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    screenCamera.position.z = 420;
    const xrCamera = new THREE.PerspectiveCamera(60, 1, 0.01, 20);

    const screenRoot = new THREE.Group();
    const xrRoot = new THREE.Group();
    xrRoot.visible = false;
    scene.add(screenRoot, xrRoot);
    scene.add(new THREE.AmbientLight(0xffffff, 1.85));

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
    keyLight.position.set(120, 160, 240);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x9ce4ff, 0.9);
    fillLight.position.set(-160, -70, 180);
    scene.add(fillLight);

    const loadedFish = await loadFishAsset(THREE, FBXLoader);
    const screenFish = loadedFish ? prepareFishModel(THREE, loadedFish, 220) : createSimpleFishModel(THREE, 1.7);
    const xrFish = loadedFish ? prepareFishModel(THREE, loadedFish.clone(true), 0.34) : createSimpleFishModel(THREE, 0.003);
    screenRoot.add(screenFish);
    xrRoot.add(xrFish);
    xrRoot.userData.baseRotationY = xrRoot.rotation.y;

    ar3D = {
      THREE,
      renderer,
      scene,
      screenCamera,
      xrCamera,
      screenRoot,
      xrRoot,
      startedAt: performance.now()
    };
    arScreen.classList.add("three-ready");

    window.addEventListener("resize", resizeAr3D);
    resizeAr3D();
    renderer.setAnimationLoop(animateAr3D);
  } catch (error) {
    console.warn("AR fish could not be initialized.", error);
    ar3D = null;
  }
}

async function loadFishAsset(THREE, FBXLoader) {
  try {
    const texture = await new THREE.TextureLoader().loadAsync(FISH_TEXTURE_URL);
    texture.colorSpace = THREE.SRGBColorSpace;
    const model = await new FBXLoader().loadAsync(FISH_MODEL_URL);
    model.traverse((child) => {
      if (!child.isMesh) return;
      child.material = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.82,
        metalness: 0
      });
    });
    return model;
  } catch (error) {
    console.warn("Sacabambaspis model could not be loaded. Using fallback fish.", error);
    return null;
  }
}

function prepareFishModel(THREE, model, targetSize) {
  const wrapper = new THREE.Group();
  wrapper.add(model);

  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxAxis = Math.max(size.x, size.y, size.z) || 1;

  model.position.sub(center);
  model.scale.multiplyScalar(targetSize / maxAxis);
  wrapper.rotation.x = -0.12;
  wrapper.rotation.y = 0;
  wrapper.userData.baseRotationX = wrapper.rotation.x;
  wrapper.userData.baseRotationY = wrapper.rotation.y;
  wrapper.userData.baseRotationZ = wrapper.rotation.z;
  return wrapper;
}

function createSimpleFishModel(THREE, scale) {
  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xffd56f, roughness: 0.78 });
  const finMaterial = new THREE.MeshStandardMaterial({ color: 0xffe59a, roughness: 0.76 });
  const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x47330b, roughness: 0.6 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(30, 32, 18), bodyMaterial);
  body.scale.set(1.45, 0.9, 0.62);
  group.add(body);

  const tailTop = new THREE.Mesh(new THREE.SphereGeometry(17, 24, 14), finMaterial);
  tailTop.position.set(42, 12, 0);
  tailTop.scale.set(0.82, 0.98, 0.45);
  group.add(tailTop);

  const tailBottom = tailTop.clone();
  tailBottom.position.y = -12;
  group.add(tailBottom);

  const eye = new THREE.Mesh(new THREE.SphereGeometry(3.6, 16, 10), eyeMaterial);
  eye.position.set(-26, 4, 20);
  group.add(eye);

  group.scale.setScalar(scale);
  group.rotation.x = -0.12;
  group.rotation.y = Math.PI;
  group.userData.baseRotationX = group.rotation.x;
  group.userData.baseRotationY = group.rotation.y;
  group.userData.baseRotationZ = group.rotation.z;
  return group;
}

function resizeAr3D() {
  if (!ar3D) return;
  const rect = arCanvas.getBoundingClientRect();
  ar3D.renderer.setSize(rect.width, rect.height, false);
  ar3D.screenCamera.left = -rect.width / 2;
  ar3D.screenCamera.right = rect.width / 2;
  ar3D.screenCamera.top = rect.height / 2;
  ar3D.screenCamera.bottom = -rect.height / 2;
  ar3D.screenCamera.updateProjectionMatrix();
  ar3D.xrCamera.aspect = rect.width / rect.height;
  ar3D.xrCamera.updateProjectionMatrix();
}

async function startPlaneDetectionAr() {
  xrLastFailure = "";
  if (!window.isSecureContext) {
    xrLastFailure = "HTTPSではないため";
    return false;
  }
  if (!navigator.xr?.requestSession) {
    xrLastFailure = "WebXR非対応のため";
    return false;
  }

  const sessionInit = {
    requiredFeatures: ["hit-test"],
    optionalFeatures: ["local-floor"]
  };
  let session;

  try {
    session = await navigator.xr.requestSession("immersive-ar", sessionInit);
  } catch (error) {
    console.warn("WebXR immersive-ar session could not be started.", error);
    xrLastFailure = "端末がARセッションを開始できないため";
    return false;
  }

  xrSession = session;
  await initAr3D();
  if (!ar3D?.renderer) {
    cleanupPlaneDetectionAr();
    session.end().catch(() => {});
    return false;
  }

  try {
    ar3D.renderer.xr.enabled = true;
    ar3D.renderer.xr.setReferenceSpaceType("local");
    await ar3D.renderer.xr.setSession(xrSession);

    xrViewerSpace = await xrSession.requestReferenceSpace("viewer");
    xrRefSpace = await xrSession.requestReferenceSpace("local");
    xrHitTestSource = await xrSession.requestHitTestSource({ space: xrViewerSpace });
    xrHitMatrix = new ar3D.THREE.Matrix4();
    xrPlaced = false;

    ar3D.screenRoot.visible = false;
    ar3D.xrRoot.visible = false;
    arScreen.classList.add("xr-on");
    setCameraStatus("ar", "平面を探しています");
    setArHint("床や水面にスマホを向けてタップ");

    xrSession.addEventListener("select", placeFishOnDetectedPlane);
    xrSession.addEventListener("end", cleanupPlaneDetectionAr);
    return true;
  } catch (error) {
    console.warn("WebXR plane hit-test is unavailable. Camera fallback is active.", error);
    xrLastFailure = "hit-testを開始できないため";
    session.end().catch(() => {});
    cleanupPlaneDetectionAr();
    return false;
  }
}

function cleanupPlaneDetectionAr() {
  if (xrSession) {
    xrSession.removeEventListener("select", placeFishOnDetectedPlane);
    xrSession.removeEventListener("end", cleanupPlaneDetectionAr);
  }
  xrSession = null;
  xrViewerSpace = null;
  xrRefSpace = null;
  xrHitTestSource = null;
  xrHitMatrix = null;
  xrPlaced = false;
  if (ar3D?.renderer) {
    ar3D.renderer.xr.enabled = false;
    ar3D.screenRoot.visible = true;
    ar3D.xrRoot.visible = false;
  }
  arScreen.classList.remove("xr-on");
}

function placeFishOnDetectedPlane() {
  if (!xrHitMatrix || !ar3D?.xrRoot) {
    setCameraStatus("ar", "平面を探しています");
    return;
  }

  const { THREE, xrRoot } = ar3D;
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  xrHitMatrix.decompose(position, quaternion, scale);

  xrRoot.position.copy(position);
  xrRoot.position.y += 0.018;
  xrRoot.quaternion.copy(quaternion);
  xrRoot.rotateX(-Math.PI / 2);
  xrRoot.visible = true;
  xrRoot.userData.floatBaseX = xrRoot.position.x;
  xrRoot.userData.floatBaseY = xrRoot.position.y;
  xrPlaced = true;
  arScreen.classList.add("fish-placed");
  setCameraStatus("ar", "平面にぷかぷか中");
  setArHint("別の平面をタップで移動");
}

function positionArFish(x, y, shouldLock = true) {
  if (xrSession) {
    placeFishOnDetectedPlane();
    return;
  }

  const rect = arScreen.getBoundingClientRect();
  const left = Math.max(64, Math.min(x - rect.left, rect.width - 64));
  const top = Math.max(118, Math.min(y - rect.top, rect.height - 118));
  const depthScale = 0.82 + Math.min(0.32, Math.max(0, (top - 140) / rect.height) * 0.62);

  if (arFallbackFish) {
    arFallbackFish.style.left = `${left}px`;
    arFallbackFish.style.top = `${top}px`;
    arFallbackFish.style.setProperty("--ar-fish-scale", depthScale.toFixed(3));
  }
  if (arReticle) {
    arReticle.style.left = `${left}px`;
    arReticle.style.top = `${top + 18}px`;
  }
  if (ar3D?.screenRoot) {
    ar3D.screenRoot.userData.baseX = left - rect.width / 2;
    ar3D.screenRoot.userData.baseY = rect.height / 2 - top;
    ar3D.screenRoot.userData.depthScale = depthScale;
  }

  if (shouldLock) {
    arScreen.classList.add("fish-placed");
    setCameraStatus("ar", "仮配置でぷかぷか中");
    setArHint("もう一度タップで移動");
  }
}

function animateAr3D(timestamp, frame) {
  if (!ar3D) return;
  const t = ((timestamp || performance.now()) - ar3D.startedAt) / 1000;

  if (frame && xrHitTestSource && xrRefSpace) {
    const hitTestResults = frame.getHitTestResults(xrHitTestSource);
    if (hitTestResults.length) {
      const hitPose = hitTestResults[0].getPose(xrRefSpace);
      if (hitPose) {
        xrHitMatrix.fromArray(hitPose.transform.matrix);
        if (!xrPlaced) setCameraStatus("ar", "平面を検知 タップで配置");
      }
    } else if (!xrPlaced) {
      setCameraStatus("ar", "平面を探しています");
    }
  }

  const screenSwimX = Math.sin(t * 1.15) * 22;
  const screenFloatY = Math.sin(t * 1.9) * 12 + Math.sin(t * 3.1) * 3;
  const screenJumpY = jumpPulse(t, 4.2) * 58;
  ar3D.screenRoot.position.x = (ar3D.screenRoot.userData.baseX || 0) + screenSwimX;
  ar3D.screenRoot.position.y = (ar3D.screenRoot.userData.baseY || 0) + screenFloatY + screenJumpY;
  ar3D.screenRoot.scale.setScalar((ar3D.screenRoot.userData.depthScale || 1) * (1 + Math.sin(t * 2.2) * 0.018 + jumpPulse(t, 4.2) * 0.045));
  ar3D.screenRoot.rotation.x = -0.12 + Math.sin(t * 1.55) * 0.05;
  ar3D.screenRoot.rotation.y = Math.sin(t * 1.2) * 0.18;
  ar3D.screenRoot.rotation.z = Math.sin(t * 1.35) * 0.09 + screenJumpY * 0.0015;

  if (ar3D.xrRoot.visible) {
    const xrJumpY = jumpPulse(t, 4.8) * 0.08;
    ar3D.xrRoot.position.x = (ar3D.xrRoot.userData.floatBaseX || ar3D.xrRoot.position.x) + Math.sin(t * 1.2) * 0.012;
    ar3D.xrRoot.position.y = (ar3D.xrRoot.userData.floatBaseY || ar3D.xrRoot.position.y) + Math.sin(t * 1.8) * 0.018 + xrJumpY;
    ar3D.xrRoot.rotation.y = (ar3D.xrRoot.userData.baseRotationY || 0) + Math.sin(t * 1.25) * 0.18 + xrJumpY * 1.7;
  }

  ar3D.renderer.render(ar3D.scene, xrSession ? ar3D.xrCamera : ar3D.screenCamera);
}

function jumpPulse(time, interval) {
  const phase = (time % interval) / interval;
  if (phase > 0.22) return 0;
  return Math.sin((phase / 0.22) * Math.PI);
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
  button.addEventListener("click", () => {
    if (button.dataset.nav === "post") selectedPoint = null;
    showScreen(button.dataset.nav);
  });
});

playViewBtn.addEventListener("click", () => setView("play", true));
mapViewBtn.addEventListener("click", () => setView("map", true));
locateBtn.addEventListener("click", locateUserOnly);
addHereBtn.addEventListener("click", locateUserAndOpenForm);
clearBtn.addEventListener("click", clearUserPuddles);
cancelPostBtn.addEventListener("click", closePostForm);
postForm.addEventListener("submit", submitPost);
arScreen.addEventListener("click", async (event) => {
  if (event.target.closest("button")) return;
  if (!xrSession && navigator.xr?.requestSession) {
    stopActiveCameraStream();
    arCamera.srcObject = null;
    setCameraStatus("ar", "平面検知を再試行中");
    setArHint("床や水面にスマホを向けてください");
    const planeArStarted = await startPlaneDetectionAr();
    if (planeArStarted) return;
    await startCamera("ar", { skipPlaneDetection: true });
  }
  positionArFish(event.clientX, event.clientY, true);
});

cameraPickBtn.addEventListener("click", () => photoInput.click());
libraryPickBtn.addEventListener("click", () => photoLibraryInput.click());

photoInput.addEventListener("change", () => {
  selectedPhotoFile = photoInput.files[0] || null;
  if (selectedPhotoFile) {
    photoLibraryInput.value = "";
    photoLabel.textContent = "撮影済み";
  } else {
    photoLabel.textContent = "写真";
  }
  validatePostForm();
});

photoLibraryInput.addEventListener("change", () => {
  selectedPhotoFile = photoLibraryInput.files[0] || null;
  if (selectedPhotoFile) {
    photoInput.value = "";
    photoLabel.textContent = "選択済み";
  } else {
    photoLabel.textContent = "写真";
  }
  validatePostForm();
});

postForm.querySelectorAll('input[name="size"]').forEach((input) => {
  input.addEventListener("change", validatePostForm);
});

transparencyInput.addEventListener("input", () => setTransparencyLevel(Number(transparencyInput.value)));
observedAtInput.addEventListener("change", validatePostForm);

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

setObservedAt(new Date());
setTransparencyLevel(1);
