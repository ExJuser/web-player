import type { VideoEditSegment } from "./playerTypes";

export function createVideoEditSegment(firstTime: number, secondTime: number, updatedAt = Date.now()): VideoEditSegment | null {
  const startTime = Math.min(firstTime, secondTime);
  const endTime = Math.max(firstTime, secondTime);
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || startTime < 0 || endTime - startTime < 0.2) {
    return null;
  }
  return {
    id: `edit-${Math.round(startTime * 10)}-${Math.round(endTime * 10)}-${updatedAt.toString(36)}`,
    startTime,
    endTime,
    updatedAt,
  };
}

export function summarizeVideoEditSegments(segments: VideoEditSegment[]) {
  const sorted = segments
    .map(({ startTime, endTime }) => ({ startTime, endTime }))
    .sort((a, b) => a.startTime - b.startTime || a.endTime - b.endTime);
  const merged: Array<{ startTime: number; endTime: number }> = [];
  for (const segment of sorted) {
    const previous = merged.at(-1);
    if (previous && segment.startTime <= previous.endTime) {
      previous.endTime = Math.max(previous.endTime, segment.endTime);
    } else {
      merged.push({ ...segment });
    }
  }
  return {
    mergedSegmentCount: merged.length,
    durationSeconds: merged.reduce((total, segment) => total + segment.endTime - segment.startTime, 0),
  };
}
