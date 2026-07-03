import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import { fetchLocalJson as fetchJson } from "./localApiClient";
import type { MediaProbeResponse } from "./appTypes";
import type { VideoItem } from "./playerTypes";

type UseMediaProbeControllerOptions = {
  canUseServerMediaTools: boolean;
  currentMediaRootId: string | null;
  currentVideo: VideoItem | null;
  mediaProbeVideoIdRef: MutableRefObject<string | null>;
  setMediaProbeVideoId: Dispatch<SetStateAction<string | null>>;
  updateVideoMetadata: (videoId: string, metadata: NonNullable<MediaProbeResponse["metadata"]>) => void;
  updateVideoPlayability: (videoId: string, playability: NonNullable<VideoItem["playability"]>) => void;
};

export function useMediaProbeController({
  canUseServerMediaTools,
  currentMediaRootId,
  currentVideo,
  mediaProbeVideoIdRef,
  setMediaProbeVideoId,
  updateVideoMetadata,
  updateVideoPlayability,
}: UseMediaProbeControllerOptions) {
  useEffect(() => {
    if (!currentVideo || !currentMediaRootId || !canUseServerMediaTools) return;
    if (currentVideo.playability || mediaProbeVideoIdRef.current === currentVideo.id) return;

    let isCancelled = false;
    const videoId = currentVideo.id;
    mediaProbeVideoIdRef.current = videoId;
    setMediaProbeVideoId(videoId);
    fetchJson<MediaProbeResponse>("/api/media/probe", {
      method: "POST",
      body: JSON.stringify({
        rootId: currentMediaRootId,
        relativePath: currentVideo.relativePath,
      }),
    })
      .then((payload) => {
        if (isCancelled) return;
        updateVideoPlayability(videoId, payload.playability);
        if (payload.metadata) {
          updateVideoMetadata(videoId, payload.metadata);
        }
      })
      .catch((error) => {
        if (isCancelled) return;
        updateVideoPlayability(videoId, {
          status: "unknown",
          reason: error instanceof Error ? `媒体探测失败：${error.message}` : "媒体探测失败。",
        });
      })
      .finally(() => {
        if (mediaProbeVideoIdRef.current === videoId) {
          mediaProbeVideoIdRef.current = null;
          setMediaProbeVideoId((currentId) => (currentId === videoId ? null : currentId));
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [
    canUseServerMediaTools,
    currentMediaRootId,
    currentVideo,
    mediaProbeVideoIdRef,
    setMediaProbeVideoId,
    updateVideoMetadata,
    updateVideoPlayability,
  ]);
}
