import { useCallback, type Dispatch, type SetStateAction } from "react";

import type { MediaProcessingTaskSnapshot } from "./appTypes";
import type { LadaRestorationConfirmState, LadaRestorationResultState } from "./LadaRestorationDialogs";
import { writeStoredLadaOptions } from "./ladaPreferences";
import { fetchLocalJson as fetchJson } from "./localApiClient";
import { toMediaProcessingTaskState } from "./mediaProcessingTaskClient";
import type { MediaProcessingTaskState } from "./MediaProcessingTaskDialog";

type UseLadaRestorationControllerOptions = {
  confirm: LadaRestorationConfirmState | null;
  task: MediaProcessingTaskState | null;
  setConfirm: Dispatch<SetStateAction<LadaRestorationConfirmState | null>>;
  setResult: Dispatch<SetStateAction<LadaRestorationResultState | null>>;
  setTask: Dispatch<SetStateAction<MediaProcessingTaskState | null>>;
  setMessage: (message: string) => void;
};

export function useLadaRestorationController({
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
    try {
      const response = await fetchJson<{ task: MediaProcessingTaskSnapshot }>("/api/media/lada/restore", {
        method: "POST",
        body: JSON.stringify({
          rootId: request.rootId,
          relativePath: request.relativePath,
          options: requestOptions,
        }),
      });
      setTask((current) => toMediaProcessingTaskState(response.task, current));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "马赛克修复失败。");
    }
  }, [confirm, setConfirm, setMessage, setResult, setTask, task]);

  return { createRestoration };
}
