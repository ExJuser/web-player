import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import type { HighlightMontageResult, HighlightMontageStreamEvent } from "./appTypes";
import type {
  HighlightMontageConfirmState,
  HighlightMontageResultState,
  HighlightMontageTaskState,
} from "./HighlightMontageDialogs";
import { readLocalApiStream } from "./localApiClient";
import { clamp } from "./playerInteractionUtils";

type UseHighlightMontageControllerOptions = {
  abortControllerRef: MutableRefObject<AbortController | null>;
  confirm: HighlightMontageConfirmState | null;
  task: HighlightMontageTaskState | null;
  setConfirm: Dispatch<SetStateAction<HighlightMontageConfirmState | null>>;
  setResult: Dispatch<SetStateAction<HighlightMontageResultState | null>>;
  setTask: Dispatch<SetStateAction<HighlightMontageTaskState | null>>;
  setMessage: (message: string) => void;
};

export function useHighlightMontageController({ abortControllerRef, confirm, task, setConfirm, setResult, setTask, setMessage }: UseHighlightMontageControllerOptions) {
  const createMontage = useCallback(async () => {
    if (!confirm || task) return;
    const request = confirm;
    setConfirm(null);
    setResult(null);
    setTask({ videoName: request.videoName, progress: 0, status: "正在准备剪辑任务...", isDialogOpen: true });
    const controller = new AbortController();
    abortControllerRef.current = controller;
    let montageResult: HighlightMontageResult | null = null;
    try {
      await readLocalApiStream<HighlightMontageStreamEvent>("/api/media/highlight-montage", {
        method: "POST",
        signal: controller.signal,
        body: JSON.stringify({
          rootId: request.rootId,
          relativePath: request.relativePath,
          sourceVideoId: request.sourceVideoId,
          segments: request.segments,
          highlights: request.highlights,
        }),
      }, (event) => {
        if (event.type === "progress") {
          setTask((current) => current ? {
            ...current,
            progress: clamp(Number(event.percent) || 0, 0, 100),
            status: event.message || current.status,
          } : current);
        } else if (event.type === "done") {
          montageResult = event.result;
        }
      });
      const result = montageResult as HighlightMontageResult | null;
      if (!result) throw new Error("生成剪辑版未返回结果。");
      setTask(null);
      setResult({ fileName: result.fileName, relativePath: result.relativePath, durationSeconds: result.durationSeconds });
      setMessage(`已生成剪辑版 ${result.fileName}。`);
    } catch (error) {
      const message = controller.signal.aborted
        ? "已取消生成剪辑版。"
        : error instanceof Error ? error.message : "生成剪辑版失败。";
      setTask(null);
      setMessage(message);
    } finally {
      if (abortControllerRef.current === controller) abortControllerRef.current = null;
    }
  }, [abortControllerRef, confirm, setConfirm, setMessage, setResult, setTask, task]);

  const cancelMontage = useCallback(() => {
    abortControllerRef.current?.abort();
    setTask((current) => current ? { ...current, status: "正在取消剪辑任务..." } : current);
  }, [abortControllerRef, setTask]);

  const runInBackground = useCallback(() => {
    setTask((current) => current ? { ...current, isDialogOpen: false } : current);
  }, [setTask]);

  const reopenTask = useCallback(() => {
    setTask((current) => current ? { ...current, isDialogOpen: true } : current);
  }, [setTask]);

  return { cancelMontage, createMontage, reopenTask, runInBackground };
}
