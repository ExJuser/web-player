import { ChevronDown } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import { HomeCardThumbnail } from "./HomeVideoCards";
import { RatingChip, TagChips } from "./MetadataChips";
import type { HomeVideoCard, VideoCommentStore, VideoItem, VideoRatingStore } from "./playerTypes";
import type { SpecialInsightTab, SpecialModeInsights, SpecialModeTagInsight, SpecialModeVideoInsight } from "./specialInsights";

type SpecialInsightTabOption = {
  value: SpecialInsightTab;
  label: string;
  icon: ReactNode;
};

type SpecialTagMetric = "videoCount" | "played" | "emission";

type SpecialInsightsCardProps = {
  insights: SpecialModeInsights;
  isExpanded: boolean;
  activeTab: SpecialInsightTab;
  createCard: (video: VideoItem) => HomeVideoCard;
  tabOptions: SpecialInsightTabOption[];
  tagGroupIcons: Record<SpecialTagMetric, ReactNode>;
  rankingVideos: SpecialModeVideoInsight[];
  videoRatings: VideoRatingStore;
  videoComments: VideoCommentStore;
  formatDuration: (seconds: number) => string;
  formatRelativeTime: (timestamp: number) => string;
  formatVideoMetric: (insight: SpecialModeVideoInsight) => string;
  onTabChange: (tab: SpecialInsightTab) => void;
  onOpenVideo: (video: VideoItem) => void;
  onSelectTag: (tag: string) => void;
  onThumbnailError: (videoId: string) => void;
  onToggle: () => void;
};

function SpecialInsightVideoRow({
  insight,
  index,
  card,
  rating,
  comment,
  formatMetric,
  onOpenVideo,
  onThumbnailError,
}: {
  insight: SpecialModeVideoInsight;
  index: number;
  card: HomeVideoCard;
  rating?: number;
  comment?: string;
  formatMetric: (insight: SpecialModeVideoInsight) => string;
  onOpenVideo: (video: VideoItem) => void;
  onThumbnailError: (videoId: string) => void;
}) {
  return (
    <button
      className="special-insight-video-row"
      type="button"
      onClick={() => onOpenVideo(insight.video)}
      title={insight.video.relativePath || insight.video.name}
    >
      <span className="special-insight-rank">{index + 1}</span>
      <HomeCardThumbnail card={card} fallbackIndex={index} onThumbnailError={onThumbnailError} />
      <span className="special-insight-row-copy">
        <strong>{insight.video.name}</strong>
        <small>{formatMetric(insight)}</small>
        <TagChips tags={insight.tags} limit={10} compact />
        <RatingChip rating={rating} comment={comment} />
      </span>
    </button>
  );
}

function getSpecialTagMetricValue(insight: SpecialModeTagInsight, metric: SpecialTagMetric) {
  if (metric === "videoCount") return insight.videoCount;
  if (metric === "played") return insight.totalPlayedSeconds;
  return insight.emissionCount;
}

function SpecialTagInsightButton({
  insight,
  metric,
  maxValue,
  index,
  formatDuration,
  onSelectTag,
}: {
  insight: SpecialModeTagInsight;
  metric: SpecialTagMetric;
  maxValue: number;
  index: number;
  formatDuration: (seconds: number) => string;
  onSelectTag: (tag: string) => void;
}) {
  const metricValue = getSpecialTagMetricValue(insight, metric);
  const valueLabel =
    metric === "videoCount"
      ? `${insight.videoCount} 个`
      : metric === "played"
        ? formatDuration(insight.totalPlayedSeconds)
        : `${insight.emissionCount} 次`;
  const share = maxValue > 0 ? Math.max(8, Math.round((metricValue / maxValue) * 100)) : 0;

  return (
    <button
      className="special-tag-insight"
      type="button"
      onClick={() => onSelectTag(insight.tag)}
      style={{
        "--tag-share": `${share}%`,
      } as CSSProperties}
      title={`筛选标签：${insight.tag}`}
    >
      <span className="special-tag-insight-meter" aria-hidden="true">
        <span />
      </span>
      <span className="special-tag-insight-rank">{index + 1}</span>
      <span className="special-tag-insight-copy">
        <span>{insight.tag}</span>
        <small>{insight.videoCount} 个视频</small>
      </span>
      <strong>{valueLabel}</strong>
    </button>
  );
}

function SpecialTagChartGroup({
  label,
  icon,
  insights,
  metric,
  emptyText,
  formatDuration,
  onSelectTag,
}: {
  label: string;
  icon: ReactNode;
  insights: SpecialModeTagInsight[];
  metric: SpecialTagMetric;
  emptyText: string;
  formatDuration: (seconds: number) => string;
  onSelectTag: (tag: string) => void;
}) {
  const maxValue = insights.reduce((max, insight) => Math.max(max, getSpecialTagMetricValue(insight, metric)), 0);

  return (
    <div className={`special-tag-group special-tag-chart-${metric}`}>
      <span>
        {icon}
        {label}
      </span>
      <div className="special-tag-chart" role="list" aria-label={label}>
        {insights.length ? (
          insights.map((insight, index) => (
            <SpecialTagInsightButton
              formatDuration={formatDuration}
              index={index}
              insight={insight}
              key={`${metric}-${insight.key}`}
              maxValue={maxValue}
              metric={metric}
              onSelectTag={onSelectTag}
            />
          ))
        ) : (
          <small>{emptyText}</small>
        )}
      </div>
    </div>
  );
}

export function SpecialInsightsCard({
  insights,
  isExpanded,
  activeTab,
  createCard,
  tabOptions,
  tagGroupIcons,
  rankingVideos,
  videoRatings,
  videoComments,
  formatDuration,
  formatRelativeTime,
  formatVideoMetric,
  onTabChange,
  onOpenVideo,
  onSelectTag,
  onThumbnailError,
  onToggle,
}: SpecialInsightsCardProps) {
  return (
    <section className="home-section special-insights-card">
      <button
        className="home-section-toggle"
        type="button"
        aria-expanded={isExpanded}
        aria-controls="special-insights-content"
        onClick={onToggle}
      >
        <h2>特殊模式洞察</h2>
        <span>{isExpanded ? `${insights.summary.taggedVideos} 个已打标签` : "点击展开"}</span>
        <ChevronDown className="home-section-toggle-chevron" size={16} aria-hidden="true" />
      </button>
      {isExpanded ? (
        <div id="special-insights-content" className="home-section-collapsible-content">
      <div className="special-insight-summary">
        <div>
          <strong>{formatDuration(insights.summary.totalPlayedSeconds)}</strong>
          <span>累计播放</span>
        </div>
        <div>
          <strong>{insights.summary.playCount}</strong>
          <span>播放次数</span>
        </div>
        <div>
          <strong>{insights.summary.emissionCount}</strong>
          <span>发射次数</span>
        </div>
        <div>
          <strong>{Math.round(insights.summary.tagCoverage * 100)}%</strong>
          <span>标签覆盖</span>
        </div>
      </div>
      <div className="special-insight-subtle">
        最近发射：
        {insights.summary.lastEmissionAt ? formatRelativeTime(insights.summary.lastEmissionAt) : "暂无记录"}
      </div>
      <div className="special-insight-tabs" role="tablist" aria-label="特殊模式视频榜单">
        {tabOptions.map((option) => (
          <button
            className={activeTab === option.value ? "active" : ""}
            key={option.value}
            type="button"
            role="tab"
            aria-selected={activeTab === option.value}
            onClick={() => onTabChange(option.value)}
          >
            {option.icon}
            {option.label}
          </button>
        ))}
      </div>
      {rankingVideos.length ? (
        <div className="special-insight-list">
          {rankingVideos.map((insight, index) => (
            <SpecialInsightVideoRow
              card={createCard(insight.video)}
              comment={videoComments[insight.video.id]}
              formatMetric={formatVideoMetric}
              index={index}
              insight={insight}
              key={`${activeTab}-${insight.video.id}`}
              onOpenVideo={onOpenVideo}
              onThumbnailError={onThumbnailError}
              rating={videoRatings[insight.video.id]}
            />
          ))}
        </div>
      ) : (
        <div className="empty-list compact">当前榜单暂无统计记录。</div>
      )}
      <div className="special-tag-groups">
        <SpecialTagChartGroup
          emptyText="暂无标签"
          formatDuration={formatDuration}
          icon={tagGroupIcons.videoCount}
          insights={insights.tagsByVideoCount}
          label="热门标签"
          metric="videoCount"
          onSelectTag={onSelectTag}
        />
        <SpecialTagChartGroup
          emptyText="暂无播放统计"
          formatDuration={formatDuration}
          icon={tagGroupIcons.played}
          insights={insights.tagsByPlayedDuration}
          label="播放标签"
          metric="played"
          onSelectTag={onSelectTag}
        />
        <SpecialTagChartGroup
          emptyText="暂无发射统计"
          formatDuration={formatDuration}
          icon={tagGroupIcons.emission}
          insights={insights.tagsByEmissionCount}
          label="发射标签"
          metric="emission"
          onSelectTag={onSelectTag}
        />
      </div>
        </div>
      ) : null}
    </section>
  );
}
