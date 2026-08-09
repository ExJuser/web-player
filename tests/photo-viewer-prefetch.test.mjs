import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const prefetch = await importTsModule(new URL("../src/photoViewerPrefetch.ts", import.meta.url));

test("keeps idle prefetch indexes symmetric and within image bounds", () => {
  const plan = prefetch.buildPhotoViewerLoadPlan({
    albumId: "album",
    currentIndex: 0,
    imageCount: 5,
    isPageVisible: true,
    now: 1000,
    previousPosition: null,
    scrollDirection: 0,
  });

  assert.deepEqual(plan.warmIndexes, [0, 1, 2]);
  assert.deepEqual(prefetch.getPhotoViewerDecodeIndexes(0, 5, 0, false), [0, 1, 2]);
  assert.deepEqual(plan.position, {
    albumId: "album",
    averageStepMs: 0,
    direction: 0,
    index: 0,
    timestamp: 1000,
  });
});

test("expands forward prefetching during fast navigation", () => {
  const plan = prefetch.buildPhotoViewerLoadPlan({
    albumId: "album",
    currentIndex: 3,
    imageCount: 10,
    isPageVisible: true,
    now: 1200,
    previousPosition: {
      albumId: "album",
      averageStepMs: 0,
      direction: 0,
      index: 2,
      timestamp: 1000,
    },
    scrollDirection: 0,
  });

  assert.equal(plan.position.averageStepMs, 200);
  assert.equal(plan.position.direction, 1);
  assert.equal(plan.position.timestamp, 1200);
  assert.deepEqual(plan.warmIndexes, [3, 4, 5, 6, 7, 8, 9, 2]);
  assert.deepEqual(prefetch.getPhotoViewerDecodeIndexes(3, 10, 1, true), [3, 4]);
});

test("uses explicit scroll direction and limits hidden-page warming", () => {
  const previousPosition = {
    albumId: "album",
    averageStepMs: 400,
    direction: 1,
    index: 4,
    timestamp: 1000,
  };
  const plan = prefetch.buildPhotoViewerLoadPlan({
    albumId: "album",
    currentIndex: 4,
    imageCount: 10,
    isPageVisible: false,
    now: 1400,
    previousPosition,
    scrollDirection: -1,
  });

  assert.equal(plan.position.direction, -1);
  assert.equal(plan.position.averageStepMs, 400);
  assert.equal(plan.position.timestamp, 1000);
  assert.deepEqual(plan.warmIndexes, [4]);
  assert.deepEqual(prefetch.getPhotoViewerDecodeIndexes(4, 10, -1, false), [4, 3, 2, 5]);
});
