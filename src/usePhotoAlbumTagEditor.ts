import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";

import type { AiTagMergeSuggestionResponse, TagMergePrompt } from "./appTypes";
import { fetchLocalJson as fetchJson } from "./localApiClient";
import type { LocalConfig } from "./mediaRootScanCache";
import { savePhotoAlbumPreferences, savePhotoAlbumTags } from "./photoAlbumStorage";
import type { PhotoAlbum, PhotoAlbumPreferences } from "./playerTypes";
import {
  createTagInputSuggestions,
  createTagPairKey,
  createTagSearchIndex,
  findTagMergeSuggestion,
  getActiveTagInputSegment,
  mergeTags,
  normalizeTagKey,
  parseTagInput,
  splitTagsByExistingMatch,
  type TagMergeSuggestion,
} from "./tagUtils";

type UsePhotoAlbumTagEditorParams = {
  localConfig: LocalConfig | null;
  photoAlbumPreferencesRef: MutableRefObject<PhotoAlbumPreferences>;
  photoAlbumTagsRef: MutableRefObject<Record<string, string[]>>;
  photoAlbums: PhotoAlbum[];
  setPhotoAlbumTags: Dispatch<SetStateAction<Record<string, string[]>>>;
};

export function usePhotoAlbumTagEditor({
  localConfig,
  photoAlbumPreferencesRef,
  photoAlbumTagsRef,
  photoAlbums,
  setPhotoAlbumTags,
}: UsePhotoAlbumTagEditorParams) {
  const [editorAlbumId, setEditorAlbumId] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [message, setMessage] = useState("");
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const [isSuggestionLoading, setIsSuggestionLoading] = useState(false);
  const [mergePrompt, setMergePrompt] = useState<TagMergePrompt | null>(null);
  const [preferencesRevision, setPreferencesRevision] = useState(0);

  const editorAlbum = useMemo(
    () => photoAlbums.find((album) => album.id === editorAlbumId) ?? null,
    [editorAlbumId, photoAlbums],
  );
  const currentTags = editorAlbum ? photoAlbumTagsRef.current[editorAlbum.id] ?? [] : [];
  const activeInputSegment = useMemo(() => getActiveTagInputSegment(tagInput), [tagInput]);
  const tagSearchIndex = useMemo(() => {
    const activeAlbumIds = new Set(photoAlbums.map((album) => album.id));
    const activeAlbumTags = Object.fromEntries(
      Object.entries(photoAlbumTagsRef.current).filter(([albumId]) => activeAlbumIds.has(albumId)),
    );
    return createTagSearchIndex(activeAlbumTags);
  }, [photoAlbums, photoAlbumTagsRef, photoAlbumTagsRef.current]);
  const tagInputSuggestions = useMemo(() => editorAlbum && activeInputSegment
    ? createTagInputSuggestions({ query: activeInputSegment, tagIndex: tagSearchIndex, currentTags })
    : [], [activeInputSegment, currentTags, editorAlbum, tagSearchIndex]);
  const tagViews = useMemo(() => {
    const currentKeys = new Set(currentTags.map(normalizeTagKey));
    const available = tagSearchIndex
      .filter((tag) => !currentKeys.has(tag.key))
      .map(({ label, count }) => ({ label, count }));
    const commonTags = available.slice().sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "zh-Hans-CN", { numeric: true }));
    const allTags = available.slice().sort((a, b) => a.label.localeCompare(b.label, "zh-Hans-CN", { numeric: true }));
    const recentTags = photoAlbumPreferencesRef.current.recentTags
      .filter((entry) => !currentKeys.has(entry.key))
      .map((entry) => ({ label: entry.label, count: tagSearchIndex.find((tag) => tag.key === entry.key)?.count ?? 0 }));
    return { allTags, commonTags, recentTags };
  }, [currentTags, photoAlbumPreferencesRef, preferencesRevision, tagSearchIndex]);
  const optionCount = tagInputSuggestions.length + (activeInputSegment && !tagInputSuggestions.some((tag) => tag.key === normalizeTagKey(activeInputSegment)) ? 1 : 0);
  const resolvedActiveSuggestionIndex = optionCount ? Math.min(activeSuggestionIndex, optionCount - 1) : 0;

  useEffect(() => setActiveSuggestionIndex(0), [activeInputSegment, optionCount]);

  const closeEditor = useCallback(() => {
    setEditorAlbumId(null);
    setMergePrompt(null);
  }, []);

  const openEditor = useCallback((album: PhotoAlbum) => {
    setEditorAlbumId(album.id);
    setTagInput("");
    setMessage("");
    setMergePrompt(null);
  }, []);

  const savePreferences = useCallback((preferences: PhotoAlbumPreferences) => {
    photoAlbumPreferencesRef.current = preferences;
    setPreferencesRevision((revision) => revision + 1);
    void savePhotoAlbumPreferences(preferences).catch(() => setMessage("标签已保存，但标签偏好保存失败。"));
  }, [photoAlbumPreferencesRef]);

  const recordRecentTags = useCallback((tags: string[]) => {
    const usedAt = Date.now();
    const incoming = tags.flatMap((label, index) => {
      const key = normalizeTagKey(label);
      return key ? [{ key, label: label.trim(), usedAt: usedAt - index }] : [];
    });
    const incomingKeys = new Set(incoming.map((entry) => entry.key));
    savePreferences({
      ...photoAlbumPreferencesRef.current,
      recentTags: [...incoming, ...photoAlbumPreferencesRef.current.recentTags.filter((entry) => !incomingKeys.has(entry.key))].slice(0, 20),
    });
  }, [photoAlbumPreferencesRef, savePreferences]);

  const replaceTags = useCallback(async (album: PhotoAlbum, nextTags: string[], successMessage: string) => {
    const parsedTags = parseTagInput(nextTags.join(" "));
    const nextAlbumTags = { ...photoAlbumTagsRef.current, [album.id]: parsedTags };
    if (!parsedTags.length) delete nextAlbumTags[album.id];
    photoAlbumTagsRef.current = nextAlbumTags;
    setPhotoAlbumTags(nextAlbumTags);
    try {
      await savePhotoAlbumTags(album.id, parsedTags);
      setMessage(successMessage);
      return true;
    } catch {
      setMessage("图集标签保存失败。");
      return false;
    }
  }, [photoAlbumTagsRef, setPhotoAlbumTags]);

  const getAllTags = useCallback(() => tagSearchIndex.map((tag) => tag.label), [tagSearchIndex]);

  const addTags = useCallback(async (tags = parseTagInput(tagInput), options?: { skipPrompt?: boolean }) => {
    if (!editorAlbum || isSuggestionLoading) return;
    const incomingTags = parseTagInput(tags.join(" "));
    if (!incomingTags.length) {
      setMessage("请输入至少一个标签。");
      return;
    }
    const allTags = getAllTags();
    const { resolvedTags, unmatchedTags } = splitTagsByExistingMatch(incomingTags, allTags);
    if (!options?.skipPrompt && unmatchedTags.length) {
      const suggestion = unmatchedTags
        .map((tag) => findTagMergeSuggestion(tag, allTags, photoAlbumPreferencesRef.current.tagMergeDecisions))
        .find((item): item is TagMergeSuggestion => Boolean(item));
      if (suggestion) {
        setMergePrompt({ pendingTags: resolvedTags, suggestion });
        setMessage("");
        return;
      }
      if (localConfig?.ai.configured && allTags.length) {
        setIsSuggestionLoading(true);
        try {
          const aiSuggestion = await fetchJson<AiTagMergeSuggestionResponse>("/api/ai/tags/merge-suggestion", {
            method: "POST",
            body: JSON.stringify({ newTags: unmatchedTags, existingTags: allTags }),
          });
          if (aiSuggestion.newTag && aiSuggestion.existingTag) {
            setMergePrompt({
              pendingTags: resolvedTags,
              suggestion: { newTag: aiSuggestion.newTag, existingTag: aiSuggestion.existingTag, reason: "相似标签", score: 0.86 },
            });
            setMessage(aiSuggestion.reason || "");
            return;
          }
        } catch {
          setMessage("AI 标签合并建议不可用，已使用离线规则。");
        } finally {
          setIsSuggestionLoading(false);
        }
      }
    }
    const existingTags = photoAlbumTagsRef.current[editorAlbum.id] ?? [];
    const nextTags = mergeTags(existingTags, resolvedTags);
    const existingKeys = new Set(existingTags.map(normalizeTagKey));
    const addedTags = resolvedTags.filter((tag) => !existingKeys.has(normalizeTagKey(tag)));
    if (await replaceTags(editorAlbum, nextTags, `已保存 ${nextTags.length} 个标签。`)) recordRecentTags(addedTags);
    setTagInput("");
    setMergePrompt(null);
  }, [editorAlbum, getAllTags, isSuggestionLoading, localConfig, photoAlbumPreferencesRef, photoAlbumTagsRef, recordRecentTags, replaceTags, tagInput]);

  const selectSuggestion = useCallback((tag: string) => {
    const resolvedInput = tagInput.replace(/[^\s,，、;；|]*$/u, tag);
    void addTags(parseTagInput(resolvedInput));
  }, [addTags, tagInput]);

  const removeTag = useCallback((tag: string) => {
    if (!editorAlbum) return;
    const removedKey = normalizeTagKey(tag);
    const nextTags = (photoAlbumTagsRef.current[editorAlbum.id] ?? []).filter((item) => normalizeTagKey(item) !== removedKey);
    void replaceTags(editorAlbum, nextTags, nextTags.length ? `已移除标签“${tag}”。` : "已清空图集标签。");
  }, [editorAlbum, photoAlbumTagsRef, replaceTags]);

  const resolveMergePrompt = useCallback((decision: "merge" | "keep") => {
    if (!mergePrompt) return;
    const { pendingTags, suggestion } = mergePrompt;
    const pairKey = createTagPairKey(suggestion.newTag, suggestion.existingTag);
    savePreferences({
      ...photoAlbumPreferencesRef.current,
      tagMergeDecisions: {
        ...photoAlbumPreferencesRef.current.tagMergeDecisions,
        [pairKey]: { from: suggestion.newTag, to: suggestion.existingTag, decision, updatedAt: Date.now() },
      },
    });
    const tags = decision === "merge"
      ? pendingTags.map((tag) => normalizeTagKey(tag) === normalizeTagKey(suggestion.newTag) ? suggestion.existingTag : tag)
      : pendingTags;
    void addTags(tags, { skipPrompt: true });
  }, [addTags, mergePrompt, photoAlbumPreferencesRef, savePreferences]);

  return {
    activeSuggestionIndex: resolvedActiveSuggestionIndex,
    addTags: () => void addTags(),
    allTags: tagViews.allTags,
    applyMergeSuggestion: () => resolveMergePrompt("merge"),
    closeEditor,
    commonTags: tagViews.commonTags,
    editorAlbum,
    isSuggestionLoading,
    keepMergeSuggestion: () => resolveMergePrompt("keep"),
    mergePrompt,
    message,
    openEditor,
    recentTags: tagViews.recentTags,
    removeTag,
    selectSuggestion,
    setActiveSuggestionIndex,
    setMergePrompt,
    setTagInput,
    tagInput,
    tagInputSuggestions,
  };
}
