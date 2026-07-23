import type { VideoItem, WatchActivityItem, WatchActivityStore } from "./playerTypes";

export type VideoGrowthRingSort = "recent" | "watched" | "activeDays" | "plays" | "title";

export type VideoGrowthRingLayer = {
  key: string;
  startDate: string;
  endDate: string;
  activeDays: number;
  gapDays: number;
  watchedSeconds: number;
  playCount: number;
  completedCount: number;
  emissionCount: number;
  seed: number;
};

export type VideoGrowthRing = {
  video: VideoItem;
  firstWatchedDate: string;
  lastWatchedDate: string;
  activeDays: number;
  totalWatchedSeconds: number;
  totalPlayCount: number;
  totalCompletedCount: number;
  totalEmissionCount: number;
  seed: number;
  forestLayers: VideoGrowthRingLayer[];
  detailLayers: VideoGrowthRingLayer[];
};

export type VideoGrowthRingForest = {
  rings: VideoGrowthRing[];
  totalWatchedSeconds: number;
  activeDays: number;
  firstWatchedDate: string | null;
  lastWatchedDate: string | null;
};

const dateKeyPattern = /^\d{4}-\d{2}-\d{2}$/;

function finitePositive(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function wholePositive(value: number) {
  return Math.floor(finitePositive(value));
}

function isValidActivity(item: WatchActivityItem) {
  return dateKeyPattern.test(item.date)
    && Boolean(item.videoId)
    && (
      finitePositive(item.watchedSeconds) > 0
      || wholePositive(item.playCount) > 0
      || wholePositive(item.completedCount) > 0
      || wholePositive(item.emissionCount) > 0
    );
}

function dateDistanceInDays(from: string, to: string) {
  const fromTime = new Date(`${from}T00:00:00`).getTime();
  const toTime = new Date(`${to}T00:00:00`).getTime();
  if (!Number.isFinite(fromTime) || !Number.isFinite(toTime)) return 0;
  return Math.max(0, Math.round((toTime - fromTime) / 86_400_000) - 1);
}

export function createGrowthRingSeed(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededUnit(seed: number, index: number) {
  let value = seed ^ Math.imul(index + 1, 0x9e3779b1);
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return (value >>> 0) / 4_294_967_295;
}

export function createOrganicGrowthRingPath(radius: number, seed: number, pointCount = 40) {
  const points = Math.max(12, Math.floor(pointCount));
  const coordinates = Array.from({ length: points }, (_, index) => {
    const angle = (Math.PI * 2 * index) / points - Math.PI / 2;
    const lowFrequency = Math.sin(angle * 3 + seededUnit(seed, 1) * Math.PI * 2) * radius * 0.012;
    const jitter = (seededUnit(seed, index + 2) - 0.5) * radius * 0.018;
    const nextRadius = radius + lowFrequency + jitter;
    return [
      150 + Math.cos(angle) * nextRadius,
      150 + Math.sin(angle) * nextRadius,
    ];
  });
  return `${coordinates.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ")} Z`;
}

function mergeActivity(current: WatchActivityItem | undefined, activity: WatchActivityItem): WatchActivityItem {
  if (!current) {
    return {
      ...activity,
      watchedSeconds: finitePositive(activity.watchedSeconds),
      playCount: wholePositive(activity.playCount),
      completedCount: wholePositive(activity.completedCount),
      emissionCount: wholePositive(activity.emissionCount),
    };
  }
  return {
    ...current,
    watchedSeconds: current.watchedSeconds + finitePositive(activity.watchedSeconds),
    playCount: current.playCount + wholePositive(activity.playCount),
    completedCount: current.completedCount + wholePositive(activity.completedCount),
    emissionCount: current.emissionCount + wholePositive(activity.emissionCount),
    updatedAt: Math.max(current.updatedAt, activity.updatedAt),
  };
}

function createDailyLayers(videoId: string, activities: WatchActivityItem[]): VideoGrowthRingLayer[] {
  let previousDate: string | null = null;
  return activities
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((activity) => {
      const layer = {
        key: activity.date,
        startDate: activity.date,
        endDate: activity.date,
        activeDays: 1,
        gapDays: previousDate ? dateDistanceInDays(previousDate, activity.date) : 0,
        watchedSeconds: finitePositive(activity.watchedSeconds),
        playCount: wholePositive(activity.playCount),
        completedCount: wholePositive(activity.completedCount),
        emissionCount: wholePositive(activity.emissionCount),
        seed: createGrowthRingSeed(`${videoId}:${activity.date}`),
      };
      previousDate = activity.date;
      return layer;
    });
}

export function compactGrowthRingLayers(
  layers: VideoGrowthRingLayer[],
  maxLayers: number,
  videoId = "",
): VideoGrowthRingLayer[] {
  const groupCount = Math.min(layers.length, Math.max(1, Math.floor(maxLayers)));
  if (!groupCount) return [];
  if (groupCount === layers.length) return layers.map((layer) => ({ ...layer }));

  const compacted: VideoGrowthRingLayer[] = [];
  for (let groupIndex = 0; groupIndex < groupCount; groupIndex += 1) {
    const startIndex = Math.floor((groupIndex * layers.length) / groupCount);
    const endIndex = Math.floor(((groupIndex + 1) * layers.length) / groupCount);
    const group = layers.slice(startIndex, endIndex);
    const first = group[0];
    const last = group[group.length - 1];
    const previous = compacted.at(-1);
    compacted.push({
      key: `${first.startDate}:${last.endDate}`,
      startDate: first.startDate,
      endDate: last.endDate,
      activeDays: group.reduce((sum, layer) => sum + layer.activeDays, 0),
      gapDays: previous ? dateDistanceInDays(previous.endDate, first.startDate) : 0,
      watchedSeconds: group.reduce((sum, layer) => sum + layer.watchedSeconds, 0),
      playCount: group.reduce((sum, layer) => sum + layer.playCount, 0),
      completedCount: group.reduce((sum, layer) => sum + layer.completedCount, 0),
      emissionCount: group.reduce((sum, layer) => sum + layer.emissionCount, 0),
      seed: createGrowthRingSeed(`${videoId}:${first.startDate}:${last.endDate}`),
    });
  }
  return compacted;
}

export function buildVideoGrowthRingForest(
  activityStore: WatchActivityStore,
  videos: VideoItem[],
  options: { forestLayerLimit?: number; detailLayerLimit?: number } = {},
): VideoGrowthRingForest {
  const videoById = new Map(videos.map((video) => [video.id, video]));
  const activitiesByVideo = new Map<string, Map<string, WatchActivityItem>>();
  const uniqueActiveDates = new Set<string>();

  Object.values(activityStore).forEach((activity) => {
    if (!videoById.has(activity.videoId) || !isValidActivity(activity)) return;
    const byDate = activitiesByVideo.get(activity.videoId) ?? new Map<string, WatchActivityItem>();
    byDate.set(activity.date, mergeActivity(byDate.get(activity.date), activity));
    activitiesByVideo.set(activity.videoId, byDate);
    uniqueActiveDates.add(activity.date);
  });

  const forestLayerLimit = options.forestLayerLimit ?? 24;
  const detailLayerLimit = options.detailLayerLimit ?? 96;
  const rings = Array.from(activitiesByVideo.entries()).flatMap(([videoId, activitiesByDate]) => {
    const video = videoById.get(videoId);
    if (!video) return [];
    const dailyLayers = createDailyLayers(videoId, Array.from(activitiesByDate.values()));
    if (!dailyLayers.length) return [];
    return [{
      video,
      firstWatchedDate: dailyLayers[0].startDate,
      lastWatchedDate: dailyLayers.at(-1)?.endDate ?? dailyLayers[0].endDate,
      activeDays: dailyLayers.length,
      totalWatchedSeconds: dailyLayers.reduce((sum, layer) => sum + layer.watchedSeconds, 0),
      totalPlayCount: dailyLayers.reduce((sum, layer) => sum + layer.playCount, 0),
      totalCompletedCount: dailyLayers.reduce((sum, layer) => sum + layer.completedCount, 0),
      totalEmissionCount: dailyLayers.reduce((sum, layer) => sum + layer.emissionCount, 0),
      seed: createGrowthRingSeed(videoId),
      forestLayers: compactGrowthRingLayers(dailyLayers, forestLayerLimit, videoId),
      detailLayers: compactGrowthRingLayers(dailyLayers, detailLayerLimit, videoId),
    }];
  });

  const sortedByDate = [...rings].sort((a, b) => a.firstWatchedDate.localeCompare(b.firstWatchedDate));
  return {
    rings,
    totalWatchedSeconds: rings.reduce((sum, ring) => sum + ring.totalWatchedSeconds, 0),
    activeDays: uniqueActiveDates.size,
    firstWatchedDate: sortedByDate[0]?.firstWatchedDate ?? null,
    lastWatchedDate: rings.reduce<string | null>(
      (latest, ring) => !latest || ring.lastWatchedDate > latest ? ring.lastWatchedDate : latest,
      null,
    ),
  };
}

export function sortVideoGrowthRings(rings: VideoGrowthRing[], sort: VideoGrowthRingSort) {
  return [...rings].sort((a, b) => {
    if (sort === "watched") return b.totalWatchedSeconds - a.totalWatchedSeconds || a.video.name.localeCompare(b.video.name, "zh-Hans-CN", { numeric: true });
    if (sort === "activeDays") return b.activeDays - a.activeDays || b.totalWatchedSeconds - a.totalWatchedSeconds;
    if (sort === "plays") return b.totalPlayCount - a.totalPlayCount || b.totalWatchedSeconds - a.totalWatchedSeconds;
    if (sort === "title") return a.video.name.localeCompare(b.video.name, "zh-Hans-CN", { numeric: true });
    return b.lastWatchedDate.localeCompare(a.lastWatchedDate) || b.totalWatchedSeconds - a.totalWatchedSeconds;
  });
}
