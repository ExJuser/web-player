import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const utils = await importTsModule(new URL("../src/videoEditUtils.ts", import.meta.url));

test("creates an ordered edit retention segment from two playback marks", () => {
  assert.deepEqual(utils.createVideoEditSegment(20, 5, 1000), {
    id: "edit-50-200-rs",
    startTime: 5,
    endTime: 20,
    updatedAt: 1000,
  });
  assert.equal(utils.createVideoEditSegment(5, 5.1, 1000), null);
});

test("summarizes merged edit retention segments for confirmation", () => {
  assert.deepEqual(utils.summarizeVideoEditSegments([
    { id: "b", startTime: 18, endTime: 30, updatedAt: 1 },
    { id: "a", startTime: 5, endTime: 20, updatedAt: 1 },
    { id: "c", startTime: 40, endTime: 45, updatedAt: 1 },
  ]), {
    mergedSegmentCount: 2,
    durationSeconds: 30,
  });
});
