import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import { revokeObjectUrl } from "./appResourceCleanup";
import type { GeneratedSubtitleResult, MediaProcessingTaskSnapshot } from "./appTypes";
import { fetchLocalJson as fetchJson } from "./localApiClient";
import type { MediaProcessingTaskState } from "./MediaProcessingTaskDialog";
import { isObjectUrl } from "./playerLibraryUtils";
import type { SubtitleItem, VideoItem } from "./playerTypes";
import { createSubtitleUrl } from "./subtitleMedia";

type GeneratedSubtitlePayload = {
  id: string;
  text: string;
  format: "vtt";
  language: "ja";
  modelLabel: string;
};

type UseGeneratedSubtitleControllerOptions = {
  canReadGeneratedSubtitle: boolean;
  currentMediaRootId: string | null;
  currentVideo: VideoItem | null;
  setMessage: (message: string) => void;
  setSubtitles: Dispatch<SetStateAction<SubtitleItem[]>>;
  setTask: Dispatch<SetStateAction<MediaProcessingTaskState | null>>;
  subtitlesRef: MutableRefObject<SubtitleItem[]>;
  task: MediaProcessingTaskState | null;
  updateSelectedSubtitleId: (subtitleId: string) => void;
  videosRef: MutableRefObject<VideoItem[]>;
};

export function useGeneratedSubtitleController({
  canReadGeneratedSubtitle,
  currentMediaRootId,
  currentVideo,
  setMessage,
  setSubtitles,
  setTask,
  subtitlesRef,
  task,
  updateSelectedSubtitleId,
  videosRef,
}: UseGeneratedSubtitleControllerOptions) {
  const loadedCacheKeysRef = useRef(new Set<string>());

  const loadGeneratedSubtitleForVideo = useCallback(async (
    video: VideoItem,
    rootId: string,
    options?: { select?: boolean },
  ) => {
    const payload = await fetchJson<GeneratedSubtitlePayload>("/api/subtitles/generated/cached", {
      method: "POST",
      body: JSON.stringify({ rootId, relativePath: video.relativePath }),
    });
    if (!payload.text.trim()) return null;

    const subtitle: SubtitleItem = {
      id: `generated:${video.id}:${payload.id}`,
      name: `生成日语字幕 · ${payload.modelLabel}`,
      relativePath: `${video.relativePath}#generated-ja`,
      url: "",
      source: "generated",
      rawText: payload.text,
      format: payload.format,
      videoId: video.id,
      mediaRootId: rootId,
    };
    const subtitleWithUrl = { ...subtitle, url: await createSubtitleUrl(subtitle) };
    const previous = subtitlesRef.current;
    previous
      .filter((item) => item.id === subtitleWithUrl.id && isObjectUrl(item.url))
      .forEach((item) => revokeObjectUrl(item.url));
    const next = [...previous.filter((item) => item.id !== subtitleWithUrl.id), subtitleWithUrl];
    subtitlesRef.current = next;
    setSubtitles(next);
    if (options?.select) updateSelectedSubtitleId(subtitleWithUrl.id);
    return subtitleWithUrl;
  }, [setSubtitles, subtitlesRef, updateSelectedSubtitleId]);

  const startSubtitleGeneration = useCallback(async () => {
    if (!currentVideo || !currentMediaRootId || task) return;
    try {
      const response = await fetchJson<{ task: MediaProcessingTaskSnapshot }>("/api/subtitles/generated/generate", {
        method: "POST",
        body: JSON.stringify({
          rootId: currentMediaRootId,
          relativePath: currentVideo.relativePath,
          sourceVideoId: currentVideo.id,
        }),
      });
      setTask({ ...response.task, isDialogOpen: true });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "启动日语字幕生成失败。");
    }
  }, [currentMediaRootId, currentVideo, setMessage, setTask, task]);

  const handleCompletedGeneration = useCallback(async (result: GeneratedSubtitleResult) => {
    const video = videosRef.current.find((item) => (
      item.id === result.sourceVideoId && item.relativePath === result.relativePath
    )) ?? null;
    if (!video) {
      setMessage(`已为 ${result.relativePath} 生成日语字幕。`);
      return;
    }
    try {
      loadedCacheKeysRef.current.add(`${result.rootId}|${result.relativePath}`);
      const shouldSelect = currentVideo?.id === video.id;
      await loadGeneratedSubtitleForVideo(video, result.rootId, { select: shouldSelect });
      setMessage(shouldSelect ? "日语字幕已生成并加载。" : `已为 ${video.name} 生成日语字幕。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "日语字幕已生成，但加载失败。");
    }
  }, [currentVideo?.id, loadGeneratedSubtitleForVideo, setMessage, videosRef]);

  useEffect(() => {
    if (!canReadGeneratedSubtitle || !currentVideo || !currentMediaRootId) return;
    const cacheKey = `${currentMediaRootId}|${currentVideo.relativePath}`;
    if (loadedCacheKeysRef.current.has(cacheKey)) return;
    loadedCacheKeysRef.current.add(cacheKey);
    void loadGeneratedSubtitleForVideo(currentVideo, currentMediaRootId).catch(() => undefined);
  }, [canReadGeneratedSubtitle, currentMediaRootId, currentVideo, loadGeneratedSubtitleForVideo]);

  return { handleCompletedGeneration, startSubtitleGeneration };
}
