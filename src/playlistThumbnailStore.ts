import { revokeObjectUrl } from "./appResourceCleanup";
import type { VideoItem } from "./playerTypes";

export type PlaylistThumbnailState = {
  status: NonNullable<VideoItem["thumbnailStatus"]>;
  url?: string;
};

type PlaylistThumbnailUpdate = PlaylistThumbnailState & { videoId: string };

export function createPlaylistThumbnailStore() {
  const entries = new Map<string, PlaylistThumbnailState>();
  const listeners = new Map<string, Set<() => void>>();

  const notify = (videoId: string) => {
    listeners.get(videoId)?.forEach((listener) => listener());
  };

  const setMany = (updates: PlaylistThumbnailUpdate[]) => {
    updates.forEach((update) => {
      const previous = entries.get(update.videoId);
      const nextUrl = update.url ?? (update.status === "failed" || update.status === "idle" ? undefined : previous?.url);
      if (previous?.url && previous.url !== nextUrl) revokeObjectUrl(previous.url);
      if (previous?.status === update.status && previous?.url === nextUrl) return;
      entries.set(update.videoId, { status: update.status, url: nextUrl });
      notify(update.videoId);
    });
  };

  const clear = () => {
    entries.forEach((entry) => revokeObjectUrl(entry.url));
    const changedIds = Array.from(entries.keys());
    entries.clear();
    changedIds.forEach(notify);
  };

  return {
    clear,
    get: (videoId: string) => entries.get(videoId),
    setFailed: (videoId: string) => setMany([{ videoId, status: "failed" }]),
    setMany,
    subscribe(videoId: string, listener: () => void) {
      const videoListeners = listeners.get(videoId) ?? new Set();
      videoListeners.add(listener);
      listeners.set(videoId, videoListeners);
      return () => {
        videoListeners.delete(listener);
        if (!videoListeners.size) listeners.delete(videoId);
      };
    },
  };
}

export type PlaylistThumbnailStore = ReturnType<typeof createPlaylistThumbnailStore>;
