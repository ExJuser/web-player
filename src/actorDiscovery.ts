import type { ActorInsight } from "./actorUtils";
import type { VideoItem } from "./playerTypes";

export type ActorSort = "explore" | "name" | "count" | "recent" | "playCount" | "duration" | "emissionCount";

function hashActorDiscoveryValue(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function selectActorCoverVideo(entry: ActorInsight, seed: string, recentVideoIds: string[]): VideoItem {
  const candidates = entry.videos.map(({ video }) => video);
  if (candidates.length <= 1) return candidates[0] ?? entry.representativeVideo;
  const unseenCandidates = candidates.filter((video) => !recentVideoIds.includes(video.id));
  const candidatePool = unseenCandidates.length
    ? unseenCandidates
    : candidates.filter((video) => video.id !== recentVideoIds[0]);
  return candidatePool[hashActorDiscoveryValue(`${seed}:${entry.actor.id}`) % candidatePool.length] ?? entry.representativeVideo;
}

export function filterAndSortActors({
  actors,
  discoveryBatch,
  discoveryDateKey,
  discoveryScope,
  query,
  recentActorIds,
  sort,
  sortDirection,
}: {
  actors: ActorInsight[];
  discoveryBatch: number;
  discoveryDateKey: string;
  discoveryScope: string;
  query: string;
  recentActorIds: string[];
  sort: ActorSort;
  sortDirection: "asc" | "desc";
}) {
  const normalizedQuery = query.normalize("NFKC").trim().toLocaleLowerCase();
  const matchingActors = actors.filter((entry) =>
    !normalizedQuery
    || entry.actor.name.toLocaleLowerCase().includes(normalizedQuery)
    || entry.actor.aliases.some((alias) => alias.label.toLocaleLowerCase().includes(normalizedQuery))
  );
  const maxVideoCount = Math.max(1, ...matchingActors.map((entry) => entry.videos.length));
  const latestModified = Math.max(0, ...matchingActors.map((entry) => entry.latestModified));
  const earliestModified = Math.min(latestModified, ...matchingActors.map((entry) => entry.latestModified));
  const modifiedRange = Math.max(1, latestModified - earliestModified);
  const recentActorIdSet = new Set(recentActorIds);
  const discoverySeed = `${discoveryScope}:${discoveryDateKey}:${discoveryBatch}`;
  const direction = sortDirection === "asc" ? 1 : -1;

  const getDiscoveryScore = (entry: ActorInsight) => {
    const videoCountScore = Math.log1p(entry.videos.length) / Math.log1p(maxVideoCount);
    const recencyScore = (entry.latestModified - earliestModified) / modifiedRange;
    const unseenScore = recentActorIdSet.has(entry.actor.id) ? 0 : 1;
    const randomScore = hashActorDiscoveryValue(`${discoverySeed}:${entry.actor.id}`) / 0xffffffff;
    return videoCountScore * 0.4 + recencyScore * 0.25 + unseenScore * 0.2 + randomScore * 0.15;
  };

  return matchingActors.sort((a, b) => {
    const nameComparison = a.actor.name.localeCompare(b.actor.name, undefined, { numeric: true, sensitivity: "base" });
    if (sort === "explore") return getDiscoveryScore(b) - getDiscoveryScore(a) || nameComparison;
    if (sort === "name") return nameComparison * direction;
    if (sort === "recent") return (a.latestModified - b.latestModified) * direction || nameComparison;
    if (sort === "playCount") return (a.stats.playCount - b.stats.playCount) * direction || nameComparison;
    if (sort === "duration") return (a.stats.totalPlayedSeconds - b.stats.totalPlayedSeconds) * direction || nameComparison;
    if (sort === "emissionCount") return (a.stats.emissionCount - b.stats.emissionCount) * direction || nameComparison;
    return (a.videos.length - b.videos.length) * direction || nameComparison;
  });
}
