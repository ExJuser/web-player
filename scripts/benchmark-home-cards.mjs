// 首页卡片 memo 重算代价基准：模拟"每次播放进度保存（5s 一次）→
// resumable/recent/favorite/next-episode 四个卡片 memo 全量重算"的成本。
// 用法：node scripts/benchmark-home-cards.mjs
import { performance } from "node:perf_hooks";
import { importTsModule } from "../tests/importTsModule.mjs";

const uiState = await importTsModule(new URL("../src/playerUiState.ts", import.meta.url));
const candidates = await importTsModule(new URL("../src/homeCardCandidates.ts", import.meta.url));
const seriesUtils = await importTsModule(new URL("../src/playerSeriesUtils.ts", import.meta.url));
const mediaPathUtils = await importTsModule(new URL("../src/mediaPathUtils.ts", import.meta.url));
const interactionUtils = await importTsModule(new URL("../src/playerInteractionUtils.ts", import.meta.url));

const COUNT = 20000;
const videos = [];
for (let index = 0; index < COUNT; index += 1) {
  const series = String.fromCharCode(65 + (index % 26));
  videos.push({
    id: `root|系列${series}/第${String((index % 40) + 1).padStart(2, "0")}话.mkv|${index}|${index}`,
    name: `第${String((index % 40) + 1).padStart(2, "0")}话.mkv`,
    relativePath: `系列${series}/第${String((index % 40) + 1).padStart(2, "0")}话.mkv`,
    url: "/video",
    size: 1000 + index,
    lastModified: 1000 + index,
    mediaRootId: "root",
    duration: index % 2 ? 3600 : 1800,
    thumbnailStatus: "idle",
  });
}

// 模拟播放期间持续增长的 progressStore（约 2000 条有进度）
const progressStore = {};
for (let index = 0; index < 2000; index += 1) {
  progressStore[videos[index].id] = {
    currentTime: index % 100,
    duration: 3600,
    completed: index % 10 === 0,
    updatedAt: index,
  };
}

const seriesTitleByVideoId = new Map(
  videos.map((video) => [video.id, `系列${video.relativePath.split("/")[0].replace("系列", "")}`]),
);
const mediaRootLabelsById = { root: "我的影片库" };
const effectiveVideoTags = {};
const videoActorTags = {};
const systemVideoTags = {};
const videoRatings = {};
const videoComments = {};
const favoriteVideoIds = new Set(videos.slice(0, 500).map((video) => video.id));
const isResumableProgress = (progress) =>
  Boolean(progress && !progress.completed && progress.currentTime >= 1 && progress.currentTime < progress.duration - 8);

function measure(label, fn) {
  const startedAt = performance.now();
  fn();
  const elapsedMs = performance.now() - startedAt;
  console.log(`${label.padEnd(56)} ${elapsedMs.toFixed(2)} ms`);
  return elapsedMs;
}

const createCard = (video) => ({
  video,
  progress: progressStore[video.id],
  progressPercent: progressStore[video.id] ? 50 : 0,
  seriesTitle: seriesTitleByVideoId.get(video.id) ?? seriesUtils.inferSeriesTitle(video),
  mediaRootLabel: (video.mediaRootId ? mediaRootLabelsById[video.mediaRootId] : "") || mediaPathUtils.fallbackMediaRootLabelForVideo(video),
  tags: effectiveVideoTags[video.id] ?? [],
  actorTags: videoActorTags[video.id] ?? [],
  systemTags: systemVideoTags[video.id] ?? [],
  rating: videoRatings[video.id],
  ratingComment: videoComments[video.id],
});

console.log(`视频规模: ${COUNT}（progressStore ${Object.keys(progressStore).length} 条）`);
console.log("-".repeat(64));
const resumableMs = measure("旧：createResumableHomeCards（map 全部 + filter + sort）", () => {
  uiState.createResumableHomeCards({ videos, createCard, isResumableProgress: isResumableProgress });
});
const recentMs = measure("旧：createRecentHomeCards（map 全部 + filter + sort + slice10）", () => {
  uiState.createRecentHomeCards(videos, createCard);
});
const favoriteMs = measure("旧：createFavoriteHomeCards（filter + map 500 + sort + slice10）", () => {
  uiState.createFavoriteHomeCards({ videos, favoriteVideoIds, createCard });
});
console.log("-".repeat(64));
const newResumableMs = measure("新：findPrimaryResumableVideo（单遍求值 + 只建 1 张卡）", () => {
  const video = candidates.findPrimaryResumableVideo(videos, progressStore, isResumableProgress);
  if (video) createCard(video);
});
const newRecentMs = measure("新：getRecentHomeCandidateVideos + map（只建 10 张卡）", () => {
  candidates.getRecentHomeCandidateVideos(videos, progressStore).forEach(createCard);
});
const newFavoriteMs = measure("新：getFavoriteHomeCandidateVideos + map（只建 10 张卡）", () => {
  candidates.getFavoriteHomeCandidateVideos(videos, favoriteVideoIds, progressStore).forEach(createCard);
});
console.log("-".repeat(64));
const oldTotal = resumableMs + recentMs + favoriteMs;
const newTotal = newResumableMs + newRecentMs + newFavoriteMs;
console.log(`单次进度保存：旧 ≈ ${oldTotal.toFixed(2)} ms → 新 ≈ ${newTotal.toFixed(2)} ms（${((1 - newTotal / oldTotal) * 100).toFixed(0)}% 减少）`);
console.log(`按 5s 一次进度保存，连续播放 1 小时：旧 ≈ ${(oldTotal * 720).toFixed(0)} ms → 新 ≈ ${(newTotal * 720).toFixed(0)} ms 主线程时间`);
