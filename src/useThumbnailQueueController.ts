import { useEffect, useRef, type MutableRefObject } from "react";

import { revokeObjectUrl } from "./appResourceCleanup";
import { thumbnailCommitBatchSize, thumbnailGenerationConcurrency, thumbnailLookupConcurrency } from "./playerConstants";
import type { VideoItem, VideoMetadata } from "./playerTypes";
import type { ThumbnailVariant } from "./playerStorage";
import { generateVideoThumbnail, loadAvailableVideoThumbnail } from "./videoThumbnail";

export type ThumbnailQueueUpdate = {
  videoId: string;
  status: NonNullable<VideoItem["thumbnailStatus"]>;
  url?: string;
  metadata?: VideoMetadata;
};

type UseThumbnailQueueControllerOptions = {
  applyVideoThumbnailUpdates: (updates: ThumbnailQueueUpdate[]) => void;
  getThumbnailStatus?: (video: VideoItem) => VideoItem["thumbnailStatus"];
  isMainVideoLoading: boolean;
  isPlaylistScrolling: boolean;
  isScanning: boolean;
  libraryIdRef: MutableRefObject<string | null>;
  thumbnailQueueVideoIdsKey: string;
  thumbnailVariant?: ThumbnailVariant;
  videosRef: MutableRefObject<VideoItem[]>;
};

export function useThumbnailQueueController({
  applyVideoThumbnailUpdates,
  getThumbnailStatus = (video) => video.thumbnailStatus,
  isMainVideoLoading,
  isPlaylistScrolling,
  isScanning,
  libraryIdRef,
  thumbnailQueueVideoIdsKey,
  thumbnailVariant = "standard",
  videosRef,
}: UseThumbnailQueueControllerOptions) {
  const thumbnailLoadRunIdRef = useRef(0);
  // 滚动状态通过 ref 感知：滚动中挂起加载而不是 abort 重来，
  // 避免每次滚动开始/停止都重新 fetch/解码全部未就绪缩略图。
  const isPlaylistScrollingRef = useRef(isPlaylistScrolling);
  useEffect(() => {
    isPlaylistScrollingRef.current = isPlaylistScrolling;
  }, [isPlaylistScrolling]);

  useEffect(() => {
    const runId = thumbnailLoadRunIdRef.current + 1;
    thumbnailLoadRunIdRef.current = runId;
    let isCancelled = false;
    const abortController = new AbortController();
    const orderedVideoIds = thumbnailQueueVideoIdsKey ? thumbnailQueueVideoIdsKey.split("\n") : [];
    const videoById = new Map(videosRef.current.map((video) => [video.id, video]));

    if (isScanning || isMainVideoLoading || !orderedVideoIds.length) {
      return () => {
        isCancelled = true;
        abortController.abort();
      };
    }

    const isCurrentRun = () => !isCancelled && thumbnailLoadRunIdRef.current === runId;
    const waitIfSuspended = async () => {
      while (!isCancelled && isPlaylistScrollingRef.current) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 60));
      }
    };
    const commitUpdates = (updates: ThumbnailQueueUpdate[]) => {
      if (!updates.length) return;
      if (!isCurrentRun()) {
        updates.forEach((update) => revokeObjectUrl(update.url));
        return;
      }
      applyVideoThumbnailUpdates(updates);
    };
    const createFailureUpdate = (video: VideoItem, error: unknown): ThumbnailQueueUpdate | null => {
      if (error instanceof Error && error.name === "AbortError") return null;
      return { videoId: video.id, status: "failed" };
    };
    const pendingGeneration: Array<VideoItem | undefined> = new Array(orderedVideoIds.length);
    const lookupUpdates: Array<ThumbnailQueueUpdate | undefined> = new Array(orderedVideoIds.length);

    const lookupWorker = async (workerIndex: number) => {
      for (let index = workerIndex; index < orderedVideoIds.length; index += thumbnailLookupConcurrency) {
        await waitIfSuspended();
        if (!isCurrentRun()) return;
        const video = videoById.get(orderedVideoIds[index]);
        if (!video || getThumbnailStatus(video) === "ready") continue;
        try {
          const loaded = await loadAvailableVideoThumbnail(libraryIdRef.current, video, abortController.signal, thumbnailVariant);
          if (loaded) lookupUpdates[index] = { videoId: video.id, status: "ready", url: loaded.thumbnailUrl, metadata: loaded.metadata };
          else pendingGeneration[index] = video;
        } catch (error) {
          lookupUpdates[index] = createFailureUpdate(video, error) ?? undefined;
        }
      }
    };

    const generateBatch = async (videos: VideoItem[]) => {
      const updates = await Promise.all(videos.map(async (video): Promise<ThumbnailQueueUpdate | null> => {
        try {
          const loaded = await generateVideoThumbnail(libraryIdRef.current, video, abortController.signal, thumbnailVariant);
          return { videoId: video.id, status: "ready", url: loaded.thumbnailUrl, metadata: loaded.metadata };
        } catch (error) {
          return createFailureUpdate(video, error);
        }
      }));
      commitUpdates(updates.filter((update): update is ThumbnailQueueUpdate => Boolean(update)));
    };

    const commitUpdatesAcrossFrames = async (updates: ThumbnailQueueUpdate[]) => {
      for (let index = 0; index < updates.length; index += thumbnailCommitBatchSize) {
        if (!isCurrentRun()) {
          updates.slice(index).forEach((update) => revokeObjectUrl(update.url));
          return;
        }
        commitUpdates(updates.slice(index, index + thumbnailCommitBatchSize));
        if (index + thumbnailCommitBatchSize < updates.length) {
          await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
        }
      }
    };

    const loadQueuedThumbnails = async () => {
      await waitIfSuspended();
      if (!isCurrentRun()) return;
      await Promise.all(Array.from({ length: Math.min(thumbnailLookupConcurrency, orderedVideoIds.length) }, (_, index) => lookupWorker(index)));
      await commitUpdatesAcrossFrames(lookupUpdates.filter((update): update is ThumbnailQueueUpdate => Boolean(update)));
      if (!isCurrentRun()) return;
      const videos = pendingGeneration.filter((video): video is VideoItem => Boolean(video));
      for (let index = 0; index < videos.length && isCurrentRun(); index += thumbnailGenerationConcurrency) {
        await waitIfSuspended();
        if (!isCurrentRun()) break;
        await generateBatch(videos.slice(index, index + thumbnailGenerationConcurrency));
      }
    };

    void loadQueuedThumbnails();

    return () => {
      isCancelled = true;
      abortController.abort();
    };
  }, [applyVideoThumbnailUpdates, getThumbnailStatus, isMainVideoLoading, isScanning, libraryIdRef, thumbnailQueueVideoIdsKey, thumbnailVariant, videosRef]);
}
