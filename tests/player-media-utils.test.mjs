import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const mediaUtils = await importTsModule(new URL("../src/playerMediaUtils.ts", import.meta.url));

const createVideo = (overrides = {}) => ({
  id: overrides.id ?? overrides.relativePath ?? "show/01.mp4",
  name: overrides.name ?? (overrides.relativePath ? overrides.relativePath.split("/").at(-1) : "01.mp4"),
  relativePath: overrides.relativePath ?? "show/01.mp4",
  url: overrides.url ?? "/video",
  size: overrides.size ?? 100,
  lastModified: overrides.lastModified ?? 1,
  ...overrides,
});

test("sorts playlist paths with season-aware natural order", () => {
  const videos = [
    createVideo({ id: "s10", name: "02.mp4", relativePath: "Show/S10/02.mp4" }),
    createVideo({ id: "s2", name: "10.mp4", relativePath: "Show/S2/10.mp4" }),
    createVideo({ id: "season-cn", name: "01.mp4", relativePath: "Show/第十季/01.mp4" }),
    createVideo({ id: "s1", name: "02.mp4", relativePath: "Show/S1/02.mp4" }),
  ];

  assert.deepEqual(
    mediaUtils.getSortedVideos(videos, "path", false).map((video) => video.id),
    ["s1", "s2", "season-cn", "s10"],
  );
  assert.deepEqual(
    mediaUtils.getSortedVideos(videos, "path", true).map((video) => video.id),
    ["s10", "season-cn", "s2", "s1"],
  );
});

test("sorts playlist entries by stats modes with path fallback", () => {
  const first = createVideo({ id: "a", name: "Same.mp4", relativePath: "A/01.mp4", size: 100, lastModified: 10, duration: 100 });
  const second = createVideo({ id: "b", name: "Same.mp4", relativePath: "B/01.mp4", size: 200, lastModified: 20, duration: 100 });
  const stats = {
    "same.mp4|100|10": { totalPlayedSeconds: 20, playCount: 1, emissionCount: 4, durationSeconds: 100 },
    "same.mp4|200|20": { totalPlayedSeconds: 40, playCount: 2, emissionCount: 3, durationSeconds: 100 },
  };

  assert.deepEqual(
    mediaUtils.getSortedVideos([first, second], "playedDuration", false, stats).map((video) => video.id),
    ["b", "a"],
  );
  assert.deepEqual(
    mediaUtils.getSortedVideos([first, second], "emissionCount", false, stats).map((video) => video.id),
    ["a", "b"],
  );
});

test("finds latest resumable video while excluding completed and near-ended progress", () => {
  const videos = [createVideo({ id: "old" }), createVideo({ id: "done" }), createVideo({ id: "near-end" }), createVideo({ id: "latest" })];
  const result = mediaUtils.getLatestResumableVideo(videos, {
    old: { currentTime: 10, duration: 100, updatedAt: 10, completed: false },
    done: { currentTime: 10, duration: 100, updatedAt: 100, completed: true },
    "near-end": { currentTime: 95, duration: 100, updatedAt: 200, completed: false },
    latest: { currentTime: 20, duration: 100, updatedAt: 300, completed: false },
  });

  assert.equal(result.video.id, "latest");
});

test("merges and sorts media scan batches without mutating inputs", () => {
  const base = mediaUtils.createEmptyMediaCollection();
  const batch = {
    videos: [createVideo({ id: "b", relativePath: "B/02.mp4" }), createVideo({ id: "a", relativePath: "A/01.mp4" })],
    subtitles: [{ id: "s2", name: "s2.srt", relativePath: "B/02.srt", url: "/s2" }],
    scannedFiles: 3,
    filteredSmallVideos: 1,
  };

  const merged = mediaUtils.mergeMediaBatch(base, batch);
  const sorted = mediaUtils.sortMediaCollection(merged);

  assert.deepEqual(base.videos, []);
  assert.equal(merged.scannedFiles, 3);
  assert.deepEqual(sorted.videos.map((video) => video.id), ["a", "b"]);
});

test("keeps runtime-only video state across refreshed scan results", () => {
  const next = createVideo({ id: "movie", relativePath: "movie.mp4", duration: undefined });
  const previous = createVideo({
    id: "movie",
    relativePath: "movie.mp4",
    duration: 120,
    width: 1920,
    height: 1080,
    thumbnailUrl: "blob:thumb",
    thumbnailStatus: "ready",
    playability: { status: "remuxRecommended", reason: "x", compatibleUrl: "/compatible.mp4" },
  });

  assert.deepEqual(mediaUtils.mergeVideoRuntimeState([next], [previous])[0], {
    ...next,
    duration: 120,
    width: 1920,
    height: 1080,
    thumbnailUrl: "blob:thumb",
    thumbnailStatus: "ready",
    playability: { status: "remuxRecommended", reason: "x", compatibleUrl: "/compatible.mp4" },
  });
});

test("flushes media scans by batch size or elapsed delay", () => {
  const videos = Array.from({ length: 150 }, (_, index) => createVideo({ id: `video-${index}` }));

  assert.equal(mediaUtils.shouldFlushMediaScan(Date.now(), videos, []), true);
  assert.equal(mediaUtils.shouldFlushMediaScan(Date.now() - 1000, [], []), true);
  assert.equal(mediaUtils.shouldFlushMediaScan(Date.now(), [], []), false);
});
