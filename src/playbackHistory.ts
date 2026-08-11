import type { PlaybackHistory } from "./playerTypes";

export const playbackHistoryBucketCount = 200;

function getPlaybackHistoryLevel(watchedSeconds: number, bucketDuration: number) {
  if (watchedSeconds <= 0 || bucketDuration <= 0) return 0;
  const passes = watchedSeconds / bucketDuration;
  if (passes < 0.75) return 1;
  if (passes < 1.5) return 2;
  if (passes < 3) return 3;
  return 4;
}

export function createPlaybackHistoryGradient(history: PlaybackHistory | undefined, duration: number) {
  if (!history?.buckets.length) return "var(--timeline-history-empty)";
  const effectiveDuration = duration > 0 ? duration : history.duration;
  const bucketDuration = effectiveDuration / history.buckets.length;
  const ranges: Array<{ level: number; start: number; end: number }> = [];
  history.buckets.forEach((watchedSeconds, index) => {
    const level = getPlaybackHistoryLevel(watchedSeconds, bucketDuration);
    const previous = ranges.at(-1);
    if (previous?.level === level) {
      previous.end = index + 1;
    } else {
      ranges.push({ level, start: index, end: index + 1 });
    }
  });
  const stops = ranges.flatMap((range) => {
    const color = `var(--timeline-history-${range.level})`;
    const start = (range.start / history.buckets.length) * 100;
    const end = (range.end / history.buckets.length) * 100;
    return [`${color} ${start}%`, `${color} ${end}%`];
  });
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

export function getPlaybackHistoryAtTime(history: PlaybackHistory | undefined, time: number, duration: number) {
  if (!history?.buckets.length || duration <= 0) return null;
  const index = Math.min(history.buckets.length - 1, Math.max(0, Math.floor((time / duration) * history.buckets.length)));
  const watchedSeconds = history.buckets[index] ?? 0;
  if (watchedSeconds <= 0) return null;
  return {
    watchedSeconds,
    passes: watchedSeconds / (duration / history.buckets.length),
  };
}

export function addPlaybackHistoryInterval(
  history: PlaybackHistory | undefined,
  startTime: number,
  endTime: number,
  duration: number,
  updatedAt = Date.now(),
): PlaybackHistory | undefined {
  if (
    !Number.isFinite(startTime)
    || !Number.isFinite(endTime)
    || !Number.isFinite(duration)
    || duration <= 0
    || endTime <= startTime
    || endTime - startTime > 10
  ) {
    return history;
  }

  const buckets = history?.buckets.length === playbackHistoryBucketCount
    ? [...history.buckets]
    : Array<number>(playbackHistoryBucketCount).fill(0);
  const intervalStart = Math.max(0, Math.min(duration, startTime));
  const intervalEnd = Math.max(0, Math.min(duration, endTime));
  const bucketDuration = duration / playbackHistoryBucketCount;
  if (intervalEnd <= intervalStart || bucketDuration <= 0) return history;

  const firstBucket = Math.min(playbackHistoryBucketCount - 1, Math.floor(intervalStart / bucketDuration));
  const lastBucket = Math.min(playbackHistoryBucketCount - 1, Math.floor((intervalEnd - Number.EPSILON) / bucketDuration));
  for (let index = firstBucket; index <= lastBucket; index += 1) {
    const bucketStart = index * bucketDuration;
    const bucketEnd = bucketStart + bucketDuration;
    const watchedSeconds = Math.max(0, Math.min(intervalEnd, bucketEnd) - Math.max(intervalStart, bucketStart));
    buckets[index] = Math.round((buckets[index] + watchedSeconds) * 1000) / 1000;
  }

  return { duration, buckets, updatedAt };
}
