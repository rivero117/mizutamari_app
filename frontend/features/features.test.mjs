import test from "node:test";
import assert from "node:assert/strict";
import { chooseArPlacementMode, createTapFishOverlay } from "./ar/index.mjs";
import {
  filterHomePosts,
  makeGoogleMapsDirectionsUrl
} from "./home/index.mjs";
import { createPost, createPostFeature } from "./post/index.mjs";

const NOW = new Date("2026-07-15T10:00:00+09:00");

test("post feature creates the specification data shape and GeoJSON", () => {
  const draft = {
    lat: 33.97,
    lng: 134.36,
    size: 242,
    transparency: 5,
    observedAt: "2026-07-15T09:00:00+09:00",
    image: "data:image/png;base64,abc"
  };

  const post = createPost(draft, NOW);
  const feature = createPostFeature(draft, NOW);

  assert.equal(post.size, 242);
  assert.equal(post.transparency, 5);
  assert.deepEqual(feature.geometry.coordinates, [134.36, 33.97]);
  assert.equal(feature.properties["透明度"], 5);
});

test("post feature rejects missing specification-required fields", () => {
  assert.throws(
    () =>
      createPost(
        {
          lat: 33.97,
          lng: 134.36,
          size: 242,
          image: "data:image/png;base64,abc"
        },
        NOW
      ),
    /透明度/
  );
});

test("HOME shows only posts observed during the last week", () => {
  const posts = [
    { id: "recent", observedAt: "2026-07-14T10:00:00+09:00", size: 100, transparency: 5 },
    { id: "old", observedAt: "2026-07-01T10:00:00+09:00", size: 100, transparency: 5 }
  ];

  assert.deepEqual(filterHomePosts(posts, {}, NOW).map((post) => post.id), ["recent"]);
});

test("HOME directions hide coordinates from UI while retaining them in the URL", () => {
  const url = makeGoogleMapsDirectionsUrl({ lat: 33.97, lng: 134.36 });
  assert.match(url, /destination=33\.97%2C134\.36/);
});

test("AR creates a bounded tap-position fish overlay", () => {
  const fish = createTapFishOverlay({ x: 0.5, y: 0.6 }, 3);
  assert.equal(fish.length, 3);
  assert.ok(fish.every((item) => item.x >= 0 && item.x <= 1));
  assert.ok(fish.every((item) => item.y >= 0 && item.y <= 1));
});

test("AR chooses plane placement only when WebXR hit-test is available", () => {
  assert.equal(chooseArPlacementMode({ webXr: true, hitTest: true }), "plane");
  assert.equal(chooseArPlacementMode({ webXr: true, hitTest: false }), "tap");
  assert.equal(chooseArPlacementMode({ webXr: false, hitTest: true }), "tap");
});
