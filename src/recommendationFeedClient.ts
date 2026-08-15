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
  source: "manual" | "signals" | "fallback";
  reasons: string[];
  tags: string[];
  rating?: number;
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

export function sendRecommendationFeedback(videoId: string, action: "skip" | "complete" | "replay" | "dismiss") {
  return fetchLocalJson<{ ok: true }>("/api/recommendations/feedback", {
    method: "POST",
    body: JSON.stringify({ videoId, action }),
  });
}
