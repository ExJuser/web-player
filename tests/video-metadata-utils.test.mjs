import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const videoMetadataUtils = await importTsModule(new URL("../src/videoMetadataUtils.ts", import.meta.url));

function writeAscii(view, offset, value) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function createBox(type, payload) {
  const buffer = new ArrayBuffer(8 + payload.byteLength);
  const view = new DataView(buffer);
  view.setUint32(0, buffer.byteLength);
  writeAscii(view, 4, type);
  new Uint8Array(buffer, 8).set(new Uint8Array(payload));
  return buffer;
}

function createMovieHeaderBox({ version = 0, timescale, duration }) {
  const payloadLength = version === 1 ? 32 : 20;
  const payload = new ArrayBuffer(payloadLength);
  const view = new DataView(payload);
  view.setUint8(0, version);

  if (version === 1) {
    view.setUint32(20, timescale);
    view.setUint32(24, Math.floor(duration / 2 ** 32));
    view.setUint32(28, duration >>> 0);
  } else {
    view.setUint32(12, timescale);
    view.setUint32(16, duration);
  }

  return createBox("mvhd", payload);
}

function concatBuffers(...buffers) {
  const totalLength = buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const buffer of buffers) {
    result.set(new Uint8Array(buffer), offset);
    offset += buffer.byteLength;
  }

  return result.buffer;
}

test("parseMp4MovieDuration reads version 0 movie header duration", () => {
  const moov = createBox("moov", concatBuffers(
    createBox("free", new ArrayBuffer(4)),
    createMovieHeaderBox({ timescale: 1000, duration: 123456 }),
  ));

  assert.equal(videoMetadataUtils.parseMp4MovieDuration(moov), 123.456);
});

test("parseMp4MovieDuration reads version 1 movie header duration", () => {
  const duration = 2 ** 32 + 90000;
  const moov = createBox("moov", createMovieHeaderBox({ version: 1, timescale: 90000, duration }));

  assert.equal(videoMetadataUtils.parseMp4MovieDuration(moov), duration / 90000);
});

test("parseMp4MovieDuration ignores invalid boxes and zero timescale", () => {
  const invalidSize = new ArrayBuffer(8);
  const invalidView = new DataView(invalidSize);
  invalidView.setUint32(0, 4);
  writeAscii(invalidView, 4, "free");

  assert.equal(videoMetadataUtils.parseMp4MovieDuration(invalidSize), undefined);
  assert.equal(
    videoMetadataUtils.parseMp4MovieDuration(createBox("moov", createMovieHeaderBox({ timescale: 0, duration: 100 }))),
    undefined,
  );
});

test("selectTrustedDuration returns the smallest positive finite candidate", () => {
  assert.equal(videoMetadataUtils.selectTrustedDuration([undefined, Number.NaN, Infinity, 120, 118.5]), 118.5);
  assert.equal(videoMetadataUtils.selectTrustedDuration([undefined, 0, -1, Number.NaN]), undefined);
});
