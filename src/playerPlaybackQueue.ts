import type { PlaybackMode } from "./playerTypes";

export function getNextVideoIdForQueue<Video extends { id: string }>(
  queueVideos: Video[],
  currentVideoId: string | null,
  mode: PlaybackMode,
  random: () => number = Math.random,
) {
  if (mode === "single-loop") return currentVideoId;
  if (!queueVideos.length) return null;

  const currentIndex = queueVideos.findIndex((video) => video.id === currentVideoId);
  if (mode === "shuffle") {
    if (queueVideos.length === 1) return queueVideos[0].id;
    const candidates = queueVideos.filter((video) => video.id !== currentVideoId);
    return candidates[Math.floor(random() * candidates.length)]?.id ?? null;
  }

  if (currentIndex < 0) return queueVideos[0].id;
  if (currentIndex < queueVideos.length - 1) return queueVideos[currentIndex + 1].id;
  return mode === "list-loop" ? queueVideos[0].id : null;
}

export function getPreviousVideoIdForQueue<Video extends { id: string }>(
  queueVideos: Video[],
  currentVideoId: string | null,
  mode: PlaybackMode,
) {
  if (mode === "single-loop") return currentVideoId;
  if (mode === "shuffle" || !queueVideos.length) return null;

  const currentIndex = queueVideos.findIndex((video) => video.id === currentVideoId);
  if (currentIndex < 0) return queueVideos[queueVideos.length - 1].id;
  if (currentIndex > 0) return queueVideos[currentIndex - 1].id;
  return mode === "list-loop" ? queueVideos[queueVideos.length - 1].id : null;
}

export function pickShuffleVideoId<Video extends { id: string }>(
  queueVideos: Video[],
  currentVideoId: string | null,
  remainingIds: string[],
  random: () => number = Math.random,
) {
  const queueIds = new Set(queueVideos.map((video) => video.id));
  let eligibleIds = remainingIds.filter((videoId) => videoId !== currentVideoId && queueIds.has(videoId));
  if (!eligibleIds.length) {
    eligibleIds = queueVideos.map((video) => video.id).filter((videoId) => videoId !== currentVideoId);
  }
  if (!eligibleIds.length) {
    return { videoId: queueVideos[0]?.id ?? null, remainingIds: [] };
  }

  const index = Math.min(eligibleIds.length - 1, Math.floor(random() * eligibleIds.length));
  return { videoId: eligibleIds[index], remainingIds: eligibleIds };
}
