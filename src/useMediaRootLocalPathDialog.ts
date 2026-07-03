import {
  useCallback,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";

import { fetchLocalJson as fetchJson } from "./localApiClient";
import { normalizeClientLocalConfig } from "./localConfigClient";
import type { MediaRootLocalPathDialog } from "./appTypes";
import type {
  LocalConfig,
  LocalMediaRoot,
  UpdateMediaRootLocalPathResponse,
} from "./mediaRootScanCache";

type UseMediaRootLocalPathDialogParams = {
  localConfigRef: MutableRefObject<LocalConfig | null>;
  setLocalConfig: Dispatch<SetStateAction<LocalConfig | null>>;
  setMessage: Dispatch<SetStateAction<string>>;
};

export function useMediaRootLocalPathDialog({
  localConfigRef,
  setLocalConfig,
  setMessage,
}: UseMediaRootLocalPathDialogParams) {
  const [mediaRootLocalPathDialog, setMediaRootLocalPathDialog] = useState<MediaRootLocalPathDialog | null>(null);

  const openMediaRootLocalPathDialog = useCallback((root: LocalMediaRoot) => {
    setMediaRootLocalPathDialog({
      root,
      value: root.localPath ?? "",
      error: "",
      isSaving: false,
    });
  }, []);

  const closeMediaRootLocalPathDialog = useCallback(() => {
    setMediaRootLocalPathDialog((previous) => (previous?.isSaving ? previous : null));
  }, []);

  const updateMediaRootLocalPathValue = useCallback((value: string) => {
    setMediaRootLocalPathDialog((previous) => (previous ? { ...previous, value, error: "" } : previous));
  }, []);

  const submitMediaRootLocalPath = useCallback(async () => {
    if (!mediaRootLocalPathDialog || mediaRootLocalPathDialog.isSaving) return;
    const localPath = mediaRootLocalPathDialog.value.trim();
    if (!localPath) {
      setMediaRootLocalPathDialog((previous) =>
        previous ? { ...previous, error: "请输入本机绝对路径。" } : previous,
      );
      return;
    }

    setMediaRootLocalPathDialog((previous) => (previous ? { ...previous, isSaving: true, error: "" } : previous));
    try {
      const response = await fetchJson<UpdateMediaRootLocalPathResponse>("/api/local-config/media-root/local-path", {
        method: "PUT",
        body: JSON.stringify({
          id: mediaRootLocalPathDialog.root.id,
          localPath,
        }),
      });
      const nextConfig = normalizeClientLocalConfig(response);
      setLocalConfig(nextConfig);
      localConfigRef.current = nextConfig;
      setMediaRootLocalPathDialog(null);
      setMessage("已保存媒体库本机路径。");
    } catch (error) {
      setMediaRootLocalPathDialog((previous) =>
        previous
          ? {
              ...previous,
              isSaving: false,
              error: error instanceof Error ? error.message : "保存本机路径失败。",
            }
          : previous,
      );
    }
  }, [localConfigRef, mediaRootLocalPathDialog, setLocalConfig, setMessage]);

  return {
    closeMediaRootLocalPathDialog,
    mediaRootLocalPathDialog,
    openMediaRootLocalPathDialog,
    submitMediaRootLocalPath,
    updateMediaRootLocalPathValue,
  };
}
