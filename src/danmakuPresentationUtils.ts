import type {
  DanmakuComment,
  DanmakuSource,
  DanmakuSourceBreakdown,
} from "./playerTypes";

export const danmakuLaneLineHeight = 1.12;

export function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function formatDanmakuProviderLabel(provider: DanmakuSource["provider"]) {
  if (provider === "bilibili") return "Bilibili";
  if (provider === "bahamut") return "巴哈姆特动画疯";
  if (provider === "combined") return "多来源";
  return "手动";
}

export function getDanmakuSourceBreakdown(source: DanmakuSource | null): DanmakuSourceBreakdown[] {
  if (!source) return [];
  return source.sourceBreakdown?.length
    ? source.sourceBreakdown
    : [
        {
          provider: source.provider,
          label: formatDanmakuProviderLabel(source.provider),
          sourceUrl: source.sourceUrl,
          commentCount: source.commentCount,
          translatedCount: source.translatedCount,
        },
      ];
}

export function getDanmakuBreakdownTotal(sources: DanmakuSourceBreakdown[]) {
  return sources.reduce((sum, source) => sum + source.commentCount, 0);
}

export function formatDanmakuLoadedMessage(source: DanmakuSource, comments: DanmakuComment[], action = "已加载") {
  const sources = getDanmakuSourceBreakdown(source);
  const total = getDanmakuBreakdownTotal(sources) || comments.length;
  return `${action} ${total} 条弹幕，来自 ${Math.max(1, sources.length)} 个来源。`;
}

export function getDanmakuLane(comment: Pick<DanmakuComment, "id" | "hash" | "time">, laneCount: number) {
  if (laneCount <= 1) return 0;
  const hash = stableHash(`${comment.id}:${comment.hash}:${comment.time.toFixed(3)}`);
  return Number.parseInt(hash.slice(0, 8), 16) % laneCount;
}

function findFirstDanmakuAfter(comments: DanmakuComment[], time: number) {
  let low = 0;
  let high = comments.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (comments[middle].time <= time) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

export function getActiveDanmakuComments(input: {
  comments: DanmakuComment[];
  currentTime: number;
  durationSeconds: number;
  displayLimit: number;
}) {
  const { comments, currentTime, durationSeconds, displayLimit } = input;
  if (!comments.length || !Number.isFinite(currentTime) || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return [];
  }

  const firstFutureIndex = findFirstDanmakuAfter(comments, currentTime);
  const windowStart = Math.max(0, currentTime - durationSeconds);
  let startIndex = firstFutureIndex;
  while (startIndex > 0 && comments[startIndex - 1].time >= windowStart) {
    startIndex -= 1;
  }
  const limitedStartIndex = Math.max(startIndex, firstFutureIndex - Math.max(0, displayLimit));
  return comments.slice(limitedStartIndex, firstFutureIndex);
}

export function formatDanmakuSpeedLevel(speed: number) {
  if (speed <= 16) return "较快";
  if (speed <= 20) return "稍快";
  if (speed <= 24) return "中等";
  if (speed <= 28) return "稍慢";
  return "较慢";
}

export function getDanmakuLaneCount(displayArea: number, fontSize: number, layerHeight: number) {
  const boundedDisplayArea = Math.min(1, Math.max(0.25, displayArea));
  const laneStep = Math.max(14, fontSize * danmakuLaneLineHeight);
  const effectiveHeight = Math.max(180, layerHeight || 0);
  return Math.max(4, Math.floor((effectiveHeight * boundedDisplayArea) / laneStep));
}

export function formatDanmakuLaneTop(lane: number, laneCount: number, displayArea: number) {
  if (laneCount <= 1) return "0%";
  const percent = (lane / laneCount) * Math.min(1, Math.max(0.25, displayArea)) * 100;
  return `${percent.toFixed(3)}%`;
}
