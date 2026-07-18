import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  assertMontageMediaRoot,
  createHighlightMontage,
  createHighlightMontageArgs,
  mapHighlightsToMontage,
  normalizeMontageSegments,
} from "../server/highlightMontage.mjs";

test("requires a configured local path for browser media roots", () => {
  assert.throws(() => assertMontageMediaRoot(null), /未找到/);
  assert.throws(() => assertMontageMediaRoot({ source: "browser" }), /配置本机路径/);
  assert.doesNotThrow(() => assertMontageMediaRoot({ source: "browser", localPath: "D:/Media" }));
  assert.doesNotThrow(() => assertMontageMediaRoot({ source: "server" }));
});

test("sorts and merges overlapping or touching montage segments", () => {
  assert.deepEqual(normalizeMontageSegments([
    { id: "third", startTime: 30, endTime: 50 },
    { id: "first", startTime: 5, endTime: 12 },
    { id: "second", startTime: 10, endTime: 30 },
    { id: "last", startTime: 70, endTime: 130 },
  ], 100), [
    { startTime: 5, endTime: 50 },
    { startTime: 70, endTime: 100 },
  ]);
});

test("rejects invalid montage segments and an empty result", () => {
  assert.throws(() => normalizeMontageSegments([{ startTime: Number.NaN, endTime: 10 }], 100), /无效/);
  assert.throws(() => normalizeMontageSegments([{ startTime: 100, endTime: 110 }], 100), /有效/);
  assert.throws(() => normalizeMontageSegments([], 100), /至少标记一个/);
});

test("maps source highlights onto the concatenated montage timeline", () => {
  assert.deepEqual(mapHighlightsToMontage([
    { id: "h1", startTime: 12, endTime: 14, tag: "名场面", updatedAt: 1 },
    { id: "h2", startTime: 42, endTime: 48, updatedAt: 2 },
  ], [
    { startTime: 10, endTime: 20 },
    { startTime: 40, endTime: 50 },
  ], 999), [
    { id: "edit-h1-1", startTime: 2, endTime: 4, tag: "名场面", updatedAt: 999 },
    { id: "edit-h2-2", startTime: 12, endTime: 18, updatedAt: 999 },
  ]);
});

test("rejects a high energy highlight outside retained montage segments", () => {
  assert.throws(() => mapHighlightsToMontage([
    { id: "h1", startTime: 18, endTime: 22, updatedAt: 1 },
  ], [{ startTime: 10, endTime: 20 }]), /不完全位于剪辑保留片段内/);
});

test("rejects malformed high energy highlights supplied by the client", () => {
  assert.throws(() => mapHighlightsToMontage([
    { id: "bad", startTime: Number.NaN, endTime: 12, updatedAt: 1 },
  ], [{ startTime: 0, endTime: 20 }]), /无效的高能片段/);
});

test("allows sub-millisecond highlight drift at a retained boundary", () => {
  assert.deepEqual(mapHighlightsToMontage([
    { id: "h1", startTime: 10, endTime: 20.0004, updatedAt: 1 },
  ], [{ startTime: 10, endTime: 20 }], 2), [
    { id: "edit-h1-1", startTime: 0, endTime: 10, updatedAt: 2 },
  ]);
});

test("creates precise H.264 AAC montage arguments for media with audio", () => {
  const args = createHighlightMontageArgs("input.mkv", "output.tmp.mp4", [
    { startTime: 5, endTime: 10 },
    { startTime: 20, endTime: 25 },
  ], { hasAudio: true });

  assert.equal(args.includes("-filter_complex"), true);
  assert.match(args[args.indexOf("-filter_complex") + 1], /trim=start=5:end=10/);
  assert.match(args[args.indexOf("-filter_complex") + 1], /atrim=start=20:end=25/);
  assert.match(args[args.indexOf("-filter_complex") + 1], /concat=n=2:v=1:a=1/);
  assert.equal(args.includes("libx264"), true);
  assert.equal(args.includes("aac"), true);
  assert.equal(args.includes("yuv420p"), true);
  assert.equal(args.at(-1), "output.tmp.mp4");
});

test("creates video-only montage arguments when the source has no audio", () => {
  const args = createHighlightMontageArgs("input.mp4", "output.tmp.mp4", [
    { startTime: 0, endTime: 8 },
  ], { hasAudio: false });
  const filter = args[args.indexOf("-filter_complex") + 1];

  assert.match(filter, /concat=n=1:v=1:a=0/);
  assert.doesNotMatch(filter, /atrim/);
  assert.equal(args.includes("aac"), false);
});

test("writes an incremented edit file and persists mapped highlights", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "web-player-montage-"));
  const sourcePath = path.join(directory, "霸王别姬.1993.mkv");
  await writeFile(sourcePath, "source");
  await writeFile(path.join(directory, "霸王别姬.1993-edit.mp4"), "existing");
  const persisted = [];
  const progressEvents = [];

  try {
    const result = await createHighlightMontage({
      runProcess: async (command, args, options) => {
        if (command === "ffprobe") {
          return JSON.stringify({
            format: { duration: "100" },
            streams: [{ codec_type: "video" }, { codec_type: "audio" }],
          });
        }
        await writeFile(args.at(-1), "montage-output");
        options.onStdout(Buffer.from("out_time=00:00:10.000000\nprogress=continue\n"));
        return "";
      },
      sourcePath,
      rootId: "movies",
      relativePath: "Classics/霸王别姬.1993.mkv",
      segments: [{ startTime: 10, endTime: 30 }],
      sourceHighlights: [{ id: "h1", startTime: 12, endTime: 15, tag: "高能", updatedAt: 1 }],
      persistHighlights: (videoId, highlights) => persisted.push({ videoId, highlights }),
      now: () => 999,
      onProgress: (event) => progressEvents.push(event),
    });

    assert.equal(result.fileName, "霸王别姬.1993-edit-2.mp4");
    assert.equal(result.relativePath, "Classics/霸王别姬.1993-edit-2.mp4");
    assert.equal(result.segmentCount, 1);
    assert.equal(result.durationSeconds, 20);
    assert.match(result.videoId, /^movies\|Classics\/霸王别姬\.1993-edit-2\.mp4\|/);
    assert.equal(await readFile(path.join(directory, result.fileName), "utf8"), "montage-output");
    assert.deepEqual(persisted[0].highlights, [
      { id: "edit-h1-1", startTime: 2, endTime: 5, tag: "高能", updatedAt: 999 },
    ]);
    assert.equal(progressEvents.some((event) => event.percent === 50), true);
    assert.equal(progressEvents.at(-1).percent, 100);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("cleans temporary and final output when generation or persistence fails", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "web-player-montage-cleanup-"));
  const sourcePath = path.join(directory, "Movie.mp4");
  await writeFile(sourcePath, "source");

  try {
    await assert.rejects(() => createHighlightMontage({
      runProcess: async (command, args) => {
        if (command === "ffprobe") {
          return JSON.stringify({ format: { duration: "20" }, streams: [{ codec_type: "video" }] });
        }
        await writeFile(args.at(-1), "partial");
        throw new Error("cancelled");
      },
      sourcePath,
      rootId: "movies",
      relativePath: "Movie.mp4",
      segments: [{ startTime: 1, endTime: 5 }],
    }), /cancelled/);
    assert.deepEqual((await readdir(directory)).sort(), ["Movie.mp4"]);

    await assert.rejects(() => createHighlightMontage({
      runProcess: async (command, args) => {
        if (command === "ffprobe") {
          return JSON.stringify({ format: { duration: "20" }, streams: [{ codec_type: "video" }] });
        }
        await writeFile(args.at(-1), "complete");
        return "";
      },
      sourcePath,
      rootId: "movies",
      relativePath: "Movie.mp4",
      segments: [{ startTime: 1, endTime: 5 }],
      persistHighlights: () => { throw new Error("storage failed"); },
    }), /storage failed/);
    assert.deepEqual((await readdir(directory)).sort(), ["Movie.mp4"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
