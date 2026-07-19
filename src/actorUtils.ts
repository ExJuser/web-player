import { normalizeActorKey } from "./actorNfoCore.mjs";
import { normalizeTagKey } from "./tagUtils";
import type {
  ActorProfile,
  ActorProfileStore,
  ActorSource,
  ActorTagDefinitionStore,
  VideoActorOverrideStore,
  VideoItem,
  VideoTagStore,
} from "./playerTypes";

export type ResolvedVideoActors = {
  actorIds: string[];
  source: ActorSource | null;
};

export type ActorVideoEntry = {
  video: VideoItem;
  source: ActorSource;
};

export type ActorInsight = {
  actor: ActorProfile;
  videos: ActorVideoEntry[];
  latestModified: number;
  representativeVideo: VideoItem;
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

export function reconcileActorProfiles(input: {
  profiles: ActorProfileStore;
  videos: VideoItem[];
  videoTags: VideoTagStore;
  actorTagDefinitions: ActorTagDefinitionStore;
  now?: number;
}) {
  const profiles: ActorProfileStore = Object.fromEntries(
    Object.entries(input.profiles).map(([id, profile]) => [id, { ...profile, aliases: [...profile.aliases] }]),
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
  const override = input.videoActorOverrides[input.video.id];
  if (override) {
    return {
      actorIds: Array.from(new Set(override.actorIds.filter((actorId) => Boolean(input.profiles[actorId])))),
      source: "manual",
    };
  }

  const aliasIndex = createActorAliasIndex(input.profiles);
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
}) {
  const entriesByActor = new Map<string, ActorVideoEntry[]>();
  const unresolvedVideos: VideoItem[] = [];
  input.videos.forEach((video) => {
    const resolved = resolveVideoActors({ ...input, video });
    if (!resolved.actorIds.length || !resolved.source) {
      unresolvedVideos.push(video);
      return;
    }
    resolved.actorIds.forEach((actorId) => {
      const entries = entriesByActor.get(actorId) ?? [];
      entries.push({ video, source: resolved.source! });
      entriesByActor.set(actorId, entries);
    });
  });

  const actors: ActorInsight[] = [];
  entriesByActor.forEach((entries, actorId) => {
    const actor = input.profiles[actorId];
    if (!actor || !entries.length) return;
    const sortedEntries = [...entries].sort((a, b) => b.video.lastModified - a.video.lastModified);
    actors.push({
      actor,
      videos: sortedEntries,
      latestModified: sortedEntries[0].video.lastModified,
      representativeVideo: sortedEntries[0].video,
    });
  });
  return { actors, unresolvedVideos: unresolvedVideos.sort((a, b) => b.lastModified - a.lastModified) };
}

export function renameActorProfile(profiles: ActorProfileStore, actorId: string, nextName: string, now = Date.now()) {
  const profile = profiles[actorId];
  const key = normalizeActorKey(nextName);
  if (!profile || !key) return { profiles, conflictActorId: null };
  const aliasIndex = createActorAliasIndex(profiles);
  const conflictActorId = aliasIndex.get(key);
  if (conflictActorId && conflictActorId !== actorId) return { profiles, conflictActorId };
  const aliases = profile.aliases.some((alias) => alias.key === key)
    ? profile.aliases
    : [...profile.aliases, { key, label: nextName.trim() }];
  return {
    profiles: { ...profiles, [actorId]: { ...profile, name: nextName.trim(), aliases, updatedAt: now } },
    conflictActorId: null,
  };
}

export function mergeActorProfiles(input: {
  profiles: ActorProfileStore;
  videoActorOverrides: VideoActorOverrideStore;
  sourceActorId: string;
  targetActorId: string;
  now?: number;
}) {
  const source = input.profiles[input.sourceActorId];
  const target = input.profiles[input.targetActorId];
  if (!source || !target || source.id === target.id) return input;
  const seenAliases = new Set(target.aliases.map((alias) => alias.key));
  const aliases = [...target.aliases];
  source.aliases.forEach((alias) => {
    if (!seenAliases.has(alias.key)) aliases.push(alias);
  });
  const profiles = { ...input.profiles };
  profiles[target.id] = { ...target, aliases, updatedAt: input.now ?? Date.now() };
  delete profiles[source.id];
  const videoActorOverrides = Object.fromEntries(
    Object.entries(input.videoActorOverrides).map(([videoId, override]) => [
      videoId,
      {
        ...override,
        actorIds: Array.from(new Set(override.actorIds.map((id) => id === source.id ? target.id : id))),
      },
    ]),
  );
  return { profiles, videoActorOverrides, sourceActorId: input.sourceActorId, targetActorId: input.targetActorId };
}
