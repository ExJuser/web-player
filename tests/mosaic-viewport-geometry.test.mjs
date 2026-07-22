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

test("mosaic source popover opens beside the selected cell and stays inside the viewport", () => {
  const right = geometryModule.calculateMosaicPopoverAnchor({
    viewportWidth: 1000,
    viewportHeight: 660,
    cellLeft: 120,
    cellTop: 300,
    cellWidth: 18,
    cellHeight: 18,
    popoverWidth: 360,
    popoverHeight: 340,
  });
  assert.equal(right.side, "right");
  assert.equal(right.x, 150);

  const left = geometryModule.calculateMosaicPopoverAnchor({
    viewportWidth: 1000,
    viewportHeight: 660,
    cellLeft: 920,
    cellTop: 640,
    cellWidth: 18,
    cellHeight: 18,
    popoverWidth: 360,
    popoverHeight: 340,
  });
  assert.equal(left.side, "left");
  assert.equal(left.x, 548);
  assert.equal(left.y, 308);
});
