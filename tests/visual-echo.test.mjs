import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const echo = await importTsModule(new URL("../src/visualEcho.ts", import.meta.url));

function video(id, overrides = {}) {
  return {
    id,
    name: `${id}.mp4`,
    relativePath: `${id}.mp4`,
    url: "",
    size: overrides.size ?? 100,
    lastModified: overrides.lastModified ?? 200,
  };
}

function descriptor(hash, luma, color) {
  return {
    version: 1,
    hash,
    luma: Array(24).fill(luma),
    color: Array(32).fill(color),
  };
}

function sample(id, videoId, value, timestamp = 10) {
  const target = video(videoId);
  return {
    id,
    frameId: id,
    videoId,
    timestamp,
    videoSignature: echo.createVisualEchoVideoSignature(target),
    descriptor: descriptor(value ? "ffffffffffffffff" : "0000000000000000", value, value * 255),
  };
}

test("creates adaptive sample times inside the five-percent boundaries", () => {
  const short = echo.createVisualEchoSampleTimes(60);
  const long = echo.createVisualEchoSampleTimes(10_000);
  assert.equal(short.length, 6);
  assert.equal(long.length, 24);
  assert.ok(short[0] > 3);
  assert.ok(short.at(-1) < 57);
  assert.deepEqual(echo.createVisualEchoSampleTimes(0), []);
});

test("creates stable video signatures and frame ids", () => {
  const target = video("a");
  assert.equal(echo.createVisualEchoVideoSignature(target), echo.createVisualEchoVideoSignature(target));
  assert.notEqual(
    echo.createVisualEchoVideoSignature(target),
    echo.createVisualEchoVideoSignature(video("a", { size: target.size + 1 })),
  );
  assert.equal(echo.createVisualEchoFrameId("signature", 12.3454), echo.createVisualEchoFrameId("signature", 12.3454));
  assert.notEqual(echo.createVisualEchoFrameId("signature", 12), echo.createVisualEchoFrameId("signature", 13));
});

test("creates deterministic descriptor shapes from the same pixels", () => {
  const pixels = new Uint8ClampedArray(12 * 8 * 4);
  for (let index = 0; index < pixels.length; index += 4) {
    pixels[index] = (index * 7) % 255;
    pixels[index + 1] = (index * 11) % 255;
    pixels[index + 2] = (index * 13) % 255;
    pixels[index + 3] = 255;
  }
  const imageData = { data: pixels, width: 12, height: 8 };
  const first = echo.createVisualEchoDescriptor(imageData);
  const second = echo.createVisualEchoDescriptor(imageData);
  assert.deepEqual(first, second);
  assert.equal(first.hash.length, 16);
  assert.equal(first.luma.length, 24);
  assert.equal(first.color.length, 32);
});

test("scores hash, composition, and color similarities with configured weights", () => {
  assert.equal(echo.visualEchoHashSimilarity("0000000000000000", "0000000000000000"), 1);
  assert.equal(echo.visualEchoHashSimilarity("0000000000000000", "ffffffffffffffff"), 0);
  assert.equal(echo.visualEchoCompositionSimilarity([0, 0], [1, 1]), 0);
  assert.equal(echo.visualEchoColorSimilarity([0], [255]), 0);
  const score = echo.scoreVisualEchoDescriptors(
    descriptor("0000000000000000", 0, 0),
    descriptor("ffffffffffffffff", 0, 0),
  );
  assert.equal(score.score, 55);
});

test("finds stable cross-video matches and optionally includes the source video", () => {
  const source = sample("source", "a", 0);
  const sameVideo = sample("same", "a", 0.05);
  const closest = sample("closest", "b", 0.05);
  const farther = sample("farther", "c", 1);
  const index = { version: 1, updatedAt: 1, samples: [farther, sameVideo, closest, source] };

  assert.deepEqual(echo.findVisualEchoMatches(source, index).map((match) => match.sample.id), ["closest", "farther"]);
  assert.deepEqual(
    echo.findVisualEchoMatches(source, index, { includeSameVideo: true, limit: 2 }).map((match) => match.sample.id),
    ["same", "closest"],
  );
});

test("handles empty and single-video indexes and caps results at eighteen", () => {
  const source = sample("source", "a", 0);
  assert.deepEqual(echo.findVisualEchoMatches(source, { version: 1, updatedAt: 0, samples: [] }), []);
  assert.deepEqual(echo.findVisualEchoMatches(source, { version: 1, updatedAt: 0, samples: [source] }), []);
  const candidates = Array.from({ length: 25 }, (_, index) => sample(`candidate-${index}`, `video-${index}`, index / 100, index));
  assert.equal(
    echo.findVisualEchoMatches(source, { version: 1, updatedAt: 1, samples: candidates }).length,
    18,
  );
});

test("filters stale and missing video samples from an index", () => {
  const current = video("a");
  const stale = video("b", { lastModified: 999 });
  const index = {
    version: 1,
    updatedAt: 1,
    samples: [
      sample("current", "a", 0),
      sample("stale", "b", 0),
      sample("missing", "c", 0),
    ],
  };
  const filtered = echo.filterVisualEchoIndex(index, [current, stale]);
  assert.deepEqual(filtered.samples.map((item) => item.id), ["current"]);
});
