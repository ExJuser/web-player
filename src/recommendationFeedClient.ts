import { fetchLocalJson } from "./localApiClient";
import type { HomeMediaMode } from "./playerTypes";

export type RecommendationFeedSeriesItem = {
  videoId: string;
  title: string;
  relativePath?: string;
  mediaRootId?: string;
  playbackUrl?: string;
  thumbnailUrl?: string;
  duration?: number;
};

export type RecommendationFeedItem = {
  id: string;
  videoId: string;
  title: string;
  relativePath: string;
  mediaRootId?: string;
  playbackUrl: string;
  thumbnailUrl?: string;
  startTime: number;
  endTime: number;
  duration: number;
  source: "manual" | "signals" | "behavior" | "fallback";
  reasons: string[];
  tags: string[];
  rating?: number;
  isFavorite?: boolean;
  viewState?: "untouched" | "partial" | "completed";
  progressCurrentTime?: number;
  progressDuration?: number;
  stats?: { playCount: number; totalPlayedSeconds: number };
  series?: RecommendationFeedSeriesItem[];
};

/**
 * "看原片/同系列"跳转所需的最小可播放信息。推荐流来自服务端实时扫描，
 * 目标影片可能不在前端已加载的本地媒体库中（例如只通过浏览器授权了部分媒体根，
 * 或本地缓存早于文件变动），前端据此补充一个可播放条目后再打开。
 */
export type RecommendationOpenVideo = {
  videoId: string;
  title: string;
  relativePath: string;
  mediaRootId?: string;
  playbackUrl: string;
  thumbnailUrl?: string;
  duration: number;
};

export type RecommendationFeedResponse = {
  version: number;
  mode: HomeMediaMode;
  items: RecommendationFeedItem[];
  nextCursor: string | null;
  analysis: { queued: number; analyzing: boolean };
};

export function loadRecommendationFeed(mode: HomeMediaMode, cursor?: string | null, sessionSeed?: string) {
  const params = new URLSearchParams({ mode, limit: "8" });
  if (cursor) params.set("cursor", cursor);
  if (sessionSeed) params.set("seed", sessionSeed);
  return fetchLocalJson<RecommendationFeedResponse>(`/api/recommendations/feed?${params}`);
}

export function loadRecommendationFeedStatus() {
  return fetchLocalJson<{ analyzed: number; queued: number; analyzing: boolean }>("/api/recommendations/status");
}

export function sendRecommendationFeedback(
  videoId: string,
  action: "skip" | "complete" | "replay" | "dismiss",
  startTime?: number,
  extra?: { scope?: "video" | "tags"; tags?: string[] },
) {
  return fetchLocalJson<{ ok: true }>("/api/recommendations/feedback", {
    method: "POST",
    body: JSON.stringify({
      videoId,
      action,
      ...(startTime !== undefined ? { startTime } : {}),
      ...(extra?.scope ? { scope: extra.scope } : {}),
      ...(extra?.tags?.length ? { tags: extra.tags } : {}),
    }),
  });
}
