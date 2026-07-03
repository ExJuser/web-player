import { formatCumulativeDuration, formatRelativeTime } from "./playerFormatUtils";
import type { HomeVideoCard } from "./playerTypes";
import type { SpecialInsightTab, SpecialModeVideoInsight } from "./specialInsights";

export function createPrimaryHomeLabels(input: {
  primaryResumeCard: HomeVideoCard | null;
  modeFilteredVideoCount: number;
}) {
  return {
    title: input.primaryResumeCard ? "继续观看" : input.modeFilteredVideoCount ? "开始观看" : "准备播放",
    action: input.primaryResumeCard ? "继续播放" : "播放第一个视频",
  };
}

export function formatSpecialInsightVideoMetric(
  insight: SpecialModeVideoInsight,
  specialInsightTab: SpecialInsightTab,
) {
  if (specialInsightTab === "played") {
    const intensity = insight.playIntensity ? ` · 约 ${insight.playIntensity.toFixed(1)} 遍` : "";
    return `${formatCumulativeDuration(insight.stats.totalPlayedSeconds)}${intensity}`;
  }
  if (specialInsightTab === "count") return `${insight.stats.playCount} 次播放`;
  if (specialInsightTab === "emission") return `${insight.stats.emissionCount} 次发射`;
  return formatRelativeTime(insight.activeAt);
}
