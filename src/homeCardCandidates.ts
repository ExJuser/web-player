import { compareNaturalRelativePath } from "./playerMediaUtils";
import type { PlaybackProgress, VideoItem } from "./playerTypes";

// 首页卡片候选视频的"先筛后建卡"辅助：只对候选视频构建卡片对象，
// 避免每次进度保存（播放中每 5s 一次）都对全库 2 万视频构建卡片后丢弃。
// 语义与 playerUiState 的 createResumableHomeCards / createRecentHomeCards /
// createFavoriteHomeCards 完全一致，仅把"先建卡再过滤"改为"先过滤再建卡"。

export function isResumableHomeProgress(progress?: PlaybackProgress) {
  return Boolean(
    progress && !progress.completed && progress.currentTime >= 1 && progress.currentTime < progress.duration - 8,
  );
}

// 找"继续观看"主卡：单遍求 updatedAt 最大的可续播视频（等价于全量建卡排序后取 [0]）。
export function findPrimaryResumableVideo(
  videos: readonly VideoItem[],
  progressStore: Readonly<Record<string, PlaybackProgress | undefined>>,
  isResumable: (progress?: PlaybackProgress) => boolean = isResumableHomeProgress,
): VideoItem | null {
  let best: VideoItem | null = null;
  let bestUpdatedAt = -1;
  for (const video of videos) {
    const progress = progressStore[video.id];
    if (!isResumable(progress)) continue;
    const updatedAt = progress?.updatedAt ?? 0;
    if (updatedAt > bestUpdatedAt) {
      bestUpdatedAt = updatedAt;
      best = video;
    }
  }
  return best;
}

// "最近观看"候选（未完成在前、completed 在后，各自按 updatedAt 降序），仅取前 limit 个。
export function getRecentHomeCandidateVideos(
  videos: readonly VideoItem[],
  progressStore: Readonly<Record<string, PlaybackProgress | undefined>>,
  limit = 10,
): VideoItem[] {
  const withProgress = [];
  for (const video of videos) {
    const progress = progressStore[video.id];
    if (!progress) continue;
    withProgress.push({ video, progress });
  }
  return withProgress
    .sort((a, b) => {
      const aCompleted = a.progress.completed ? 1 : 0;
      const bCompleted = b.progress.completed ? 1 : 0;
      return aCompleted - bCompleted || (b.progress.updatedAt ?? 0) - (a.progress.updatedAt ?? 0);
    })
    .slice(0, limit)
    .map((entry) => entry.video);
}

// "收藏/稍后看"候选（进行中 0 < 无进度 1 < 已完成 2，随后 updatedAt/修改时间降序，再自然路径序）。
export function getFavoriteHomeCandidateVideos(
  videos: readonly VideoItem[],
  favoriteVideoIds: ReadonlySet<string>,
  progressStore: Readonly<Record<string, PlaybackProgress | undefined>>,
  limit = 10,
): VideoItem[] {
  const favorites = [];
  for (const video of videos) {
    if (!favoriteVideoIds.has(video.id)) continue;
    const progress = progressStore[video.id];
    const statusRank = progress?.completed ? 2 : progress ? 0 : 1;
    favorites.push({ video, progress, statusRank });
  }
  return favorites
    .sort(
      (a, b) =>
        a.statusRank - b.statusRank ||
        (b.progress?.updatedAt ?? b.video.lastModified) - (a.progress?.updatedAt ?? a.video.lastModified) ||
        compareNaturalRelativePath(a.video.relativePath, b.video.relativePath),
    )
    .slice(0, limit)
    .map((entry) => entry.video);
}
