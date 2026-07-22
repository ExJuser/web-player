import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const geometryModule = await importTsModule(new URL("../src/mosaicViewportGeometry.ts", import.meta.url));

test("mosaic viewport hit testing follows zoom and pan geometry", () => {
  const geometry = geometryModule.calculateMosaicGeometry({
    viewportWidth: 1000,
    viewportHeight: 600,
    imageWidth: 1600,
    imageHeight: 900,
    transform: { scale: 2, x: 120, y: -40 },
  });
  const cell = geometryModule.locateMosaicCell({
    pointX: geometry.left + geometry.width * 0.75,
    pointY: geometry.top + geometry.height * 0.25,
    columns: 160,
    rows: 90,
    geometry,
  });

  assert.deepEqual(cell, { column: 120, row: 22, index: 3640 });
  assert.equal(geometryModule.locateMosaicCell({ pointX: geometry.left - 1, pointY: geometry.top, columns: 160, rows: 90, geometry }), null);
});
