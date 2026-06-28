import type { PlaybackProgress, ProgressStore, VideoItem, VideoStats, VideoStatsStore, VideoTagStore } from "./playerTypes";
import { createVideoStatsKey } from "./playerUiState";
import { normalizeTagKey } from "./tagUtils";

export type SpecialInsightTab = "played" | "count" | "emission" | "active";

export type SpecialModeVideoInsight = {
  video: VideoItem;
  stats: VideoStats;
  tags: string[];
  progress?: PlaybackProgress;
  playIntensity: number | null;
  activeAt: number;
};

export type SpecialModeTagInsight = {
  key: string;
  tag: string;
  videoCount: number;
  videoIds: string[];
  totalPlayedSeconds: number;
  emissionCount: number;
};

export type SpecialModeInsights = {
  summary: {
    totalVideos: number;
    taggedVideos: number;
    tagCoverage: number;
    totalPlayedSeconds: number;
    playCount: number;
    emissionCount: number;
    lastEmissionAt: number | null;
  };
  videosByPlayedDuration: SpecialModeVideoInsight[];
  videosByPlayCount: SpecialModeVideoInsight[];
  videosByEmissionCount: SpecialModeVideoInsight[];
  videosByRecentActivity: SpecialModeVideoInsight[];
  tagsByVideoCount: SpecialModeTagInsight[];
  tagsByPlayedDuration: SpecialModeTagInsight[];
  tagsByEmissionCount: SpecialModeTagInsight[];
};

const emptyStats: VideoStats = {
  totalPlayedSeconds: 0,
  playCount: 0,
  durationSeconds: 0,
  emissionCount: 0,
  updatedAt: 0,
};

const defaultInsightLimit = 10;

function compareVideoFallback(a: SpecialModeVideoInsight, b: SpecialModeVideoInsight) {
  return (
    a.video.relativePath.localeCompare(b.video.relativePath, "zh-Hans-CN", { numeric: true }) ||
    a.video.name.localeCompare(b.video.name, "zh-Hans-CN", { numeric: true })
  );
}

function compareTagFallback(a: SpecialModeTagInsight, b: SpecialModeTagInsight) {
  return a.tag.localeCompare(b.tag, "zh-Hans-CN", { numeric: true });
}

function topVideos(
  insights: SpecialModeVideoInsight[],
  value: (insight: SpecialModeVideoInsight) => number,
  limit: number,
) {
  return insights
    .filter((insight) => value(insight) > 0)
    .sort((a, b) => value(b) - value(a) || compareVideoFallback(a, b))
    .slice(0, limit);
}

function topTags(
  insights: SpecialModeTagInsight[],
  value: (insight: SpecialModeTagInsight) => number,
  limit: number,
) {
  return insights
    .filter((insight) => value(insight) > 0)
    .sort((a, b) => value(b) - value(a) || compareTagFallback(a, b))
    .slice(0, limit);
}

export function buildSpecialModeInsights(
  videos: VideoItem[],
  videoStats: VideoStatsStore,
  videoTags: VideoTagStore,
  progressStore: ProgressStore,
  options?: { videoLimit?: number; tagLimit?: number },
): SpecialModeInsights {
  const videoLimit = options?.videoLimit ?? defaultInsightLimit;
  const tagLimit = options?.tagLimit ?? defaultInsightLimit;
  const tagStatsByKey = new Map<string, SpecialModeTagInsight>();
  const videoInsights = videos.map((video) => {
    const stats = videoStats[createVideoStatsKey(video)] ?? emptyStats;
    const tags = videoTags[video.id] ?? [];
    const durationSeconds = stats.durationSeconds || video.duration || 0;
    const playIntensity = durationSeconds > 0 && stats.totalPlayedSeconds > 0
      ? stats.totalPlayedSeconds / durationSeconds
      : null;
    const progress = progressStore[video.id];
    const activeAt = Math.max(stats.updatedAt || 0, stats.lastEmissionAt || 0, progress?.updatedAt ?? 0);
    const insight: SpecialModeVideoInsight = {
      video,
      stats,
      tags,
      progress,
      playIntensity,
      activeAt,
    };

    const seenTagKeys = new Set<string>();
    tags.forEach((tag) => {
      const key = normalizeTagKey(tag);
      if (!key || seenTagKeys.has(key)) return;
      seenTagKeys.add(key);
      const existing = tagStatsByKey.get(key);
      if (existing) {
        existing.videoCount += 1;
        existing.videoIds.push(video.id);
        existing.totalPlayedSeconds += stats.totalPlayedSeconds;
        existing.emissionCount += stats.emissionCount;
        return;
      }
      tagStatsByKey.set(key, {
        key,
        tag,
        videoCount: 1,
        videoIds: [video.id],
        totalPlayedSeconds: stats.totalPlayedSeconds,
        emissionCount: stats.emissionCount,
      });
    });

    return insight;
  });

  const taggedVideos = videoInsights.filter((insight) =>
    insight.tags.some((tag) => normalizeTagKey(tag)),
  ).length;
  const totalPlayedSeconds = videoInsights.reduce((sum, insight) => sum + insight.stats.totalPlayedSeconds, 0);
  const playCount = videoInsights.reduce((sum, insight) => sum + insight.stats.playCount, 0);
  const emissionCount = videoInsights.reduce((sum, insight) => sum + insight.stats.emissionCount, 0);
  const lastEmissionAt = videoInsights.reduce(
    (latest: number | null, insight) =>
      insight.stats.lastEmissionAt && insight.stats.lastEmissionAt > (latest ?? 0)
        ? insight.stats.lastEmissionAt
        : latest,
    null,
  );
  const tagInsights = Array.from(tagStatsByKey.values());

  return {
    summary: {
      totalVideos: videos.length,
      taggedVideos,
      tagCoverage: videos.length ? taggedVideos / videos.length : 0,
      totalPlayedSeconds,
      playCount,
      emissionCount,
      lastEmissionAt,
    },
    videosByPlayedDuration: topVideos(videoInsights, (insight) => insight.stats.totalPlayedSeconds, videoLimit),
    videosByPlayCount: topVideos(videoInsights, (insight) => insight.stats.playCount, videoLimit),
    videosByEmissionCount: topVideos(videoInsights, (insight) => insight.stats.emissionCount, videoLimit),
    videosByRecentActivity: topVideos(videoInsights, (insight) => insight.activeAt, videoLimit),
    tagsByVideoCount: topTags(tagInsights, (insight) => insight.videoCount, tagLimit),
    tagsByPlayedDuration: topTags(tagInsights, (insight) => insight.totalPlayedSeconds, tagLimit),
    tagsByEmissionCount: topTags(tagInsights, (insight) => insight.emissionCount, tagLimit),
  };
}
