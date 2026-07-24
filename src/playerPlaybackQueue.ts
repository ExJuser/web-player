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
