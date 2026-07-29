import { useCallback, useEffect, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import { formatTime } from "./playerFormatUtils";
import { clamp } from "./playerInteractionUtils";
import { savePlayerVideoEditSegments } from "./playerStorage";
import type { VideoEditSegmentStore, VideoItem } from "./playerTypes";
import { createVideoEditSegment } from "./videoEditUtils";

type UseVideoEditSegmentControllerOptions = {
  currentVideo: VideoItem | null;
  getPlaybackSnapshot: () => { currentTime: number; duration: number };
  setMessage: (message: string) => void;
  setVideoEditSegments: Dispatch<SetStateAction<VideoEditSegmentStore>>;
  videoEditSegmentsRef: MutableRefObject<VideoEditSegmentStore>;
};

export function useVideoEditSegmentController({
  currentVideo,
  getPlaybackSnapshot,
  setMessage,
  setVideoEditSegments,
  videoEditSegmentsRef,
}: UseVideoEditSegmentControllerOptions) {
  const [pendingStart, setPendingStart] = useState<{ videoId: string; time: number } | null>(null);

  useEffect(() => {
    setPendingStart(null);
  }, [currentVideo?.id]);

  const markCurrentSegment = useCallback(() => {
    const { currentTime, duration } = getPlaybackSnapshot();
    if (!currentVideo || !duration) return;
    const markTime = clamp(currentTime, 0, duration);
    if (!pendingStart || pendingStart.videoId !== currentVideo.id) {
      setPendingStart({ videoId: currentVideo.id, time: markTime });
      setMessage(`已选择剪辑保留起点 ${formatTime(markTime)}，再次点击标记终点。`);
      return;
    }

    setPendingStart(null);
    const segment = createVideoEditSegment(pendingStart.time, markTime);
    if (!segment) {
      setMessage("剪辑保留片段太短，请重新选择起点和终点。");
      return;
    }
    const currentSegments = videoEditSegmentsRef.current[currentVideo.id] ?? [];
    const nextVideoSegments = [...currentSegments, segment].sort((a, b) => a.startTime - b.startTime || a.endTime - b.endTime);
    const nextStore = { ...videoEditSegmentsRef.current, [currentVideo.id]: nextVideoSegments };
    videoEditSegmentsRef.current = nextStore;
    setVideoEditSegments(nextStore);
    setMessage(`已标记剪辑保留片段 ${formatTime(segment.startTime)} - ${formatTime(segment.endTime)}。`);
    void savePlayerVideoEditSegments(currentVideo.id, nextVideoSegments).catch(() => {
      setMessage("剪辑保留片段保存失败。");
    });
  }, [currentVideo, getPlaybackSnapshot, pendingStart, setMessage, setVideoEditSegments, videoEditSegmentsRef]);

  const removeCurrentSegment = useCallback((segmentId: string) => {
    if (!currentVideo) return;
    const nextVideoSegments = (videoEditSegmentsRef.current[currentVideo.id] ?? []).filter((segment) => segment.id !== segmentId);
    const nextStore = { ...videoEditSegmentsRef.current };
    if (nextVideoSegments.length) nextStore[currentVideo.id] = nextVideoSegments;
    else delete nextStore[currentVideo.id];
    videoEditSegmentsRef.current = nextStore;
    setVideoEditSegments(nextStore);
    void savePlayerVideoEditSegments(currentVideo.id, nextVideoSegments).catch(() => {
      setMessage("剪辑保留片段保存失败。");
    });
  }, [currentVideo, setMessage, setVideoEditSegments, videoEditSegmentsRef]);

  return { markCurrentSegment, pendingStart, removeCurrentSegment };
}
