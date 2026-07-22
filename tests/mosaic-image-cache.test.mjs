import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const pipeline = await importTsModule(new URL("../src/mosaicImagePipeline.ts", import.meta.url));

test("mosaic bitmap cache deduplicates concurrent decoding and respects source signatures", async () => {
  const originalCreateImageBitmap = globalThis.createImageBitmap;
  let decodeCount = 0;
  globalThis.createImageBitmap = async () => {
    decodeCount += 1;
    await Promise.resolve();
    return { width: 64, height: 48, close() {} };
  };

  try {
    const source = { id: "photo:1", size: 100, lastModified: 1, file: {} };
    const [first, second] = await Promise.all([
      pipeline.acquireMosaicBitmap(source, 128),
      pipeline.acquireMosaicBitmap(source, 128),
    ]);
    assert.equal(first.bitmap, second.bitmap);
    assert.equal(decodeCount, 1);
    first.release();
    second.release();

    const changed = await pipeline.acquireMosaicBitmap({ ...source, lastModified: 2 }, 128);
    assert.equal(decodeCount, 2);
    changed.release();
  } finally {
    globalThis.createImageBitmap = originalCreateImageBitmap;
  }
});
