import { useCallback, useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import type { LocalConfig } from "./mediaRootScanCache";
import type { VideoItem, VideoStatsStore, WatchActivityStore } from "./playerTypes";
import { savePlayerVideoStats, savePlayerWatchActivity } from "./playerStorage";
import { createVideoStatsKey, isMediaRootInHomeMode } from "./playerUiState";
import { createLocalDateKey, createWatchActivityKey } from "./watchActivityInsights";

type PlaybackStatsSession = { key: string; lastTime: number | null; hasCountedPlay: boolean };
type PlaybackActivitySession = { videoId: string; lastTime: number | null; hasCountedPlay: boolean };
type WatchActivityIncrements = {
  watchedSeconds?: number;
  playCount?: number;
  completedCount?: number;
  emissionCount?: number;
};

type UsePlaybackActivityControllerOptions = {
  currentVideoId: string | null;
  localConfigRef: MutableRefObject<LocalConfig | null>;
  playbackActivitySessionRef: MutableRefObject<PlaybackActivitySession | null>;
  playbackStatsSessionRef: MutableRefObject<PlaybackStatsSession | null>;
  setMessage: (message: string) => void;
  setVideoStatsRevision: Dispatch<SetStateAction<number>>;
  setWatchActivityRevision: Dispatch<SetStateAction<number>>;
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  videoStatsRef: MutableRefObject<VideoStatsStore>;
  watchActivityRef: MutableRefObject<WatchActivityStore>;
};

export function usePlaybackActivityController({
  currentVideoId,
  localConfigRef,
  playbackActivitySessionRef,
  playbackStatsSessionRef,
  setMessage,
  setVideoStatsRevision,
  setWatchActivityRevision,
  videoRef,
  videoStatsRef,
  watchActivityRef,
}: UsePlaybackActivityControllerOptions) {
  const updateSpecialVideoStats = useCallback(
    (
      video: VideoItem,
      updater: (current: VideoStatsStore[string]) => VideoStatsStore[string],
      options?: { saveMessage?: string },
    ) => {
      const root = video.mediaRootId
        ? localConfigRef.current?.mediaRoots.find((item) => item.id === video.mediaRootId) ?? null
        : null;
      if (!root || !isMediaRootInHomeMode(root, "special")) return;

      const statsKey = createVideoStatsKey(video);
      const currentStats = videoStatsRef.current[statsKey] ?? {
        totalPlayedSeconds: 0,
        playCount: 0,
        durationSeconds: 0,
        emissionCount: 0,
        updatedAt: Date.now(),
      };
      const nextStats = updater(currentStats);
      const nextStore = {
        ...videoStatsRef.current,
        [statsKey]: nextStats,
      };
      videoStatsRef.current = nextStore;
      setVideoStatsRevision((revision) => revision + 1);

      savePlayerVideoStats(statsKey, nextStats)
        .then(() => {
          if (options?.saveMessage) setMessage(options.saveMessage);
        })
        .catch(() => {
          setMessage("无法写入项目数据目录，请确认通过 npm run dev 或 npm run preview 启动。");
        });
    },
    [localConfigRef, setMessage, setVideoStatsRevision, videoStatsRef],
  );

  const updateWatchActivity = useCallback(
    (video: VideoItem, increments: WatchActivityIncrements, timestamp = Date.now()) => {
      const date = createLocalDateKey(timestamp);
      const key = createWatchActivityKey(date, video.id);
      const currentActivity = watchActivityRef.current[key] ?? {
        date,
        videoId: video.id,
        watchedSeconds: 0,
        playCount: 0,
        completedCount: 0,
        emissionCount: 0,
        updatedAt: timestamp,
      };
      const nextActivity = {
        ...currentActivity,
        watchedSeconds: currentActivity.watchedSeconds + Math.max(0, increments.watchedSeconds ?? 0),
        playCount: currentActivity.playCount + Math.max(0, Math.floor(increments.playCount ?? 0)),
        completedCount: currentActivity.completedCount + Math.max(0, Math.floor(increments.completedCount ?? 0)),
        emissionCount: currentActivity.emissionCount + Math.max(0, Math.floor(increments.emissionCount ?? 0)),
        updatedAt: timestamp,
      };
      const nextStore = {
        ...watchActivityRef.current,
        [key]: nextActivity,
      };
      watchActivityRef.current = nextStore;
      setWatchActivityRevision((revision) => revision + 1);
      savePlayerWatchActivity(nextActivity).catch(() => {
        setMessage("无法写入项目数据目录，请确认通过 npm run dev 或 npm run preview 启动。");
      });
    },
    [setMessage, setWatchActivityRevision, watchActivityRef],
  );

  const recordPlaybackStartForActivity = useCallback(
    (video: VideoItem) => {
      const session = playbackActivitySessionRef.current;
      if (session?.videoId === video.id && session.hasCountedPlay) return;

      playbackActivitySessionRef.current = {
        videoId: video.id,
        lastTime: videoRef.current?.currentTime ?? null,
        hasCountedPlay: true,
      };
      updateWatchActivity(video, { playCount: 1 });
    },
    [playbackActivitySessionRef, updateWatchActivity, videoRef],
  );

  const recordPlaybackStartForStats = useCallback(
    (video: VideoItem) => {
      const statsKey = createVideoStatsKey(video);
      const session = playbackStatsSessionRef.current;
      if (session?.key === statsKey && session.hasCountedPlay) return;

      playbackStatsSessionRef.current = {
        key: statsKey,
        lastTime: videoRef.current?.currentTime ?? null,
        hasCountedPlay: true,
      };
      updateSpecialVideoStats(video, (stats) => ({
        ...stats,
        playCount: stats.playCount + 1,
        durationSeconds: videoRef.current?.duration && Number.isFinite(videoRef.current.duration)
          ? videoRef.current.duration
          : stats.durationSeconds,
        updatedAt: Date.now(),
      }));
    },
    [playbackStatsSessionRef, updateSpecialVideoStats, videoRef],
  );

  const recordPlaybackProgressForStats = useCallback(
    (video: VideoItem, nextTime: number, nextDuration: number) => {
      const statsKey = createVideoStatsKey(video);
      const session = playbackStatsSessionRef.current;
      const nextSession =
        session?.key === statsKey
          ? session
          : { key: statsKey, lastTime: null, hasCountedPlay: false };
      const previousTime = nextSession.lastTime;
      nextSession.lastTime = nextTime;
      playbackStatsSessionRef.current = nextSession;
      if (previousTime === null || !Number.isFinite(previousTime) || !Number.isFinite(nextTime)) return;

      const delta = nextTime - previousTime;
      if (delta <= 0 || delta > 10) return;

      updateSpecialVideoStats(video, (stats) => ({
        ...stats,
        totalPlayedSeconds: stats.totalPlayedSeconds + delta,
        durationSeconds: Number.isFinite(nextDuration) && nextDuration > 0 ? nextDuration : stats.durationSeconds,
        updatedAt: Date.now(),
      }));
    },
    [playbackStatsSessionRef, updateSpecialVideoStats],
  );

  const recordPlaybackProgressForActivity = useCallback(
    (video: VideoItem, nextTime: number) => {
      const session = playbackActivitySessionRef.current;
      const nextSession =
        session?.videoId === video.id
          ? session
          : { videoId: video.id, lastTime: null, hasCountedPlay: false };
      const previousTime = nextSession.lastTime;
      nextSession.lastTime = nextTime;
      playbackActivitySessionRef.current = nextSession;
      if (previousTime === null || !Number.isFinite(previousTime) || !Number.isFinite(nextTime)) return;

      const delta = nextTime - previousTime;
      if (delta <= 0 || delta > 10) return;
      updateWatchActivity(video, { watchedSeconds: delta });
    },
    [playbackActivitySessionRef, updateWatchActivity],
  );

  const recordPlaybackEndedForStats = useCallback(() => {
    playbackStatsSessionRef.current = null;
  }, [playbackStatsSessionRef]);

  const recordPlaybackEndedForActivity = useCallback(() => {
    playbackActivitySessionRef.current = null;
  }, [playbackActivitySessionRef]);

  useEffect(() => {
    playbackStatsSessionRef.current = null;
    playbackActivitySessionRef.current = null;
  }, [currentVideoId, playbackActivitySessionRef, playbackStatsSessionRef]);

  return {
    recordPlaybackEndedForActivity,
    recordPlaybackEndedForStats,
    recordPlaybackProgressForActivity,
    recordPlaybackProgressForStats,
    recordPlaybackStartForActivity,
    recordPlaybackStartForStats,
    updateSpecialVideoStats,
    updateWatchActivity,
  };
}
