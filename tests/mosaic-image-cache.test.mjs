import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const pipeline = await importTsModule(new URL("../src/mosaicImagePipeline.ts", import.meta.url));

function replaceGlobal(name, value) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, value });
  return () => descriptor
    ? Object.defineProperty(globalThis, name, descriptor)
    : delete globalThis[name];
}

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

test("mosaic bitmap cache uses the original media URL for detail viewing", async () => {
  const originalCreateImageBitmap = globalThis.createImageBitmap;
  const originalFetch = globalThis.fetch;
  const requestedUrls = [];
  globalThis.fetch = async (url) => {
    requestedUrls.push(url);
    return { ok: true, blob: async () => ({}) };
  };
  globalThis.createImageBitmap = async () => ({ width: 64, height: 48, close() {} });

  try {
    const lease = await pipeline.acquireMosaicBitmap({
      id: "photo:original",
      size: 100,
      lastModified: 1,
      url: "/thumbnail.jpg",
      originalUrl: "/api/media/photos/original.jpg",
    }, 128, true);
    lease.release();
    assert.deepEqual(requestedUrls, ["/api/media/photos/original.jpg"]);
  } finally {
    globalThis.createImageBitmap = originalCreateImageBitmap;
    globalThis.fetch = originalFetch;
  }
});

test("mosaic rendering preserves layout, rotation, progress, and target cleanup", async () => {
  const canvases = [];
  class FakeOffscreenCanvas {
    constructor(width, height) {
      this.width = width;
      this.height = height;
      this.draws = [];
      this.rotations = [];
      this.context = {
        fillRect() {},
        save() {},
        restore() {},
        translate() {},
        rotate: (angle) => this.rotations.push(angle),
        drawImage: (...args) => this.draws.push(args),
      };
      canvases.push(this);
    }
    getContext() { return this.context; }
    async convertToBlob(options) { return new Blob(["mosaic"], { type: options.type }); }
  }

  const sourceFile = { kind: "source" };
  const targetFile = { kind: "target" };
  let targetCloseCount = 0;
  const restoreCanvas = replaceGlobal("OffscreenCanvas", FakeOffscreenCanvas);
  const restoreBitmap = replaceGlobal("createImageBitmap", async (file) => ({
    width: file === targetFile ? 80 : 64,
    height: file === targetFile ? 40 : 32,
    close() { if (file === targetFile) targetCloseCount++; },
  }));
  const progress = [];
  const previews = [];

  try {
    const result = await pipeline.renderMosaic({
      sources: [{ id: "tile", size: 1, lastModified: 1, file: sourceFile }],
      assignments: ["tile", "tile"],
      target: { file: targetFile },
      targetColors: [[1, 2, 3], [4, 5, 6]],
      columns: 2,
      rows: 1,
      longestEdge: 800,
      colorPreservation: 1,
      targetClarity: 0.5,
      targetRotation: 90,
      tileFit: "contain",
      type: "image/png",
      onProgress: (completed, total) => progress.push([completed, total]),
      onPreview: (preview, completed, total) => previews.push([preview, completed, total]),
    });

    assert.equal(result.type, "image/png");
    assert.deepEqual([canvases[0].width, canvases[0].height], [800, 400]);
    assert.deepEqual(canvases[0].draws.slice(0, 2).map((args) => args.slice(1)), [
      [0, 100.25, 401, 200.5],
      [400, 100.25, 401, 200.5],
    ]);
    assert.equal(canvases[0].rotations.at(-1), Math.PI / 2);
    assert.deepEqual(progress, [[1, 1]]);
    assert.deepEqual(previews, [[result, 1, 1]]);
    assert.equal(targetCloseCount, 1);
  } finally {
    restoreBitmap();
    restoreCanvas();
  }
});
