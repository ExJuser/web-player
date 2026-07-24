import type { VideoItem, VideoTagStore, WatchActivityStore } from "./playerTypes";
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

export const watchActivityRangeOptions: Array<{ value: WatchActivityRange; label: string }> = [
  { value: 30, label: "30 天" },
  { value: 90, label: "90 天" },
  { value: 365, label: "365 天" },
];

export const watchActivityMetricOptions: Array<{ value: WatchActivityMetric; label: string }> = [
  { value: "watched", label: "时长" },
  { value: "plays", label: "次数" },
  { value: "completed", label: "完成" },
  { value: "emission", label: "发射" },
];

export const watchActivityWeekdayLabels = ["一", "二", "三", "四", "五", "六", "日"];

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

export function getWatchActivityMetricValue(
  activity: Pick<WatchActivityDayInsight, "watchedSeconds" | "playCount" | "completedCount" | "emissionCount">,
  metric: WatchActivityMetric,
) {
  if (metric === "plays") return activity.playCount;
  if (metric === "completed") return activity.completedCount;
  if (metric === "emission") return activity.emissionCount;
  return activity.watchedSeconds;
}

export function formatWatchActivityDate(date: string) {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("zh-Hans-CN", { month: "numeric", day: "numeric", weekday: "short" });
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
  const spansMultipleYears = new Set(days.map((day) => day.date.slice(0, 4))).size > 1;

  days.forEach((day) => {
    const key = day.date.slice(0, 7);
    let group = groupByKey.get(key);
    if (!group) {
      const monthNumber = Number(day.date.slice(5, 7));
      const monthStart = new Date(`${key}-01T00:00:00`);
      group = {
        key,
        label: Number.isFinite(monthNumber)
          ? `${spansMultipleYears ? `${day.date.slice(0, 4)}年` : ""}${monthNumber}月`
          : key,
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

export function buildWatchActivityInsights(
  activityStore: WatchActivityStore,
  videos: VideoItem[],
  videoTags: VideoTagStore,
  options: {
    rangeDays?: WatchActivityRange;
    metric?: WatchActivityMetric;
    today?: string;
    tagLimit?: number;
    excludedTagKeys?: ReadonlySet<string>;
  } = {},
): WatchActivityInsights {
  const rangeDays = options.rangeDays ?? 30;
  const metric = options.metric ?? "watched";
  const today = options.today && isValidWatchActivityDate(options.today) ? options.today : createLocalDateKey();
  const tagLimit = options.tagLimit ?? 8;
  const videoIds = new Set(videos.map((video) => video.id));
  const daysByDate = new Map(createDateRange(rangeDays, today).map((date) => [date, createEmptyDay(date)]));
  const dayVideoIdsByDate = new Map<string, Set<string>>();
  const tagStatsByKey = new Map<string, WatchActivityTagInsight>();
  const tagVideoIdsByKey = new Map<string, Set<string>>();

  Object.values(activityStore).forEach((item) => {
    if (!videoIds.has(item.videoId)) return;
    const day = daysByDate.get(item.date);
    if (!day) return;
    day.watchedSeconds += item.watchedSeconds;
    day.playCount += item.playCount;
    day.completedCount += item.completedCount;
    day.emissionCount += item.emissionCount;
    const dayVideoIds = dayVideoIdsByDate.get(item.date) ?? new Set<string>();
    if (!dayVideoIds.has(item.videoId)) {
      dayVideoIds.add(item.videoId);
      day.videoIds.push(item.videoId);
      dayVideoIdsByDate.set(item.date, dayVideoIds);
    }

    const seenTagKeys = new Set<string>();
    (videoTags[item.videoId] ?? []).forEach((tag) => {
      const key = normalizeTagKey(tag);
      if (!key || options.excludedTagKeys?.has(key) || seenTagKeys.has(key)) return;
      seenTagKeys.add(key);
      const existing = tagStatsByKey.get(key);
      if (existing) {
        existing.watchedSeconds += item.watchedSeconds;
        existing.playCount += item.playCount;
        existing.completedCount += item.completedCount;
        existing.emissionCount += item.emissionCount;
        const tagVideoIds = tagVideoIdsByKey.get(key);
        if (!tagVideoIds?.has(item.videoId)) {
          tagVideoIds?.add(item.videoId);
          existing.videoIds.push(item.videoId);
        }
        return;
      }
      tagVideoIdsByKey.set(key, new Set([item.videoId]));
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
      const aValue = aActivity ? getWatchActivityMetricValue(aActivity, metric) : 0;
      const bValue = bActivity ? getWatchActivityMetricValue(bActivity, metric) : 0;
      return bValue - aValue;
    });
  });
  const totals = days.reduce(
    (summary, day) => {
      summary.watchedSeconds += day.watchedSeconds;
      summary.playCount += day.playCount;
      summary.completedCount += day.completedCount;
      summary.emissionCount += day.emissionCount;
      summary.maxMetricValue = Math.max(summary.maxMetricValue, getWatchActivityMetricValue(day, metric));
      if (hasWatchActivity(day)) summary.activeDays += 1;
      return summary;
    },
    { watchedSeconds: 0, playCount: 0, completedCount: 0, emissionCount: 0, maxMetricValue: 0, activeDays: 0 },
  );
  const topTags = Array.from(tagStatsByKey.values())
    .filter((tag) => getWatchActivityMetricValue(tag, metric) > 0)
    .sort(
      (a, b) =>
        getWatchActivityMetricValue(b, metric) - getWatchActivityMetricValue(a, metric) ||
        a.tag.localeCompare(b.tag, "zh-Hans-CN", { numeric: true }),
    )
    .slice(0, tagLimit);

  return {
    rangeDays,
    days,
    activeDays: totals.activeDays,
    maxMetricValue: totals.maxMetricValue,
    totalWatchedSeconds: totals.watchedSeconds,
    totalPlayCount: totals.playCount,
    totalCompletedCount: totals.completedCount,
    totalEmissionCount: totals.emissionCount,
    topTags,
  };
}
