"use strict";

const GEOJSON_URL = "../data/mizutamari.geojson";
const STORAGE_KEY = "ameato_user_puddle_posts_v11";
const START_CENTER = [134.3612, 33.9742];

const statusEl = document.getElementById("status");
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
const modalBg = document.getElementById("modalBg");
const postForm = document.getElementById("postForm");
const placeText = document.getElementById("placeText");
const diameterInput = document.getElementById("diameterInput");
const turbidityInput = document.getElementById("turbidityInput");
const reviewInput = document.getElementById("reviewInput");
const photoInput = document.getElementById("photoInput");
const contestInput = document.getElementById("contestInput");
const cancelPostBtn = document.getElementById("cancelPostBtn");

let currentView = "play";
let clickMode = false;
let selectedPoint = null;
let draftPinMarker = null;
let playerMarker = null;
let lastKnownPosition = null;
let apiAvailable = false;
let puddles = [];

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
    puddles = data.puddles || [];
    apiAvailable = true;
    sourceBadge.textContent = "API";
  } catch {
    const [official, user] = await Promise.all([loadOfficialFromGeoJson(), loadLocalUserPuddles()]);
    puddles = [...official, ...user];
    apiAvailable = false;
    sourceBadge.textContent = "Static";
  }

  renderPuddles();
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
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveLocalUserPuddles(userPuddles) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(userPuddles));
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

function showPuddlePopup(puddle) {
  const photoHtml = puddle.photoDataUrl ? `<br><img class="popup-photo" src="${puddle.photoDataUrl}" alt="" />` : "";
  const html = `
    <strong>${puddle.contestEntry ? "🏆 " : ""}水たまり</strong><br>
    観測日時：${escapeHtml(puddle.createdAt || "不明")}<br>
    直径：${escapeHtml(puddle.diameterCm ? `${puddle.diameterCm}cm` : "不明")}<br>
    濁り具合：${escapeHtml(labelTurbidity(puddle.turbidity))}<br>
    魚：${escapeHtml(puddle.fishCount)}匹<br>
    交通量：${escapeHtml(puddle.traffic || "不明")}<br>
    手洗い場：${escapeHtml(puddle.handWash || "不明")}<br>
    天気予報：${escapeHtml(puddle.weather || "不明")}<br>
    レビュー：${escapeHtml(puddle.review || "なし")}<br>
    緯度：${Number(puddle.latitude).toFixed(6)}<br>
    経度：${Number(puddle.longitude).toFixed(6)}
    ${photoHtml}
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

function openPostForm(longitude, latitude) {
  selectedPoint = { longitude, latitude };
  placeText.textContent = `投稿位置：緯度 ${latitude.toFixed(6)} / 経度 ${longitude.toFixed(6)}`;
  diameterInput.value = 120;
  turbidityInput.value = "cloudy";
  reviewInput.value = "";
  photoInput.value = "";
  contestInput.checked = false;
  modalBg.style.display = "flex";
}

function closePostForm() {
  modalBg.style.display = "none";
  selectedPoint = null;
  clearDraftPin();
}

async function submitPost(event) {
  event.preventDefault();

  if (!selectedPoint) {
    statusEl.textContent = "投稿する場所が選ばれていません。";
    return;
  }

  const diameterCm = Number(diameterInput.value || 120);
  const size = diameterToSize(diameterCm);
  const review = reviewInput.value.trim();
  const payload = {
    longitude: selectedPoint.longitude,
    latitude: selectedPoint.latitude,
    diameterCm,
    size,
    turbidity: turbidityInput.value,
    review,
    photoDataUrl: await readPhotoAsDataUrl(photoInput.files[0]),
    contestEntry: contestInput.checked,
    fishCount: sizeToFishCount(size, review)
  };

  let savedPuddle = null;

  if (apiAvailable) {
    try {
      const response = await fetch("/api/puddles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error("Post failed");
      savedPuddle = (await response.json()).puddle;
    } catch {
      apiAvailable = false;
      sourceBadge.textContent = "Static";
    }
  }

  if (!savedPuddle) {
    savedPuddle = {
      ...payload,
      id: `user_puddle_${Date.now()}`,
      source: "user",
      createdAt: new Date().toISOString(),
      likes: 0,
      depth: "",
      traffic: "",
      handWash: "",
      weather: "",
      note: ""
    };
    const localUserPuddles = loadLocalUserPuddles();
    localUserPuddles.push(savedPuddle);
    saveLocalUserPuddles(localUserPuddles);
  }

  puddles.push(savedPuddle);
  renderPuddles();
  updateGeoJsonLayer();
  updateDataBox();
  closePostForm();
  setView(currentView, true);
  statusEl.textContent = `直径${diameterCm}cmの水たまりを投稿しました。`;
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
    statusEl.textContent = `現在地を表示しました。緯度 ${latitude.toFixed(5)} / 経度 ${longitude.toFixed(5)}`;
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
  renderPuddles();
  updateGeoJsonLayer();
  updateDataBox();
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

modalBg.addEventListener("click", (event) => {
  if (event.target === modalBg) closePostForm();
});
