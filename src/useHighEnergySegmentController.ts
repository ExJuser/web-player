import { useCallback, useEffect, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import type { HighEnergyTagPrompt } from "./HighEnergyTagDialog";
import { formatTime } from "./playerFormatUtils";
import { clamp } from "./playerInteractionUtils";
import { savePlayerVideoHighlights } from "./playerStorage";
import type { VideoHighlightSegment, VideoHighlightStore, VideoItem } from "./playerTypes";

type UseHighEnergySegmentControllerOptions = {
  currentVideo: VideoItem | null;
  getPlaybackSnapshot: () => { currentTime: number; duration: number };
  setMessage: (message: string) => void;
  setVideoHighlights: Dispatch<SetStateAction<VideoHighlightStore>>;
  videoHighlightsRef: MutableRefObject<VideoHighlightStore>;
};

export function useHighEnergySegmentController({
  currentVideo,
  getPlaybackSnapshot,
  setMessage,
  setVideoHighlights,
  videoHighlightsRef,
}: UseHighEnergySegmentControllerOptions) {
  const [pendingStart, setPendingStart] = useState<{ videoId: string; time: number } | null>(null);
  const [tagPrompt, setTagPrompt] = useState<HighEnergyTagPrompt | null>(null);

  useEffect(() => {
    setPendingStart(null);
    setTagPrompt(null);
  }, [currentVideo?.id]);

  const markCurrentSegment = useCallback(() => {
    const { currentTime, duration } = getPlaybackSnapshot();
    if (!currentVideo || !duration) return;
    const markTime = clamp(currentTime, 0, duration);
    if (!pendingStart || pendingStart.videoId !== currentVideo.id) {
      setPendingStart({ videoId: currentVideo.id, time: markTime });
      setMessage(`已选择高能起点 ${formatTime(markTime)}，再次点击标记终点。`);
      return;
    }

    const startTime = Math.min(pendingStart.time, markTime);
    const endTime = Math.max(pendingStart.time, markTime);
    setPendingStart(null);
    if (endTime - startTime < 0.2) {
      setMessage("高能片段太短，请重新选择起点和终点。");
      return;
    }
    setTagPrompt({
      videoId: currentVideo.id,
      videoName: currentVideo.name,
      startTime,
      endTime,
      tagInput: "",
    });
    setMessage(`已选择高能片段 ${formatTime(startTime)} - ${formatTime(endTime)}，请填写标签。`);
  }, [currentVideo, getPlaybackSnapshot, pendingStart, setMessage]);

  const saveTagPrompt = useCallback(() => {
    if (!tagPrompt) return;
    const tag = tagPrompt.tagInput.trim().slice(0, 40);
    if (!tag) {
      setMessage("请输入高能片段标签。");
      return;
    }
    const updatedAt = Date.now();
    const nextHighlight: VideoHighlightSegment = {
      id: tagPrompt.highlightId ?? `${Math.round(tagPrompt.startTime * 10)}-${Math.round(tagPrompt.endTime * 10)}-${updatedAt.toString(36)}`,
      startTime: tagPrompt.startTime,
      endTime: tagPrompt.endTime,
      tag,
      updatedAt,
    };
    const currentHighlights = videoHighlightsRef.current[tagPrompt.videoId] ?? [];
    const nextVideoHighlights = tagPrompt.highlightId
      ? currentHighlights.map((highlight) => (highlight.id === tagPrompt.highlightId ? nextHighlight : highlight))
      : [...currentHighlights, nextHighlight];
    const nextHighlights = {
      ...videoHighlightsRef.current,
      [tagPrompt.videoId]: nextVideoHighlights.sort((a, b) => a.startTime - b.startTime),
    };
    videoHighlightsRef.current = nextHighlights;
    setVideoHighlights(nextHighlights);
    setTagPrompt(null);
    setMessage(tagPrompt.highlightId ? "已更新高能片段描述。" : `已标记高能片段 ${formatTime(tagPrompt.startTime)} - ${formatTime(tagPrompt.endTime)}：${tag}`);
    void savePlayerVideoHighlights(tagPrompt.videoId, nextHighlights[tagPrompt.videoId]).catch(() => {
      setMessage("高能标记保存失败。");
    });
  }, [setMessage, setVideoHighlights, tagPrompt, videoHighlightsRef]);

  const editCurrentSegment = useCallback((highlight: VideoHighlightSegment) => {
    if (!currentVideo) return;
    setTagPrompt({
      videoId: currentVideo.id,
      videoName: currentVideo.name,
      startTime: highlight.startTime,
      endTime: highlight.endTime,
      highlightId: highlight.id,
      tagInput: highlight.tag ?? "",
    });
  }, [currentVideo]);

  const removeCurrentSegment = useCallback((highlightId: string) => {
    if (!currentVideo) return;
    const nextVideoHighlights = (videoHighlightsRef.current[currentVideo.id] ?? []).filter((highlight) => highlight.id !== highlightId);
    const nextHighlights = {
      ...videoHighlightsRef.current,
      [currentVideo.id]: nextVideoHighlights,
    };
    if (!nextVideoHighlights.length) delete nextHighlights[currentVideo.id];
    videoHighlightsRef.current = nextHighlights;
    setVideoHighlights(nextHighlights);
    void savePlayerVideoHighlights(currentVideo.id, nextVideoHighlights).catch(() => {
      setMessage("高能标记保存失败。");
    });
  }, [currentVideo, setMessage, setVideoHighlights, videoHighlightsRef]);

  return {
    editCurrentSegment,
    markCurrentSegment,
    pendingStart,
    removeCurrentSegment,
    saveTagPrompt,
    setTagPrompt,
    tagPrompt,
  };
}
