import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";

import { clamp } from "./playerInteractionUtils";
import type { VideoItem } from "./playerTypes";
import { getVideoDisplaySize } from "./videoThumbnail";

export type TimelinePreviewState = {
  time: number;
  left: number;
  isVisible: boolean;
  isDragging: boolean;
  imageUrl: string;
  isLoadingFrame: boolean;
};

const initialTimelinePreview: TimelinePreviewState = {
  time: 0,
  left: 0,
  isVisible: false,
  isDragging: false,
  imageUrl: "",
  isLoadingFrame: false,
};

type UseTimelinePreviewControllerOptions = {
  currentVideo: VideoItem | null;
  duration: number;
  isPrivacyMode: boolean;
  previewCanvasRef: MutableRefObject<HTMLCanvasElement | null>;
  previewVideoRef: MutableRefObject<HTMLVideoElement | null>;
  timelineRef: MutableRefObject<HTMLInputElement | null>;
};

export function useTimelinePreviewController({
  currentVideo,
  duration,
  isPrivacyMode,
  previewCanvasRef,
  previewVideoRef,
  timelineRef,
}: UseTimelinePreviewControllerOptions) {
  const timelineFrameTimerRef = useRef<number | null>(null);
  const timelineFrameRequestRef = useRef(0);
  const [timelinePreview, setTimelinePreview] = useState<TimelinePreviewState>(initialTimelinePreview);

  const resetTimelinePreview = useCallback(() => {
    setTimelinePreview(initialTimelinePreview);
  }, []);

  const updateTimelinePreview = useCallback(
    (clientX: number, isDragging = false) => {
      const timeline = timelineRef.current;
      if (isPrivacyMode || !timeline || !currentVideo || duration <= 0) {
        setTimelinePreview((previous) => ({ ...previous, isVisible: false, isDragging: false }));
        return;
      }

      const rect = timeline.getBoundingClientRect();
      const ratio = rect.width ? clamp((clientX - rect.left) / rect.width, 0, 1) : 0;
      setTimelinePreview((previous) => ({
        ...previous,
        time: ratio * duration,
        left: ratio * 100,
        isVisible: true,
        isDragging,
      }));
    },
    [currentVideo, duration, isPrivacyMode, timelineRef],
  );

  const updateTimelinePreviewFromTime = useCallback(
    (time: number, isDragging = false) => {
      if (isPrivacyMode || !currentVideo || duration <= 0) {
        setTimelinePreview((previous) => ({ ...previous, isVisible: false, isDragging: false }));
        return;
      }

      const nextTime = clamp(time, 0, duration);
      setTimelinePreview((previous) => ({
        ...previous,
        time: nextTime,
        left: (nextTime / duration) * 100,
        isVisible: true,
        isDragging,
      }));
    },
    [currentVideo, duration, isPrivacyMode],
  );

  const hideTimelinePreview = useCallback(() => {
    setTimelinePreview((previous) =>
      previous.isDragging ? previous : { ...previous, isVisible: false, isDragging: false },
    );
  }, []);

  const stopTimelineDragPreview = useCallback(() => {
    setTimelinePreview((previous) => ({ ...previous, isVisible: false, isDragging: false }));
  }, []);

  const captureTimelineFrame = useCallback((time: number) => {
    const previewVideo = previewVideoRef.current;
    const canvas = previewCanvasRef.current;
    if (
      isPrivacyMode ||
      !previewVideo ||
      !canvas ||
      !currentVideo ||
      duration <= 0 ||
      previewVideo.readyState < HTMLMediaElement.HAVE_METADATA
    ) {
      return;
    }

    const requestId = timelineFrameRequestRef.current + 1;
    timelineFrameRequestRef.current = requestId;
    const targetTime = clamp(time, 0, Math.max(0, previewVideo.duration || duration));
    setTimelinePreview((previous) => (previous.isVisible ? { ...previous, isLoadingFrame: true } : previous));

    const drawFrame = () => {
      if (timelineFrameRequestRef.current !== requestId) return;
      const context = canvas.getContext("2d");
      const displaySize = getVideoDisplaySize(previewVideo.videoWidth, previewVideo.videoHeight);
      const sourceWidth = displaySize?.width;
      const sourceHeight = displaySize?.height;
      if (!context || !sourceWidth || !sourceHeight) return;

      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;
      const scale = Math.min(canvasWidth / sourceWidth, canvasHeight / sourceHeight);
      const drawWidth = sourceWidth * scale;
      const drawHeight = sourceHeight * scale;
      const drawLeft = (canvasWidth - drawWidth) / 2;
      const drawTop = (canvasHeight - drawHeight) / 2;

      context.fillStyle = "#050607";
      context.fillRect(0, 0, canvasWidth, canvasHeight);
      context.drawImage(previewVideo, drawLeft, drawTop, drawWidth, drawHeight);
      const imageUrl = canvas.toDataURL("image/jpeg", 0.78);
      setTimelinePreview((previous) =>
        previous.isVisible ? { ...previous, imageUrl, isLoadingFrame: false } : previous,
      );
    };

    if (Math.abs(previewVideo.currentTime - targetTime) < 0.08 && previewVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      drawFrame();
      return;
    }

    previewVideo.addEventListener("seeked", drawFrame, { once: true });
    previewVideo.currentTime = targetTime;
  }, [currentVideo, duration, isPrivacyMode, previewCanvasRef, previewVideoRef]);

  useEffect(() => {
    if (timelineFrameTimerRef.current) {
      window.clearTimeout(timelineFrameTimerRef.current);
      timelineFrameTimerRef.current = null;
    }

    if (isPrivacyMode || !timelinePreview.isVisible || !currentVideo || duration <= 0) {
      timelineFrameRequestRef.current += 1;
      setTimelinePreview((previous) =>
        previous.imageUrl || previous.isLoadingFrame ? { ...previous, imageUrl: "", isLoadingFrame: false } : previous,
      );
      return;
    }

    timelineFrameTimerRef.current = window.setTimeout(() => {
      timelineFrameTimerRef.current = null;
      captureTimelineFrame(timelinePreview.time);
    }, 80);

    return () => {
      if (timelineFrameTimerRef.current) {
        window.clearTimeout(timelineFrameTimerRef.current);
        timelineFrameTimerRef.current = null;
      }
    };
  }, [captureTimelineFrame, currentVideo, duration, isPrivacyMode, timelinePreview.isVisible, timelinePreview.time]);

  return {
    hideTimelinePreview,
    resetTimelinePreview,
    stopTimelineDragPreview,
    timelinePreview,
    updateTimelinePreview,
    updateTimelinePreviewFromTime,
  };
}
