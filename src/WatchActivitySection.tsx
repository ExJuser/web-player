import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";

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
  onThumbnailError: (videoId: string) => void;
};

export function WatchActivitySection({
  carouselCardsByDate,
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
  onThumbnailError,
}: WatchActivitySectionProps) {
  // 轮播 tick 局部化到本区块：不再驱动 App 整树每 3.2s 重渲染，
  // 区块挂载（探索概览可见）时自持定时器，卸载即停。
  const [carouselTick, setCarouselTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setCarouselTick((tick) => tick + 1);
    }, 3200);
    return () => window.clearInterval(timer);
  }, []);
  const selectedMetricLabel = selectedDay
    ? formatMetric(getWatchActivityMetricValue(selectedDay, metric), metric)
    : "暂无记录";

  return (
    <section className="watch-activity-card explore-ledger-section" aria-labelledby="watch-activity-title">
      <header className="explore-section-heading">
        <div>
          <span className="explore-section-eyebrow">Viewing timeline</span>
          <h2 id="watch-activity-title">观影时间胶片</h2>
          <p>画面记录当天看过的影片，曝光强度对应所选指标。</p>
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
      </header>

      <dl className="watch-activity-summary" aria-label="当前周期统计">
        <div><dt>观看时长</dt><dd>{formatCumulativeDuration(insights.totalWatchedSeconds)}</dd></div>
        <div><dt>播放次数</dt><dd>{insights.totalPlayCount}</dd></div>
        <div><dt>完成</dt><dd>{insights.totalCompletedCount}</dd></div>
        <div><dt>发射</dt><dd>{insights.totalEmissionCount}</dd></div>
        <div><dt>活跃日</dt><dd>{insights.activeDays}</dd></div>
      </dl>

      <div className="watch-activity-layout">
        <div className="watch-activity-filmstrip">
          <div className="watch-activity-film-edge" aria-hidden="true" />
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
          <div className="watch-activity-film-edge" aria-hidden="true" />
        </div>

        <aside className="watch-activity-detail" aria-label="选中日期详情">
          <div className="watch-activity-detail-header">
            <span><CalendarDays size={14} />选中日期</span>
            <strong>{selectedMetricLabel}</strong>
          </div>
          <h3>{selectedDay ? formatDate(selectedDay.date) : "暂无观看日期"}</h3>
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
                    <span><strong>{card.video.name}</strong><small>{label}</small></span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="empty-list compact">选择有画面的日期，查看当天的影片。</div>
          )}
          <div className="watch-activity-tag-block">
            <span>本期高频标签</span>
            <div className="watch-activity-tags" aria-label="当前范围热门标签">
              {insights.topTags.length ? (
                insights.topTags.map((insight, index) => (
                  <WatchActivityTagButton
                    formatMetric={formatMetric}
                    index={index}
                    insight={insight}
                    key={insight.key}
                    metric={metric}
                  />
                ))
              ) : (
                <small>当前范围暂无可统计标签。</small>
              )}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
