import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const runtime = await importTsModule(new URL("../src/duplicateDetectionRuntime.ts", import.meta.url));

function createVideo(overrides = {}) {
  return {
    id: "root|Show/E01.mkv|1000|10",
    name: "E01.mkv",
    relativePath: "Show/E01.mkv",
    size: 1000,
    lastModified: 10,
    ...overrides,
  };
}

test("duplicate fingerprint cache key uses stable file identity fields", () => {
  assert.equal(
    runtime.createDuplicateFingerprintCacheKey(createVideo({ size: 1000.9, lastModified: 10.4 })),
    "root|Show/E01.mkv|1000|10|1000|10",
  );
});

test("duplicate name similarity cache key is stable regardless of pair order", () => {
  const first = createVideo({
    id: "first",
    name: "A.mkv",
    relativePath: "Library/A.mkv",
    size: 1024.9,
    duration: 1200.4,
  });
  const second = createVideo({
    id: "second",
    name: "B.mkv",
    relativePath: "Library/B.mkv",
    size: 2048.2,
    duration: 1199.6,
  });

  assert.equal(
    runtime.createDuplicateNameSimilarityCacheKey({ id: "pair-a", a: first, b: second }),
    runtime.createDuplicateNameSimilarityCacheKey({ id: "pair-b", a: second, b: first }),
  );
});

test("duplicate sample ranges use one whole-file range for small files", () => {
  assert.deepEqual(runtime.createDuplicateSampleRanges(0), []);
  assert.deepEqual(runtime.createDuplicateSampleRanges(3 * 1024 * 1024), [
    { start: 0, end: 3 * 1024 * 1024 - 1 },
  ]);
});

test("duplicate sample ranges sample head middle and tail for large files", () => {
  assert.deepEqual(runtime.createDuplicateSampleRanges(5 * 1024 * 1024), [
    { start: 0, end: 1024 * 1024 - 1 },
    { start: 2 * 1024 * 1024, end: 3 * 1024 * 1024 - 1 },
    { start: 4 * 1024 * 1024, end: 5 * 1024 * 1024 - 1 },
  ]);
});

test("persisted duplicate detection keeps highest scoring unique pairs", () => {
  const originalNow = Date.now;
  Date.now = () => 12345;
  try {
    const result = runtime.createPersistedDuplicateDetectionResult(
      "anime",
      [
        {
          severity: "duplicate",
          score: 91,
          videos: [],
          pairs: [
            { key: "same", aId: "a", bId: "b", score: 80, reasons: ["old"] },
            { key: "other", aId: "a", bId: "c", score: 70, reasons: ["other"] },
          ],
        },
        {
          severity: "duplicate",
          score: 95,
          videos: [],
          pairs: [
            { key: "same", aId: "a", bId: "b", score: 99, reasons: ["new"] },
          ],
        },
      ],
      "  saved  ",
    );

    assert.deepEqual(result, {
      mode: "anime",
      scopeKey: "anime",
      pairs: [
        { key: "same", aId: "a", bId: "b", score: 99, reasons: ["new"] },
        { key: "other", aId: "a", bId: "c", score: 70, reasons: ["other"] },
      ],
      updatedAt: 12345,
      message: "saved",
    });
  } finally {
    Date.now = originalNow;
  }
});

test("persisted duplicate detection returns null when no pairs exist", () => {
  assert.equal(runtime.createPersistedDuplicateDetectionResult("all", [], "empty"), null);
});
