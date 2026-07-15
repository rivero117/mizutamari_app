export const MAX_VISIBLE_DAYS = 7;

export function normalizeTransparency(value, turbidity = "cloudy") {
  const numeric = Number(value);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 5) return numeric;
  if (turbidity === "clear") return 5;
  if (turbidity === "muddy") return 1;
  return 3;
}

export function transparencyToTurbidity(value) {
  const transparency = normalizeTransparency(value);
  if (transparency >= 4) return "clear";
  if (transparency <= 1) return "muddy";
  return "cloudy";
}

export function toSpecPost(puddle) {
  const size = Number(
    typeof puddle.size === "number" ? puddle.size : puddle.diameterCm ?? puddle.sizeCm
  );
  const lat = Number(puddle.lat ?? puddle.latitude);
  const lng = Number(puddle.lng ?? puddle.longitude);

  return {
    id: String(puddle.id || ""),
    lat,
    lng,
    size,
    transparency: normalizeTransparency(puddle.transparency, puddle.turbidity),
    observedAt: String(puddle.observedAt || puddle.createdAt || ""),
    image: String(puddle.image || puddle.photoDataUrl || ""),
    comment: String(puddle.comment || puddle.review || ""),
    depth: String(puddle.depth || ""),
    weather: String(puddle.weather || ""),
    createdAt: String(puddle.createdAt || puddle.observedAt || "")
  };
}

export function toLegacyPuddle(post) {
  const transparency = normalizeTransparency(post.transparency);
  const size = Number(post.size);
  return {
    id: post.id,
    source: "user",
    latitude: Number(post.lat),
    longitude: Number(post.lng),
    diameterCm: size,
    size: size < 150 ? "small" : size < 300 ? "medium" : "large",
    transparency,
    turbidity: transparencyToTurbidity(transparency),
    observedAt: post.observedAt,
    createdAt: post.createdAt,
    photoDataUrl: post.image,
    review: post.comment || "",
    depth: post.depth || "",
    weather: post.weather || ""
  };
}

export function postToGeoJsonFeature(post) {
  return {
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [Number(post.lng), Number(post.lat)]
    },
    properties: {
      id: post.id,
      "大きさ": Number(post.size),
      "透明度": normalizeTransparency(post.transparency),
      "観測日時": post.observedAt,
      "画像": post.image
    }
  };
}
