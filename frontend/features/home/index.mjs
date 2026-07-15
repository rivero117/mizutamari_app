import { MAX_VISIBLE_DAYS, normalizeTransparency } from "../../shared/puddle-contract.mjs";

export function isVisibleOnHome(post, now = new Date(), days = MAX_VISIBLE_DAYS) {
  const observedAt = new Date(post.observedAt);
  if (Number.isNaN(observedAt.getTime())) return false;
  const start = new Date(now);
  start.setDate(start.getDate() - days);
  return observedAt >= start && observedAt <= now;
}

export function filterHomePosts(posts, filters = {}, now = new Date()) {
  return posts.filter((post) => {
    if (!isVisibleOnHome(post, now)) return false;
    if (filters.minSize && Number(post.size) < Number(filters.minSize)) return false;
    if (filters.maxSize && Number(post.size) > Number(filters.maxSize)) return false;
    if (
      filters.transparency &&
      normalizeTransparency(post.transparency) !== Number(filters.transparency)
    ) {
      return false;
    }
    return true;
  });
}

export function makeGoogleMapsDirectionsUrl(post) {
  const params = new URLSearchParams({
    api: "1",
    destination: `${Number(post.lat)},${Number(post.lng)}`
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
