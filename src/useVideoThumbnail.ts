import { useCallback, useSyncExternalStore } from "react";

import { playlistThumbnailStore, type PlaylistThumbnailState } from "./playlistThumbnailStore";

export type VideoThumbnailSnapshot = Pick<PlaylistThumbnailState, "status" | "url">;

const idleSnapshot: VideoThumbnailSnapshot = { status: "idle" };

/**
 * 订阅某个视频的缩略图状态（模块级单例 store）。
 * 缩略图更新不再写入 videos 数组，避免每次提交触发全库重排；
 * 需要展示缩略图的组件统一走本 hook。
 */
export function useVideoThumbnail(videoId: string | null): VideoThumbnailSnapshot {
  const subscribe = useCallback(
    (listener: () => void) => (videoId ? playlistThumbnailStore.subscribe(videoId, listener) : () => undefined),
    [videoId],
  );
  const getSnapshot = useCallback(
    () => (videoId ? (playlistThumbnailStore.get(videoId) ?? idleSnapshot) : idleSnapshot),
    [videoId],
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
