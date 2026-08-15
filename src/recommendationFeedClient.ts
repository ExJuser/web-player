import { fetchLocalJson } from "./localApiClient";
import type { HomeMediaMode } from "./playerTypes";

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
  series?: Array<{ videoId: string; title: string; thumbnailUrl?: string }>;
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
