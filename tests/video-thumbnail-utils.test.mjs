import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const videoThumbnailUtils = await importTsModule(new URL("../src/videoThumbnailUtils.ts", import.meta.url));

test("createThumbnailTargetTimes falls back to the first frame without a positive duration", () => {
  assert.deepEqual(videoThumbnailUtils.createThumbnailTargetTimes(0), [0]);
  assert.deepEqual(videoThumbnailUtils.createThumbnailTargetTimes(Number.NaN), [0]);
  assert.deepEqual(videoThumbnailUtils.createThumbnailTargetTimes(Infinity), [0]);
});

test("createThumbnailTargetTimes clamps and de-duplicates short video times", () => {
  assert.deepEqual(videoThumbnailUtils.createThumbnailTargetTimes(0.15), [0.1]);
  assert.deepEqual(videoThumbnailUtils.createThumbnailTargetTimes(0.3), [0.1]);
});

test("createThumbnailTargetTimes keeps the existing percentage and two-second probes", () => {
  assert.deepEqual(videoThumbnailUtils.createThumbnailTargetTimes(20), [2, 5, 10, 15]);
  assert.deepEqual(videoThumbnailUtils.createThumbnailTargetTimes(60), [6, 15, 30, 45, 2]);
});

test("getVideoDisplaySize returns dimensions only when both sides are known", () => {
  assert.deepEqual(videoThumbnailUtils.getVideoDisplaySize(1920, 1080), { width: 1920, height: 1080 });
  assert.equal(videoThumbnailUtils.getVideoDisplaySize(0, 1080), null);
  assert.equal(videoThumbnailUtils.getVideoDisplaySize(1920, undefined), null);
});

test("getPlayerFrameAspectRatio keeps the widescreen player fallback", () => {
  assert.equal(videoThumbnailUtils.getPlayerFrameAspectRatio(), 16 / 9);
});

function createCanvasContext(pixels) {
  return {
    getImageData: () => ({ data: new Uint8ClampedArray(pixels.flatMap(([red, green, blue]) => [red, green, blue, 255])) }),
  };
}

test("isCanvasNearlyBlack treats fewer than one percent bright pixels as black", () => {
  const mostlyDarkPixels = Array.from({ length: 200 }, () => [4, 5, 6]);
  mostlyDarkPixels[0] = [20, 20, 20];

  assert.equal(videoThumbnailUtils.isCanvasNearlyBlack(createCanvasContext(mostlyDarkPixels), 20, 10), true);
});

test("isCanvasNearlyBlack rejects frames at or above the bright pixel threshold", () => {
  const darkContext = {
    getImageData: () => ({ data: new Uint8ClampedArray([4, 5, 6, 255, 8, 8, 8, 255]) }),
  };
  const brightContext = {
    getImageData: () => ({ data: new Uint8ClampedArray([4, 5, 6, 255, 20, 20, 20, 255]) }),
  };

  assert.equal(videoThumbnailUtils.isCanvasNearlyBlack(darkContext, 2, 1), true);
  assert.equal(videoThumbnailUtils.isCanvasNearlyBlack(brightContext, 2, 1), false);
});
