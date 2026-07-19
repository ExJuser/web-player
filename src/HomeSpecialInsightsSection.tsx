import { Activity, BarChart3, Clock3, Rocket, Tags } from "lucide-react";
import type { ReactNode } from "react";

import { SpecialInsightsCard } from "./SpecialInsightsCard";
import type { HomeVideoCard, VideoCommentStore, VideoItem, VideoRatingStore } from "./playerTypes";
import type { SpecialInsightTab, SpecialModeInsights, SpecialModeVideoInsight } from "./specialInsights";

const specialInsightTabOptions: Array<{ value: SpecialInsightTab; label: string; icon: ReactNode }> = [
  { value: "played", label: "播放最久", icon: <Clock3 size={14} /> },
  { value: "count", label: "次数最多", icon: <BarChart3 size={14} /> },
  { value: "emission", label: "发射最多", icon: <Rocket size={14} /> },
  { value: "active", label: "最近活跃", icon: <Activity size={14} /> },
];

type HomeSpecialInsightsSectionProps = {
  activeTab: SpecialInsightTab;
  createCard: (video: VideoItem) => HomeVideoCard;
  insights: SpecialModeInsights | null;
  isExpanded: boolean;
  rankingVideos: SpecialModeVideoInsight[];
  videoComments: VideoCommentStore;
  videoRatings: VideoRatingStore;
  formatDuration: (seconds: number) => string;
  formatRelativeTime: (timestamp: number) => string;
  formatVideoMetric: (insight: SpecialModeVideoInsight) => string;
  onOpenVideo: (video: VideoItem) => void;
  onSelectTag: (tag: string) => void;
  onTabChange: (tab: SpecialInsightTab) => void;
  onThumbnailError: (videoId: string) => void;
  onToggle: () => void;
};

export function HomeSpecialInsightsSection({
  activeTab,
  createCard,
  insights,
  isExpanded,
  rankingVideos,
  videoComments,
  videoRatings,
  formatDuration,
  formatRelativeTime,
  formatVideoMetric,
  onOpenVideo,
  onSelectTag,
  onTabChange,
  onThumbnailError,
  onToggle,
}: HomeSpecialInsightsSectionProps) {
  if (!insights?.summary.totalVideos) return null;

  return (
    <SpecialInsightsCard
      activeTab={activeTab}
      createCard={createCard}
      formatDuration={formatDuration}
      formatRelativeTime={formatRelativeTime}
      formatVideoMetric={formatVideoMetric}
      insights={insights}
      isExpanded={isExpanded}
      onOpenVideo={onOpenVideo}
      onSelectTag={onSelectTag}
      onTabChange={onTabChange}
      onThumbnailError={onThumbnailError}
      onToggle={onToggle}
      rankingVideos={rankingVideos}
      tagGroupIcons={{
        videoCount: <Tags size={14} />,
        played: <Clock3 size={14} />,
        emission: <Rocket size={14} />,
      }}
      tabOptions={specialInsightTabOptions}
      videoComments={videoComments}
      videoRatings={videoRatings}
    />
  );
}
