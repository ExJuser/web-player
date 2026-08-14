import { useCallback, useEffect, useMemo, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import type { AiTagMergeSuggestionResponse, TagMergePrompt } from "./appTypes";
import { fetchLocalJson as fetchJson } from "./localApiClient";
import type { LocalConfig } from "./mediaRootScanCache";
import { savePlayerPreference, savePlayerVideoTags, saveTagMergeDecisions } from "./playerStorage";
import type { ActorProfileStore, PlayerPreferences, TagMergeDecisionStore, VideoItem, VideoTagStore } from "./playerTypes";
import {
  createTagInputSuggestions,
  createTagSearchIndex,
  createAvailableTagViews,
  createTagAdditionPlan,
  createTagPairKey,
  getActiveTagInputSegment,
  normalizeTagKey,
  parseTagInput,
  preloadPinyinSearch,
} from "./tagUtils";

type UseVideoTagControllerOptions = {
  activeTagSuggestionIndex: number;
  actorProfiles: ActorProfileStore;
  currentVideo: VideoItem | null;
  currentVideoTags: string[];
  isTagDialogOpen: boolean;
  isTagInputActor: boolean;
  isTagSuggestionLoading: boolean;
  isKnownActorName: (name: string) => boolean;
  localConfig: LocalConfig | null;
  onMarkActorTags: (tags: string[], force?: boolean) => void;
  playerPreferencesRef: MutableRefObject<PlayerPreferences>;
  setActiveTagSuggestionIndex: Dispatch<SetStateAction<number>>;
  setIsTagSuggestionLoading: Dispatch<SetStateAction<boolean>>;
  setTagInput: Dispatch<SetStateAction<string>>;
  setTagMergeDecisions: Dispatch<SetStateAction<TagMergeDecisionStore>>;
  setTagMergePrompt: Dispatch<SetStateAction<TagMergePrompt | null>>;
  setTagMessage: Dispatch<SetStateAction<string>>;
  setVideoTags: Dispatch<SetStateAction<VideoTagStore>>;
  tagInput: string;
  tagMergeDecisionsRef: MutableRefObject<TagMergeDecisionStore>;
  tagMergePrompt: TagMergePrompt | null;
  videoTags: VideoTagStore;
  tagUsageVideoTags: VideoTagStore;
  videoTagsRef: MutableRefObject<VideoTagStore>;
};

export function useVideoTagController({
  activeTagSuggestionIndex,
  actorProfiles,
  currentVideo,
  currentVideoTags,
  isTagDialogOpen,
  isTagInputActor,
  isTagSuggestionLoading,
  isKnownActorName,
  localConfig,
  onMarkActorTags,
  playerPreferencesRef,
  setActiveTagSuggestionIndex,
  setIsTagSuggestionLoading,
  setTagInput,
  setTagMergeDecisions,
  setTagMergePrompt,
  setTagMessage,
  setVideoTags,
  tagInput,
  tagMergeDecisionsRef,
  tagMergePrompt,
  videoTags,
  tagUsageVideoTags,
  videoTagsRef,
}: UseVideoTagControllerOptions) {
  const [pinyinReady, setPinyinReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void preloadPinyinSearch().then((ready) => {
      if (ready && !cancelled) setPinyinReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeTagInputSegment = useMemo(() => getActiveTagInputSegment(tagInput), [tagInput]);
  const actorSpecialTags = useMemo(() => {
    const seen = new Set<string>();
    return Object.values(actorProfiles).flatMap((profile) =>
      [profile.name, ...profile.aliases.map((alias) => alias.label)].flatMap((label) => {
        const key = normalizeTagKey(label);
        const identity = `${profile.id}\u0000${key}`;
        if (!key || seen.has(identity)) return [];
        seen.add(identity);
        return [{ actorId: profile.id, count: 0, key, kind: "actor" as const, label }];
      }),
    );
  }, [actorProfiles]);
  const tagSearchIndex = useMemo(
    () => createTagSearchIndex(videoTags, actorSpecialTags),
    // pinyinReady 变化时重建索引，让拼音匹配在模块加载完成后生效
    [actorSpecialTags, pinyinReady, videoTags],
  );
  const tagInputSuggestions = useMemo(() => {
    if (!isTagDialogOpen || !currentVideo || !activeTagInputSegment) return [];
    return createTagInputSuggestions({
      query: activeTagInputSegment,
      tagIndex: tagSearchIndex,
      currentTags: currentVideoTags,
    });
  }, [activeTagInputSegment, currentVideo, currentVideoTags, isTagDialogOpen, tagSearchIndex]);
  const tagViews = useMemo(() => {
    if (!isTagDialogOpen || !currentVideo) return { allTags: [], commonTags: [], recentTags: [] };
    return createAvailableTagViews({
      currentTags: currentVideoTags,
      recentTags: playerPreferencesRef.current.recentVideoTags,
      videoTags: tagUsageVideoTags,
    });
  }, [currentVideo, currentVideoTags, isTagDialogOpen, playerPreferencesRef, tagUsageVideoTags]);
  const { allTags, commonTags, recentTags } = tagViews;
  const hasActorTagSuggestions = tagInputSuggestions.some((suggestion) => suggestion.kind === "actor");
  const tagInputOptionCount = tagInputSuggestions.length + (hasActorTagSuggestions ? 1 : 0);
  const resolvedActiveTagSuggestionIndex = tagInputOptionCount
    ? Math.min(activeTagSuggestionIndex, tagInputOptionCount - 1)
    : 0;
  const activeTagSuggestionId = tagInputOptionCount
    ? `tag-input-suggestion-${resolvedActiveTagSuggestionIndex}`
    : undefined;

  const replaceVideoTags = useCallback(async (nextVideoTags: VideoTagStore, successMessage?: string) => {
    const previousVideoTags = videoTagsRef.current;
    videoTagsRef.current = nextVideoTags;
    setVideoTags(nextVideoTags);

    const changedVideoIds = Array.from(new Set([...Object.keys(previousVideoTags), ...Object.keys(nextVideoTags)]))
      .filter((videoId) => previousVideoTags[videoId] !== nextVideoTags[videoId]);
    try {
      await Promise.all(changedVideoIds.map((videoId) => savePlayerVideoTags(videoId, nextVideoTags[videoId] ?? [])));
      if (successMessage) setTagMessage(successMessage);
      return true;
    } catch {
      setTagMessage("无法写入项目数据目录，请确认通过 npm run dev 或 npm run preview 启动。");
      return false;
    }
  }, [setTagMessage, setVideoTags, videoTagsRef]);

  const recordRecentVideoTags = useCallback((tags: string[]) => {
    const usedAt = Date.now();
    const incomingKeys = new Set<string>();
    const incoming = tags.flatMap((label, index) => {
      const trimmedLabel = label.trim();
      const key = normalizeTagKey(trimmedLabel);
      if (!key || incomingKeys.has(key)) return [];
      incomingKeys.add(key);
      return key ? [{ key, label: trimmedLabel, usedAt: usedAt - index }] : [];
    });
    if (!incoming.length) return;
    const recentVideoTags = [
      ...incoming,
      ...playerPreferencesRef.current.recentVideoTags.filter((entry) => !incomingKeys.has(entry.key)),
    ].slice(0, 20);
    playerPreferencesRef.current = {
      ...playerPreferencesRef.current,
      recentVideoTags,
    };
    savePlayerPreference("recentVideoTags", recentVideoTags).catch(() => {
      setTagMessage("标签已保存，但最近使用记录保存失败。");
    });
  }, [playerPreferencesRef, setTagMessage]);

  const replaceTagMergeDecisions = useCallback((nextDecisions: TagMergeDecisionStore) => {
    tagMergeDecisionsRef.current = nextDecisions;
    setTagMergeDecisions(nextDecisions);
    saveTagMergeDecisions(nextDecisions).catch(() => {
      setTagMessage("无法保存标签合并选择。");
    });
  }, [setTagMergeDecisions, setTagMessage, tagMergeDecisionsRef]);

  const getAllLibraryTags = useCallback(() => {
    const seen = new Set<string>();
    const tags: string[] = [];
    Object.values(videoTagsRef.current).flat().forEach((tag) => {
      const key = normalizeTagKey(tag);
      if (!key || seen.has(key)) return;
      seen.add(key);
      tags.push(tag);
    });
    return tags;
  }, [videoTagsRef]);

  const addTagsToCurrentVideo = useCallback(async (
    tags: string[],
    options?: { skipActorMatch?: boolean; skipPrompt?: boolean; markAsActor?: boolean },
  ) => {
    if (!currentVideo) return;
    const { markAsActor, skipActorMatch = false, skipPrompt = false } = options ?? {};
    const existingVideoTags = videoTagsRef.current[currentVideo.id] ?? [];
    const allTags = getAllLibraryTags();
    const plan = createTagAdditionPlan({
      allTags,
      existingVideoTags,
      incomingTags: tags,
      isKnownActorName,
      mergeDecisions: tagMergeDecisionsRef.current,
      skipPrompt,
    });
    if (plan.status === "empty") {
      setTagMessage("请输入至少一个标签。");
      return;
    }

    const { addedTags, nextTags, offlineSuggestion, resolvedTags, unmatchedMergeTags } = plan;

    if (!skipPrompt && unmatchedMergeTags.length) {
      if (offlineSuggestion) {
        setTagMergePrompt({ pendingTags: resolvedTags, suggestion: offlineSuggestion, markAsActor });
        setTagMessage("");
        return;
      }

      if (localConfig?.ai.configured && allTags.length) {
        setIsTagSuggestionLoading(true);
        try {
          const aiSuggestion = await fetchJson<AiTagMergeSuggestionResponse>("/api/ai/tags/merge-suggestion", {
            method: "POST",
            body: JSON.stringify({ newTags: unmatchedMergeTags, existingTags: allTags }),
          });
          if (aiSuggestion.newTag && aiSuggestion.existingTag) {
            setTagMergePrompt({
              pendingTags: resolvedTags,
              suggestion: {
                newTag: aiSuggestion.newTag,
                existingTag: aiSuggestion.existingTag,
                reason: "相似标签",
                score: 0.86,
              },
              markAsActor,
            });
            setTagMessage(aiSuggestion.reason || "");
            return;
          }
        } catch {
          setTagMessage("AI 标签合并建议不可用，已使用离线规则。");
        } finally {
          setIsTagSuggestionLoading(false);
        }
      }
    }

    const nextVideoTags = {
      ...videoTagsRef.current,
      [currentVideo.id]: nextTags,
    };
    const didSave = await replaceVideoTags(nextVideoTags, `已保存 ${nextTags.length} 个标签。`);
    if (!didSave) return;
    recordRecentVideoTags(addedTags);
    if (!skipActorMatch) onMarkActorTags(resolvedTags, markAsActor);
    setTagInput("");
    setTagMergePrompt(null);
  }, [
    currentVideo,
    getAllLibraryTags,
    isKnownActorName,
    localConfig,
    onMarkActorTags,
    recordRecentVideoTags,
    replaceVideoTags,
    setIsTagSuggestionLoading,
    setTagInput,
    setTagMergePrompt,
    setTagMessage,
    tagMergeDecisionsRef,
    videoTagsRef,
  ]);

  const submitTagInput = useCallback(() => {
    if (isTagSuggestionLoading) return;
    void addTagsToCurrentVideo(parseTagInput(tagInput), { markAsActor: isTagInputActor });
  }, [addTagsToCurrentVideo, isTagInputActor, isTagSuggestionLoading, tagInput]);

  const submitTagInputSuggestion = useCallback((tag: string) => {
    if (isTagSuggestionLoading) return;
    const resolvedInput = tagInput.replace(/[^\s,，、;；|]*$/u, tag);
    void addTagsToCurrentVideo(parseTagInput(resolvedInput), { markAsActor: isTagInputActor });
  }, [addTagsToCurrentVideo, isTagInputActor, isTagSuggestionLoading, tagInput]);

  const submitActorNameSuggestion = useCallback((name: string) => {
    if (isTagSuggestionLoading || !isKnownActorName(name)) return;
    onMarkActorTags([name]);
    setTagInput("");
    setTagMergePrompt(null);
    setTagMessage("影片演员已添加。");
  }, [
    isKnownActorName,
    isTagSuggestionLoading,
    onMarkActorTags,
    setTagInput,
    setTagMergePrompt,
    setTagMessage,
  ]);

  const submitActorNameAsNewTag = useCallback(() => {
    if (isTagSuggestionLoading) return;
    void addTagsToCurrentVideo(parseTagInput(tagInput), { skipActorMatch: true, skipPrompt: true });
  }, [addTagsToCurrentVideo, isTagSuggestionLoading, tagInput]);

  useEffect(() => {
    setActiveTagSuggestionIndex(0);
  }, [activeTagInputSegment, setActiveTagSuggestionIndex, tagInputOptionCount]);

  const removeTagFromCurrentVideo = useCallback((tag: string) => {
    if (!currentVideo) return;
    const tagKey = normalizeTagKey(tag);
    const nextTags = (videoTagsRef.current[currentVideo.id] ?? []).filter((item) => normalizeTagKey(item) !== tagKey);
    const nextVideoTags = { ...videoTagsRef.current };
    if (nextTags.length) {
      nextVideoTags[currentVideo.id] = nextTags;
    } else {
      delete nextVideoTags[currentVideo.id];
    }
    void replaceVideoTags(nextVideoTags, "标签已移除。");
  }, [currentVideo, replaceVideoTags, videoTagsRef]);

  const applyTagMergeSuggestion = useCallback(() => {
    if (!tagMergePrompt || !currentVideo) return;
    const { suggestion, pendingTags } = tagMergePrompt;
    const pairKey = createTagPairKey(suggestion.newTag, suggestion.existingTag);
    const nextDecisions = {
      ...tagMergeDecisionsRef.current,
      [pairKey]: {
        from: suggestion.newTag,
        to: suggestion.existingTag,
        decision: "merge" as const,
        updatedAt: Date.now(),
      },
    };
    tagMergeDecisionsRef.current = nextDecisions;
    setTagMergeDecisions(nextDecisions);
    const mergedTags = pendingTags.map((tag) =>
      normalizeTagKey(tag) === normalizeTagKey(suggestion.newTag) ? suggestion.existingTag : tag,
    );
    void addTagsToCurrentVideo(mergedTags, { skipPrompt: true, markAsActor: tagMergePrompt.markAsActor });
    saveTagMergeDecisions(nextDecisions).catch(() => setTagMessage("无法保存标签合并选择。"));
  }, [addTagsToCurrentVideo, currentVideo, setTagMergeDecisions, setTagMessage, tagMergeDecisionsRef, tagMergePrompt]);

  const keepTagMergeSuggestion = useCallback(() => {
    if (!tagMergePrompt) return;
    const { suggestion, pendingTags } = tagMergePrompt;
    const pairKey = createTagPairKey(suggestion.newTag, suggestion.existingTag);
    replaceTagMergeDecisions({
      ...tagMergeDecisionsRef.current,
      [pairKey]: {
        from: suggestion.newTag,
        to: suggestion.existingTag,
        decision: "keep",
        updatedAt: Date.now(),
      },
    });
    void addTagsToCurrentVideo(pendingTags, { skipPrompt: true, markAsActor: tagMergePrompt.markAsActor });
  }, [addTagsToCurrentVideo, replaceTagMergeDecisions, tagMergeDecisionsRef, tagMergePrompt]);

  return {
    activeTagInputSegment,
    activeTagSuggestionId,
    addTagsToCurrentVideo,
    allTags,
    applyTagMergeSuggestion,
    commonTags,
    getAllLibraryTags,
    hasActorTagSuggestions,
    keepTagMergeSuggestion,
    recentTags,
    removeTagFromCurrentVideo,
    replaceVideoTags,
    resolvedActiveTagSuggestionIndex,
    submitActorNameAsNewTag,
    submitActorNameSuggestion,
    submitTagInput,
    submitTagInputSuggestion,
    tagInputSuggestions,
  };
}
