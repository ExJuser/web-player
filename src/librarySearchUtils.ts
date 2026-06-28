import { doTagsSatisfyAllFilters, getTagSearchScore } from "./tagUtils";
import { baseNameWithoutExtension, directoryPartsOf, fallbackMediaRootLabelForVideo } from "./mediaPathUtils";

export const librarySearchResultPageSize = 24;

type LibrarySearchMode = "all" | "anime" | "special";

export type LibrarySearchVideo = {
  id: string;
  name: string;
  relativePath: string;
  mediaRootId?: string;
};

export type LibrarySearchContext<Progress = unknown> = {
  mode: LibrarySearchMode;
  mediaRootLabelsById?: Record<string, string>;
  progressByVideoId?: Record<string, Progress | undefined>;
  favoriteVideoIds?: ReadonlySet<string>;
  isResumableProgress?: (progress: Progress | undefined) => boolean;
  tagFilters?: string[];
  videoTags?: Record<string, string[] | undefined>;
};

export type LibrarySearchEntryVideo<Video extends LibrarySearchVideo, Progress = unknown> = {
  video: Video;
  progress?: Progress;
};

export type LibrarySearchEntry<Video extends LibrarySearchVideo, Progress = unknown> = {
  kind: "folder" | "video";
  key: string;
  title: string;
  path: string;
  mediaRootLabel?: string;
  videos: Array<LibrarySearchEntryVideo<Video, Progress>>;
  representativeVideo: Video;
  score: number;
  reason: string;
};

export function applyLibrarySearchResultLimit<T>(results: T[], limit?: number) {
  return typeof limit === "number" ? results.slice(0, limit) : results;
}

export function getVisibleLibrarySearchResults<T>(results: T[], visibleCount: number) {
  const safeVisibleCount = Math.max(0, Math.floor(visibleCount));
  const visibleResults = results.slice(0, safeVisibleCount);
  return {
    visibleResults,
    hasMoreResults: visibleResults.length < results.length,
  };
}

export function libraryFolderTitleForVideo(video: LibrarySearchVideo) {
  return directoryPartsOf(video.relativePath)[0] ?? baseNameWithoutExtension(video.name);
}

export function scopedLibraryFolderKeyForVideo(video: LibrarySearchVideo, title: string) {
  const titleKey = title.trim().toLowerCase();
  return video.mediaRootId ? `${video.mediaRootId}:${titleKey}` : titleKey;
}

export function libraryFolderKeyForVideo(video: LibrarySearchVideo) {
  return scopedLibraryFolderKeyForVideo(video, libraryFolderTitleForVideo(video));
}

export function libraryFolderPathForVideo(video: LibrarySearchVideo) {
  return directoryPartsOf(video.relativePath)[0] ?? "";
}

export function normalizeLibrarySearchText(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function tokenizeLibrarySearchQuery(query: string, minLength = 2) {
  return normalizeLibrarySearchText(query)
    .split(/\s+/)
    .filter((token) => token.length >= minLength);
}

function includesAnyLibrarySearchVariant(searchable: string[], variants: string[]) {
  return variants.some((variant) => searchable.some((value) => value.includes(variant)));
}

const japaneseSimplifiedCharacterPairs: Array<[string, string]> = [
  ["亜", "亚"],
  ["悪", "恶"],
  ["圧", "压"],
  ["囲", "围"],
  ["為", "为"],
  ["隠", "隐"],
  ["栄", "荣"],
  ["駅", "驿"],
  ["円", "圆"],
  ["応", "应"],
  ["桜", "樱"],
  ["穏", "稳"],
  ["仮", "假"],
  ["価", "价"],
  ["画", "画"],
  ["会", "会"],
  ["絵", "绘"],
];

const librarySearchCharacterAlternatives = new Map<string, string[]>();
japaneseSimplifiedCharacterPairs.forEach(([japanese, simplified]) => {
  librarySearchCharacterAlternatives.set(japanese, [...(librarySearchCharacterAlternatives.get(japanese) ?? []), simplified]);
  librarySearchCharacterAlternatives.set(simplified, [...(librarySearchCharacterAlternatives.get(simplified) ?? []), japanese]);
});

function createLibrarySearchTextVariants(value: string, limit = 24) {
  const normalized = normalizeLibrarySearchText(value);
  if (!normalized) return [];

  const variants = [""];
  for (const character of normalized) {
    const alternatives = [character, ...(librarySearchCharacterAlternatives.get(character) ?? [])];
    const uniqueAlternatives = Array.from(new Set(alternatives));
    const nextVariants: string[] = [];
    for (const variant of variants) {
      for (const alternative of uniqueAlternatives) {
        nextVariants.push(`${variant}${alternative}`);
        if (nextVariants.length >= limit) break;
      }
      if (nextVariants.length >= limit) break;
    }
    variants.splice(0, variants.length, ...nextVariants);
  }

  return Array.from(new Set(variants.map(normalizeLibrarySearchText))).filter(Boolean);
}

function createLibrarySearchTokenVariants(query: string) {
  return tokenizeLibrarySearchQuery(query).flatMap((token) => createLibrarySearchTextVariants(token, 8));
}

function compareNaturalRelativePath(a: string, b: string) {
  return a.localeCompare(b, "zh-Hans-CN", { numeric: true, sensitivity: "base" });
}

function getProgress<Video extends LibrarySearchVideo, Progress>(video: Video, context: LibrarySearchContext<Progress>) {
  return context.progressByVideoId?.[video.id];
}

function getMediaRootLabel<Video extends LibrarySearchVideo, Progress>(video: Video, context: LibrarySearchContext<Progress>) {
  return video.mediaRootId ? context.mediaRootLabelsById?.[video.mediaRootId] ?? fallbackMediaRootLabelForVideo(video) : "";
}

function getSearchableFields<Video extends LibrarySearchVideo, Progress>(video: Video, context: LibrarySearchContext<Progress>) {
  const folderTitle = libraryFolderTitleForVideo(video);
  const folderPath = libraryFolderPathForVideo(video);
  const mediaRootLabel = getMediaRootLabel(video, context);
  const directoryParts = directoryPartsOf(video.relativePath);
  const parentDirectory = directoryParts.at(-1) ?? "";
  const directoryPath = directoryParts.join(" ");
  return [
    folderTitle,
    folderPath,
    parentDirectory,
    directoryPath,
    video.name,
    video.relativePath,
    baseNameWithoutExtension(video.name),
    mediaRootLabel,
  ].map(normalizeLibrarySearchText);
}

function matchesRequiredSpecialTerms(searchable: string[], query: string, tags: string[]) {
  const requiredTokens = tokenizeLibrarySearchQuery(query, 1);
  if (!requiredTokens.length) return false;
  return requiredTokens.every((token) => {
    const tagScore = getTagSearchScore(token, tags);
    if (token.length < 2) return tagScore > 0;
    return searchable.some((value) => value.includes(token)) || tagScore > 0;
  });
}

function scoreVideo<Video extends LibrarySearchVideo, Progress>(
  video: Video,
  query: string,
  context: LibrarySearchContext<Progress>,
) {
  const normalizedQuery = normalizeLibrarySearchText(query);
  const tokens = tokenizeLibrarySearchQuery(query);
  const queryVariants = createLibrarySearchTextVariants(query);
  const alternateQueryVariants = queryVariants.filter((variant) => variant !== normalizedQuery);
  const tokenVariants = createLibrarySearchTokenVariants(query);
  const searchable = getSearchableFields(video, context);
  const tags = context.videoTags?.[video.id] ?? [];
  const hasTagFilters = Boolean(context.tagFilters?.length);
  if (hasTagFilters && !doTagsSatisfyAllFilters(tags, context.tagFilters ?? [])) {
    return { score: 0, reason: "标签筛选" };
  }

  let score = normalizedQuery ? 0 : hasTagFilters ? 30 : 0;
  const reasons: string[] = normalizedQuery ? [] : hasTagFilters ? ["标签筛选"] : [];

  if (context.mode === "special" && normalizedQuery && !matchesRequiredSpecialTerms(searchable, query, tags)) {
    return { score: 0, reason: "关键词匹配" };
  }

  if (includesAnyLibrarySearchVariant([searchable[0]], queryVariants)) {
    score += 40;
    reasons.push("文件夹匹配");
  }
  if (includesAnyLibrarySearchVariant([searchable[1]], queryVariants)) {
    score += 32;
    reasons.push("目录匹配");
  }
  if (includesAnyLibrarySearchVariant([searchable[2]], queryVariants)) {
    score += 24;
    reasons.push("文件夹匹配");
  }
  if (includesAnyLibrarySearchVariant([searchable[3]], queryVariants)) {
    score += 18;
    reasons.push("目录匹配");
  }
  if (includesAnyLibrarySearchVariant([searchable[4]], queryVariants)) {
    score += 10;
    reasons.push("文件名匹配");
  }
  if (includesAnyLibrarySearchVariant([searchable[5]], queryVariants)) {
    score += 6;
    reasons.push("路径匹配");
  }
  if (includesAnyLibrarySearchVariant([searchable[7]], queryVariants)) {
    score += 12;
    reasons.push("媒体库匹配");
  }
  if (alternateQueryVariants.length && includesAnyLibrarySearchVariant(searchable, alternateQueryVariants)) {
    score += 8;
    reasons.push("中日字形匹配");
  }
  const tagScore = getTagSearchScore(query, tags);
  if (tagScore > 0) {
    score += tagScore;
    reasons.push("标签匹配");
  }

  tokens.forEach((token) => {
    if (searchable[0].includes(token)) score += 10;
    if (searchable[1].includes(token)) score += 8;
    if (searchable[2].includes(token)) score += 6;
    if (searchable[3].includes(token)) score += 5;
    if (searchable[4].includes(token)) score += 2;
    if (searchable[5].includes(token)) score += 1;
    if (searchable[7].includes(token)) score += 4;
    score += Math.floor(getTagSearchScore(token, tags) / 4);
  });
  if (context.mode === "special") {
    tokenizeLibrarySearchQuery(query, 1)
      .filter((token) => !tokens.includes(token))
      .forEach((token) => {
        score += Math.floor(getTagSearchScore(token, tags) / 2);
      });
  }
  tokenVariants
    .filter((token) => !tokens.includes(token))
    .forEach((token) => {
      if (searchable[0].includes(token)) score += 8;
      if (searchable[1].includes(token)) score += 6;
      if (searchable[2].includes(token)) score += 5;
      if (searchable[3].includes(token)) score += 4;
      if (searchable[4].includes(token)) score += 2;
      if (searchable[5].includes(token)) score += 1;
      if (searchable[7].includes(token)) score += 3;
    });

  if (context.favoriteVideoIds?.has(video.id)) score += 1;
  if (context.isResumableProgress?.(getProgress(video, context))) score += 1;
  return { score, reason: reasons[0] ?? "关键词匹配" };
}

export function createLibraryFolderResult<Video extends LibrarySearchVideo, Progress>(
  folderVideos: Video[],
  representativeVideo: Video,
  score: number,
  reason: string,
  context: LibrarySearchContext<Progress>,
): LibrarySearchEntry<Video, Progress> {
  const sortedVideos = [...folderVideos].sort((a, b) => compareNaturalRelativePath(a.relativePath, b.relativePath));
  const mediaRootLabel = getMediaRootLabel(representativeVideo, context);
  return {
    kind: "folder",
    key: libraryFolderKeyForVideo(representativeVideo),
    title: libraryFolderTitleForVideo(representativeVideo),
    path: libraryFolderPathForVideo(representativeVideo),
    mediaRootLabel: mediaRootLabel || undefined,
    videos: sortedVideos.map((video) => ({ video, progress: getProgress(video, context) })),
    representativeVideo,
    score,
    reason,
  };
}

export function createLibraryVideoResult<Video extends LibrarySearchVideo, Progress>(
  video: Video,
  score: number,
  reason: string,
  context: LibrarySearchContext<Progress>,
): LibrarySearchEntry<Video, Progress> {
  const mediaRootLabel = getMediaRootLabel(video, context);
  return {
    kind: "video",
    key: video.id,
    title: video.name,
    path: video.relativePath,
    mediaRootLabel: mediaRootLabel || undefined,
    videos: [{ video, progress: getProgress(video, context) }],
    representativeVideo: video,
    score,
    reason,
  };
}

function groupVideosByLibraryFolderKey<Video extends LibrarySearchVideo>(videos: Video[]) {
  const grouped = new Map<string, Video[]>();
  videos.forEach((video) => {
    const key = libraryFolderKeyForVideo(video);
    const existing = grouped.get(key);
    if (existing) {
      existing.push(video);
    } else {
      grouped.set(key, [video]);
    }
  });
  return grouped;
}

export function searchLibraryEntries<Video extends LibrarySearchVideo, Progress>(
  query: string,
  videos: Video[],
  context: LibrarySearchContext<Progress>,
  limit?: number,
) {
  const hasTagFilters = Boolean(context.tagFilters?.length);
  if (!normalizeLibrarySearchText(query) && !hasTagFilters) return [];
  const folderVideosByKey = groupVideosByLibraryFolderKey(videos);
  const scoredVideos = videos
    .map((video) => ({ video, ...scoreVideo(video, query, context) }))
    .filter((item) => item.score > 0);

  if (context.mode === "special") {
    const videoResults = scoredVideos
      .map(({ video, score, reason }) => createLibraryVideoResult(video, score, reason, context))
      .sort((a, b) => b.score - a.score || compareNaturalRelativePath(a.representativeVideo.relativePath, b.representativeVideo.relativePath));
    return applyLibrarySearchResultLimit(videoResults, limit);
  }

  const folderResults = new Map<string, LibrarySearchEntry<Video, Progress>>();
  scoredVideos.forEach(({ video, score, reason }) => {
    const key = libraryFolderKeyForVideo(video);
    const existing = folderResults.get(key);
    if (existing) {
      if (
        score > existing.score ||
        (score === existing.score && compareNaturalRelativePath(video.relativePath, existing.representativeVideo.relativePath) < 0)
      ) {
        existing.score = score;
        existing.reason = reason;
        existing.representativeVideo = video;
      }
      return;
    }
    folderResults.set(key, createLibraryFolderResult(folderVideosByKey.get(key) ?? [video], video, score, reason, context));
  });

  const sortedResults = Array.from(folderResults.values()).sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "zh-Hans-CN"));
  return applyLibrarySearchResultLimit(sortedResults, limit);
}

export function createAiLibrarySearchResults<Video extends LibrarySearchVideo, Progress>(
  matchIds: string[],
  videos: Video[],
  context: LibrarySearchContext<Progress>,
) {
  const videoById = new Map(videos.map((video) => [video.id, video]));
  const folderVideosByKey = groupVideosByLibraryFolderKey(videos);
  const resultsByKey = new Map<string, LibrarySearchEntry<Video, Progress>>();
  const results: Array<LibrarySearchEntry<Video, Progress>> = [];

  matchIds.forEach((id, index) => {
    const video = videoById.get(id);
    if (!video) return;
    const score = 100 - index;
    if (context.mode === "special") {
      if (resultsByKey.has(video.id)) return;
      const result = createLibraryVideoResult(video, score, "AI 推荐", context);
      resultsByKey.set(video.id, result);
      results.push(result);
      return;
    }

    const key = libraryFolderKeyForVideo(video);
    if (resultsByKey.has(key)) return;
    const result = createLibraryFolderResult(folderVideosByKey.get(key) ?? [video], video, score, "AI 推荐", context);
    resultsByKey.set(key, result);
    results.push(result);
  });

  return results;
}
