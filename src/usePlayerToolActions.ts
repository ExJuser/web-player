import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import type { VideoItem } from "./playerTypes";

type WebkitFullscreenDocument = Document & {
  webkitExitFullscreen?: () => Promise<void> | void;
  webkitFullscreenElement?: Element | null;
};

type WebkitFullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

type WebkitFullscreenVideo = HTMLVideoElement & {
  webkitDisplayingFullscreen?: boolean;
  webkitEnterFullscreen?: () => void;
  webkitExitFullscreen?: () => void;
};

type UsePlayerToolActionsOptions = {
  currentVideo: VideoItem | null;
  fullscreenRef: MutableRefObject<HTMLElement | null>;
  setMessage: (message: string) => void;
  setVideoRotation: Dispatch<SetStateAction<number>>;
  videoRef: MutableRefObject<HTMLVideoElement | null>;
};

export function usePlayerToolActions({
  currentVideo,
  fullscreenRef,
  setMessage,
  setVideoRotation,
  videoRef,
}: UsePlayerToolActionsOptions) {
  const toggleFullscreen = useCallback(async () => {
    const player = fullscreenRef.current as WebkitFullscreenElement | null;
    const video = videoRef.current as WebkitFullscreenVideo | null;
    if (!player || !currentVideo) return;

    const fullscreenDocument = document as WebkitFullscreenDocument;
    try {
      if (document.fullscreenElement || fullscreenDocument.webkitFullscreenElement) {
        const exitFullscreen = document.exitFullscreen?.bind(document)
          ?? fullscreenDocument.webkitExitFullscreen?.bind(fullscreenDocument);
        await exitFullscreen?.();
        return;
      }

      if (video?.webkitDisplayingFullscreen && video.webkitExitFullscreen) {
        video.webkitExitFullscreen();
        return;
      }

      const requestFullscreen = player.requestFullscreen?.bind(player)
        ?? player.webkitRequestFullscreen?.bind(player);
      if (requestFullscreen) {
        try {
          await requestFullscreen();
          return;
        } catch (error) {
          if (!video?.webkitEnterFullscreen) throw error;
        }
      }

      if (video?.webkitEnterFullscreen) {
        video.webkitEnterFullscreen();
        return;
      }

      setMessage("当前浏览器不支持全屏播放");
    } catch {
      setMessage("无法进入全屏模式");
    }
  }, [currentVideo, fullscreenRef, setMessage, videoRef]);

  const togglePictureInPicture = useCallback(async () => {
    const element = videoRef.current;
    if (!element || !document.pictureInPictureEnabled) {
      setMessage("当前浏览器不支持画中画");
      return;
    }
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await element.requestPictureInPicture();
      }
    } catch {
      setMessage("无法进入画中画模式");
    }
  }, [setMessage, videoRef]);

  const rotateVideoClockwise = useCallback(() => {
    if (!currentVideo) return;
    setVideoRotation((rotation) => (rotation + 90) % 360);
  }, [currentVideo, setVideoRotation]);

  return {
    rotateVideoClockwise,
    toggleFullscreen,
    togglePictureInPicture,
  };
}
