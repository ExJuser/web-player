import { Converter } from "opencc-js/t2cn";

const traditionalToSimplified = Converter({ from: "tw", to: "cn" });

export type PlaylistSearchField = "title" | "path" | "series" | "tag" | "actor" | "comment" | "library";

export type PlaylistSearchRecord = {
  id: string;
  title: string;
  path: string;
  series?: string;
  tags?: string[];
  actors?: string[];
  actorAliases?: string[];
  comment?: string;
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
  entries: Array<{
    field: PlaylistSearchField;
    value: string;
    normalizedValue: string;
  }>;
};

export type PlaylistSearchToken = {
  raw: string;
  normalized: string;
};

const fieldLabels: Record<Exclude<PlaylistSearchField, "title">, string> = {
  path: "路径",
  series: "剧集",
  tag: "标签",
  actor: "演员",
  comment: "备注",
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
  const pattern = /"([^"]*)"|([^\s"]+)/gu;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(query)) !== null) {
    const raw = (match[1] ?? match[2] ?? "").trim();
    const normalized = normalizePlaylistSearchText(raw);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    tokens.push({ raw, normalized });
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
  addValues("library", [record.library]);

  return { videoId: record.id, entries };
}

export function searchPlaylistVideos<Video extends { id: string }>(
  videos: Video[],
  documentsByVideoId: ReadonlyMap<string, PlaylistSearchDocument>,
  query: string,
) {
  const tokens = parsePlaylistSearchQuery(query);
  const matchesByVideoId = new Map<string, PlaylistSearchMatch>();
  if (!tokens.length) return { videos, matchesByVideoId, tokens };

  const matchingVideos = videos.filter((video) => {
    const document = documentsByVideoId.get(video.id);
    if (!document) return false;
    const matchesByToken = tokens.map((token) =>
      document.entries.filter((entry) => entry.normalizedValue.includes(token.normalized)),
    );
    if (matchesByToken.some((matches) => !matches.length)) return false;

    const reasons: PlaylistSearchReason[] = [];
    const seenReasons = new Set<string>();
    matchesByToken.forEach((entries) => {
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
