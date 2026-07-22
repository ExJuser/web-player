import { useEffect, useRef, type MutableRefObject } from "react";

import { revokeObjectUrl } from "./appResourceCleanup";
import { thumbnailGenerationConcurrency, thumbnailLookupConcurrency } from "./playerConstants";
import type { VideoItem, VideoMetadata } from "./playerTypes";
import { generateVideoThumbnail, loadAvailableVideoThumbnail } from "./videoThumbnail";

type UseThumbnailQueueControllerOptions = {
  isMainVideoLoading: boolean;
  isScanning: boolean;
  libraryIdRef: MutableRefObject<string | null>;
  setVideoThumbnailState: (videoId: string, status: VideoItem["thumbnailStatus"], url?: string) => void;
  thumbnailQueueVideoIdsKey: string;
  updateVideoMetadata: (videoId: string, metadata: VideoMetadata) => void;
  videosRef: MutableRefObject<VideoItem[]>;
};

export function useThumbnailQueueController({
  isMainVideoLoading,
  isScanning,
  libraryIdRef,
  setVideoThumbnailState,
  thumbnailQueueVideoIdsKey,
  updateVideoMetadata,
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
    const commitThumbnail = (video: VideoItem, thumbnailUrl: string, metadata?: VideoMetadata) => {
      if (!isCurrentRun()) {
        revokeObjectUrl(thumbnailUrl);
        return;
      }
      if (metadata) updateVideoMetadata(video.id, metadata);
      setVideoThumbnailState(video.id, "ready", thumbnailUrl);
    };
    const handleFailure = (video: VideoItem, error: unknown) => {
      if (isCurrentRun() && !(error instanceof Error && error.name === "AbortError")) {
        setVideoThumbnailState(video.id, "failed");
      }
    };
    const pendingGeneration: Array<VideoItem | undefined> = new Array(orderedVideoIds.length);

    const lookupWorker = async (workerIndex: number) => {
      for (let index = workerIndex; index < orderedVideoIds.length; index += thumbnailLookupConcurrency) {
        if (!isCurrentRun()) return;
        const video = videoById.get(orderedVideoIds[index]);
        if (!video || video.thumbnailStatus === "ready") continue;
        try {
          const loaded = await loadAvailableVideoThumbnail(libraryIdRef.current, video, abortController.signal);
          if (loaded) commitThumbnail(video, loaded.thumbnailUrl, loaded.metadata);
          else pendingGeneration[index] = video;
        } catch (error) {
          handleFailure(video, error);
        }
      }
    };

    const videosToGenerate = () => pendingGeneration.filter((video): video is VideoItem => Boolean(video));

    const generationWorker = async (workerIndex: number, videos: VideoItem[]) => {
      for (let index = workerIndex; index < videos.length; index += thumbnailGenerationConcurrency) {
        if (!isCurrentRun()) return;
        const video = videos[index];
        try {
          const loaded = await generateVideoThumbnail(libraryIdRef.current, video, abortController.signal);
          commitThumbnail(video, loaded.thumbnailUrl, loaded.metadata);
        } catch (error) {
          handleFailure(video, error);
        }
      }
    };

    const loadQueuedThumbnails = async () => {
      await Promise.all(Array.from({ length: Math.min(thumbnailLookupConcurrency, orderedVideoIds.length) }, (_, index) => lookupWorker(index)));
      if (!isCurrentRun()) return;
      const videos = videosToGenerate();
      await Promise.all(Array.from({ length: Math.min(thumbnailGenerationConcurrency, videos.length) }, (_, index) => generationWorker(index, videos)));
    };

    void loadQueuedThumbnails();

    return () => {
      isCancelled = true;
      abortController.abort();
    };
  }, [isMainVideoLoading, isScanning, libraryIdRef, setVideoThumbnailState, thumbnailQueueVideoIdsKey, updateVideoMetadata, videosRef]);
}
