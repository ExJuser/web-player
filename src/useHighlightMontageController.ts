import { useCallback, type Dispatch, type SetStateAction } from "react";

import type { MediaProcessingTaskSnapshot } from "./appTypes";
import type {
  HighlightMontageConfirmState,
  HighlightMontageResultState,
} from "./HighlightMontageDialogs";
import type { MediaProcessingTaskState } from "./MediaProcessingTaskDialog";
import { fetchLocalJson as fetchJson } from "./localApiClient";
import { toMediaProcessingTaskState } from "./mediaProcessingTaskClient";

type UseHighlightMontageControllerOptions = {
  confirm: HighlightMontageConfirmState | null;
  task: MediaProcessingTaskState | null;
  setConfirm: Dispatch<SetStateAction<HighlightMontageConfirmState | null>>;
  setResult: Dispatch<SetStateAction<HighlightMontageResultState | null>>;
  setTask: Dispatch<SetStateAction<MediaProcessingTaskState | null>>;
  setMessage: (message: string) => void;
};

export function useHighlightMontageController({ confirm, task, setConfirm, setResult, setTask, setMessage }: UseHighlightMontageControllerOptions) {
  const createMontage = useCallback(async () => {
    if (!confirm || task) return;
    const request = confirm;
    setConfirm(null);
    setResult(null);
    try {
      const response = await fetchJson<{ task: MediaProcessingTaskSnapshot }>("/api/media/highlight-montage", {
        method: "POST",
        body: JSON.stringify({
          rootId: request.rootId,
          relativePath: request.relativePath,
          sourceVideoId: request.sourceVideoId,
          segments: request.segments,
          highlights: request.highlights,
        }),
      });
      setTask((current) => toMediaProcessingTaskState(response.task, current));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "生成剪辑版失败。");
    }
  }, [confirm, setConfirm, setMessage, setResult, setTask, task]);

  return { createMontage };
}
