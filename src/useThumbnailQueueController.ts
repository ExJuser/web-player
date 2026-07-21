import { useEffect, useRef, type MutableRefObject } from "react";

import { revokeObjectUrl } from "./appResourceCleanup";
import type { VideoItem, VideoMetadata } from "./playerTypes";
import { loadVideoThumbnail } from "./videoThumbnail";

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

    const loadThumbnailsInOrder = async () => {
      for (const videoId of orderedVideoIds) {
        if (isCancelled || thumbnailLoadRunIdRef.current !== runId) return;

        const video = videoById.get(videoId);
        if (!video || video.thumbnailStatus === "ready") {
          continue;
        }

        try {
          const { thumbnailUrl, metadata } = await loadVideoThumbnail(libraryIdRef.current, video, abortController.signal);
          if (isCancelled || thumbnailLoadRunIdRef.current !== runId) {
            revokeObjectUrl(thumbnailUrl);
            return;
          }
          if (metadata) {
            updateVideoMetadata(video.id, metadata);
          }
          setVideoThumbnailState(video.id, "ready", thumbnailUrl);
        } catch (error) {
          if (!isCancelled && thumbnailLoadRunIdRef.current === runId && !(error instanceof Error && error.name === "AbortError")) {
            setVideoThumbnailState(video.id, "failed");
          }
        }
      }
    };

    void loadThumbnailsInOrder();

    return () => {
      isCancelled = true;
      abortController.abort();
    };
  }, [isMainVideoLoading, isScanning, libraryIdRef, setVideoThumbnailState, thumbnailQueueVideoIdsKey, updateVideoMetadata, videosRef]);
}
