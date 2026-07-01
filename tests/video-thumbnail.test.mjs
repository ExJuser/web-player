import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const thumbnail = await importTsModule(new URL("../src/videoThumbnail.ts", import.meta.url));

function writeType(view, offset, type) {
  for (let index = 0; index < type.length; index += 1) {
    view.setUint8(offset + index, type.charCodeAt(index));
  }
}

function createMoovBuffer({ timescale, duration }) {
  const buffer = new ArrayBuffer(36);
  const view = new DataView(buffer);

  view.setUint32(0, 36);
  writeType(view, 4, "moov");
  view.setUint32(8, 28);
  writeType(view, 12, "mvhd");
  view.setUint8(16, 0);
  view.setUint32(20, 0);
  view.setUint32(24, 0);
  view.setUint32(28, timescale);
  view.setUint32(32, duration);

  return buffer;
}

test("parses mp4 movie duration from mvhd", () => {
  const buffer = createMoovBuffer({ timescale: 1000, duration: 123456 });

  assert.equal(thumbnail.parseMp4MovieDuration(buffer), 123.456);
});

test("ignores invalid mp4 movie duration values", () => {
  const buffer = createMoovBuffer({ timescale: 0, duration: 123456 });

  assert.equal(thumbnail.parseMp4MovieDuration(buffer), undefined);
});

test("selects the shortest finite positive duration", () => {
  assert.equal(thumbnail.selectTrustedDuration([undefined, Number.NaN, 25, 12, Infinity]), 12);
  assert.equal(thumbnail.selectTrustedDuration([undefined, 0, -1, Number.NaN]), undefined);
});

test("returns video display size only when both dimensions are present", () => {
  assert.deepEqual(thumbnail.getVideoDisplaySize(1920, 1080), { width: 1920, height: 1080 });
  assert.equal(thumbnail.getVideoDisplaySize(1920, 0), null);
  assert.equal(thumbnail.getVideoDisplaySize(undefined, 1080), null);
});
