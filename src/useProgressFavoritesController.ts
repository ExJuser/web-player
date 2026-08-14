import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import { createProgress, deletePlayerProgress, savePlayerFavorite, savePlayerProgress } from "./playerStorage";
import { addPlaybackHistoryInterval } from "./playbackHistory";
import type { ProgressStore, VideoItem } from "./playerTypes";

type UseProgressFavoritesControllerOptions = {
  clearedProgressVideoIdsRef: MutableRefObject<Set<string>>;
  currentVideo: VideoItem | null;
  currentVideoId: string | null;
  favoriteVideoIdsRef: MutableRefObject<Set<string>>;
  isPrivacyMode: boolean;
  progressStoreRef: MutableRefObject<ProgressStore>;
  setFavoriteVideoIds: Dispatch<SetStateAction<Set<string>>>;
  setCurrentTime: Dispatch<SetStateAction<number>>;
  setMessage: (message: string) => void;
  setProgressStore: Dispatch<SetStateAction<ProgressStore>>;
  updateWatchActivity: (video: VideoItem, delta: { completedCount?: number }, updatedAt?: number) => void;
  videoRef: MutableRefObject<HTMLVideoElement | null>;
};

export function useProgressFavoritesController({
  clearedProgressVideoIdsRef,
  currentVideo,
  currentVideoId,
  favoriteVideoIdsRef,
  isPrivacyMode,
  progressStoreRef,
  setCurrentTime,
  setFavoriteVideoIds,
  setMessage,
  setProgressStore,
  updateWatchActivity,
  videoRef,
}: UseProgressFavoritesControllerOptions) {
  const updateProgress = useCallback(
    (video: VideoItem, currentTime: number, duration: number, completed?: boolean) => {
      if (!completed && clearedProgressVideoIdsRef.current.has(video.id)) {
        if (currentTime < 0.5) return;
        clearedProgressVideoIdsRef.current.delete(video.id);
      }

      const previous = progressStoreRef.current[video.id];
      const nextDuration =
        Number.isFinite(duration) && duration > 0
          ? duration
          : previous?.duration && previous.duration > 0
            ? previous.duration
            : video.duration && video.duration > 0
              ? video.duration
              : 0;
      const progress = createProgress(currentTime, nextDuration, completed ?? previous?.completed ?? false);
      if (!progress) return;
      const history = isPrivacyMode
        ? previous?.history
        : addPlaybackHistoryInterval(previous?.history, previous?.currentTime ?? 0, currentTime, nextDuration, progress.updatedAt);
      if (history) progress.history = history;

      const nextStore = {
        ...progressStoreRef.current,
        [video.id]: progress,
      };
      progressStoreRef.current = nextStore;
      setProgressStore(nextStore);

      if (progress.completed && !previous?.completed) {
        updateWatchActivity(video, { completedCount: 1 }, progress.updatedAt);
      }

      savePlayerProgress(video.id, progress).catch(() => {
        setMessage("无法写入项目数据目录，请确认通过 npm run dev 或 npm run preview 启动。");
      });
    },
    [clearedProgressVideoIdsRef, isPrivacyMode, progressStoreRef, setMessage, setProgressStore, updateWatchActivity],
  );

  const replaceProgressStore = useCallback((nextStore: ProgressStore, successMessage?: string) => {
    const previousStore = progressStoreRef.current;
    progressStoreRef.current = nextStore;
    setProgressStore(nextStore);

    const changedVideoIds = Array.from(new Set([...Object.keys(previousStore), ...Object.keys(nextStore)])).filter((videoId) => {
      const previous = previousStore[videoId];
      const next = nextStore[videoId];
      if (previous === next) return false;
      return JSON.stringify(previous ?? null) !== JSON.stringify(next ?? null);
    });
    Promise.all(
      changedVideoIds.map((videoId) =>
        nextStore[videoId] ? savePlayerProgress(videoId, nextStore[videoId]) : deletePlayerProgress(videoId),
      ),
    )
      .then(() => {
        if (successMessage) setMessage(successMessage);
      })
      .catch(() => {
        setMessage("无法写入项目数据目录，请确认通过 npm run dev 或 npm run preview 启动。");
      });
  }, [progressStoreRef, setMessage, setProgressStore]);

  const replaceFavorites = useCallback((nextFavorites: Set<string>, successMessage?: string) => {
    const previousFavorites = favoriteVideoIdsRef.current;
    favoriteVideoIdsRef.current = nextFavorites;
    setFavoriteVideoIds(new Set(nextFavorites));

    const changedVideoIds = Array.from(new Set([...previousFavorites, ...nextFavorites])).filter(
      (videoId) => previousFavorites.has(videoId) !== nextFavorites.has(videoId),
    );
    Promise.all(
      changedVideoIds.map((videoId) =>
        savePlayerFavorite(videoId, nextFavorites.has(videoId)),
      ),
    )
      .then(() => {
        if (successMessage) setMessage(successMessage);
      })
      .catch(() => {
        setMessage("无法写入项目数据目录，请确认通过 npm run dev 或 npm run preview 启动。");
      });
  }, [favoriteVideoIdsRef, setFavoriteVideoIds, setMessage]);

  const toggleFavorite = useCallback(
    (video: VideoItem) => {
      const nextFavorites = new Set(favoriteVideoIdsRef.current);
      if (nextFavorites.has(video.id)) {
        nextFavorites.delete(video.id);
        replaceFavorites(nextFavorites, `已取消收藏《${video.name}》`);
      } else {
        nextFavorites.add(video.id);
        replaceFavorites(nextFavorites, `已收藏《${video.name}》`);
      }
    },
    [favoriteVideoIdsRef, replaceFavorites],
  );

  const toggleCurrentFavorite = useCallback(() => {
    if (!currentVideo) return;
    toggleFavorite(currentVideo);
  }, [currentVideo, toggleFavorite]);

  const resetVideoProgress = useCallback(
    (video: VideoItem) => {
      clearedProgressVideoIdsRef.current.add(video.id);
      const nextStore = { ...progressStoreRef.current };
      delete nextStore[video.id];

      if (currentVideoId === video.id) {
        const element = videoRef.current;
        if (element && Number.isFinite(element.duration)) {
          element.currentTime = 0;
        }
        setCurrentTime(0);
      }
      replaceProgressStore(nextStore, `已清除《${video.name}》的播放进度`);
    },
    [clearedProgressVideoIdsRef, currentVideoId, progressStoreRef, replaceProgressStore, setCurrentTime, videoRef],
  );

  return {
    resetVideoProgress,
    toggleCurrentFavorite,
    toggleFavorite,
    updateProgress,
  };
}
