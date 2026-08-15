import assert from "node:assert/strict";
import test from "node:test";

import { createRecommendationFeedService, parseSubtitleCues } from "../server/recommendationFeed.mjs";

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
  assert.equal(probeCalls, 2);
});
