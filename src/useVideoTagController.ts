import { useCallback, useEffect, useMemo, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import type { AiTagMergeSuggestionResponse, TagMergePrompt } from "./appTypes";
import { fetchLocalJson as fetchJson } from "./localApiClient";
import type { LocalConfig } from "./mediaRootScanCache";
import { savePlayerVideoTags, saveTagMergeDecisions } from "./playerStorage";
import type { TagMergeDecisionStore, VideoItem, VideoTagStore } from "./playerTypes";
import {
  createTagInputSuggestions,
  createTagPairKey,
  findTagMergeSuggestion,
  getActiveTagInputSegment,
  mergeTags,
  normalizeTagKey,
  parseTagInput,
  splitTagsByExistingMatch,
  type TagMergeSuggestion,
} from "./tagUtils";

type UseVideoTagControllerOptions = {
  activeTagSuggestionIndex: number;
  currentVideo: VideoItem | null;
  currentVideoTags: string[];
  isTagDialogOpen: boolean;
  isTagInputActor: boolean;
  isTagSuggestionLoading: boolean;
  localConfig: LocalConfig | null;
  onMarkActorTags: (tags: string[]) => void;
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
  videoTagsRef: MutableRefObject<VideoTagStore>;
};

export function useVideoTagController({
  activeTagSuggestionIndex,
  currentVideo,
  currentVideoTags,
  isTagDialogOpen,
  isTagInputActor,
  isTagSuggestionLoading,
  localConfig,
  onMarkActorTags,
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
  videoTagsRef,
}: UseVideoTagControllerOptions) {
  const activeTagInputSegment = useMemo(() => getActiveTagInputSegment(tagInput), [tagInput]);
  const tagInputSuggestions = useMemo(() => {
    if (!isTagDialogOpen || !currentVideo || !activeTagInputSegment) return [];
    return createTagInputSuggestions({
      query: activeTagInputSegment,
      allVideoTags: videoTags,
      currentTags: currentVideoTags,
    });
  }, [activeTagInputSegment, currentVideo, currentVideoTags, isTagDialogOpen, videoTags]);
  const commonTags = useMemo(() => {
    if (!isTagDialogOpen || !currentVideo) return [];
    const currentTagKeys = new Set(currentVideoTags.map(normalizeTagKey));
    const usageByKey = new Map<string, { label: string; count: number }>();
    Object.values(videoTags).forEach((tags) => {
      const seenVideoTagKeys = new Set<string>();
      tags.forEach((tag) => {
        const key = normalizeTagKey(tag);
        if (!key || currentTagKeys.has(key) || seenVideoTagKeys.has(key)) return;
        seenVideoTagKeys.add(key);
        const usage = usageByKey.get(key);
        usageByKey.set(key, { label: usage?.label ?? tag, count: (usage?.count ?? 0) + 1 });
      });
    });
    return Array.from(usageByKey.values())
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "zh-Hans-CN", { numeric: true }))
      .slice(0, 15)
      .map(({ label }) => label);
  }, [currentVideo, currentVideoTags, isTagDialogOpen, videoTags]);
  const resolvedActiveTagSuggestionIndex = tagInputSuggestions.length
    ? Math.min(activeTagSuggestionIndex, tagInputSuggestions.length - 1)
    : 0;
  const activeTagSuggestionId = tagInputSuggestions.length
    ? `tag-input-suggestion-${resolvedActiveTagSuggestionIndex}`
    : undefined;

  const replaceVideoTags = useCallback((nextVideoTags: VideoTagStore, successMessage?: string) => {
    const previousVideoTags = videoTagsRef.current;
    videoTagsRef.current = nextVideoTags;
    setVideoTags(nextVideoTags);

    const changedVideoIds = Array.from(new Set([...Object.keys(previousVideoTags), ...Object.keys(nextVideoTags)]))
      .filter((videoId) => previousVideoTags[videoId] !== nextVideoTags[videoId]);
    Promise.all(changedVideoIds.map((videoId) => savePlayerVideoTags(videoId, nextVideoTags[videoId] ?? [])))
      .then(() => {
        if (successMessage) setTagMessage(successMessage);
      })
      .catch(() => {
        setTagMessage("无法写入项目数据目录，请确认通过 npm run dev 或 npm run preview 启动。");
      });
  }, [setTagMessage, setVideoTags, videoTagsRef]);

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

  const addTagsToCurrentVideo = useCallback(async (tags: string[], options?: { skipPrompt?: boolean; markAsActor?: boolean }) => {
    if (!currentVideo) return;
    const existingVideoTags = videoTagsRef.current[currentVideo.id] ?? [];
    const allTags = getAllLibraryTags();
    const incomingTags = parseTagInput(tags.join(" "));
    if (!incomingTags.length) {
      setTagMessage("请输入至少一个标签。");
      return;
    }

    const { resolvedTags, unmatchedTags } = splitTagsByExistingMatch(incomingTags, allTags);

    if (!options?.skipPrompt && unmatchedTags.length) {
      const suggestion = unmatchedTags
        .map((tag) => findTagMergeSuggestion(tag, allTags, tagMergeDecisionsRef.current))
        .find((item): item is TagMergeSuggestion => Boolean(item));
      if (suggestion) {
        setTagMergePrompt({ pendingTags: resolvedTags, suggestion, markAsActor: options?.markAsActor });
        setTagMessage("");
        return;
      }

      if (localConfig?.ai.configured && allTags.length) {
        setIsTagSuggestionLoading(true);
        try {
          const aiSuggestion = await fetchJson<AiTagMergeSuggestionResponse>("/api/ai/tags/merge-suggestion", {
            method: "POST",
            body: JSON.stringify({ newTags: unmatchedTags, existingTags: allTags }),
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
              markAsActor: options?.markAsActor,
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

    const nextTags = mergeTags(existingVideoTags, resolvedTags);
    const nextVideoTags = {
      ...videoTagsRef.current,
      [currentVideo.id]: nextTags,
    };
    replaceVideoTags(nextVideoTags, `已保存 ${nextTags.length} 个标签。`);
    if (options?.markAsActor) onMarkActorTags(resolvedTags);
    setTagInput("");
    setTagMergePrompt(null);
  }, [
    currentVideo,
    getAllLibraryTags,
    localConfig,
    onMarkActorTags,
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

  useEffect(() => {
    setActiveTagSuggestionIndex(0);
  }, [activeTagInputSegment, setActiveTagSuggestionIndex, tagInputSuggestions.length]);

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
    replaceVideoTags(nextVideoTags, "标签已移除。");
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
    applyTagMergeSuggestion,
    commonTags,
    getAllLibraryTags,
    keepTagMergeSuggestion,
    removeTagFromCurrentVideo,
    replaceVideoTags,
    resolvedActiveTagSuggestionIndex,
    submitTagInput,
    submitTagInputSuggestion,
    tagInputSuggestions,
  };
}
