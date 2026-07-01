import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const duplicateRuntime = await importTsModule(new URL("../src/playerDuplicateRuntime.ts", import.meta.url));

const createVideo = (overrides = {}) => ({
  id: overrides.id ?? "video-a",
  name: overrides.name ?? "Episode 01.mp4",
  relativePath: overrides.relativePath ?? "Show/Episode 01.mp4",
  url: overrides.url ?? "/video-a.mp4",
  size: overrides.size ?? 100,
  lastModified: overrides.lastModified ?? 1,
  ...overrides,
});

test("creates stable duplicate cache keys from file identity", () => {
  const video = createVideo({ id: "a", size: 123.9, lastModified: 456.4 });
  const pair = {
    a: createVideo({ id: "a", name: "Same.mp4", relativePath: "A/Same.mp4", size: 100, duration: 60.4 }),
    b: createVideo({ id: "b", name: "Same copy.mp4", relativePath: "B/Same copy.mp4", size: 100, duration: 60.4 }),
  };
  const reversedPair = { a: pair.b, b: pair.a };

  assert.equal(duplicateRuntime.createDuplicateFingerprintCacheKey(video), "a|123|456");
  assert.equal(
    duplicateRuntime.createDuplicateNameSimilarityCacheKey(pair),
    duplicateRuntime.createDuplicateNameSimilarityCacheKey(reversedPair),
  );
});

test("creates bounded duplicate sample ranges", () => {
  assert.deepEqual(duplicateRuntime.createDuplicateSampleRanges(0), []);
  assert.deepEqual(duplicateRuntime.createDuplicateSampleRanges(10), [{ start: 0, end: 9 }]);

  const ranges = duplicateRuntime.createDuplicateSampleRanges(10 * 1024 * 1024);
  assert.equal(ranges.length, 3);
  assert.deepEqual(ranges[0], { start: 0, end: 1024 * 1024 - 1 });
  assert.deepEqual(ranges[2], { start: 9 * 1024 * 1024, end: 10 * 1024 * 1024 - 1 });
});

test("persists the highest duplicate pair score per key", () => {
  const result = duplicateRuntime.createPersistedDuplicateDetectionResult(
    "anime",
    [
      {
        id: "g1",
        severity: "duplicate",
        videos: [],
        pairs: [
          { key: "a:b", aId: "a", bId: "b", score: 10, severity: "suspicious", reasons: ["low"] },
          { key: "a:b", aId: "a", bId: "b", score: 20, severity: "duplicate", reasons: ["high"] },
        ],
      },
    ],
    "  cached  ",
  );

  assert.equal(result.mode, "anime");
  assert.equal(result.scopeKey, "anime");
  assert.equal(result.message, "cached");
  assert.deepEqual(result.pairs, [
    { key: "a:b", aId: "a", bId: "b", score: 20, severity: "duplicate", reasons: ["high"] },
  ]);
});

test("prunes persisted duplicate pairs for deleted videos", () => {
  const result = duplicateRuntime.pruneDuplicateDetectionsForVideos(
    {
      all: {
        mode: "all",
        pairs: [
          { key: "a:b", aId: "a", bId: "b", score: 20, severity: "duplicate", reasons: [] },
          { key: "a:c", aId: "a", bId: "c", score: 20, severity: "duplicate", reasons: [] },
        ],
        updatedAt: 1,
      },
      anime: {
        mode: "anime",
        pairs: [{ key: "x:y", aId: "x", bId: "y", score: 20, severity: "duplicate", reasons: [] }],
        updatedAt: 1,
      },
    },
    [createVideo({ id: "a" }), createVideo({ id: "b" })],
  );

  assert.deepEqual(Object.keys(result), ["all"]);
  assert.deepEqual(result.all.pairs.map((pair) => pair.key), ["a:b"]);
});
