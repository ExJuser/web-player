import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createVideoThumbnailFfmpegArgs,
  createVideoThumbnailService,
} from "../server/videoThumbnailService.mjs";

test("video thumbnail ffmpeg args produce a bounded jpeg frame", () => {
  const args = createVideoThumbnailFfmpegArgs("source.mp4", "thumbnail.jpg");

  assert.deepEqual(args.slice(-4), ["-f", "image2", "-y", "thumbnail.jpg"]);
  assert.ok(args.includes("thumbnail=60,scale=960:540:force_original_aspect_ratio=decrease,pad=960:540:(ow-iw)/2:(oh-ih)/2:color=0x050607"));
});

test("playlist thumbnail ffmpeg args use the smaller list dimensions", () => {
  const args = createVideoThumbnailFfmpegArgs("source.mp4", "thumbnail.jpg", { variant: "playlist" });

  assert.ok(args.includes("thumbnail=60,scale=240:135:force_original_aspect_ratio=decrease,pad=240:135:(ow-iw)/2:(oh-ih)/2:color=0x050607"));
});

test("mosaic target ffmpeg args preserve a high resolution frame", () => {
  const args = createVideoThumbnailFfmpegArgs("source.mp4", "target.jpg", { highQuality: true });

  assert.ok(args.includes("thumbnail=60,scale='min(3840,iw)':'min(2160,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2"));
  assert.equal(args[args.indexOf("-q:v") + 1], "2");
});

test("video thumbnail service dedupes cache ids and serializes ffmpeg jobs", async () => {
  const cacheRoot = await mkdtemp(path.join(tmpdir(), "web-player-thumbnails-"));
  let activeProcesses = 0;
  let maximumActiveProcesses = 0;
  const calls = [];
  const runProcess = async (command, args) => {
    activeProcesses += 1;
    maximumActiveProcesses = Math.max(maximumActiveProcesses, activeProcesses);
    calls.push({ command, args });
    await new Promise((resolve) => setTimeout(resolve, 10));
    await writeFile(args.at(-1), `thumbnail-${calls.length}`);
    activeProcesses -= 1;
  };

  try {
    const service = createVideoThumbnailService({ cacheRoot, runProcess, maxConcurrency: 1 });
    const first = service.generate({ thumbnailId: "first", sourcePath: "first.mp4" });
    const duplicate = service.generate({ thumbnailId: "first", sourcePath: "first.mp4" });
    const second = service.generate({ thumbnailId: "second", sourcePath: "second.mp4" });

    assert.equal(first, duplicate);
    const [firstResult, duplicateResult, secondResult] = await Promise.all([first, duplicate, second]);
    assert.deepEqual(firstResult, duplicateResult);
    assert.equal(firstResult.cached, false);
    assert.equal(secondResult.cached, false);
    assert.equal(calls.length, 2);
    assert.equal(maximumActiveProcesses, 1);
    assert.equal(calls[0].command, "ffmpeg");
    assert.equal(await readFile(firstResult.filePath, "utf8"), "thumbnail-1");

    const cachedResult = await service.generate({ thumbnailId: "first", sourcePath: "first.mp4" });
    assert.equal(cachedResult.cached, true);
    assert.equal(calls.length, 2);
  } finally {
    await rm(cacheRoot, { recursive: true, force: true });
  }
});
