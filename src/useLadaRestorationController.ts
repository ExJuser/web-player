import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import type { LadaRestorationResult, LadaRestorationStreamEvent } from "./appTypes";
import type { LadaRestorationConfirmState, LadaRestorationResultState } from "./LadaRestorationDialogs";
import { writeStoredLadaOptions } from "./ladaPreferences";
import { readLocalApiStream } from "./localApiClient";
import type { MediaProcessingTaskState } from "./MediaProcessingTaskDialog";
import { clamp } from "./playerInteractionUtils";

type UseLadaRestorationControllerOptions = {
  abortControllerRef: MutableRefObject<AbortController | null>;
  confirm: LadaRestorationConfirmState | null;
  task: MediaProcessingTaskState | null;
  setConfirm: Dispatch<SetStateAction<LadaRestorationConfirmState | null>>;
  setResult: Dispatch<SetStateAction<LadaRestorationResultState | null>>;
  setTask: Dispatch<SetStateAction<MediaProcessingTaskState | null>>;
  setMessage: (message: string) => void;
};

export function useLadaRestorationController({
  abortControllerRef,
  confirm,
  task,
  setConfirm,
  setResult,
  setTask,
  setMessage,
}: UseLadaRestorationControllerOptions) {
  const createRestoration = useCallback(async () => {
    if (!confirm?.options || task) return;
    const request = confirm;
    const requestOptions = confirm.options;
    writeStoredLadaOptions(requestOptions);
    setConfirm(null);
    setResult(null);
    setTask({ kind: "lada", videoName: request.videoName, progress: 0, status: "正在准备马赛克修复...", isDialogOpen: true });
    const controller = new AbortController();
    abortControllerRef.current = controller;
    let ladaResult: LadaRestorationResult | null = null;
    try {
      await readLocalApiStream<LadaRestorationStreamEvent>("/api/media/lada/restore", {
        method: "POST",
        signal: controller.signal,
        body: JSON.stringify({
          rootId: request.rootId,
          relativePath: request.relativePath,
          options: requestOptions,
        }),
      }, (event) => {
        if (event.type === "progress") {
          setTask((current) => current?.kind === "lada" ? {
            ...current,
            progress: clamp(Number(event.percent) || 0, 0, 100),
            status: event.message || current.status,
          } : current);
        } else if (event.type === "done") {
          ladaResult = event.result;
        }
      });
      const result = ladaResult as LadaRestorationResult | null;
      if (!result) throw new Error("马赛克修复未返回结果。");
      setTask((current) => current?.kind === "lada" ? null : current);
      setResult({ fileName: result.fileName, relativePath: result.relativePath, size: result.size });
      setMessage(`已完成马赛克修复 ${result.fileName}。`);
    } catch (error) {
      const message = controller.signal.aborted
        ? "已取消马赛克修复。"
        : error instanceof Error ? error.message : "马赛克修复失败。";
      setTask((current) => current?.kind === "lada" ? null : current);
      setMessage(message);
    } finally {
      if (abortControllerRef.current === controller) abortControllerRef.current = null;
    }
  }, [abortControllerRef, confirm, setConfirm, setMessage, setResult, setTask, task]);

  const cancelRestoration = useCallback(() => {
    abortControllerRef.current?.abort();
    setTask((current) => current?.kind === "lada" ? { ...current, status: "正在取消马赛克修复..." } : current);
  }, [abortControllerRef, setTask]);

  return { cancelRestoration, createRestoration };
}
