import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";

import type { MediaProcessingTaskSnapshot } from "./appTypes";
import type { HighlightMontageResultState } from "./HighlightMontageDialogs";
import type { LadaRestorationResultState } from "./LadaRestorationDialogs";
import { fetchLocalJson as fetchJson } from "./localApiClient";
import {
  isActiveMediaProcessingTask,
  resolveMediaProcessingTaskAction,
  toMediaProcessingTaskState,
} from "./mediaProcessingTaskClient";
import type { MediaProcessingTaskState } from "./MediaProcessingTaskDialog";

type MediaProcessingTaskResponse = { task: MediaProcessingTaskSnapshot | null };

type UseMediaProcessingTaskSyncOptions = {
  task: MediaProcessingTaskState | null;
  setTask: Dispatch<SetStateAction<MediaProcessingTaskState | null>>;
  setHighlightMontageResult: Dispatch<SetStateAction<HighlightMontageResultState | null>>;
  setLadaRestorationResult: Dispatch<SetStateAction<LadaRestorationResultState | null>>;
  setMessage: (message: string) => void;
};

export function useMediaProcessingTaskSync({
  task,
  setTask,
  setHighlightMontageResult,
  setLadaRestorationResult,
  setMessage,
}: UseMediaProcessingTaskSyncOptions) {
  const handledTaskIdRef = useRef<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const response = await fetchJson<MediaProcessingTaskResponse>("/api/media/processing-task");
        if (disposed) return;
        const remoteTask = response.task;
        if (remoteTask && isActiveMediaProcessingTask(remoteTask)) {
          setTask((current) => toMediaProcessingTaskState(remoteTask, current));
          timerId = setTimeout(() => void poll(), 1000);
          return;
        }

        setTask(null);
        if (!remoteTask || handledTaskIdRef.current === remoteTask.id) return;
        handledTaskIdRef.current = remoteTask.id;
        const action = resolveMediaProcessingTaskAction(remoteTask, null);
        if (action.type === "lada-completed") {
          setLadaRestorationResult(action.result);
          setMessage(`已完成马赛克修复 ${action.result.fileName}。`);
        } else if (action.type === "montage-completed") {
          setHighlightMontageResult(action.result);
          setMessage(`已生成剪辑版 ${action.result.fileName}。`);
        } else if (action.type === "message") {
          setMessage(action.message);
        }
      } catch {
        if (!disposed) timerId = setTimeout(() => void poll(), 1000);
      }
    };

    void poll();
    return () => {
      disposed = true;
      if (timerId) clearTimeout(timerId);
    };
  }, [setHighlightMontageResult, setLadaRestorationResult, setMessage, setTask, task?.id]);

  const cancelTask = useCallback(async () => {
    const taskId = task?.id;
    if (!taskId || task.state === "cancelling") return;
    setTask((current) => current?.id === taskId
      ? { ...current, state: "cancelling", status: "正在取消任务..." }
      : current);
    try {
      const response = await fetchJson<MediaProcessingTaskResponse>("/api/media/processing-task", {
        method: "DELETE",
        body: JSON.stringify({ id: taskId }),
      });
      if (response.task && isActiveMediaProcessingTask(response.task)) {
        setTask((current) => toMediaProcessingTaskState(response.task as MediaProcessingTaskSnapshot, current));
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "取消媒体处理任务失败。");
    }
  }, [setMessage, setTask, task?.id, task?.state]);

  return { cancelTask };
}
