import { useCallback, useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import type { DanmakuSourcePayload } from "./appTypes";
import { fetchLocalJson as fetchJson } from "./localApiClient";
import { formatDanmakuLoadedMessage } from "./danmakuPresentationUtils";
import { saveDanmakuPreferences, saveDanmakuSelection } from "./playerStorage";
import type {
  DanmakuComment,
  DanmakuPreferences,
  DanmakuSelectionStore,
  DanmakuSource,
  VideoItem,
} from "./playerTypes";

type UseDanmakuControllerOptions = {
  currentDanmakuSource: DanmakuSource | null;
  currentVideo: VideoItem | null;
  danmakuPreferencesRef: MutableRefObject<DanmakuPreferences>;
  danmakuSelectionsRef: MutableRefObject<DanmakuSelectionStore>;
  setCurrentDanmakuSource: Dispatch<SetStateAction<DanmakuSource | null>>;
  setDanmakuComments: Dispatch<SetStateAction<DanmakuComment[]>>;
  setDanmakuMessage: Dispatch<SetStateAction<string>>;
  setDanmakuPreferences: Dispatch<SetStateAction<DanmakuPreferences>>;
  setDanmakuSelections: Dispatch<SetStateAction<DanmakuSelectionStore>>;
  setIsDanmakuLoading: Dispatch<SetStateAction<boolean>>;
  setIsDanmakuSourceDetailOpen: Dispatch<SetStateAction<boolean>>;
};

async function normalizeDanmakuComments(comments: DanmakuSourcePayload["comments"]) {
  const { createDanmakuComment } = await import("./danmakuUtils");
  return comments
    .map((comment) => createDanmakuComment(comment))
    .filter((comment): comment is DanmakuComment => Boolean(comment));
}

export function useDanmakuController({
  currentDanmakuSource,
  currentVideo,
  danmakuPreferencesRef,
  danmakuSelectionsRef,
  setCurrentDanmakuSource,
  setDanmakuComments,
  setDanmakuMessage,
  setDanmakuPreferences,
  setDanmakuSelections,
  setIsDanmakuLoading,
  setIsDanmakuSourceDetailOpen,
}: UseDanmakuControllerOptions) {
  const applyDanmakuSourcePayload = useCallback(
    (payload: DanmakuSourcePayload, nextComments: DanmakuComment[], options?: { persist?: boolean; message?: string }) => {
      setCurrentDanmakuSource(payload.source);
      setDanmakuComments(nextComments);
      setDanmakuMessage(options?.message ?? formatDanmakuLoadedMessage(payload.source, nextComments));

      if (options?.persist && currentVideo) {
        const nextSelections = {
          ...danmakuSelectionsRef.current,
          [currentVideo.id]: {
            sourceId: payload.source.id,
            sourceName: payload.source.title,
            provider: payload.source.provider,
            updatedAt: Date.now(),
          },
        };
        danmakuSelectionsRef.current = nextSelections;
        setDanmakuSelections(nextSelections);
        void saveDanmakuSelection(currentVideo.id, nextSelections[currentVideo.id]).catch(() => undefined);
      }
    },
    [currentVideo, danmakuSelectionsRef, setCurrentDanmakuSource, setDanmakuComments, setDanmakuMessage, setDanmakuSelections],
  );

  const loadDanmakuSource = useCallback(
    async (sourceId: string, options?: { silent?: boolean }) => {
      if (!sourceId) return;
      if (!options?.silent) {
        setIsDanmakuLoading(true);
        setDanmakuMessage("正在加载弹幕缓存...");
      }
      try {
        const payload = await fetchJson<DanmakuSourcePayload>("/api/danmaku/source", {
          method: "POST",
          body: JSON.stringify({ sourceId }),
        });
        const nextComments = await normalizeDanmakuComments(payload.comments);
        applyDanmakuSourcePayload(payload, nextComments, { message: formatDanmakuLoadedMessage(payload.source, nextComments, "已恢复") });
      } catch (error) {
        setCurrentDanmakuSource(null);
        setDanmakuComments([]);
        if (!options?.silent) setDanmakuMessage(error instanceof Error ? error.message : "弹幕缓存加载失败。");
      } finally {
        if (!options?.silent) setIsDanmakuLoading(false);
      }
    },
    [applyDanmakuSourcePayload, setCurrentDanmakuSource, setDanmakuComments, setDanmakuMessage, setIsDanmakuLoading],
  );

  useEffect(() => {
    if (!currentVideo) {
      setCurrentDanmakuSource(null);
      setDanmakuComments([]);
      setIsDanmakuSourceDetailOpen(false);
      return;
    }
    const selection = danmakuSelectionsRef.current[currentVideo.id];
    if (!selection) {
      setCurrentDanmakuSource(null);
      setDanmakuComments([]);
      setIsDanmakuSourceDetailOpen(false);
      return;
    }
    void loadDanmakuSource(selection.sourceId, { silent: true });
  }, [
    currentVideo,
    danmakuSelectionsRef,
    loadDanmakuSource,
    setCurrentDanmakuSource,
    setDanmakuComments,
    setIsDanmakuSourceDetailOpen,
  ]);

  const fetchDanmakuFromUrl = useCallback(
    async (url: string) => {
      if (!currentVideo || !url.trim()) {
        setDanmakuMessage("请输入弹幕链接。");
        return;
      }
      setIsDanmakuLoading(true);
      setDanmakuMessage("正在拉取弹幕...");
      try {
        const payload = await fetchJson<DanmakuSourcePayload>("/api/danmaku/fetch", {
          method: "POST",
          body: JSON.stringify({ url: url.trim(), mergeSourceId: currentDanmakuSource?.id }),
        });
        const nextComments = await normalizeDanmakuComments(payload.comments);
        applyDanmakuSourcePayload(payload, nextComments, { persist: true, message: formatDanmakuLoadedMessage(payload.source, nextComments) });
      } catch (error) {
        setDanmakuMessage(error instanceof Error ? error.message : "弹幕拉取失败。");
      } finally {
        setIsDanmakuLoading(false);
      }
    },
    [applyDanmakuSourcePayload, currentDanmakuSource?.id, currentVideo, setDanmakuMessage, setIsDanmakuLoading],
  );

  const removeDanmakuMatch = useCallback(() => {
    if (!currentVideo) return;
    const nextSelections = { ...danmakuSelectionsRef.current };
    delete nextSelections[currentVideo.id];
    danmakuSelectionsRef.current = nextSelections;
    setDanmakuSelections(nextSelections);
    setCurrentDanmakuSource(null);
    setDanmakuComments([]);
    setIsDanmakuSourceDetailOpen(false);
    setDanmakuMessage("已删除弹幕匹配。");
    void saveDanmakuSelection(currentVideo.id, null).catch(() => undefined);
  }, [
    currentVideo,
    danmakuSelectionsRef,
    setCurrentDanmakuSource,
    setDanmakuComments,
    setDanmakuMessage,
    setDanmakuSelections,
    setIsDanmakuSourceDetailOpen,
  ]);

  const replaceDanmakuPreferences = useCallback(
    (nextPreferences: DanmakuPreferences) => {
      danmakuPreferencesRef.current = nextPreferences;
      setDanmakuPreferences(nextPreferences);
      void saveDanmakuPreferences(nextPreferences).catch(() => undefined);
    },
    [danmakuPreferencesRef, setDanmakuPreferences],
  );

  return {
    fetchDanmakuFromUrl,
    removeDanmakuMatch,
    replaceDanmakuPreferences,
  };
}
