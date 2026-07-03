import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import type {
  CompatibleMediaConfirmState,
  CompatibleMediaDeleteConfirmState,
  CompatibleMediaTaskState,
} from "./CompatibleMediaDialogs";
import { fetchLocalJson as fetchJson, readLocalApiStream } from "./localApiClient";
import { clamp } from "./playerInteractionUtils";
import type {
  CompatibleMediaDeleteResponse,
  CompatibleRemuxResponse,
  CompatibleRemuxStreamEvent,
  PlaybackSourceChoice,
} from "./appTypes";
import type { VideoItem } from "./playerTypes";

type UseCompatibleMediaControllerOptions = {
  compatibleMediaAbortControllerRef: MutableRefObject<AbortController | null>;
  compatibleMediaConfirm: CompatibleMediaConfirmState | null;
  compatibleMediaDeleteConfirm: CompatibleMediaDeleteConfirmState | null;
  compatibleMediaVideoId: string | null;
  isDeletingCompatibleMedia: boolean;
  removeVideoCompatibleMediaUrl: (videoId: string) => void;
  setCompatibleMediaConfirm: Dispatch<SetStateAction<CompatibleMediaConfirmState | null>>;
  setCompatibleMediaDeleteConfirm: Dispatch<SetStateAction<CompatibleMediaDeleteConfirmState | null>>;
  setCompatibleMediaMessage: Dispatch<SetStateAction<string>>;
  setCompatibleMediaTask: Dispatch<SetStateAction<CompatibleMediaTaskState | null>>;
  setCompatibleMediaVideoId: Dispatch<SetStateAction<string | null>>;
  setIsDeletingCompatibleMedia: Dispatch<SetStateAction<boolean>>;
  setMessage: Dispatch<SetStateAction<string>>;
  setPlaybackSourceChoices: Dispatch<SetStateAction<Record<string, PlaybackSourceChoice>>>;
  updateVideoPlayability: (videoId: string, playability: NonNullable<VideoItem["playability"]>) => void;
};

export function useCompatibleMediaController({
  compatibleMediaAbortControllerRef,
  compatibleMediaConfirm,
  compatibleMediaDeleteConfirm,
  compatibleMediaVideoId,
  isDeletingCompatibleMedia,
  removeVideoCompatibleMediaUrl,
  setCompatibleMediaConfirm,
  setCompatibleMediaDeleteConfirm,
  setCompatibleMediaMessage,
  setCompatibleMediaTask,
  setCompatibleMediaVideoId,
  setIsDeletingCompatibleMedia,
  setMessage,
  setPlaybackSourceChoices,
  updateVideoPlayability,
}: UseCompatibleMediaControllerOptions) {
  const createCompatibleMedia = useCallback(async () => {
    if (!compatibleMediaConfirm) return;
    if (compatibleMediaVideoId) return;

    setCompatibleMediaConfirm(null);
    setCompatibleMediaVideoId(compatibleMediaConfirm.videoId);
    setCompatibleMediaTask({
      label: compatibleMediaConfirm.label,
      videoName: compatibleMediaConfirm.videoName,
      progress: 0,
      status: "正在准备生成任务...",
    });
    setCompatibleMediaMessage(`正在${compatibleMediaConfirm.label}...`);
    const abortController = new AbortController();
    compatibleMediaAbortControllerRef.current = abortController;
    let remuxResult: CompatibleRemuxResponse | null = null;
    try {
      await readLocalApiStream<CompatibleRemuxStreamEvent>("/api/media/compatible/remux", {
        method: "POST",
        signal: abortController.signal,
        body: JSON.stringify({
          rootId: compatibleMediaConfirm.rootId,
          relativePath: compatibleMediaConfirm.relativePath,
        }),
      }, (event) => {
        if (event.type === "progress") {
          const nextProgress = clamp(Number(event.percent) || 0, 0, 100);
          setCompatibleMediaTask((current) => current
            ? { ...current, progress: nextProgress, status: event.message || current.status }
            : current);
          if (event.message) setCompatibleMediaMessage(event.message);
          return;
        }
        if (event.type === "done") {
          remuxResult = event.result;
        }
      });
      const result = remuxResult as CompatibleRemuxResponse | null;
      if (!result) throw new Error("生成兼容 MP4 未返回结果。");
      updateVideoPlayability(compatibleMediaConfirm.videoId, result.playability);
      setPlaybackSourceChoices((previous) => ({ ...previous, [compatibleMediaConfirm.videoId]: "compatible" }));
      setCompatibleMediaMessage("已生成兼容 MP4，播放器将优先使用兼容版本。");
      setMessage("已生成兼容 MP4。");
    } catch (error) {
      const message = abortController.signal.aborted
        ? "已取消生成兼容 MP4。"
        : error instanceof Error
          ? error.message
          : "生成兼容 MP4 失败。";
      setCompatibleMediaMessage(message);
    } finally {
      if (compatibleMediaAbortControllerRef.current === abortController) {
        compatibleMediaAbortControllerRef.current = null;
      }
      setCompatibleMediaVideoId(null);
      setCompatibleMediaTask(null);
    }
  }, [
    compatibleMediaAbortControllerRef,
    compatibleMediaConfirm,
    compatibleMediaVideoId,
    setCompatibleMediaConfirm,
    setCompatibleMediaMessage,
    setCompatibleMediaTask,
    setCompatibleMediaVideoId,
    setMessage,
    setPlaybackSourceChoices,
    updateVideoPlayability,
  ]);

  const deleteCompatibleMedia = useCallback(async () => {
    if (!compatibleMediaDeleteConfirm || isDeletingCompatibleMedia) return;

    setIsDeletingCompatibleMedia(true);
    setCompatibleMediaMessage("正在删除修复版本...");
    try {
      await fetchJson<CompatibleMediaDeleteResponse>("/api/media/compatible", {
        method: "DELETE",
        body: JSON.stringify({
          rootId: compatibleMediaDeleteConfirm.rootId,
          relativePath: compatibleMediaDeleteConfirm.relativePath,
        }),
      });
      removeVideoCompatibleMediaUrl(compatibleMediaDeleteConfirm.videoId);
      setPlaybackSourceChoices((previous) => ({ ...previous, [compatibleMediaDeleteConfirm.videoId]: "original" }));
      setCompatibleMediaDeleteConfirm(null);
      setCompatibleMediaMessage("已删除修复版本，播放器已切回原版。");
      setMessage("已删除修复版本。");
    } catch (error) {
      setCompatibleMediaMessage(error instanceof Error ? error.message : "删除修复版本失败。");
    } finally {
      setIsDeletingCompatibleMedia(false);
    }
  }, [
    compatibleMediaDeleteConfirm,
    isDeletingCompatibleMedia,
    removeVideoCompatibleMediaUrl,
    setCompatibleMediaDeleteConfirm,
    setCompatibleMediaMessage,
    setIsDeletingCompatibleMedia,
    setMessage,
    setPlaybackSourceChoices,
  ]);

  const cancelCompatibleMediaGeneration = useCallback(() => {
    compatibleMediaAbortControllerRef.current?.abort();
    setCompatibleMediaTask((current) => current ? { ...current, status: "正在取消生成任务..." } : current);
    setCompatibleMediaMessage("正在取消生成兼容 MP4...");
  }, [compatibleMediaAbortControllerRef, setCompatibleMediaMessage, setCompatibleMediaTask]);

  return {
    cancelCompatibleMediaGeneration,
    createCompatibleMedia,
    deleteCompatibleMedia,
  };
}
