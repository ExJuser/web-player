import { ChevronDown } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import { HomeCardThumbnail } from "./HomeVideoCards";
import { RatingChip, TagChips } from "./MetadataChips";
import type { ActorInsight } from "./actorUtils";
import type { HomeVideoCard, VideoCommentStore, VideoItem, VideoRatingStore } from "./playerTypes";
import type { SpecialInsightTab, SpecialModeInsights, SpecialModeTagInsight, SpecialModeVideoInsight } from "./specialInsights";

type SpecialInsightTabOption = {
  value: SpecialInsightTab;
  label: string;
  icon: ReactNode;
};

type SpecialTagMetric = "videoCount" | "played" | "emission";
type SpecialActorMetric = "played" | "count" | "emission";

type SpecialInsightsCardProps = {
  insights: SpecialModeInsights;
  isExpanded: boolean;
  activeTab: SpecialInsightTab;
  actors: ActorInsight[];
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
  onThumbnailError: (videoId: string) => void;
  onToggle: () => void;
};

function getSpecialActorMetricValue(insight: ActorInsight, metric: SpecialActorMetric) {
  if (metric === "played") return insight.stats.totalPlayedSeconds;
  if (metric === "count") return insight.stats.playCount;
  return insight.stats.emissionCount;
}

function SpecialActorChartGroup({
  label,
  icon,
  actors,
  metric,
  formatDuration,
}: {
  label: string;
  icon: ReactNode;
  actors: ActorInsight[];
  metric: SpecialActorMetric;
  formatDuration: (seconds: number) => string;
}) {
  const rankedActors = [...actors]
    .filter((insight) => getSpecialActorMetricValue(insight, metric) > 0)
    .sort((a, b) => getSpecialActorMetricValue(b, metric) - getSpecialActorMetricValue(a, metric)
      || a.actor.name.localeCompare(b.actor.name, "zh-Hans-CN", { numeric: true }))
    .slice(0, 10);
  const maxValue = rankedActors.length ? getSpecialActorMetricValue(rankedActors[0], metric) : 0;

  return (
    <div className={`special-tag-group special-tag-chart-${metric === "count" ? "videoCount" : metric}`}>
      <span>{icon}{label}</span>
      <div className="special-tag-chart" role="list" aria-label={label}>
        {rankedActors.length ? rankedActors.map((insight, index) => {
          const metricValue = getSpecialActorMetricValue(insight, metric);
          const valueLabel = metric === "played" ? formatDuration(metricValue) : `${metricValue} 次`;
          const share = maxValue > 0 ? Math.max(8, Math.round((metricValue / maxValue) * 100)) : 0;
          return (
            <div
              className="special-tag-insight"
              key={`${metric}-${insight.actor.id}`}
              style={{ "--tag-share": `${share}%` } as CSSProperties}
              title={insight.actor.name}
            >
              <span className="special-tag-insight-meter" aria-hidden="true"><span /></span>
              <span className="special-tag-insight-rank">{index + 1}</span>
              <span className="special-tag-insight-copy">
                <span>{insight.actor.name}</span>
                <small>{insight.videos.length} 部影片</small>
              </span>
              <strong>{valueLabel}</strong>
            </div>
          );
        }) : <small>暂无演员统计</small>}
      </div>
    </div>
  );
}

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
}: {
  insight: SpecialModeTagInsight;
  metric: SpecialTagMetric;
  maxValue: number;
  index: number;
  formatDuration: (seconds: number) => string;
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
    <div
      className="special-tag-insight"
      style={{
        "--tag-share": `${share}%`,
      } as CSSProperties}
      title={insight.tag}
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
    </div>
  );
}

function SpecialTagChartGroup({
  label,
  icon,
  insights,
  metric,
  emptyText,
  formatDuration,
}: {
  label: string;
  icon: ReactNode;
  insights: SpecialModeTagInsight[];
  metric: SpecialTagMetric;
  emptyText: string;
  formatDuration: (seconds: number) => string;
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
  actors,
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
        <SpecialActorChartGroup actors={actors} formatDuration={formatDuration} icon={tagGroupIcons.played} label="播放最久的演员" metric="played" />
        <SpecialActorChartGroup actors={actors} formatDuration={formatDuration} icon={tagGroupIcons.videoCount} label="次数最多的演员" metric="count" />
        <SpecialActorChartGroup actors={actors} formatDuration={formatDuration} icon={tagGroupIcons.emission} label="发射最多的演员" metric="emission" />
      </div>
      <div className="special-tag-groups">
        <SpecialTagChartGroup
          emptyText="暂无标签"
          formatDuration={formatDuration}
          icon={tagGroupIcons.videoCount}
          insights={insights.tagsByVideoCount}
          label="热门标签"
          metric="videoCount"
        />
        <SpecialTagChartGroup
          emptyText="暂无播放统计"
          formatDuration={formatDuration}
          icon={tagGroupIcons.played}
          insights={insights.tagsByPlayedDuration}
          label="播放标签"
          metric="played"
        />
        <SpecialTagChartGroup
          emptyText="暂无发射统计"
          formatDuration={formatDuration}
          icon={tagGroupIcons.emission}
          insights={insights.tagsByEmissionCount}
          label="发射标签"
          metric="emission"
        />
      </div>
        </div>
      ) : null}
    </section>
  );
}
