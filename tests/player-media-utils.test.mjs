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

test("scores metadata duplicates with combined size and duration, resolution, and stricter threshold", async () => {
  const first = createVideo({
    id: "root-a|Show/E01.mkv|1000|1",
    name: "Show - 01.mkv",
    relativePath: "Anime/Show/Show - 01.mkv",
    size: 1000,
    duration: 1440,
    width: 1920,
    height: 1080,
  });
  const sameMetadataDifferentFolder = createVideo({
    id: "root-b|Backup/Renamed.mkv|1002|2",
    name: "Renamed.mkv",
    relativePath: "Backup/Renamed.mkv",
    size: 1002,
    duration: 1441,
    width: 1920,
    height: 1080,
  });
  const sameParentOnly = createVideo({
    id: "root-c|Anime/Show/Other.mkv|5000|3",
    name: "Other.mkv",
    relativePath: "Anime/Show/Other.mkv",
    size: 5000,
    duration: 3000,
    width: 1280,
    height: 720,
  });

  const localGroups = mediaUtils.detectDuplicateVideos([first, sameMetadataDifferentFolder]);
  assert.equal(localGroups.length, 1);
  assert.equal(localGroups[0].severity, "suspicious");
  assert.equal(mediaUtils.detectDuplicateVideos([first, sameParentOnly]).length, 0);

  const groups = await mediaUtils.detectDuplicateVideosWithProgress([first, sameMetadataDifferentFolder], {
    getNameSimilarityScores: async (pairs) => new Map(pairs.map((pair) => [pair.id, 30])),
  });

  assert.equal(groups.length, 1);
  assert.equal(groups[0].severity, "suspicious");
  assert.equal(groups[0].score, 115);
  assert.ok(groups[0].reasons.includes("大小几乎一致"));
  assert.ok(groups[0].reasons.includes("时长几乎一致"));
  assert.ok(groups[0].reasons.includes("分辨率一致"));
  assert.ok(groups[0].reasons.includes("AI 名称相似度 30%"));
});

test("detects local duplicate candidates without AI", async () => {
  const first = createVideo({
    id: "root-a|Show/E01.mkv|1000|1",
    name: "Show - 01.mkv",
    relativePath: "Anime/Show/Show - 01.mkv",
    size: 1000,
    duration: 1440,
    width: 1920,
    height: 1080,
  });
  const copy = createVideo({
    id: "root-b|Backup/Show 01 copy.mkv|1002|2",
    name: "Show 01 copy.mkv",
    relativePath: "Backup/Show 01 copy.mkv",
    size: 1002,
    duration: 1441,
    width: 1920,
    height: 1080,
  });

  const syncGroups = mediaUtils.detectDuplicateVideos([first, copy]);
  const asyncGroups = await mediaUtils.detectDuplicateVideosWithProgress([first, copy]);

  assert.equal(syncGroups.length, 1);
  assert.deepEqual(asyncGroups, syncGroups);
  assert.equal(syncGroups[0].severity, "duplicate");
  assert.ok(syncGroups[0].reasons.includes("名称规范化一致"));
});

test("uses normalized names when metadata is missing", () => {
  const first = createVideo({
    id: "first",
    name: "Movie 01.mkv",
    relativePath: "A/Movie 01.mkv",
    size: 1000,
  });
  const copy = createVideo({
    id: "copy",
    name: "Movie 01 copy.mp4",
    relativePath: "B/Movie 01 copy.mp4",
    size: 1004,
  });

  const groups = mediaUtils.detectDuplicateVideos([first, copy]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].severity, "suspicious");
  assert.ok(groups[0].reasons.includes("名称规范化一致"));
  assert.ok(groups[0].reasons.includes("大小几乎一致"));
});

test("only asks AI to score name pairs after the local candidate threshold", async () => {
  const source = createVideo({
    id: "source",
    name: "Source.mkv",
    relativePath: "C/Source.mkv",
    size: 1000,
    duration: 1440,
    width: 1920,
    height: 1080,
  });
  const highCandidate = createVideo({
    id: "candidate",
    name: "Candidate.mkv",
    relativePath: "A/Candidate.mkv",
    size: 1002,
    duration: 1441,
    width: 1920,
    height: 1080,
  });
  const lowCandidate = createVideo({
    id: "low",
    name: "Low.mkv",
    relativePath: "B/Low.mkv",
    size: 5000,
    duration: 9000,
    width: 1920,
    height: 1080,
  });
  const calls = [];

  await mediaUtils.detectDuplicateVideosWithProgress([source, highCandidate, lowCandidate], {
    getNameSimilarityScores: async (pairs) => {
      calls.push(pairs);
      return new Map();
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].length, 1);
  assert.equal(calls[0][0].a.id, source.id);
  assert.equal(calls[0][0].b.id, highCandidate.id);
  assert.equal(calls[0][0].localScore, 85);
});

test("detects duplicate videos incrementally with progress updates", async () => {
  const videos = [
    createVideo({
      id: "root-a|Show/E01.mkv|1000|1",
      name: "Show - 01.mkv",
      relativePath: "Anime/Show/Show - 01.mkv",
      size: 1000,
      duration: 1440,
      width: 1920,
      height: 1080,
    }),
    createVideo({
      id: "root-b|Show/E01 copy.mkv|1002|2",
      name: "Show 01 copy.mkv",
      relativePath: "Backup/Show/Show 01 copy.mkv",
      size: 1002,
      duration: 1441,
      width: 1920,
      height: 1080,
    }),
    createVideo({ id: "other", name: "Other.mp4", relativePath: "Other.mp4", size: 2000, duration: 800 }),
  ];
  const updates = [];

  const groups = await mediaUtils.detectDuplicateVideosWithProgress(videos, {
    yieldEveryPairs: 1,
    onProgress: (progress) => updates.push(progress),
  });

  assert.deepEqual(groups, mediaUtils.detectDuplicateVideos(videos));
  assert.ok(updates.length > 1);
  assert.equal(updates.at(-1).processedPairs, updates.at(-1).totalPairs);
  assert.equal(updates.at(-1).percent, 100);
});

test("detects content-identical videos with different names from fingerprints", async () => {
  const first = createVideo({
    id: "root-a|Movies/Alpha.mkv|2048|1",
    name: "Alpha.mkv",
    relativePath: "Movies/Alpha.mkv",
    size: 2048,
    duration: 1200,
    width: 1920,
    height: 1080,
  });
  const renamed = createVideo({
    id: "root-b|Backup/Renamed.mp4|2048|2",
    name: "Renamed.mp4",
    relativePath: "Backup/Renamed.mp4",
    size: 2048,
    duration: 1200,
    width: 1920,
    height: 1080,
  });
  const sameSizeDifferentContent = createVideo({
    id: "root-c|Other/Other.mp4|2048|3",
    name: "Other.mp4",
    relativePath: "Other/Other.mp4",
    size: 2048,
    duration: 900,
    width: 1280,
    height: 720,
  });

  assert.equal(mediaUtils.detectDuplicateVideos([first, renamed, sameSizeDifferentContent]).length, 1);

  const groups = await mediaUtils.detectDuplicateVideosWithProgress([first, renamed, sameSizeDifferentContent], {
    getContentFingerprint: async (video) => (video.id === sameSizeDifferentContent.id ? "2048:different" : "2048:same"),
  });

  assert.equal(groups.length, 1);
  assert.equal(groups[0].severity, "duplicate");
  assert.equal(groups[0].score, 120);
  assert.deepEqual(groups[0].videos.map((video) => video.id), [renamed.id, first.id]);
  assert.ok(groups[0].reasons.includes("内容指纹一致"));
});

test("skips AI name scoring for pairs already matched by content fingerprints", async () => {
  const first = createVideo({
    id: "first",
    name: "Alpha.mkv",
    relativePath: "A/Alpha.mkv",
    size: 4096,
    duration: 1200,
    width: 1920,
    height: 1080,
  });
  const renamed = createVideo({
    id: "renamed",
    name: "Renamed.mp4",
    relativePath: "B/Renamed.mp4",
    size: 4096,
    duration: 1200,
    width: 1920,
    height: 1080,
  });
  let aiCalls = 0;

  const groups = await mediaUtils.detectDuplicateVideosWithProgress([first, renamed], {
    getContentFingerprint: async () => "4096:same",
    getNameSimilarityScores: async () => {
      aiCalls += 1;
      return new Map();
    },
  });

  assert.equal(aiCalls, 0);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].score, 120);
});

test("continues with local results when AI name scoring fails", async () => {
  const first = createVideo({
    id: "first",
    name: "Show 01.mkv",
    relativePath: "A/Show 01.mkv",
    size: 1000,
  });
  const copy = createVideo({
    id: "copy",
    name: "Show 01 copy.mp4",
    relativePath: "B/Show 01 copy.mp4",
    size: 1004,
  });
  let reportedError = false;

  const groups = await mediaUtils.detectDuplicateVideosWithProgress([first, copy], {
    getNameSimilarityScores: async () => {
      throw new Error("AI failed");
    },
    onNameSimilarityError: () => {
      reportedError = true;
    },
  });

  assert.equal(reportedError, true);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].severity, "suspicious");
});

test("rebuilds duplicate groups from remaining pair edges", () => {
  const first = createVideo({ id: "first", name: "A.mkv", relativePath: "A.mkv", size: 1000 });
  const bridge = createVideo({ id: "bridge", name: "B.mkv", relativePath: "B.mkv", size: 1000 });
  const third = createVideo({ id: "third", name: "C.mkv", relativePath: "C.mkv", size: 1000 });
  const groups = [
    {
      id: "manual",
      severity: "suspicious",
      score: 90,
      reasons: ["测试"],
      videos: [first, bridge, third],
      pairs: [
        { key: "first\u0000bridge", aId: "first", bId: "bridge", severity: "suspicious", score: 90, reasons: ["A-B"] },
        { key: "bridge\u0000third", aId: "bridge", bId: "third", severity: "suspicious", score: 90, reasons: ["B-C"] },
      ],
    },
  ];

  assert.equal(mediaUtils.rebuildDuplicateVideoGroups([first, third], groups).length, 0);
});

test("limits local candidate generation for large libraries", async () => {
  const videos = Array.from({ length: 120 }, (_, index) =>
    createVideo({
      id: `video-${index}`,
      name: `Different ${index}.mp4`,
      relativePath: `Library/Different ${index}.mp4`,
      size: 1024 * 1024,
    }),
  );
  const updates = [];

  await mediaUtils.detectDuplicateVideosWithProgress(videos, {
    yieldEveryPairs: 100,
    onProgress: (progress) => updates.push(progress),
  });

  const metadataUpdate = updates.find((progress) => progress.phase === "metadata" && progress.totalPairs > 0);
  assert.ok(metadataUpdate.totalPairs < (videos.length * (videos.length - 1)) / 2);
});

test("duplicate detection scope key changes with mode or video identity", () => {
  const video = createVideo({ id: "video", name: "Video.mp4", relativePath: "Video.mp4", size: 1000, lastModified: 1 });

  assert.notEqual(
    mediaUtils.createDuplicateDetectionScopeKey("all", [video]),
    mediaUtils.createDuplicateDetectionScopeKey("anime", [video]),
  );
  assert.notEqual(
    mediaUtils.createDuplicateDetectionScopeKey("all", [video]),
    mediaUtils.createDuplicateDetectionScopeKey("all", [{ ...video, size: 1001 }]),
  );
});

test("duplicate detection scope key ignores playback-populated metadata", () => {
  const video = createVideo({ id: "video", name: "Video.mp4", relativePath: "Video.mp4", size: 1000, lastModified: 1 });

  assert.equal(
    mediaUtils.createDuplicateDetectionScopeKey("special", [video]),
    mediaUtils.createDuplicateDetectionScopeKey("special", [{ ...video, duration: 100, width: 1920, height: 1080 }]),
  );
});
