import assert from "node:assert/strict";
import test from "node:test";

import {
  createBehaviorWindows,
  createRecommendationFeedService,
  diversify,
  interleaveChannels,
  mergeExplore,
  parseSubtitleCues,
  rankVideos,
  recallFresh,
  recallHot,
  recallRewatch,
  segmentFeedbackScore,
} from "../server/recommendationFeed.mjs";

const makeVideo = (id, relativePath) => ({
  id,
  name: id,
  relativePath,
  size: 1,
  lastModified: 1,
});

test("parses SRT and hour-less VTT cues for local recommendation analysis", () => {
  const cues = parseSubtitleCues(`WEBVTT

00:02.500 --> 00:04.000
为什么会这样？

2
01:02:03,100 --> 01:02:05,400
原来这就是真相！`);

  assert.deepEqual(cues, [
    { startTime: 2.5, endTime: 4, text: "为什么会这样？" },
    { startTime: 3723.1, endTime: 3725.4, text: "原来这就是真相！" },
  ]);
});

test("returns cold feed fallbacks without waiting for ffprobe and limits background probes", async () => {
  let probeCalls = 0;
  const videos = Array.from({ length: 3 }, (_, index) => ({
    id: `root:video-${index}`,
    mediaRootId: "root",
    relativePath: `video-${index}.mp4`,
    name: `video-${index}.mp4`,
    size: 100 + index,
    lastModified: 1000,
    url: `/media/video-${index}.mp4`,
  }));
  const recommendationCache = { segments: {}, feedback: {} };
  const recommendationStore = {
    loadRecommendationCache: () => recommendationCache,
    saveRecommendationSegment: (videoId, segment) => { recommendationCache.segments[videoId] = segment; },
  };
  const service = createRecommendationFeedService({
    loadConfig: async () => ({}),
    loadPlayerStore: async () => ({}),
    loadRecommendationStore: async () => recommendationStore,
    resolveMediaPath: () => "",
    resolveVideoPath: (_config, _rootId, relativePath) => relativePath,
    runProcess: async (command) => {
      if (command === "ffprobe") {
        probeCalls += 1;
        await new Promise(() => {});
      }
      return "";
    },
    scanMediaRoots: async () => ({
      roots: [{ root: { id: "root", label: "Anime" } }],
      videos,
      subtitles: [],
    }),
  });

  const feed = await service.getFeed({ mode: "anime", limit: 3 });

  assert.equal(feed.items.length, 3);
  assert.ok(feed.items.every((item) => item.source === "fallback" && item.duration === 0));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(probeCalls, 3);
});

test("cold feed falls back to a mid-video window when progress records the duration", async () => {
  const videos = [{
    id: "root:v",
    mediaRootId: "root",
    relativePath: "v.mp4",
    name: "v.mp4",
    size: 1,
    lastModified: 1,
    url: "/media/v.mp4",
  }];
  const recommendationCache = { segments: {}, feedback: {} };
  const recommendationStore = {
    loadRecommendationCache: () => recommendationCache,
    saveRecommendationSegment: (videoId, segment) => { recommendationCache.segments[videoId] = segment; },
  };
  const service = createRecommendationFeedService({
    loadConfig: async () => ({}),
    loadPlayerStore: async () => ({ items: { "root:v": { currentTime: 100, duration: 3600, completed: false } } }),
    loadRecommendationStore: async () => recommendationStore,
    resolveMediaPath: () => "",
    resolveVideoPath: () => "",
    runProcess: async () => "",
    scanMediaRoots: async () => ({
      roots: [{ root: { id: "root", label: "Anime" } }],
      videos,
      subtitles: [],
    }),
  });

  const feed = await service.getFeed({ mode: "anime", limit: 1 });
  const item = feed.items[0];

  assert.equal(item.source, "fallback");
  assert.equal(item.duration, 3600);
  assert.ok(item.startTime > 0, "兜底不应从片头开始");
  assert.ok(item.endTime > item.startTime && item.endTime <= 3600, "兜底窗口应在时长范围内");
  assert.ok(item.startTime < 3600 * 0.8, "兜底应落在影片中前段");
});

test("feed pagination stops at the end without repeating videos", async () => {
  const videos = Array.from({ length: 10 }, (_, index) => ({
    id: `root:v${index}`,
    mediaRootId: "root",
    relativePath: `v${index}.mp4`,
    name: `v${index}.mp4`,
    size: 1,
    lastModified: 1,
    url: `/media/v${index}.mp4`,
  }));
  const segments = Object.fromEntries(videos.map((video) => [video.id, {
    fingerprint: `${video.id}|1|1|1`,
    startTime: 30,
    endTime: 82,
    duration: 120,
    source: "signals",
    reasons: [],
  }]));
  const recommendationStore = {
    loadRecommendationCache: () => ({ segments, feedback: {} }),
    saveRecommendationSegment: () => undefined,
  };
  const service = createRecommendationFeedService({
    loadConfig: async () => ({}),
    loadPlayerStore: async () => ({}),
    loadRecommendationStore: async () => recommendationStore,
    resolveMediaPath: () => "",
    resolveVideoPath: () => "",
    runProcess: async () => "",
    scanMediaRoots: async () => ({
      roots: [{ root: { id: "root", label: "Anime" } }],
      videos,
      subtitles: [],
    }),
  });

  const firstPage = await service.getFeed({ mode: "anime", limit: 8, seed: "session" });
  const secondPage = await service.getFeed({ mode: "anime", cursor: firstPage.nextCursor, limit: 8, seed: "session" });
  const videoIds = [...firstPage.items, ...secondPage.items].map((item) => item.videoId);

  assert.equal(firstPage.items.length, 8);
  assert.equal(secondPage.items.length, 2);
  assert.equal(secondPage.nextCursor, null);
  assert.equal(new Set(videoIds).size, videos.length);
});

test("diversify keeps adjacent series distinct unless unavoidable", () => {
  const videos = [
    makeVideo("a1", "s1/a.mp4"),
    makeVideo("a2", "s1/b.mp4"),
    makeVideo("b1", "s2/a.mp4"),
    makeVideo("c1", "s3/a.mp4"),
    makeVideo("b2", "s2/b.mp4"),
    makeVideo("a3", "s1/c.mp4"),
  ];
  const seriesKey = (video) => video.relativePath.slice(0, video.relativePath.lastIndexOf("/"));
  const result = diversify(videos);
  assert.equal(result.length, videos.length, "diversify 应保留全部视频");
  for (let index = 1; index < result.length; index += 1) {
    if (seriesKey(result[index - 1]) === seriesKey(result[index])) {
      const rest = result.slice(index).map(seriesKey);
      assert.ok(rest.every((key) => key === rest[0]), "相邻同系列仅允许在别无选择时出现");
    }
  }
});

test("diversify degrades to original order when all videos share a series", () => {
  const videos = [makeVideo("a1", "s1/a.mp4"), makeVideo("a2", "s1/b.mp4"), makeVideo("a3", "s1/c.mp4")];
  assert.deepEqual(diversify(videos).map((video) => video.id), ["a1", "a2", "a3"]);
});

test("createBehaviorWindows returns no windows without history or heat", () => {
  assert.deepEqual(createBehaviorWindows(3600, undefined), []);
  assert.deepEqual(createBehaviorWindows(3600, { duration: 3600, buckets: [] }), []);
  assert.deepEqual(createBehaviorWindows(0, { duration: 0, buckets: [1, 2] }), []);
  assert.deepEqual(createBehaviorWindows(3600, { duration: 3600, buckets: Array(200).fill(0) }), []);
});

test("createBehaviorWindows picks the hottest window inside a hot run", () => {
  const bucketCount = 200;
  const duration = 3600;
  const bucketDuration = duration / bucketCount;
  const buckets = Array(bucketCount).fill(0);
  for (let index = 80; index < 100; index += 1) buckets[index] = bucketDuration * 2;
  const windows = createBehaviorWindows(duration, { duration, buckets });
  assert.ok(windows.length >= 1);
  const window = windows[0];
  assert.ok(window.startTime >= 80 * bucketDuration - 1, "窗口起点应落在热区内");
  assert.ok(window.endTime <= 100 * bucketDuration + 1, "窗口终点应落在热区内");
  assert.ok(window.score > 0.3, "行为强度应较高");
  assert.ok(window.endTime - window.startTime > 0, "窗口时长应为正");
});

test("createBehaviorWindows merges an all-hot video into a single window", () => {
  const bucketCount = 200;
  const duration = 3600;
  const bucketDuration = duration / bucketCount;
  const buckets = Array(bucketCount).fill(bucketDuration * 1.5);
  const windows = createBehaviorWindows(duration, { duration, buckets });
  assert.equal(windows.length, 1, "全片热区应合并为一个窗口");
  assert.ok(Math.abs(windows[0].endTime - windows[0].startTime - 52) < 20, "窗口时长应接近目标片段长度");
});

test("createBehaviorWindows stays in bounds for short videos", () => {
  const bucketCount = 200;
  const duration = 60;
  const bucketDuration = duration / bucketCount;
  const buckets = Array(bucketCount).fill(0);
  for (let index = 40; index < 90; index += 1) buckets[index] = bucketDuration * 2;
  const windows = createBehaviorWindows(duration, { duration, buckets });
  assert.ok(windows.length >= 1);
  assert.ok(windows[0].startTime >= 0 && windows[0].endTime <= duration, "窗口不得越界");
});

test("rankVideos prefers never-watched over in-progress over completed", () => {
  const store = {
    items: {
      half: { currentTime: 1200, duration: 3600, completed: false },
      done: { currentTime: 3600, duration: 3600, completed: true },
    },
  };
  const videos = [makeVideo("never", "n/a.mp4"), makeVideo("half", "h/a.mp4"), makeVideo("done", "d/a.mp4")];
  for (let round = 0; round < 5; round += 1) {
    const order = rankVideos(videos, store, {}).map((video) => video.id);
    assert.ok(order.indexOf("never") < order.indexOf("half"), `never 应在 half 前: ${order.join(",")}`);
    assert.ok(order.indexOf("half") < order.indexOf("done"), `half 应在 done 前: ${order.join(",")}`);
  }
});

test("rankVideos prefers videos with an analyzed segment over cold fallbacks", () => {
  const videos = [makeVideo("cold", "c/a.mp4"), makeVideo("ready", "r/a.mp4")];
  const segments = {
    ready: { fingerprint: `ready|1|1|1`, startTime: 100, endTime: 152, analysisPending: false },
    cold: { fingerprint: `cold|1|1|1`, startTime: 0, analysisPending: true },
  };
  for (let round = 0; round < 5; round += 1) {
    const order = rankVideos(videos, {}, {}, segments).map((video) => video.id);
    assert.ok(order.indexOf("ready") < order.indexOf("cold"), `已分析应排前: ${order.join(",")}`);
  }
});

test("recallHot ranks by aggregate play stats with untracked videos last", () => {
  const videos = [makeVideo("v1", "a.mp4"), makeVideo("v2", "b.mp4"), makeVideo("v3", "c.mp4")];
  const store = {
    videoStats: {
      v1: { totalPlayedSeconds: 7200, playCount: 10, emissionCount: 5 },
      v2: { totalPlayedSeconds: 3600, playCount: 2, emissionCount: 1 },
    },
  };
  assert.deepEqual(recallHot(videos, store).map((video) => video.id), ["v1", "v2", "v3"]);
});

test("recallFresh keeps only untouched recent videos", () => {
  const now = Date.now();
  const videos = [makeVideo("old", "old.mp4"), makeVideo("new", "new.mp4"), makeVideo("watched", "w.mp4")];
  videos[0].lastModified = now - 90 * 86400000;
  videos[1].lastModified = now - 2 * 86400000;
  videos[2].lastModified = now - 1 * 86400000;
  const store = { items: { watched: { currentTime: 100, duration: 3600, completed: false } } };
  assert.deepEqual(recallFresh(videos, store, now).map((video) => video.id), ["new"]);
});

test("recallRewatch surfaces completed favorites after cooldown only", () => {
  const now = Date.now();
  const videos = [makeVideo("fav", "a.mp4"), makeVideo("recent", "b.mp4"), makeVideo("plain", "c.mp4")];
  const store = {
    favorites: ["fav"],
    videoRatings: {},
    items: {
      fav: { currentTime: 3600, duration: 3600, completed: true, updatedAt: now - 14 * 86400000 },
      recent: { currentTime: 3600, duration: 3600, completed: true, updatedAt: now - 3 * 86400000 },
      plain: { currentTime: 3600, duration: 3600, completed: true, updatedAt: now - 14 * 86400000 },
    },
  };
  const rewatch = recallRewatch(videos, store, now);
  assert.ok(rewatch.some((video) => video.id === "fav"), "冷却期后的收藏应入选");
  assert.ok(!rewatch.some((video) => video.id === "recent"), "冷却期内不应入选");
  assert.ok(!rewatch.some((video) => video.id === "plain"), "无收藏无高评分的看完影片不应入选");
});

test("interleaveChannels merges channels by weight and dedupes", () => {
  const channels = {
    relevant: [{ id: "r1" }, { id: "r2" }, { id: "r3" }, { id: "r4" }],
    hot: [{ id: "h1" }, { id: "h2" }],
    fresh: [{ id: "f1" }],
    rewatch: [],
  };
  const merged = interleaveChannels(channels);
  assert.equal(merged.length, 7);
  assert.equal(new Set(merged.map((video) => video.id)).size, 7, "不应出现重复");
  assert.deepEqual(merged.map((video) => video.id), ["r1", "h1", "f1", "r2", "h2", "r3", "r4"]);
});

test("mergeExplore inserts exploration picks every N items and dedupes", () => {
  const base = Array.from({ length: 20 }, (_, index) => ({ id: `b${index}` }));
  const explore = [{ id: "x1" }, { id: "x2" }, { id: "b0" }, { id: "x3" }];
  const merged = mergeExplore(base, explore, 10);
  assert.equal(merged.length, 23);
  assert.equal(merged[10].id, "x1");
  assert.equal(merged[21].id, "x2");
  assert.equal(merged[22].id, "x3");
  assert.ok(!merged.some((video, index, list) => list.indexOf(video) !== index), "不应出现重复");
});

test("segmentFeedbackScore rewards watched windows and penalizes skipped ones", () => {
  const now = Date.now();
  const events = [
    { t: 100, a: "complete", at: now },
    { t: 500, a: "skip", at: now },
    { t: 100, a: "skip", at: now - 90 * 86400000 },
  ];
  const hot = segmentFeedbackScore(events, 50, 200, now);
  assert.ok(hot !== null && hot > 0.55, `看完窗口应得高分: ${hot}`);
  const cold = segmentFeedbackScore(events, 400, 600, now);
  assert.ok(cold !== null && cold < 0.45, `跳过窗口应得低分: ${cold}`);
  assert.equal(segmentFeedbackScore(events, 700, 900, now), null, "无事件窗口应返回 null");
  assert.equal(segmentFeedbackScore(undefined, 0, 100, now), null);
});

test("series entries carry playable fields so the client can open a missing sibling", async () => {
  const videos = [
    {
      id: "root:a",
      mediaRootId: "root",
      relativePath: "series/a.mp4",
      name: "a.mp4",
      size: 1,
      lastModified: 3,
      url: "/media/series/a.mp4",
    },
    {
      id: "root:b",
      mediaRootId: "root",
      relativePath: "series/b.mp4",
      name: "b.mp4",
      size: 1,
      lastModified: 2,
      url: "/media/series/b.mp4",
      playability: { status: "direct", reason: "ok", compatibleUrl: "/media-compatible/b.mp4" },
      duration: 1234,
    },
  ];
  const recommendationCache = { segments: {}, feedback: {} };
  const recommendationStore = {
    loadRecommendationCache: () => recommendationCache,
    saveRecommendationSegment: (videoId, segment) => { recommendationCache.segments[videoId] = segment; },
  };
  const service = createRecommendationFeedService({
    loadConfig: async () => ({}),
    loadPlayerStore: async () => ({}),
    loadRecommendationStore: async () => recommendationStore,
    resolveMediaPath: () => "",
    resolveVideoPath: () => "",
    runProcess: async () => "",
    scanMediaRoots: async () => ({
      roots: [{ root: { id: "root", label: "Anime" } }],
      videos,
      subtitles: [],
    }),
  });

  const feed = await service.getFeed({ mode: "anime", limit: 2 });
  const item = feed.items.find((candidate) => candidate.videoId === "root:a");
  assert.ok(item && item.series?.length, "同目录影片应出现在 series 中");
  const sibling = item.series[0];
  assert.equal(sibling.videoId, "root:b");
  assert.equal(sibling.playbackUrl, "/media-compatible/b.mp4", "series 应带可播放 URL（兼容优先）");
  assert.equal(sibling.relativePath, "series/b.mp4");
  assert.equal(sibling.mediaRootId, "root");
  assert.equal(sibling.duration, 1234);
});
