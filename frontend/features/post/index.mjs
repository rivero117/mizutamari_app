import {
  normalizeTransparency,
  postToGeoJsonFeature
} from "../../shared/puddle-contract.mjs";

export function createPost(draft, now = new Date()) {
  const lat = Number(draft.lat);
  const lng = Number(draft.lng);
  const size = Number(draft.size);
  const transparency = Number(draft.transparency);
  const image = String(draft.image || "");
  const observedAt = new Date(draft.observedAt);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new TypeError("位置情報を取得してください。");
  }
  if (!Number.isFinite(size) || size <= 0 || size > 1000) {
    throw new TypeError("大きさは1〜1000cmで入力してください。");
  }
  if (!Number.isInteger(transparency) || transparency < 1 || transparency > 5) {
    throw new TypeError("透明度は1〜5で入力してください。");
  }
  if (!image) {
    throw new TypeError("写真を撮影してください。");
  }
  if (!draft.observedAt || Number.isNaN(observedAt.getTime())) {
    throw new TypeError("観測日時を入力してください。");
  }

  const createdAt = now.toISOString();
  return {
    id: String(draft.id || `post-${now.getTime()}`),
    lat,
    lng,
    size,
    transparency: normalizeTransparency(transparency),
    observedAt: observedAt.toISOString(),
    image,
    comment: String(draft.comment || "").slice(0, 500),
    depth: String(draft.depth || ""),
    weather: String(draft.weather || ""),
    createdAt
  };
}

export function createPostFeature(draft, now = new Date()) {
  return postToGeoJsonFeature(createPost(draft, now));
}
