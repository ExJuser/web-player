import { pinyin } from "pinyin-pro";

export type TagMergeDecision = {
  from: string;
  to: string;
  decision: "merge" | "keep";
  updatedAt: number;
};

export type TagMergeDecisionStore = Record<string, TagMergeDecision>;

export type TagMergeSuggestion = {
  newTag: string;
  existingTag: string;
  reason: "同义标签" | "相似标签";
  score: number;
};

export type TagUsageStat = {
  key: string;
  tag: string;
  videoCount: number;
  videoIds: string[];
};

export type TagInputSuggestion = {
  key: string;
  label: string;
  count: number;
  kind?: "actor";
  actorId?: string;
};

export type TagSearchIndexEntry = TagInputSuggestion & {
  fullPinyin: string;
  initials: string;
};

const tagSeparators = /[\s,，、;；|]+/u;

const synonymGroups = [
  ["美腿", "腿玩年", "长腿", "腿控"],
  ["剧情", "故事", "情节"],
  ["搞笑", "喜剧", "幽默"],
  ["治愈", "温暖", "暖心"],
];

export function normalizeTagKey(tag: string) {
  return tag
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, "")
    .trim();
}

const synonymGroupByTagKey = new Map(
  synonymGroups.flatMap((group, index) => group.map((tag) => [normalizeTagKey(tag), index] as const)),
);

export function parseTagInput(input: string) {
  const seenKeys = new Set<string>();
  const tags: string[] = [];
  input.split(tagSeparators).forEach((rawTag) => {
    const tag = rawTag.trim();
    const key = normalizeTagKey(tag);
    if (!key || seenKeys.has(key)) return;
    seenKeys.add(key);
    tags.push(tag);
  });
  return tags;
}

export function getActiveTagInputSegment(input: string) {
  return input.match(/(?:^|[\s,，、;；|])([^\s,，、;；|]*)$/u)?.[1]?.trim() ?? "";
}

export function createTagPairKey(a: string, b: string) {
  const aKey = normalizeTagKey(a);
  const bKey = normalizeTagKey(b);
  return aKey <= bKey ? `${aKey}::${bKey}` : `${bKey}::${aKey}`;
}

function getSynonymGroupKey(tag: string) {
  return synonymGroupByTagKey.get(normalizeTagKey(tag)) ?? -1;
}

function getSimilarity(a: string, b: string) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) {
    return Math.min(a.length, b.length) / Math.max(a.length, b.length);
  }

  const columns = b.length + 1;
  let previous = Array.from({ length: columns }, (_, column) => column);
  let current = new Array<number>(columns);
  for (let row = 1; row <= a.length; row += 1) {
    current[0] = row;
    for (let column = 1; column < columns; column += 1) {
      const cost = a[row - 1] === b[column - 1] ? 0 : 1;
      current[column] = Math.min(
        previous[column] + 1,
        current[column - 1] + 1,
        previous[column - 1] + cost,
      );
    }
    [previous, current] = [current, previous];
  }

  const distance = previous[b.length];
  return 1 - distance / Math.max(a.length, b.length);
}

export function findTagMergeSuggestion(
  newTag: string,
  existingTags: string[],
  decisions: TagMergeDecisionStore,
): TagMergeSuggestion | null {
  const newKey = normalizeTagKey(newTag);
  if (!newKey) return null;

  for (const existingTag of existingTags) {
    const existingKey = normalizeTagKey(existingTag);
    if (!existingKey || existingKey === newKey) continue;

    const pairKey = createTagPairKey(newTag, existingTag);
    if (decisions[pairKey]?.decision === "keep") continue;

    const newSynonymGroup = getSynonymGroupKey(newTag);
    const existingSynonymGroup = getSynonymGroupKey(existingTag);
    if (newSynonymGroup >= 0 && newSynonymGroup === existingSynonymGroup) {
      return {
        newTag,
        existingTag,
        reason: "同义标签",
        score: 1,
      };
    }

    const score = getSimilarity(newKey, existingKey);
    if (score >= 0.72) {
      return {
        newTag,
        existingTag,
        reason: "相似标签",
        score,
      };
    }
  }

  return null;
}

export function splitTagsByExistingMatch(incomingTags: string[], existingTags: string[]) {
  const existingTagByKey = new Map<string, string>();
  existingTags.forEach((tag) => {
    const key = normalizeTagKey(tag);
    if (!key || existingTagByKey.has(key)) return;
    existingTagByKey.set(key, tag);
  });

  const resolvedTags: string[] = [];
  const unmatchedTags: string[] = [];
  incomingTags.forEach((tag) => {
    const existingTag = existingTagByKey.get(normalizeTagKey(tag));
    if (existingTag) {
      resolvedTags.push(existingTag);
      return;
    }

    resolvedTags.push(tag);
    unmatchedTags.push(tag);
  });

  return { resolvedTags, unmatchedTags };
}

export function mergeTags(existingTags: string[], incomingTags: string[]) {
  const seenKeys = new Set(existingTags.map(normalizeTagKey).filter(Boolean));
  const nextTags = [...existingTags];
  incomingTags.forEach((tag) => {
    const key = normalizeTagKey(tag);
    if (!key || seenKeys.has(key)) return;
    seenKeys.add(key);
    nextTags.push(tag);
  });
  return nextTags;
}

export function doTagsSatisfyAllFilters(tags: string[], filters: string[]) {
  const filterKeys = filters.map(normalizeTagKey).filter(Boolean);
  if (!filterKeys.length) return true;
  const tagKeys = new Set(tags.map(normalizeTagKey).filter(Boolean));
  return filterKeys.every((key) => tagKeys.has(key));
}

export function buildGlobalTagUsageStats(videoTags: Record<string, string[]>): TagUsageStat[] {
  const statsByKey = new Map<string, TagUsageStat>();

  Object.entries(videoTags).forEach(([videoId, tags]) => {
    const seenKeysInVideo = new Set<string>();
    tags.forEach((tag) => {
      const key = normalizeTagKey(tag);
      if (!key || seenKeysInVideo.has(key)) return;
      seenKeysInVideo.add(key);

      const existing = statsByKey.get(key);
      if (existing) {
        existing.videoCount += 1;
        existing.videoIds.push(videoId);
        return;
      }

      statsByKey.set(key, {
        key,
        tag,
        videoCount: 1,
        videoIds: [videoId],
      });
    });
  });

  return Array.from(statsByKey.values()).sort((a, b) => {
    if (b.videoCount !== a.videoCount) return b.videoCount - a.videoCount;
    return a.tag.localeCompare(b.tag, "zh-Hans-CN");
  });
}

function getSingleTagSearchScore(queryKey: string, querySynonymGroup: number, tag: string, tagKey = normalizeTagKey(tag)) {
  if (!tagKey) return 0;
  if (tagKey === queryKey) return 32;
  const tagSynonymGroup = getSynonymGroupKey(tag);
  if (querySynonymGroup >= 0 && querySynonymGroup === tagSynonymGroup) return 28;
  if (tagKey.includes(queryKey) || queryKey.includes(tagKey)) return 20;
  return getSimilarity(queryKey, tagKey) >= 0.72 ? 16 : 0;
}

export function buildSubtitleSystemVideoTags(videos: VideoItem[], subtitles: SubtitleItem[]): VideoTagStore {
  return Object.fromEntries(videos.flatMap((video) => {
    const hasTranslatedSubtitle = subtitles.some((subtitle) =>
      !subtitle.isManual &&
      (subtitle.mediaRootId === undefined || subtitle.mediaRootId === video.mediaRootId) &&
      getSubtitlePathMatchPriority(video.relativePath, subtitle.relativePath) === 0,
    );
    return hasTranslatedSubtitle ? [[video.id, [CHINESE_SUBTITLE_SYSTEM_TAG]]] : [];
  }));
}

export function mergeVideoTagStores(userTags: VideoTagStore, systemTags: VideoTagStore): VideoTagStore {
  const videoIds = new Set([...Object.keys(userTags), ...Object.keys(systemTags)]);
  return Object.fromEntries(Array.from(videoIds).flatMap((videoId) => {
    const tags = mergeTags(systemTags[videoId] ?? [], userTags[videoId] ?? []);
    return tags.length ? [[videoId, tags]] : [];
  }));
}

export function getTagSearchScore(query: string, tags: string[]) {
  const queryKey = normalizeTagKey(query);
  if (!queryKey) return 0;

  let bestScore = 0;
  const querySynonymGroup = getSynonymGroupKey(query);
  for (const tag of tags) {
    bestScore = Math.max(bestScore, getSingleTagSearchScore(queryKey, querySynonymGroup, tag));
    if (bestScore === 32) return bestScore;
  }
  return bestScore;
}

function createPinyinSearchText(label: string, pattern: "pinyin" | "first") {
  return normalizeTagKey(pinyin(label, {
    nonZh: "consecutive",
    pattern,
    separator: "",
    toneType: "none",
    v: true,
  }));
}

export function createTagSearchIndex(
  allVideoTags: Record<string, string[] | undefined>,
  specialTags: TagInputSuggestion[] = [],
): TagSearchIndexEntry[] {
  const candidatesByKey = new Map<string, TagInputSuggestion>();
  Object.values(allVideoTags).forEach((tags) => {
    const seenVideoTagKeys = new Set<string>();
    tags?.forEach((tag) => {
      const key = normalizeTagKey(tag);
      if (!key || seenVideoTagKeys.has(key)) return;
      seenVideoTagKeys.add(key);
      const existing = candidatesByKey.get(key);
      candidatesByKey.set(key, {
        key,
        label: existing?.label ?? tag,
        count: (existing?.count ?? 0) + 1,
      });
    });
  });
  specialTags.forEach((candidate) => {
    if (!candidate.key || !candidate.label.trim()) return;
    candidatesByKey.set(`actor:${candidate.actorId ?? candidate.key}:${candidate.key}`, candidate);
  });
  return Array.from(candidatesByKey.values()).map((candidate) => ({
    ...candidate,
    fullPinyin: createPinyinSearchText(candidate.label, "pinyin"),
    initials: createPinyinSearchText(candidate.label, "first"),
  }));
}

export function createTagInputSuggestions(input: {
  query: string;
  tagIndex: TagSearchIndexEntry[];
  currentTags: string[];
  limit?: number;
}) {
  const queryKey = normalizeTagKey(input.query);
  if (!queryKey) return [];

  const currentTagKeys = new Set(input.currentTags.map(normalizeTagKey).filter(Boolean));
  const querySynonymGroup = getSynonymGroupKey(input.query);
  const candidatesByKey = new Map<string, TagInputSuggestion & { matchRank: number }>();
  input.tagIndex.forEach((candidate) => {
    const { count, fullPinyin, initials, key, label } = candidate;
    if (candidate.kind !== "actor" && currentTagKeys.has(key)) return;
    const matchScore = getSingleTagSearchScore(queryKey, querySynonymGroup, label, key);
    const matchRank = key === queryKey
      ? 0
      : key.startsWith(queryKey)
        ? 1
        : key.includes(queryKey) || queryKey.includes(key)
          ? 2
          : fullPinyin.startsWith(queryKey)
            ? 3
            : initials.startsWith(queryKey)
              ? 4
              : fullPinyin.includes(queryKey)
                ? 5
                : matchScore > 0
                  ? 6
                  : -1;
    if (matchRank < 0) return;
    const candidateKey = candidate.kind === "actor"
      ? `actor:${candidate.actorId ?? key}:${key}`
      : `tag:${key}`;
    candidatesByKey.set(candidateKey, {
      key,
      label,
      count,
      ...(candidate.kind === "actor" ? { kind: candidate.kind, actorId: candidate.actorId } : {}),
      matchRank,
    });
  });
  return Array.from(candidatesByKey.values())
    .sort((a, b) =>
      Number(b.kind === "actor") - Number(a.kind === "actor")
      || a.matchRank - b.matchRank
      || b.count - a.count
      || a.label.localeCompare(b.label, "zh-Hans-CN", { numeric: true }),
    )
    .slice(0, input.limit ?? 8)
    .map(({ matchRank: _matchRank, ...candidate }) => candidate);
}
import { getSubtitlePathMatchPriority } from "./playerLibraryUtils";
import type { SubtitleItem, VideoItem, VideoTagStore } from "./playerTypes";

export const CHINESE_SUBTITLE_SYSTEM_TAG = "中文字幕";
