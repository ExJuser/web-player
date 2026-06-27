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

export function parseTagInput(input: string) {
  const seenKeys = new Set<string>();
  const tags: string[] = [];
  input
    .split(tagSeparators)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .forEach((tag) => {
      const key = normalizeTagKey(tag);
      if (!key || seenKeys.has(key)) return;
      seenKeys.add(key);
      tags.push(tag);
    });
  return tags;
}

export function createTagPairKey(a: string, b: string) {
  return [normalizeTagKey(a), normalizeTagKey(b)].sort().join("::");
}

function getSynonymGroupKey(tag: string) {
  const key = normalizeTagKey(tag);
  return synonymGroups.findIndex((group) => group.some((item) => normalizeTagKey(item) === key));
}

function getSimilarity(a: string, b: string) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) {
    return Math.min(a.length, b.length) / Math.max(a.length, b.length);
  }

  const rows = a.length + 1;
  const columns = b.length + 1;
  const distances = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: columns }, (__, column) => (row === 0 ? column : column === 0 ? row : 0)),
  );

  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const cost = a[row - 1] === b[column - 1] ? 0 : 1;
      distances[row][column] = Math.min(
        distances[row - 1][column] + 1,
        distances[row][column - 1] + 1,
        distances[row - 1][column - 1] + cost,
      );
    }
  }

  const distance = distances[a.length][b.length];
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

export function getTagSearchScore(query: string, tags: string[]) {
  const queryKey = normalizeTagKey(query);
  if (!queryKey) return 0;

  let bestScore = 0;
  for (const tag of tags) {
    const tagKey = normalizeTagKey(tag);
    if (!tagKey) continue;
    if (tagKey === queryKey) {
      bestScore = Math.max(bestScore, 32);
      continue;
    }

    const querySynonymGroup = getSynonymGroupKey(query);
    const tagSynonymGroup = getSynonymGroupKey(tag);
    if (querySynonymGroup >= 0 && querySynonymGroup === tagSynonymGroup) {
      bestScore = Math.max(bestScore, 28);
      continue;
    }

    if (tagKey.includes(queryKey) || queryKey.includes(tagKey)) {
      bestScore = Math.max(bestScore, 20);
      continue;
    }

    if (getSimilarity(queryKey, tagKey) >= 0.72) {
      bestScore = Math.max(bestScore, 16);
    }
  }
  return bestScore;
}
