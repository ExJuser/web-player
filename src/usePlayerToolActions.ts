import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import type { VideoItem } from "./playerTypes";

type UsePlayerToolActionsOptions = {
  currentVideo: VideoItem | null;
  playerRef: MutableRefObject<HTMLDivElement | null>;
  setMessage: (message: string) => void;
  setVideoRotation: Dispatch<SetStateAction<number>>;
  videoRef: MutableRefObject<HTMLVideoElement | null>;
};

export function usePlayerToolActions({
  currentVideo,
  playerRef,
  setMessage,
  setVideoRotation,
  videoRef,
}: UsePlayerToolActionsOptions) {
  const toggleFullscreen = useCallback(async () => {
    if (!playerRef.current || !currentVideo) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await playerRef.current.requestFullscreen();
      }
    } catch {
      setMessage("无法进入全屏模式");
    }
  }, [currentVideo, playerRef, setMessage]);

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
