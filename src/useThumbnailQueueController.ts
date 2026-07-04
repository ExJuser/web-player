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
    const orderedVideoIds = thumbnailQueueVideoIdsKey ? thumbnailQueueVideoIdsKey.split("\n") : [];
    const videoById = new Map(videosRef.current.map((video) => [video.id, video]));

    if (isScanning || isMainVideoLoading || !orderedVideoIds.length) {
      return () => {
        isCancelled = true;
      };
    }

    const loadThumbnailsInOrder = async () => {
      for (const videoId of orderedVideoIds) {
        if (isCancelled || thumbnailLoadRunIdRef.current !== runId) return;

        const video = videoById.get(videoId);
        if (!video || video.thumbnailStatus === "ready" || video.thumbnailStatus === "loading") {
          continue;
        }

        setVideoThumbnailState(video.id, "loading");

        try {
          const { thumbnailUrl, metadata } = await loadVideoThumbnail(libraryIdRef.current, video);
          if (isCancelled || thumbnailLoadRunIdRef.current !== runId) {
            revokeObjectUrl(thumbnailUrl);
            const currentVideo = videosRef.current.find((item) => item.id === video.id);
            if (currentVideo?.thumbnailStatus === "loading") {
              setVideoThumbnailState(video.id, "idle");
            }
            return;
          }
          if (metadata) {
            updateVideoMetadata(video.id, metadata);
          }
          setVideoThumbnailState(video.id, "ready", thumbnailUrl);
        } catch {
          if (!isCancelled && thumbnailLoadRunIdRef.current === runId) {
            setVideoThumbnailState(video.id, "failed");
          }
        }
      }
    };

    void loadThumbnailsInOrder();

    return () => {
      isCancelled = true;
    };
  }, [isMainVideoLoading, isScanning, libraryIdRef, setVideoThumbnailState, thumbnailQueueVideoIdsKey, updateVideoMetadata, videosRef]);
}
