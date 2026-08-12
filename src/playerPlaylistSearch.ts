import { Converter } from "opencc-js/t2cn";

const traditionalToSimplified = Converter({ from: "tw", to: "cn" });

export type PlaylistSearchField = "title" | "path" | "series" | "tag" | "actor" | "comment" | "highlight" | "library";

export type PlaylistSearchRecord = {
  id: string;
  title: string;
  path: string;
  score?: number;
  series?: string;
  tags?: string[];
  actors?: string[];
  actorAliases?: string[];
  comment?: string;
  highlightDescriptions?: string[];
  library?: string;
};

export type PlaylistSearchReason = {
  field: Exclude<PlaylistSearchField, "title">;
  label: string;
  value: string;
};

export type PlaylistSearchMatch = {
  reasons: PlaylistSearchReason[];
};

export type PlaylistSearchDocument = {
  videoId: string;
  score?: number;
  normalizedTags: string[];
  entries: Array<{
    field: PlaylistSearchField;
    value: string;
    normalizedValue: string;
  }>;
};

export type PlaylistSearchToken = {
  raw: string;
  normalized: string;
  orGroup: number;
};

const fieldLabels: Record<Exclude<PlaylistSearchField, "title">, string> = {
  path: "路径",
  series: "剧集",
  tag: "标签",
  actor: "演员",
  comment: "备注",
  highlight: "高能片段",
  library: "媒体库",
};

export function normalizePlaylistSearchText(value: string) {
  const normalized = value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\\／]/gu, "/")
    .replace(/\s+/gu, " ")
    .trim();
  return traditionalToSimplified(normalized);
}

export function parsePlaylistSearchQuery(query: string): PlaylistSearchToken[] {
  const tokens: PlaylistSearchToken[] = [];
  const seen = new Set<string>();
  const pattern = /"([^"]*)"|(\|)|([^\s"|]+)/gu;
  let match: RegExpExecArray | null;
  let joinPreviousGroup = false;
  let nextGroup = 0;

  while ((match = pattern.exec(query)) !== null) {
    if (match[2]) {
      joinPreviousGroup = tokens.length > 0;
      continue;
    }
    const raw = (match[1] ?? match[3] ?? "").trim();
    const normalized = normalizePlaylistSearchText(raw);
    const scoreMatch = /^(?:>=|<=|>|<)(\d+(?:\.\d+)?)$/u.exec(normalized);
    const isValidScoreFilter = scoreMatch && Number(scoreMatch[1]) >= 0 && Number(scoreMatch[1]) <= 10;
    if (match[1] === undefined && (/^-(?!$).+/u.test(normalized) || isValidScoreFilter)) {
      joinPreviousGroup = false;
      continue;
    }
    if (!normalized || seen.has(normalized)) {
      joinPreviousGroup = false;
      continue;
    }
    seen.add(normalized);
    const orGroup = joinPreviousGroup ? tokens[tokens.length - 1].orGroup : nextGroup++;
    tokens.push({ raw, normalized, orGroup });
    joinPreviousGroup = false;
  }

  return tokens;
}

export function createPlaylistSearchDocuments(records: PlaylistSearchRecord[]) {
  return new Map(records.map((record) => [record.id, createPlaylistSearchDocument(record)]));
}

function createPlaylistSearchDocument(record: PlaylistSearchRecord): PlaylistSearchDocument {
  const entries: PlaylistSearchDocument["entries"] = [];
  const addValues = (field: PlaylistSearchField, values: Array<string | undefined>) => {
    values.forEach((value) => {
      const trimmedValue = value?.trim();
      if (!trimmedValue) return;
      entries.push({ field, value: trimmedValue, normalizedValue: normalizePlaylistSearchText(trimmedValue) });
    });
  };

  addValues("title", [record.title]);
  addValues("path", [record.path]);
  addValues("series", [record.series]);
  addValues("tag", record.tags ?? []);
  addValues("actor", [...(record.actors ?? []), ...(record.actorAliases ?? [])]);
  addValues("comment", [record.comment]);
  addValues("highlight", record.highlightDescriptions ?? []);
  addValues("library", [record.library]);

  return {
    videoId: record.id,
    score: record.score,
    normalizedTags: (record.tags ?? []).map(normalizePlaylistSearchText),
    entries,
  };
}

type PlaylistScoreFilter = {
  operator: ">" | ">=" | "<" | "<=";
  value: number;
};

function parsePlaylistSearchFilters(query: string) {
  const excludedTags: string[] = [];
  const scoreFilters: PlaylistScoreFilter[] = [];
  const pattern = /"([^"]*)"|([^\s"]+)/gu;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(query)) !== null) {
    if (match[1] !== undefined) continue;
    const normalized = normalizePlaylistSearchText(match[2] ?? "");
    if (/^-(?!$).+/u.test(normalized)) {
      excludedTags.push(normalized.slice(1));
      continue;
    }

    const scoreMatch = /^(>=|<=|>|<)(\d+(?:\.\d+)?)$/u.exec(normalized);
    if (!scoreMatch) continue;
    const value = Number(scoreMatch[2]);
    if (value < 0 || value > 10) continue;
    scoreFilters.push({ operator: scoreMatch[1] as PlaylistScoreFilter["operator"], value });
  }

  return { excludedTags, scoreFilters };
}

function matchesScoreFilters(score: number | undefined, filters: PlaylistScoreFilter[]) {
  if (!filters.length) return true;
  if (typeof score !== "number") return false;
  return filters.every(({ operator, value }) => {
    if (operator === ">") return score > value;
    if (operator === ">=") return score >= value;
    if (operator === "<") return score < value;
    return score <= value;
  });
}

export function searchPlaylistVideos<Video extends { id: string }>(
  videos: Video[],
  documentsByVideoId: ReadonlyMap<string, PlaylistSearchDocument>,
  query: string,
) {
  const tokens = parsePlaylistSearchQuery(query);
  const { excludedTags, scoreFilters } = parsePlaylistSearchFilters(query);
  const matchesByVideoId = new Map<string, PlaylistSearchMatch>();
  if (!tokens.length && !excludedTags.length && !scoreFilters.length) return { videos, matchesByVideoId, tokens };
  const requiredGroupCount = new Set(tokens.map((token) => token.orGroup)).size;

  const matchingVideos = videos.filter((video) => {
    const document = documentsByVideoId.get(video.id);
    if (!document) return false;
    if (excludedTags.some((tag) => document.normalizedTags.includes(tag))) return false;
    if (!matchesScoreFilters(document.score, scoreFilters)) return false;
    const matchesByToken = tokens.map((token) => ({
      entries: document.entries.filter((entry) => entry.normalizedValue.includes(token.normalized)),
      orGroup: token.orGroup,
    }));
    const matchedGroups = new Set(matchesByToken.filter(({ entries }) => entries.length).map(({ orGroup }) => orGroup));
    if (matchedGroups.size < requiredGroupCount) return false;

    const reasons: PlaylistSearchReason[] = [];
    const seenReasons = new Set<string>();
    matchesByToken.forEach(({ entries }) => {
      if (entries.some((entry) => entry.field === "title")) return;
      entries.forEach((entry) => {
        if (entry.field === "title") return;
        const key = `${entry.field}:${entry.normalizedValue}`;
        if (seenReasons.has(key)) return;
        seenReasons.add(key);
        reasons.push({ field: entry.field, label: fieldLabels[entry.field], value: entry.value });
      });
    });

    matchesByVideoId.set(video.id, { reasons });
    return true;
  });

  return { videos: matchingVideos, matchesByVideoId, tokens };
}
