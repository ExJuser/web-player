import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const candidates = await importTsModule(new URL("../src/homeCardCandidates.ts", import.meta.url));
const uiState = await importTsModule(new URL("../src/playerUiState.ts", import.meta.url));

const createVideo = (overrides = {}) => ({
  id: overrides.id ?? "root|v.mp4|1|1",
  name: overrides.name ?? "v.mp4",
  relativePath: overrides.relativePath ?? "系列A/v.mp4",
  url: "/video",
  size: 100,
  lastModified: overrides.lastModified ?? 1,
  mediaRootId: "root",
  ...overrides,
});

const videos = [
  createVideo({ id: "resume-latest", name: "最新续播.mp4", lastModified: 100 }),
  createVideo({ id: "resume-old", name: "较早续播.mp4", lastModified: 90 }),
  createVideo({ id: "done", name: "看完.mp4", lastModified: 80 }),
  createVideo({ id: "plain", name: "未看.mp4", lastModified: 70 }),
  createVideo({ id: "fav-unwatched", name: "收藏未看.mp4", lastModified: 60 }),
  createVideo({ id: "fav-inprogress", name: "收藏进行中.mp4", lastModified: 50 }),
  createVideo({ id: "fav-done", name: "收藏看完.mp4", lastModified: 40 }),
];

const progressStore = {
  "resume-latest": { currentTime: 100, duration: 3600, completed: false, updatedAt: 500 },
  "resume-old": { currentTime: 50, duration: 3600, completed: false, updatedAt: 300 },
  done: { currentTime: 3600, duration: 3600, completed: true, updatedAt: 400 },
  "fav-inprogress": { currentTime: 30, duration: 3600, completed: false, updatedAt: 200 },
  "fav-done": { currentTime: 3600, duration: 3600, completed: true, updatedAt: 100 },
};
const favoriteVideoIds = new Set(["fav-unwatched", "fav-inprogress", "fav-done"]);
const isResumable = (progress) =>
  Boolean(progress && !progress.completed && progress.currentTime >= 1 && progress.currentTime < progress.duration - 8);

const createCard = (video) => ({
  video,
  progress: progressStore[video.id],
  progressPercent: progressStore[video.id] ? 50 : 0,
  seriesTitle: "系列A",
  mediaRootLabel: "我的影片库",
  tags: [],
  actorTags: [],
  systemTags: [],
  rating: undefined,
  ratingComment: undefined,
});

test("findPrimaryResumableVideo matches createResumableHomeCards first card", () => {
  const expected = uiState.createResumableHomeCards({ videos, createCard, isResumableProgress: isResumable })[0]?.video ?? null;
  const actual = candidates.findPrimaryResumableVideo(videos, progressStore, isResumable);
  assert.equal(actual?.id, "resume-latest");
  assert.equal(actual?.id, expected?.id);
});

test("getRecentHomeCandidateVideos matches createRecentHomeCards order", () => {
  const expected = uiState.createRecentHomeCards(videos, createCard, 10).map((card) => card.video.id);
  const actual = candidates.getRecentHomeCandidateVideos(videos, progressStore, 10).map((video) => video.id);
  assert.deepEqual(actual, expected);
});

test("getFavoriteHomeCandidateVideos matches createFavoriteHomeCards order", () => {
  const expected = uiState.createFavoriteHomeCards({ videos, favoriteVideoIds, createCard, limit: 10 }).map((card) => card.video.id);
  const actual = candidates.getFavoriteHomeCandidateVideos(videos, favoriteVideoIds, progressStore, 10).map((video) => video.id);
  assert.deepEqual(actual, expected);
});

test("candidate helpers handle empty inputs and limits", () => {
  assert.equal(candidates.findPrimaryResumableVideo([], progressStore, isResumable), null);
  assert.deepEqual(candidates.getRecentHomeCandidateVideos([], progressStore), []);
  assert.deepEqual(candidates.getFavoriteHomeCandidateVideos([], favoriteVideoIds, progressStore), []);
  // limit 生效
  assert.equal(candidates.getRecentHomeCandidateVideos(videos, progressStore, 1).length, 1);
  assert.equal(candidates.getFavoriteHomeCandidateVideos(videos, favoriteVideoIds, progressStore, 2).length, 2);
});
