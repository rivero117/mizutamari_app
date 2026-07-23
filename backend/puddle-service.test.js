"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_NOW,
  createArFishOverlay,
  filterPuddles,
  geoJsonToPuddles,
  isWithinRecentDays,
  makeGoogleMapsDirectionsUrl,
  sanitizeSpecPost,
  sanitizeUserPuddle,
  toMapPin,
  toSpecPost
} = require("./puddle-service");

test("geoJsonToPuddles normalizes official puddle fields", () => {
  const puddles = geoJsonToPuddles({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [134.1, 33.9] },
        properties: {
          No: 7,
          "観測日時": "7/14",
          "直径": "242cm",
          "濁り具合": 5,
          "水たまりのレビュー": "きれいでした"
        }
      }
    ]
  });

  assert.equal(puddles.length, 1);
  assert.equal(puddles[0].id, "geojson_puddle_7");
  assert.equal(puddles[0].diameterCm, 242);
  assert.equal(puddles[0].size, "medium");
  assert.equal(puddles[0].turbidity, "cloudy");
  assert.match(puddles[0].googleMapsUrl, /google\.com\/maps\/dir/);
});

test("isWithinRecentDays accepts only observations inside the requested window", () => {
  assert.equal(isWithinRecentDays("7/14", 7, DEFAULT_NOW), true);
  assert.equal(isWithinRecentDays("6/24", 7, DEFAULT_NOW), false);
  assert.equal(isWithinRecentDays("", 7, DEFAULT_NOW), false);
});

test("filterPuddles supports recent, turbidity, diameter, and text search filters", () => {
  const puddles = [
    {
      id: "recent_clear",
      createdAt: "7/14",
      turbidity: "clear",
      diameterCm: 90,
      review: "near station"
    },
    {
      id: "old_muddy",
      createdAt: "6/24",
      turbidity: "muddy",
      diameterCm: 400,
      review: "old spot"
    }
  ];

  assert.deepEqual(
    filterPuddles(
      puddles,
      { recentDays: "7", turbidity: "clear", maxDiameterCm: "120", q: "station" },
      DEFAULT_NOW
    ).map((puddle) => puddle.id),
    ["recent_clear"]
  );
});

test("sanitizeUserPuddle validates coordinates and creates map-ready data", () => {
  const now = new Date("2026-07-15T02:00:00.000Z");
  const puddle = sanitizeUserPuddle(
    {
      longitude: 134.36,
      latitude: 33.97,
      diameterCm: 180,
      turbidity: "clear",
      review: "posted from camera",
      cameraPhotoDataUrl: "data:image/png;base64,abc"
    },
    now
  );

  assert.equal(puddle.id, "user_puddle_1784080800000");
  assert.equal(puddle.size, "medium");
  assert.equal(puddle.photoDataUrl, "data:image/png;base64,abc");
  assert.match(puddle.googleMapsUrl, /destination=33\.97%2C134\.36/);
});

test("sanitizeSpecPost accepts the specification field names without changing the legacy API", () => {
  const now = new Date("2026-07-15T02:00:00.000Z");
  const puddle = sanitizeSpecPost(
    {
      lat: 33.97,
      lng: 134.36,
      size: 242,
      transparency: 5,
      observedAt: "2026-07-15T10:00:00+09:00",
      image: "data:image/png;base64,abc",
      comment: "spec post"
    },
    now
  );

  assert.equal(puddle.latitude, 33.97);
  assert.equal(puddle.longitude, 134.36);
  assert.equal(puddle.diameterCm, 242);
  assert.equal(puddle.size, "medium");
  assert.equal(puddle.transparency, 5);
  assert.equal(puddle.turbidity, "clear");
  assert.equal(puddle.review, "spec post");
});

test("sanitizeSpecPost rejects invalid canonical coordinates", () => {
  assert.throws(
    () =>
      sanitizeSpecPost({
        lat: 120,
        lng: 134.36,
        size: 242,
        transparency: 5,
        observedAt: "2026-07-15T10:00:00+09:00",
        image: "data:image/png;base64,abc"
      }),
    /coordinate range/
  );
});

test("toSpecPost exposes the specification contract from legacy data", () => {
  const post = toSpecPost({
    id: "legacy-1",
    latitude: 33.97,
    longitude: 134.36,
    diameterCm: 180,
    size: "medium",
    turbidity: "cloudy",
    observedAt: "2026-07-15T01:00:00.000Z",
    createdAt: "2026-07-15T02:00:00.000Z",
    photoDataUrl: "data:image/png;base64,abc",
    review: "legacy"
  });

  assert.deepEqual(
    {
      lat: post.lat,
      lng: post.lng,
      size: post.size,
      transparency: post.transparency,
      image: post.image,
      comment: post.comment
    },
    {
      lat: 33.97,
      lng: 134.36,
      size: 180,
      transparency: 3,
      image: "data:image/png;base64,abc",
      comment: "legacy"
    }
  );
});

test("HOME filtering uses observedAt rather than the later createdAt", () => {
  const puddles = [
    {
      id: "old-observation",
      observedAt: "2026-06-01T00:00:00.000Z",
      createdAt: "2026-07-15T00:00:00.000Z"
    }
  ];

  assert.deepEqual(filterPuddles(puddles, { recentDays: 7 }, DEFAULT_NOW), []);
});

test("toMapPin returns the HOME popup contract", () => {
  const pin = toMapPin({
    id: "p1",
    latitude: 33.97,
    longitude: 134.36,
    size: "small",
    diameterCm: 80,
    turbidity: "clear",
    createdAt: "7/14"
  });

  assert.equal(pin.popup.diameterCm, 80);
  assert.equal(pin.popup.transparency, "clear");
  assert.equal(pin.popup.observedAt, "7/14");
  assert.match(pin.googleMapsUrl, /google\.com\/maps\/dir/);
});

test("makeGoogleMapsDirectionsUrl includes origin when provided", () => {
  const url = makeGoogleMapsDirectionsUrl(
    { latitude: 33.97, longitude: 134.36 },
    { latitude: 33.96, longitude: 134.35 }
  );

  assert.match(url, /origin=33\.96%2C134\.35/);
  assert.match(url, /destination=33\.97%2C134\.36/);
});

test("createArFishOverlay returns fish only for confident water detections", () => {
  assert.deepEqual(createArFishOverlay({ waterDetected: false, confidence: 0.9 }).fish, []);

  const overlay = createArFishOverlay({
    waterDetected: true,
    confidence: 0.8,
    boundingBox: { x: 10, y: 20, width: 200, height: 100 },
    fishCount: 3
  });

  assert.equal(overlay.waterDetected, true);
  assert.equal(overlay.fish.length, 3);
  assert.equal(overlay.anchor.type, "screen-space-bounding-box");
});
