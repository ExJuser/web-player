import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createEmbeddedSubtitleService, normalizeSubtitleTrack } from "../server/embeddedSubtitles.mjs";

function createTestService(overrides = {}) {
  const calls = [];
  const service = createEmbeddedSubtitleService({
    cacheRoot: overrides.cacheRoot ?? path.join(os.tmpdir(), "web-player-embedded-test"),
    resolveVideoPath: (config, rootId, relativePath) => {
      calls.push({ type: "resolve", config, rootId, relativePath });
      return `video:${rootId}:${relativePath}`;
    },
    ensureFileExists: async (filePath) => {
      calls.push({ type: "ensure", filePath });
    },
    hashValue: (value) => `hash-${String(value).replace(/[^A-Za-z0-9]+/g, "-")}`,
    readTextFile: async () => null,
    runProcess: async () => "",
    ...overrides,
  });
  return { service, calls };
}

test("normalizeSubtitleTrack marks image subtitles as non-extractable", () => {
  assert.deepEqual(
    normalizeSubtitleTrack({
      index: "3",
      codec_name: "hdmv_pgs_subtitle",
      tags: { language: "jpn", title: "PGS" },
    }),
    {
      streamIndex: 3,
      codec: "hdmv_pgs_subtitle",
      language: "jpn",
      title: "PGS",
      extractable: false,
      reason: "Image subtitles need OCR and are not supported yet.",
    },
  );
});

test("probeEmbeddedSubtitles probes subtitle streams and normalizes tracks", async () => {
  const { service, calls } = createTestService({
    runProcess: async (command, args) => {
      calls.push({ type: "run", command, args });
      return JSON.stringify({
        streams: [
          { index: 2, codec_name: "subrip", tags: { language: "eng" } },
          { index: 4, codec_name: "dvd_subtitle", tags: { title: "image" } },
        ],
      });
    },
  });

  const result = await service.probeEmbeddedSubtitles({ roots: [] }, { rootId: "root", relativePath: "a.mkv" });

  assert.deepEqual(result.tracks, [
    {
      streamIndex: 2,
      codec: "subrip",
      language: "eng",
      title: undefined,
      extractable: true,
      reason: undefined,
    },
    {
      streamIndex: 4,
      codec: "dvd_subtitle",
      language: undefined,
      title: "image",
      extractable: false,
      reason: "Image subtitles need OCR and are not supported yet.",
    },
  ]);
  assert.equal(calls.find((call) => call.type === "ensure").filePath, "video:root:a.mkv");
  assert.deepEqual(calls.find((call) => call.type === "run").args, [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_streams",
    "-select_streams",
    "s",
    "video:root:a.mkv",
  ]);
});

test("extractEmbeddedSubtitle returns cached VTT text without running ffmpeg", async () => {
  const { service, calls } = createTestService({
    readTextFile: async (filePath) => {
      calls.push({ type: "read", filePath });
      return "WEBVTT cached";
    },
    runProcess: async () => {
      throw new Error("ffmpeg should not run");
    },
  });

  const result = await service.extractEmbeddedSubtitle({}, { rootId: "r", relativePath: "v.mkv", streamIndex: 1 });

  assert.deepEqual(result, {
    id: "hash-r-v-mkv-1-vtt",
    format: "vtt",
    text: "WEBVTT cached",
  });
});

test("extractEmbeddedSubtitle runs ffmpeg, writes cache, and rejects empty output", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "web-player-embedded-"));
  try {
    const { service, calls } = createTestService({
      cacheRoot: tempDir,
      runProcess: async (command, args, options) => {
        calls.push({ type: "run", command, args, options });
        return "WEBVTT extracted";
      },
    });

    const result = await service.extractEmbeddedSubtitle({}, { rootId: "r", relativePath: "v.mkv", streamIndex: 5 });
    const cachePath = path.join(tempDir, "hash-r-v-mkv-5-vtt.vtt");

    assert.deepEqual(result, {
      id: "hash-r-v-mkv-5-vtt",
      format: "vtt",
      text: "WEBVTT extracted",
    });
    assert.equal(await readFile(cachePath, "utf8"), "WEBVTT extracted");
    assert.deepEqual(calls.find((call) => call.type === "run").args, [
      "-v",
      "error",
      "-i",
      "video:r:v.mkv",
      "-map",
      "0:5",
      "-f",
      "webvtt",
      "-",
    ]);
    assert.deepEqual(calls.find((call) => call.type === "run").options, {
      timeoutMs: 30000,
      timeoutMessage: "Timed out extracting embedded subtitles.",
    });

    const empty = createTestService({
      cacheRoot: tempDir,
      hashValue: (value) => `empty-${String(value).replace(/[^A-Za-z0-9]+/g, "-")}`,
      runProcess: async () => "   ",
    }).service;
    await assert.rejects(
      () => empty.extractEmbeddedSubtitle({}, { rootId: "r", relativePath: "v.mkv", streamIndex: 6 }),
      /No subtitle text was extracted/,
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("readCachedEmbeddedSubtitle returns an empty text payload for missing cache", async () => {
  const { service } = createTestService();

  const result = await service.readCachedEmbeddedSubtitle({}, { rootId: "r", relativePath: "v.mkv", streamIndex: 2 });

  assert.deepEqual(result, {
    id: "hash-r-v-mkv-2-vtt",
    format: "vtt",
    text: "",
  });
});

test("embedded subtitle operations reject invalid stream indexes", async () => {
  const { service } = createTestService();

  await assert.rejects(
    () => service.extractEmbeddedSubtitle({}, { rootId: "r", relativePath: "v.mkv", streamIndex: -1 }),
    /Invalid subtitle stream/,
  );
  await assert.rejects(
    () => service.readCachedEmbeddedSubtitle({}, { rootId: "r", relativePath: "v.mkv", streamIndex: 1.5 }),
    /Invalid subtitle stream/,
  );
});
