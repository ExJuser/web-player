import type { HighlightMontageResult, LadaRestorationResult, MediaProcessingTaskSnapshot } from "./appTypes";
import type { MediaProcessingTaskState } from "./MediaProcessingTaskDialog";

export type MediaProcessingTaskAction =
  | { type: "idle" }
  | { type: "active"; task: MediaProcessingTaskState }
  | { type: "montage-completed"; result: Pick<HighlightMontageResult, "fileName" | "relativePath" | "durationSeconds"> }
  | { type: "lada-completed"; result: Pick<LadaRestorationResult, "fileName" | "relativePath" | "size"> }
  | { type: "message"; message: string };

export function isActiveMediaProcessingTask(task: Pick<MediaProcessingTaskSnapshot, "state">) {
  return task.state === "running" || task.state === "cancelling";
}

export function toMediaProcessingTaskState(
  task: MediaProcessingTaskSnapshot,
  current: MediaProcessingTaskState | null,
): MediaProcessingTaskState {
  return {
    ...task,
    isDialogOpen: current?.id === task.id ? current.isDialogOpen : true,
  };
}

export function resolveMediaProcessingTaskAction(
  task: MediaProcessingTaskSnapshot | null,
  current: MediaProcessingTaskState | null,
): MediaProcessingTaskAction {
  if (!task) return { type: "idle" };
  if (isActiveMediaProcessingTask(task)) {
    return { type: "active", task: toMediaProcessingTaskState(task, current) };
  }
  if (task.state === "completed" && task.kind === "lada" && task.result) {
    return {
      type: "lada-completed",
      result: {
        fileName: task.result.fileName,
        relativePath: task.result.relativePath,
        size: task.result.size,
      },
    };
  }
  if (task.state === "completed" && task.kind === "montage" && task.result) {
    return {
      type: "montage-completed",
      result: {
        fileName: task.result.fileName,
        relativePath: task.result.relativePath,
        durationSeconds: task.result.durationSeconds,
      },
    };
  }
  return {
    type: "message",
    message: task.error || (task.state === "cancelled" ? "已取消媒体处理任务。" : "媒体处理任务失败。"),
  };
}
