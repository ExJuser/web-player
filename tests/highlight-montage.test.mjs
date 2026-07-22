import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  assertMontageMediaRoot,
  createHighlightMontage,
  createHighlightMontageArgs,
  createLosslessHighlightMontageArgs,
  createLosslessHighlightMontageScript,
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

test("creates a concat script and stream-copy arguments for lossless montage", () => {
  const script = createLosslessHighlightMontageScript("D:\\Media\\Director's Cut.mkv", [
    { startTime: 5, endTime: 10 },
    { startTime: 20, endTime: 25 },
  ]);
  const args = createLosslessHighlightMontageArgs("segments.ffconcat", "output.mkv", { hasAudio: true });

  assert.equal(script, [
    "ffconcat version 1.0",
    "file 'D:/Media/Director'\\''s Cut.mkv'",
    "inpoint 5",
    "outpoint 10",
    "file 'D:/Media/Director'\\''s Cut.mkv'",
    "inpoint 20",
    "outpoint 25",
    "",
  ].join("\n"));
  assert.deepEqual(args.slice(0, 8), ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i"]);
  assert.equal(args.includes("-filter_complex"), false);
  assert.deepEqual(args.slice(args.indexOf("-c"), args.indexOf("-map_metadata")), ["-c", "copy"]);
  assert.equal(args.at(-1), "output.mkv");
});

test("creates hardware-specific H.264 encoder arguments", () => {
  const segments = [{ startTime: 5, endTime: 10 }];
  const nvencArgs = createHighlightMontageArgs("input.mkv", "output.mp4", segments, {
    hasAudio: false,
    videoEncoder: "h264_nvenc",
  });
  const qsvArgs = createHighlightMontageArgs("input.mkv", "output.mp4", segments, {
    hasAudio: false,
    videoEncoder: "h264_qsv",
  });
  const amfArgs = createHighlightMontageArgs("input.mkv", "output.mp4", segments, {
    hasAudio: false,
    videoEncoder: "h264_amf",
  });

  assert.deepEqual(nvencArgs.slice(nvencArgs.indexOf("-c:v"), nvencArgs.indexOf("-pix_fmt")), [
    "-c:v", "h264_nvenc", "-preset", "p4", "-cq", "20", "-b:v", "0",
  ]);
  assert.deepEqual(qsvArgs.slice(qsvArgs.indexOf("-c:v"), qsvArgs.indexOf("-pix_fmt")), [
    "-c:v", "h264_qsv", "-preset", "fast", "-global_quality", "20",
  ]);
  assert.deepEqual(amfArgs.slice(amfArgs.indexOf("-c:v"), amfArgs.indexOf("-pix_fmt")), [
    "-c:v", "h264_amf", "-quality", "balanced", "-rc", "cqp", "-qp_i", "20", "-qp_p", "20",
  ]);
});

test("selects the first hardware encoder that initializes successfully", async () => {
  const montageModule = await import("../server/highlightMontage.mjs");
  assert.equal(typeof montageModule.selectHighlightMontageVideoEncoder, "function");
  const attempts = [];

  const selected = await montageModule.selectHighlightMontageVideoEncoder(async (command, args) => {
    assert.equal(command, "ffmpeg");
    const encoder = args[args.indexOf("-c:v") + 1];
    attempts.push(encoder);
    if (encoder !== "h264_qsv") throw new Error("encoder unavailable");
  });

  assert.equal(selected, "h264_qsv");
  assert.deepEqual(attempts, ["h264_nvenc", "h264_qsv"]);
});

test("falls back to libx264 when hardware encoders cannot initialize", async () => {
  const montageModule = await import("../server/highlightMontage.mjs");
  assert.equal(typeof montageModule.selectHighlightMontageVideoEncoder, "function");
  const attempts = [];

  const selected = await montageModule.selectHighlightMontageVideoEncoder(async (_command, args) => {
    attempts.push(args[args.indexOf("-c:v") + 1]);
    throw new Error("encoder unavailable");
  });

  assert.equal(selected, "libx264");
  assert.deepEqual(attempts, ["h264_nvenc", "h264_qsv", "h264_amf"]);
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
  let montageArgs = null;

  try {
    const result = await createHighlightMontage({
      runProcess: async (command, args, options) => {
        if (command === "ffprobe") {
          return JSON.stringify({
            format: { duration: "100" },
            streams: [{ codec_type: "video" }, { codec_type: "audio" }],
          });
        }
        if (args.at(-1) === "-") {
          if (args.includes("h264_nvenc")) return "";
          throw new Error("encoder unavailable");
        }
        montageArgs = args;
        await writeFile(args.at(-1), "montage-output");
        options.onStdout(Buffer.from("out_time=00:00:10.000000\nprogress=continue\n"));
        return "";
      },
      sourcePath,
      rootId: "movies",
      relativePath: "Classics/霸王别姬.1993.mkv",
      segments: [{ startTime: 10, endTime: 30 }],
      sourceHighlights: [{ id: "h1", startTime: 12, endTime: 15, tag: "高能", updatedAt: 1 }],
      persistMetadata: (videoId, highlights) => persisted.push({ videoId, highlights }),
      now: () => 999,
      onProgress: (event) => progressEvents.push(event),
    });

    assert.equal(result.fileName, "霸王别姬.1993-edit-2.mp4");
    assert.equal(result.mode, "precise");
    assert.equal(result.relativePath, "Classics/霸王别姬.1993-edit-2.mp4");
    assert.equal(result.segmentCount, 1);
    assert.equal(result.durationSeconds, 20);
    assert.equal(montageArgs.includes("h264_nvenc"), true);
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

test("creates a lossless montage in the source container without probing encoders", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "web-player-lossless-montage-"));
  const sourcePath = path.join(directory, "Movie.mkv");
  await writeFile(sourcePath, "source");
  let montageArgs = null;
  let concatScript = "";
  const persisted = [];

  try {
    const result = await createHighlightMontage({
      runProcess: async (command, args) => {
        if (command === "ffprobe") {
          if (args.at(-1) !== sourcePath) {
            return JSON.stringify({ format: { duration: "20.75" }, streams: [{ codec_type: "video" }, { codec_type: "audio" }] });
          }
          return JSON.stringify({
            format: { duration: "100" },
            streams: [{ codec_type: "video" }, { codec_type: "audio" }],
          });
        }
        assert.equal(args.at(-1) === "-", false);
        montageArgs = args;
        concatScript = await readFile(args[args.indexOf("-i") + 1], "utf8");
        await writeFile(args.at(-1), "lossless-output");
        return "";
      },
      sourcePath,
      rootId: "movies",
      relativePath: "Movie.mkv",
      segments: [{ startTime: 10, endTime: 30 }],
      mode: "lossless",
      sourceHighlights: [
        { id: "h1", startTime: 12, endTime: 15, tag: "高能", updatedAt: 1 },
        { id: "h2", startTime: 40, endTime: 45, tag: "范围外", updatedAt: 1 },
      ],
      now: () => 1000,
      persistMetadata: (videoId, highlights) => persisted.push({ videoId, highlights }),
    });

    assert.equal(result.fileName, "Movie-edit.mkv");
    assert.equal(result.mode, "lossless");
    assert.equal(result.relativePath, "Movie-edit.mkv");
    assert.equal(result.durationSeconds, 20.75);
    assert.equal(montageArgs.includes("copy"), true);
    assert.match(concatScript, /inpoint 10\noutpoint 30/);
    assert.deepEqual(persisted[0].highlights, [
      { id: "edit-h1-1", startTime: 2, endTime: 5, tag: "高能", updatedAt: 1000 },
    ]);
    assert.equal(await readFile(path.join(directory, result.fileName), "utf8"), "lossless-output");
    assert.deepEqual((await readdir(directory)).sort(), ["Movie-edit.mkv", "Movie.mkv"]);
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
        if (args.at(-1) === "-") throw new Error("encoder unavailable");
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
        if (args.at(-1) === "-") throw new Error("encoder unavailable");
        await writeFile(args.at(-1), "complete");
        return "";
      },
      sourcePath,
      rootId: "movies",
      relativePath: "Movie.mp4",
      segments: [{ startTime: 1, endTime: 5 }],
      persistMetadata: () => { throw new Error("storage failed"); },
    }), /storage failed/);
    assert.deepEqual((await readdir(directory)).sort(), ["Movie.mp4"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
