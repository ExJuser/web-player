import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const rotation = await importTsModule(new URL("../src/mosaicRotation.ts", import.meta.url));

test("mosaic target rotation swaps dimensions for quarter turns", () => {
  assert.deepEqual(rotation.getMosaicRotatedDimensions(1200, 800, 0), { width: 1200, height: 800 });
  assert.deepEqual(rotation.getMosaicRotatedDimensions(1200, 800, 90), { width: 800, height: 1200 });
  assert.deepEqual(rotation.getMosaicRotatedDimensions(1200, 800, 180), { width: 1200, height: 800 });
  assert.deepEqual(rotation.getMosaicRotatedDimensions(1200, 800, 270), { width: 800, height: 1200 });
});

test("mosaic target rotation normalizes old or invalid project values", () => {
  assert.equal(rotation.normalizeMosaicTargetRotation(undefined), 0);
  assert.equal(rotation.normalizeMosaicTargetRotation(90), 90);
  assert.equal(rotation.normalizeMosaicTargetRotation(45), 0);
});
