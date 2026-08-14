import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const { createHomeVideoCard } = await importTsModule(new URL("../src/homeVideoCard.ts", import.meta.url));

const createVideo = (overrides = {}) => ({
  id: overrides.id ?? "root|系列A/第01话.mkv|1|2",
  name: overrides.name ?? "第01话.mkv",
  relativePath: overrides.relativePath ?? "系列A/第01话.mkv",
  url: "/video",
  size: 100,
  lastModified: 1,
  mediaRootId: "root",
  ...overrides,
});

const createContext = (overrides = {}) => ({
  progressStore: {},
  seriesTitleByVideoId: new Map(),
  mediaRootLabelsById: {},
  effectiveVideoTags: {},
  videoActorTags: {},
  systemVideoTags: {},
  videoRatings: {},
  videoComments: {},
  ...overrides,
});

test("computes progress percent from progress duration and clamps bounds", () => {
  const video = createVideo({ duration: 100 });
  const card = createHomeVideoCard(video, createContext({
    progressStore: { [video.id]: { currentTime: 50, duration: 100, completed: false, updatedAt: 1 } },
  }));
  assert.equal(card.progressPercent, 50);
  assert.equal(card.progress.currentTime, 50);

  const over = createHomeVideoCard(createVideo({ duration: 10 }), createContext({
    progressStore: { [video.id]: { currentTime: 200, duration: 10, completed: false, updatedAt: 1 } },
  }));
  assert.equal(over.progressPercent, 100);

  // 无进度时长时回退到 video.duration；都没有则为 0
  const noDuration = createHomeVideoCard(createVideo({ duration: 0 }), createContext());
  assert.equal(noDuration.progressPercent, 0);
});

test("resolves series title from the map and falls back to inference", () => {
  const video = createVideo({ id: "v1", relativePath: "系列B/S1/01.mp4" });
  const mapped = createHomeVideoCard(video, createContext({
    seriesTitleByVideoId: new Map([["v1", "系列B"]]),
  }));
  assert.equal(mapped.seriesTitle, "系列B");

  const fallback = createHomeVideoCard(createVideo({ id: "v2", relativePath: "系列C/01.mp4" }), createContext());
  assert.equal(fallback.seriesTitle, "系列C");
});

test("resolves media root label and falls back for unknown roots", () => {
  const labeled = createHomeVideoCard(createVideo({ id: "v1", mediaRootId: "root" }), createContext({
    mediaRootLabelsById: { root: "我的影片库" },
  }));
  assert.equal(labeled.mediaRootLabel, "我的影片库");

  // 未知 root 或无 root 时回退到 fallbackMediaRootLabelForVideo
  const fallback = createHomeVideoCard(createVideo({ id: "v2", mediaRootId: "unknown", name: "片段.mp4" }), createContext());
  assert.equal(typeof fallback.mediaRootLabel, "string");
  assert.ok(fallback.mediaRootLabel.length > 0);
});

test("wires tags, actor tags, system tags, rating and comment with empty defaults", () => {
  const video = createVideo({ id: "v1" });
  const card = createHomeVideoCard(video, createContext({
    effectiveVideoTags: { v1: ["动作"] },
    videoActorTags: { v1: ["演员甲"] },
    systemVideoTags: { v1: ["中文字幕"] },
    videoRatings: { v1: 4 },
    videoComments: { v1: "不错" },
  }));
  assert.deepEqual(card.tags, ["动作"]);
  assert.deepEqual(card.actorTags, ["演员甲"]);
  assert.deepEqual(card.systemTags, ["中文字幕"]);
  assert.equal(card.rating, 4);
  assert.equal(card.ratingComment, "不错");

  const empty = createHomeVideoCard(createVideo({ id: "v2" }), createContext());
  assert.deepEqual(empty.tags, []);
  assert.deepEqual(empty.actorTags, []);
  assert.deepEqual(empty.systemTags, []);
  assert.equal(empty.rating, undefined);
  assert.equal(empty.ratingComment, undefined);
});
