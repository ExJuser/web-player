import { useEffect, useRef, type MutableRefObject } from "react";

import { revokeObjectUrl } from "./appResourceCleanup";
import { thumbnailGenerationConcurrency, thumbnailLookupConcurrency } from "./playerConstants";
import type { VideoItem, VideoMetadata } from "./playerTypes";
import { generateVideoThumbnail, loadAvailableVideoThumbnail } from "./videoThumbnail";

export type ThumbnailQueueUpdate = {
  videoId: string;
  status: VideoItem["thumbnailStatus"];
  url?: string;
  metadata?: VideoMetadata;
};

type UseThumbnailQueueControllerOptions = {
  applyVideoThumbnailUpdates: (updates: ThumbnailQueueUpdate[]) => void;
  isMainVideoLoading: boolean;
  isScanning: boolean;
  libraryIdRef: MutableRefObject<string | null>;
  thumbnailQueueVideoIdsKey: string;
  videosRef: MutableRefObject<VideoItem[]>;
};

export function useThumbnailQueueController({
  applyVideoThumbnailUpdates,
  isMainVideoLoading,
  isScanning,
  libraryIdRef,
  thumbnailQueueVideoIdsKey,
  videosRef,
}: UseThumbnailQueueControllerOptions) {
  const thumbnailLoadRunIdRef = useRef(0);

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
        if (!isCurrentRun()) return;
        const video = videoById.get(orderedVideoIds[index]);
        if (!video || video.thumbnailStatus === "ready") continue;
        try {
          const loaded = await loadAvailableVideoThumbnail(libraryIdRef.current, video, abortController.signal);
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
          const loaded = await generateVideoThumbnail(libraryIdRef.current, video, abortController.signal);
          return { videoId: video.id, status: "ready", url: loaded.thumbnailUrl, metadata: loaded.metadata };
        } catch (error) {
          return createFailureUpdate(video, error);
        }
      }));
      commitUpdates(updates.filter((update): update is ThumbnailQueueUpdate => Boolean(update)));
    };

    const loadQueuedThumbnails = async () => {
      await Promise.all(Array.from({ length: Math.min(thumbnailLookupConcurrency, orderedVideoIds.length) }, (_, index) => lookupWorker(index)));
      commitUpdates(lookupUpdates.filter((update): update is ThumbnailQueueUpdate => Boolean(update)));
      if (!isCurrentRun()) return;
      const videos = pendingGeneration.filter((video): video is VideoItem => Boolean(video));
      for (let index = 0; index < videos.length && isCurrentRun(); index += thumbnailGenerationConcurrency) {
        await generateBatch(videos.slice(index, index + thumbnailGenerationConcurrency));
      }
    };

    void loadQueuedThumbnails();

    return () => {
      isCancelled = true;
      abortController.abort();
    };
  }, [applyVideoThumbnailUpdates, isMainVideoLoading, isScanning, libraryIdRef, thumbnailQueueVideoIdsKey, videosRef]);
}
