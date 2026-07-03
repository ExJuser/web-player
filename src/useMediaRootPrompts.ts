import { useCallback, useState } from "react";

import type {
  ExistingMediaRootPrompt,
  MediaRootLabelPrompt,
} from "./appTypes";

export function useMediaRootPrompts() {
  const [mediaRootLabelPrompt, setMediaRootLabelPrompt] = useState<MediaRootLabelPrompt | null>(null);
  const [existingMediaRootPrompt, setExistingMediaRootPrompt] = useState<ExistingMediaRootPrompt | null>(null);

  const requestMediaRootLabel = useCallback((directoryName: string) => {
    return new Promise<string | null>((resolve) => {
      setMediaRootLabelPrompt({ directoryName, value: directoryName, resolve });
    });
  }, []);

  const requestExistingMediaRootRescan = useCallback((directoryName: string, mediaRootLabel: string) => {
    return new Promise<boolean>((resolve) => {
      setExistingMediaRootPrompt({ directoryName, mediaRootLabel, resolve });
    });
  }, []);

  const closeExistingMediaRootPrompt = useCallback(
    (shouldRescan: boolean) => {
      if (!existingMediaRootPrompt) return;
      existingMediaRootPrompt.resolve(shouldRescan);
      setExistingMediaRootPrompt(null);
    },
    [existingMediaRootPrompt],
  );

  const closeMediaRootLabelPrompt = useCallback(
    (value: string | null) => {
      if (!mediaRootLabelPrompt) return;
      mediaRootLabelPrompt.resolve(value);
      setMediaRootLabelPrompt(null);
    },
    [mediaRootLabelPrompt],
  );

  const updateMediaRootLabelPromptValue = useCallback((value: string) => {
    setMediaRootLabelPrompt((previous) => (previous ? { ...previous, value } : previous));
  }, []);

  const submitMediaRootLabelPrompt = useCallback(() => {
    const label = mediaRootLabelPrompt?.value.trim();
    if (!label) return;
    closeMediaRootLabelPrompt(label);
  }, [closeMediaRootLabelPrompt, mediaRootLabelPrompt]);

  return {
    closeExistingMediaRootPrompt,
    closeMediaRootLabelPrompt,
    existingMediaRootPrompt,
    mediaRootLabelPrompt,
    requestExistingMediaRootRescan,
    requestMediaRootLabel,
    submitMediaRootLabelPrompt,
    updateMediaRootLabelPromptValue,
  };
}
