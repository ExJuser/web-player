import { CalendarDays, ChevronDown } from "lucide-react";
import { useState } from "react";

import { HomeCardThumbnail } from "./HomeVideoCards";
import type { HomeVideoCard, VideoItem, WatchActivityStore } from "./playerTypes";
import { WatchActivityMonth, WatchActivityTagButton } from "./WatchActivityCalendar";
import {
  createWatchActivityKey,
  getWatchActivityMetricValue,
  type WatchActivityDayInsight,
  type WatchActivityInsights,
  type WatchActivityMetric,
  type WatchActivityMonthGroup,
  type WatchActivityRange,
  watchActivityWeekdayLabels,
} from "./watchActivityInsights";

type WatchActivitySectionProps = {
  carouselCardsByDate: Map<string, HomeVideoCard[]>;
  carouselTick: number;
  cards: HomeVideoCard[];
  insights: WatchActivityInsights;
  metric: WatchActivityMetric;
  metricOptions: Array<{ value: WatchActivityMetric; label: string }>;
  monthGroups: WatchActivityMonthGroup[];
  range: WatchActivityRange;
  rangeOptions: Array<{ value: WatchActivityRange; label: string }>;
  selectedDay: WatchActivityDayInsight | null;
  watchActivityStore: WatchActivityStore;
  formatCumulativeDuration: (seconds: number) => string;
  formatDate: (date: string) => string;
  formatHomeMeta: (card: HomeVideoCard) => string;
  formatMetric: (value: number, metric: WatchActivityMetric) => string;
  onMetricChange: (metric: WatchActivityMetric) => void;
  onOpenVideo: (video: VideoItem) => void;
  onRangeChange: (range: WatchActivityRange) => void;
  onSelectDate: (date: string) => void;
  onSelectTag: (tag: string) => void;
  onThumbnailError: (videoId: string) => void;
};

export function WatchActivitySection({
  carouselCardsByDate,
  carouselTick,
  cards,
  insights,
  metric,
  metricOptions,
  monthGroups,
  range,
  rangeOptions,
  selectedDay,
  watchActivityStore,
  formatCumulativeDuration,
  formatDate,
  formatHomeMeta,
  formatMetric,
  onMetricChange,
  onOpenVideo,
  onRangeChange,
  onSelectDate,
  onSelectTag,
  onThumbnailError,
}: WatchActivitySectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const selectedMetricLabel = selectedDay
    ? formatMetric(getWatchActivityMetricValue(selectedDay, metric), metric)
    : "暂无记录";

  return (
    <section className="home-section watch-activity-card">
      <button
        className="home-section-toggle"
        type="button"
        aria-expanded={isExpanded}
        aria-controls="watch-activity-content"
        onClick={() => setIsExpanded((current) => !current)}
      >
        <h2>观看日历</h2>
        <span>{insights.activeDays} 个活跃日</span>
        <ChevronDown className="home-section-toggle-chevron" size={16} aria-hidden="true" />
      </button>
      {isExpanded ? (
        <div id="watch-activity-content" className="home-section-collapsible-content">
      <div className="watch-activity-summary">
        <div>
          <strong>{formatCumulativeDuration(insights.totalWatchedSeconds)}</strong>
          <span>观看时长</span>
        </div>
        <div>
          <strong>{insights.totalPlayCount}</strong>
          <span>播放次数</span>
        </div>
        <div>
          <strong>{insights.totalCompletedCount}</strong>
          <span>完成</span>
        </div>
        <div>
          <strong>{insights.totalEmissionCount}</strong>
          <span>发射</span>
        </div>
      </div>
      <div className="watch-activity-toolbar">
        <div className="watch-activity-segment" role="group" aria-label="观看日历范围">
          {rangeOptions.map((option) => (
            <button
              className={range === option.value ? "active" : ""}
              key={option.value}
              type="button"
              onClick={() => onRangeChange(option.value)}
              aria-pressed={range === option.value}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="watch-activity-segment" role="group" aria-label="观看日历指标">
          {metricOptions.map((option) => (
            <button
              className={metric === option.value ? "active" : ""}
              key={option.value}
              type="button"
              onClick={() => onMetricChange(option.value)}
              aria-pressed={metric === option.value}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="watch-activity-calendar" role="list" aria-label="最近观看分布">
        {monthGroups.map((month) => (
          <WatchActivityMonth
            carouselCardsByDate={carouselCardsByDate}
            carouselTick={carouselTick}
            formatDate={formatDate}
            formatMetric={formatMetric}
            getMetricValue={getWatchActivityMetricValue}
            key={month.key}
            maxMetricValue={insights.maxMetricValue}
            metric={metric}
            month={month}
            onSelectDate={onSelectDate}
            onThumbnailError={onThumbnailError}
            selectedDate={selectedDay?.date}
            weekdayLabels={watchActivityWeekdayLabels}
          />
        ))}
      </div>
      <div className="watch-activity-detail">
        <div className="watch-activity-detail-header">
          <span>
            <CalendarDays size={14} />
            {selectedDay ? formatDate(selectedDay.date) : "暂无日期"}
          </span>
          <strong>{selectedMetricLabel}</strong>
        </div>
        {cards.length ? (
          <div className="watch-activity-video-list">
            {cards.map((card, index) => {
              const activity = selectedDay ? watchActivityStore[createWatchActivityKey(selectedDay.date, card.video.id)] : null;
              const label = activity
                ? `${formatCumulativeDuration(activity.watchedSeconds)} · ${activity.playCount} 次播放`
                : formatHomeMeta(card);
              return (
                <button
                  className="watch-activity-video"
                  key={card.video.id}
                  type="button"
                  onClick={() => onOpenVideo(card.video)}
                  title={card.video.relativePath || card.video.name}
                >
                  <HomeCardThumbnail card={card} fallbackIndex={index} onThumbnailError={onThumbnailError} />
                  <span>
                    <strong>{card.video.name}</strong>
                    <small>{label}</small>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="empty-list compact">这一天还没有观看记录。</div>
        )}
      </div>
      <div className="watch-activity-tags" aria-label="当前范围热门标签">
        {insights.topTags.length ? (
          insights.topTags.map((insight, index) => (
            <WatchActivityTagButton
              formatMetric={formatMetric}
              index={index}
              insight={insight}
              key={insight.key}
              metric={metric}
              onSelectTag={onSelectTag}
            />
          ))
        ) : (
          <small>当前范围暂无可统计标签。</small>
        )}
      </div>
        </div>
      ) : null}
    </section>
  );
}
