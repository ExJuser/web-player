import { isUnknownActorName, normalizeActorKey } from "./actorNfoCore.mjs";
import { createVideoStatsKey } from "./playerUiState";
import { normalizeTagKey } from "./tagUtils";
import type {
  ActorProfile,
  ActorProfileStore,
  ActorSource,
  ActorTagDefinitionStore,
  VideoActorOverrideStore,
  VideoItem,
  VideoStatsStore,
  VideoTagStore,
  WatchActivityStore,
} from "./playerTypes";

export type ResolvedVideoActors = {
  actorIds: string[];
  source: ActorSource | null;
};

export type ActorVideoEntry = {
  video: VideoItem;
  source: ActorSource;
  lastWatchedAt: number | null;
};

export type ActorInsight = {
  actor: ActorProfile;
  videos: ActorVideoEntry[];
  latestModified: number;
  representativeVideo: VideoItem;
  commonTags: string[];
  stats: {
    emissionCount: number;
    playCount: number;
    totalPlayedSeconds: number;
    lastWatchedAt: number | null;
  };
};

function createActorId(key: string) {
  return `actor:${key}`;
}

export function createActorAliasIndex(profiles: ActorProfileStore) {
  const index = new Map<string, string>();
  Object.values(profiles).forEach((profile) => {
    profile.aliases.forEach((alias) => {
      if (alias.key) index.set(alias.key, profile.id);
    });
    const nameKey = normalizeActorKey(profile.name);
    if (nameKey) index.set(nameKey, profile.id);
  });
  return index;
}

function ensureActorProfile(
  profiles: ActorProfileStore,
  aliasIndex: Map<string, string>,
  label: string,
  timestamp: number,
) {
  if (isUnknownActorName(label)) return null;
  const key = normalizeActorKey(label);
  if (!key) return null;
  const existingId = aliasIndex.get(key);
  if (existingId) return existingId;
  const id = createActorId(key);
  const existingProfile = profiles[id];
  profiles[id] = existingProfile ?? {
    id,
    name: label.trim(),
    aliases: [{ key, label: label.trim() }],
    updatedAt: timestamp,
  };
  aliasIndex.set(key, id);
  return id;
}

export function addActorProfile(profiles: ActorProfileStore, label: string, now = Date.now()) {
  const nextProfiles: ActorProfileStore = Object.fromEntries(
    Object.entries(profiles).map(([id, profile]) => [id, { ...profile, aliases: [...profile.aliases] }]),
  );
  const actorId = ensureActorProfile(nextProfiles, createActorAliasIndex(nextProfiles), label, now);
  return { profiles: nextProfiles, actorId };
}

export function addActorNamesToSelection(input: {
  profiles: ActorProfileStore;
  actorIds: string[];
  names: string[];
  now?: number;
}) {
  const profiles: ActorProfileStore = Object.fromEntries(
    Object.entries(input.profiles)
      .filter(([, profile]) => !isUnknownActorName(profile.name))
      .map(([id, profile]) => [id, { ...profile, aliases: [...profile.aliases] }]),
  );
  const aliasIndex = createActorAliasIndex(profiles);
  const actorIds = new Set(input.actorIds.filter((actorId) => Boolean(profiles[actorId])));
  const timestamp = input.now ?? Date.now();
  input.names.forEach((name) => {
    const actorId = ensureActorProfile(profiles, aliasIndex, name, timestamp);
    if (actorId) actorIds.add(actorId);
  });
  return { profiles, actorIds: Array.from(actorIds) };
}

export function reconcileActorProfiles(input: {
  profiles: ActorProfileStore;
  videos: VideoItem[];
  videoTags: VideoTagStore;
  actorTagDefinitions: ActorTagDefinitionStore;
  now?: number;
}) {
  const profiles: ActorProfileStore = Object.fromEntries(
    Object.entries(input.profiles)
      .filter(([, profile]) => !isUnknownActorName(profile.name))
      .map(([id, profile]) => [id, { ...profile, aliases: [...profile.aliases] }]),
  );
  const aliasIndex = createActorAliasIndex(profiles);
  const timestamp = input.now ?? Date.now();
  input.videos.forEach((video) => {
    video.actorHints?.names.forEach((name) => ensureActorProfile(profiles, aliasIndex, name, timestamp));
    (input.videoTags[video.id] ?? []).forEach((tag) => {
      if (input.actorTagDefinitions[normalizeTagKey(tag)]) ensureActorProfile(profiles, aliasIndex, tag, timestamp);
    });
  });
  return profiles;
}

export function resolveVideoActors(input: {
  video: VideoItem;
  profiles: ActorProfileStore;
  videoTags: VideoTagStore;
  actorTagDefinitions: ActorTagDefinitionStore;
  videoActorOverrides: VideoActorOverrideStore;
}): ResolvedVideoActors {
  return resolveVideoActorsWithAliasIndex(input, createActorAliasIndex(input.profiles));
}

function resolveVideoActorsWithAliasIndex(
  input: {
    video: VideoItem;
    profiles: ActorProfileStore;
    videoTags: VideoTagStore;
    actorTagDefinitions: ActorTagDefinitionStore;
    videoActorOverrides: VideoActorOverrideStore;
  },
  aliasIndex: ReadonlyMap<string, string>,
): ResolvedVideoActors {
  const override = input.videoActorOverrides[input.video.id];
  if (override) {
    return {
      actorIds: Array.from(new Set(override.actorIds.filter((actorId) => Boolean(input.profiles[actorId])))),
      source: "manual",
    };
  }

  const nfoActorIds = (input.video.actorHints?.names ?? [])
    .map((name) => aliasIndex.get(normalizeActorKey(name)))
    .filter((actorId): actorId is string => Boolean(actorId));
  if (nfoActorIds.length) return { actorIds: Array.from(new Set(nfoActorIds)), source: "nfo" };

  const tagActorIds = (input.videoTags[input.video.id] ?? [])
    .filter((tag) => Boolean(input.actorTagDefinitions[normalizeTagKey(tag)]))
    .map((tag) => aliasIndex.get(normalizeActorKey(tag)))
    .filter((actorId): actorId is string => Boolean(actorId));
  if (tagActorIds.length) return { actorIds: Array.from(new Set(tagActorIds)), source: "tag" };
  return { actorIds: [], source: null };
}

export function buildActorInsights(input: {
  videos: VideoItem[];
  profiles: ActorProfileStore;
  videoTags: VideoTagStore;
  actorTagDefinitions: ActorTagDefinitionStore;
  videoActorOverrides: VideoActorOverrideStore;
  videoStats?: VideoStatsStore;
  watchActivity?: WatchActivityStore;
}) {
  const entriesByActor = new Map<string, ActorVideoEntry[]>();
  const unresolvedVideos: VideoItem[] = [];
  const lastWatchedAtByVideoId = new Map<string, number>();
  Object.values(input.watchActivity ?? {}).forEach((activity) => {
    if (activity.watchedSeconds <= 0 && activity.playCount <= 0) return;
    const previous = lastWatchedAtByVideoId.get(activity.videoId) ?? 0;
    if (activity.updatedAt > previous) lastWatchedAtByVideoId.set(activity.videoId, activity.updatedAt);
  });
  const actorAliasIndex = createActorAliasIndex(input.profiles);
  input.videos.forEach((video) => {
    const resolved = resolveVideoActorsWithAliasIndex({ ...input, video }, actorAliasIndex);
    if (!resolved.actorIds.length || !resolved.source) {
      unresolvedVideos.push(video);
      return;
    }
    resolved.actorIds.forEach((actorId) => {
      const entries = entriesByActor.get(actorId) ?? [];
      entries.push({ video, source: resolved.source!, lastWatchedAt: lastWatchedAtByVideoId.get(video.id) ?? null });
      entriesByActor.set(actorId, entries);
    });
  });

  const actors: ActorInsight[] = [];
  entriesByActor.forEach((entries, actorId) => {
    const actor = input.profiles[actorId];
    if (!actor || !entries.length) return;
    const sortedEntries = [...entries].sort((a, b) => b.video.lastModified - a.video.lastModified);
    const tagCounts = new Map<string, { label: string; count: number }>();
    let emissionCount = 0;
    let playCount = 0;
    let totalPlayedSeconds = 0;
    let lastWatchedAt = 0;
    sortedEntries.forEach(({ video, lastWatchedAt: videoLastWatchedAt }) => {
      const seenTagKeys = new Set<string>();
      (input.videoTags[video.id] ?? []).forEach((tag) => {
        const key = normalizeTagKey(tag);
        if (!key || seenTagKeys.has(key) || input.actorTagDefinitions[key] || actorAliasIndex.has(normalizeActorKey(tag))) return;
        seenTagKeys.add(key);
        const current = tagCounts.get(key);
        tagCounts.set(key, { label: current?.label ?? tag, count: (current?.count ?? 0) + 1 });
      });
      const stats = input.videoStats?.[createVideoStatsKey(video)];
      emissionCount += stats?.emissionCount ?? 0;
      playCount += stats?.playCount ?? 0;
      totalPlayedSeconds += stats?.totalPlayedSeconds ?? 0;
      lastWatchedAt = Math.max(lastWatchedAt, videoLastWatchedAt ?? 0);
    });
    actors.push({
      actor,
      videos: sortedEntries,
      latestModified: sortedEntries[0].video.lastModified,
      representativeVideo: sortedEntries[0].video,
      commonTags: Array.from(tagCounts.values())
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" }))
        .slice(0, 5)
        .map((tag) => tag.label),
      stats: {
        emissionCount,
        playCount,
        totalPlayedSeconds,
        lastWatchedAt: lastWatchedAt || null,
      },
    });
  });
  return { actors, unresolvedVideos: unresolvedVideos.sort((a, b) => b.lastModified - a.lastModified) };
}
