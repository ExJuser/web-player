import type { MediaProcessingTaskSnapshot } from "./appTypes";
import type { MediaProcessingTaskState } from "./MediaProcessingTaskDialog";

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
