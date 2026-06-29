import type { VideoItem, VideoTagStore, WatchActivityItem, WatchActivityStore } from "./playerTypes";
import { normalizeTagKey } from "./tagUtils";

export type WatchActivityMetric = "watched" | "plays" | "completed" | "emission";
export type WatchActivityRange = 30 | 90 | 365;

export type WatchActivityDayInsight = {
  date: string;
  watchedSeconds: number;
  playCount: number;
  completedCount: number;
  emissionCount: number;
  videoIds: string[];
};

export type WatchActivityTagInsight = {
  key: string;
  tag: string;
  watchedSeconds: number;
  playCount: number;
  completedCount: number;
  emissionCount: number;
  videoIds: string[];
};

export type WatchActivityInsights = {
  rangeDays: number;
  days: WatchActivityDayInsight[];
  activeDays: number;
  maxMetricValue: number;
  totalWatchedSeconds: number;
  totalPlayCount: number;
  totalCompletedCount: number;
  totalEmissionCount: number;
  topTags: WatchActivityTagInsight[];
};

export type WatchActivityMonthGroup = {
  key: string;
  label: string;
  leadingEmptyDays: number;
  activeDays: number;
  days: WatchActivityDayInsight[];
};

const dateKeyPattern = /^\d{4}-\d{2}-\d{2}$/;

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

export function createLocalDateKey(timestamp = Date.now()) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}

export function isValidWatchActivityDate(date: string) {
  return dateKeyPattern.test(date);
}

export function createWatchActivityKey(date: string, videoId: string) {
  return `${date}::${videoId}`;
}

export function getWatchActivityMetricValue(day: WatchActivityDayInsight, metric: WatchActivityMetric) {
  if (metric === "plays") return day.playCount;
  if (metric === "completed") return day.completedCount;
  if (metric === "emission") return day.emissionCount;
  return day.watchedSeconds;
}

function hasWatchActivity(day: WatchActivityDayInsight) {
  return day.watchedSeconds > 0 || day.playCount > 0 || day.completedCount > 0 || day.emissionCount > 0;
}

function getMondayFirstWeekdayIndex(date: Date) {
  return (date.getDay() + 6) % 7;
}

export function groupWatchActivityDaysByMonth(days: WatchActivityDayInsight[]): WatchActivityMonthGroup[] {
  const groups: WatchActivityMonthGroup[] = [];
  const groupByKey = new Map<string, WatchActivityMonthGroup>();

  days.forEach((day) => {
    const key = day.date.slice(0, 7);
    let group = groupByKey.get(key);
    if (!group) {
      const monthNumber = Number(day.date.slice(5, 7));
      const monthStart = new Date(`${key}-01T00:00:00`);
      group = {
        key,
        label: Number.isFinite(monthNumber) ? `${monthNumber}月` : key,
        leadingEmptyDays: Number.isNaN(monthStart.getTime()) ? 0 : getMondayFirstWeekdayIndex(monthStart),
        activeDays: 0,
        days: [],
      };
      groupByKey.set(key, group);
      groups.push(group);
    }
    group.days.push(day);
    if (hasWatchActivity(day)) group.activeDays += 1;
  });

  return groups;
}

function createEmptyDay(date: string): WatchActivityDayInsight {
  return {
    date,
    watchedSeconds: 0,
    playCount: 0,
    completedCount: 0,
    emissionCount: 0,
    videoIds: [],
  };
}

function addDays(date: Date, delta: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + delta);
  return next;
}

function createDateRange(rangeDays: number, todayKey: string) {
  const today = new Date(`${todayKey}T00:00:00`);
  const dates: string[] = [];
  for (let offset = rangeDays - 1; offset >= 0; offset -= 1) {
    dates.push(createLocalDateKey(addDays(today, -offset).getTime()));
  }
  return dates;
}

function addUniqueVideoId(videoIds: string[], videoId: string) {
  if (!videoIds.includes(videoId)) videoIds.push(videoId);
}

export function buildWatchActivityInsights(
  activityStore: WatchActivityStore,
  videos: VideoItem[],
  videoTags: VideoTagStore,
  options: {
    rangeDays?: WatchActivityRange;
    metric?: WatchActivityMetric;
    today?: string;
    tagLimit?: number;
  } = {},
): WatchActivityInsights {
  const rangeDays = options.rangeDays ?? 90;
  const metric = options.metric ?? "watched";
  const today = options.today && isValidWatchActivityDate(options.today) ? options.today : createLocalDateKey();
  const tagLimit = options.tagLimit ?? 8;
  const videoIds = new Set(videos.map((video) => video.id));
  const daysByDate = new Map(createDateRange(rangeDays, today).map((date) => [date, createEmptyDay(date)]));
  const tagStatsByKey = new Map<string, WatchActivityTagInsight>();

  Object.values(activityStore).forEach((item) => {
    if (!videoIds.has(item.videoId)) return;
    const day = daysByDate.get(item.date);
    if (!day) return;
    day.watchedSeconds += item.watchedSeconds;
    day.playCount += item.playCount;
    day.completedCount += item.completedCount;
    day.emissionCount += item.emissionCount;
    addUniqueVideoId(day.videoIds, item.videoId);

    const seenTagKeys = new Set<string>();
    (videoTags[item.videoId] ?? []).forEach((tag) => {
      const key = normalizeTagKey(tag);
      if (!key || seenTagKeys.has(key)) return;
      seenTagKeys.add(key);
      const existing = tagStatsByKey.get(key);
      if (existing) {
        existing.watchedSeconds += item.watchedSeconds;
        existing.playCount += item.playCount;
        existing.completedCount += item.completedCount;
        existing.emissionCount += item.emissionCount;
        addUniqueVideoId(existing.videoIds, item.videoId);
        return;
      }
      tagStatsByKey.set(key, {
        key,
        tag,
        watchedSeconds: item.watchedSeconds,
        playCount: item.playCount,
        completedCount: item.completedCount,
        emissionCount: item.emissionCount,
        videoIds: [item.videoId],
      });
    });
  });

  const days = Array.from(daysByDate.values());
  days.forEach((day) => {
    day.videoIds.sort((a, b) => {
      const aActivity = activityStore[createWatchActivityKey(day.date, a)];
      const bActivity = activityStore[createWatchActivityKey(day.date, b)];
      return (bActivity?.watchedSeconds ?? 0) - (aActivity?.watchedSeconds ?? 0);
    });
  });
  const totalWatchedSeconds = days.reduce((sum, day) => sum + day.watchedSeconds, 0);
  const totalPlayCount = days.reduce((sum, day) => sum + day.playCount, 0);
  const totalCompletedCount = days.reduce((sum, day) => sum + day.completedCount, 0);
  const totalEmissionCount = days.reduce((sum, day) => sum + day.emissionCount, 0);
  const maxMetricValue = days.reduce((max, day) => Math.max(max, getWatchActivityMetricValue(day, metric)), 0);
  const activeDays = days.filter(hasWatchActivity).length;
  const topTags = Array.from(tagStatsByKey.values())
    .filter((tag) => {
      if (metric === "plays") return tag.playCount > 0;
      if (metric === "completed") return tag.completedCount > 0;
      if (metric === "emission") return tag.emissionCount > 0;
      return tag.watchedSeconds > 0;
    })
    .sort((a, b) => {
      const aValue =
        metric === "plays" ? a.playCount : metric === "completed" ? a.completedCount : metric === "emission" ? a.emissionCount : a.watchedSeconds;
      const bValue =
        metric === "plays" ? b.playCount : metric === "completed" ? b.completedCount : metric === "emission" ? b.emissionCount : b.watchedSeconds;
      return bValue - aValue || a.tag.localeCompare(b.tag, "zh-Hans-CN", { numeric: true });
    })
    .slice(0, tagLimit);

  return {
    rangeDays,
    days,
    activeDays,
    maxMetricValue,
    totalWatchedSeconds,
    totalPlayCount,
    totalCompletedCount,
    totalEmissionCount,
    topTags,
  };
}
