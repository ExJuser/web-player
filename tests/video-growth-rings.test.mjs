import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const growthRings = await importTsModule(new URL("../src/videoGrowthRings.ts", import.meta.url));

function createVideo(id, name = `${id}.mp4`) {
  return {
    id,
    name,
    relativePath: name,
    url: "",
    size: 100,
    lastModified: 1,
  };
}

function createActivity(videoId, date, overrides = {}) {
  return {
    date,
    videoId,
    watchedSeconds: overrides.watchedSeconds ?? 60,
    playCount: overrides.playCount ?? 1,
    completedCount: overrides.completedCount ?? 0,
    emissionCount: overrides.emissionCount ?? 0,
    updatedAt: overrides.updatedAt ?? 1,
  };
}

test("builds rings only from valid activity in the selected video scope", () => {
  const store = {
    a: createActivity("video-a", "2026-01-01", { watchedSeconds: 120, completedCount: 1 }),
    b: createActivity("video-a", "2026-01-04", { watchedSeconds: 30, playCount: 2, emissionCount: 1 }),
    outside: createActivity("outside", "2026-01-02", { watchedSeconds: 999 }),
    zero: createActivity("video-b", "2026-01-03", { watchedSeconds: 0, playCount: 0 }),
    invalid: createActivity("video-b", "not-a-date"),
  };

  const forest = growthRings.buildVideoGrowthRingForest(store, [createVideo("video-a"), createVideo("video-b")]);

  assert.equal(forest.rings.length, 1);
  assert.equal(forest.totalWatchedSeconds, 150);
  assert.equal(forest.activeDays, 2);
  assert.equal(forest.firstWatchedDate, "2026-01-01");
  assert.equal(forest.lastWatchedDate, "2026-01-04");
  assert.deepEqual(
    forest.rings[0].detailLayers.map((layer) => [layer.startDate, layer.gapDays]),
    [["2026-01-01", 0], ["2026-01-04", 2]],
  );
});

test("compacts chronological layers without losing totals or date ranges", () => {
  const store = {};
  for (let day = 1; day <= 30; day += 1) {
    const date = `2026-03-${String(day).padStart(2, "0")}`;
    store[date] = createActivity("video-a", date, {
      watchedSeconds: day,
      playCount: 1,
      completedCount: day % 5 === 0 ? 1 : 0,
      emissionCount: day % 7 === 0 ? 1 : 0,
    });
  }

  const forest = growthRings.buildVideoGrowthRingForest(store, [createVideo("video-a")], {
    forestLayerLimit: 24,
    detailLayerLimit: 8,
  });
  const ring = forest.rings[0];

  assert.equal(ring.forestLayers.length, 24);
  assert.equal(ring.detailLayers.length, 8);
  assert.equal(ring.detailLayers[0].startDate, "2026-03-01");
  assert.equal(ring.detailLayers.at(-1).endDate, "2026-03-30");
  assert.equal(ring.detailLayers.reduce((sum, layer) => sum + layer.activeDays, 0), 30);
  assert.equal(ring.detailLayers.reduce((sum, layer) => sum + layer.watchedSeconds, 0), 465);
  assert.equal(ring.detailLayers.reduce((sum, layer) => sum + layer.completedCount, 0), 6);
  assert.equal(ring.detailLayers.reduce((sum, layer) => sum + layer.emissionCount, 0), 4);
});

test("uses stable seeds and supports all forest sort modes", () => {
  assert.equal(growthRings.createGrowthRingSeed("video-a:2026-01-01"), growthRings.createGrowthRingSeed("video-a:2026-01-01"));
  assert.notEqual(growthRings.createGrowthRingSeed("video-a"), growthRings.createGrowthRingSeed("video-b"));
  assert.equal(growthRings.createOrganicGrowthRingPath(80, 123), growthRings.createOrganicGrowthRingPath(80, 123));
  assert.notEqual(growthRings.createOrganicGrowthRingPath(80, 123), growthRings.createOrganicGrowthRingPath(80, 456));

  const forest = growthRings.buildVideoGrowthRingForest(
    {
      a1: createActivity("a", "2026-01-01", { watchedSeconds: 30, playCount: 5 }),
      b1: createActivity("b", "2026-01-02", { watchedSeconds: 300, playCount: 1 }),
      b2: createActivity("b", "2026-01-03", { watchedSeconds: 20, playCount: 1 }),
    },
    [createVideo("a", "Beta.mp4"), createVideo("b", "Alpha.mp4")],
  );

  assert.deepEqual(growthRings.sortVideoGrowthRings(forest.rings, "recent").map((ring) => ring.video.id), ["b", "a"]);
  assert.deepEqual(growthRings.sortVideoGrowthRings(forest.rings, "watched").map((ring) => ring.video.id), ["b", "a"]);
  assert.deepEqual(growthRings.sortVideoGrowthRings(forest.rings, "activeDays").map((ring) => ring.video.id), ["b", "a"]);
  assert.deepEqual(growthRings.sortVideoGrowthRings(forest.rings, "plays").map((ring) => ring.video.id), ["a", "b"]);
  assert.deepEqual(growthRings.sortVideoGrowthRings(forest.rings, "title").map((ring) => ring.video.id), ["b", "a"]);
});

test("handles empty and single-day histories", () => {
  assert.deepEqual(growthRings.buildVideoGrowthRingForest({}, [createVideo("a")]), {
    rings: [],
    totalWatchedSeconds: 0,
    activeDays: 0,
    firstWatchedDate: null,
    lastWatchedDate: null,
  });

  const forest = growthRings.buildVideoGrowthRingForest(
    { one: createActivity("a", "2026-07-23", { watchedSeconds: 42 }) },
    [createVideo("a")],
  );
  assert.equal(forest.rings[0].detailLayers.length, 1);
  assert.equal(forest.rings[0].detailLayers[0].gapDays, 0);
  assert.equal(forest.rings[0].activeDays, 1);
});
