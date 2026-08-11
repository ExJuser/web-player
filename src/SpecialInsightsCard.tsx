import { useState, type CSSProperties, type ReactNode } from "react";

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
};

const actorMetricOptions: Array<{ value: SpecialActorMetric; label: string }> = [
  { value: "played", label: "播放" },
  { value: "count", label: "次数" },
  { value: "emission", label: "发射" },
];

const tagMetricOptions: Array<{ value: SpecialTagMetric; label: string }> = [
  { value: "videoCount", label: "数量" },
  { value: "played", label: "播放" },
  { value: "emission", label: "发射" },
];

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
}: SpecialInsightsCardProps) {
  const [actorMetric, setActorMetric] = useState<SpecialActorMetric>("played");
  const [tagMetric, setTagMetric] = useState<SpecialTagMetric>("videoCount");
  const actorMetricLabel = actorMetricOptions.find((option) => option.value === actorMetric)?.label ?? "播放";
  const tagMetricConfig = tagMetric === "videoCount"
    ? { label: "热门标签", insights: insights.tagsByVideoCount, emptyText: "暂无标签" }
    : tagMetric === "played"
      ? { label: "播放标签", insights: insights.tagsByPlayedDuration, emptyText: "暂无播放统计" }
      : { label: "发射标签", insights: insights.tagsByEmissionCount, emptyText: "暂无发射统计" };

  return (
    <section className="special-insights-card explore-ledger-section" aria-labelledby="special-insights-title">
      <header className="explore-section-heading special-insights-heading">
        <div>
          <span className="explore-section-eyebrow">Archive ranking</span>
          <h2 id="special-insights-title">观看排行</h2>
          <p>从全库记录里找出停留最久、反复播放和最近活跃的内容。</p>
        </div>
        <span className="special-insight-subtle">
          最近发射：{insights.summary.lastEmissionAt ? formatRelativeTime(insights.summary.lastEmissionAt) : "暂无记录"}
        </span>
      </header>

      <dl className="special-insight-summary" aria-label="全库观看统计">
        <div><dt>全库累计</dt><dd>{formatDuration(insights.summary.totalPlayedSeconds)}</dd></div>
        <div><dt>播放次数</dt><dd>{insights.summary.playCount}</dd></div>
        <div><dt>发射次数</dt><dd>{insights.summary.emissionCount}</dd></div>
        <div><dt>标签覆盖</dt><dd>{Math.round(insights.summary.tagCoverage * 100)}%</dd></div>
      </dl>

      <div className="special-insight-layout">
        <div className="special-ranking-panel">
          <div className="special-insight-tabs" role="tablist" aria-label="观看视频榜单">
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
            <div className="empty-list compact">当前榜单还没有可展示的观看记录。</div>
          )}
        </div>

        <aside className="special-preference-panel" aria-labelledby="special-preference-title">
          <div className="special-preference-heading">
            <div><span>Preference facets</span><h3 id="special-preference-title">偏好切面</h3></div>
            <small>{insights.summary.taggedVideos} 个影片已打标签</small>
          </div>
          <section className="special-facet-card" aria-labelledby="special-actor-facet-title">
            <header>
              <h4 id="special-actor-facet-title">演员</h4>
              <div className="special-facet-switch" role="group" aria-label="演员统计指标">
                {actorMetricOptions.map((option) => (
                  <button
                    className={actorMetric === option.value ? "active" : ""}
                    key={option.value}
                    type="button"
                    aria-pressed={actorMetric === option.value}
                    onClick={() => setActorMetric(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </header>
            <SpecialActorChartGroup
              actors={actors}
              formatDuration={formatDuration}
              icon={tagGroupIcons[actorMetric === "count" ? "videoCount" : actorMetric]}
              label={`${actorMetricLabel}靠前的演员`}
              metric={actorMetric}
            />
          </section>
          <section className="special-facet-card" aria-labelledby="special-tag-facet-title">
            <header>
              <h4 id="special-tag-facet-title">标签</h4>
              <div className="special-facet-switch" role="group" aria-label="标签统计指标">
                {tagMetricOptions.map((option) => (
                  <button
                    className={tagMetric === option.value ? "active" : ""}
                    key={option.value}
                    type="button"
                    aria-pressed={tagMetric === option.value}
                    onClick={() => setTagMetric(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </header>
            <SpecialTagChartGroup
              emptyText={tagMetricConfig.emptyText}
              formatDuration={formatDuration}
              icon={tagGroupIcons[tagMetric]}
              insights={tagMetricConfig.insights}
              label={tagMetricConfig.label}
              metric={tagMetric}
            />
          </section>
        </aside>
      </div>
    </section>
  );
}
