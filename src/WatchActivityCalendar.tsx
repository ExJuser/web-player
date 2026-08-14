import type { CSSProperties } from "react";

import type { HomeVideoCard } from "./playerTypes";
import { useVideoThumbnail } from "./useVideoThumbnail";
import type {
  WatchActivityDayInsight,
  WatchActivityMetric,
  WatchActivityMonthGroup,
  WatchActivityTagInsight,
} from "./watchActivityInsights";

function ActivityDaySlideThumbnail({ card, isActive, onThumbnailError }: {
  card: HomeVideoCard;
  isActive: boolean;
  onThumbnailError: (videoId: string) => void;
}) {
  const { url } = useVideoThumbnail(card.video.id);
  return (
    <span
      className={`watch-activity-day-slide ${isActive ? "active" : ""} ${url ? "has-image" : ""}`}
      key={card.video.id}
    >
      {url ? (
        <img
          src={url}
          alt=""
          draggable={false}
          onError={() => onThumbnailError(card.video.id)}
        />
      ) : null}
    </span>
  );
}

type WatchActivityDayProps = {
  day: WatchActivityDayInsight;
  metric: WatchActivityMetric;
  maxMetricValue: number;
  selectedDate?: string;
  carouselCards: HomeVideoCard[];
  carouselTick: number;
  getMetricValue: (day: WatchActivityDayInsight, metric: WatchActivityMetric) => number;
  formatDate: (date: string) => string;
  formatMetric: (value: number, metric: WatchActivityMetric) => string;
  onSelectDate: (date: string) => void;
  onThumbnailError: (videoId: string) => void;
};

function WatchActivityDay({
  day,
  metric,
  maxMetricValue,
  selectedDate,
  carouselCards,
  carouselTick,
  getMetricValue,
  formatDate,
  formatMetric,
  onSelectDate,
  onThumbnailError,
}: WatchActivityDayProps) {
  const metricValue = getMetricValue(day, metric);
  const share = maxMetricValue > 0 ? metricValue / maxMetricValue : 0;
  const level = metricValue > 0 ? Math.max(0.18, share) : 0;
  const isSelected = selectedDate === day.date;
  const carouselCount = carouselCards.length;
  const carouselActiveIndex = carouselCount ? (carouselTick + Number(day.date.slice(-2))) % carouselCount : 0;

  return (
    <button
      className={`watch-activity-day ${carouselCount ? "has-carousel" : ""} ${isSelected ? "active" : ""}`}
      type="button"
      onClick={() => onSelectDate(day.date)}
      style={{ "--activity-level": level } as CSSProperties}
      title={`${formatDate(day.date)}：${formatMetric(metricValue, metric)}`}
      aria-label={`${formatDate(day.date)}，${formatMetric(metricValue, metric)}`}
    >
      {carouselCount ? (
        <span className="watch-activity-day-carousel" aria-hidden="true">
          {carouselCards.map((card, index) => (
            <ActivityDaySlideThumbnail card={card} isActive={index === carouselActiveIndex} onThumbnailError={onThumbnailError} />
          ))}
        </span>
      ) : null}
      <span className="watch-activity-day-number">{Number(day.date.slice(-2))}</span>
    </button>
  );
}

type WatchActivityMonthProps = {
  month: WatchActivityMonthGroup;
  weekdayLabels: string[];
  metric: WatchActivityMetric;
  maxMetricValue: number;
  selectedDate?: string;
  carouselCardsByDate: Map<string, HomeVideoCard[]>;
  carouselTick: number;
  getMetricValue: (day: WatchActivityDayInsight, metric: WatchActivityMetric) => number;
  formatDate: (date: string) => string;
  formatMetric: (value: number, metric: WatchActivityMetric) => string;
  onSelectDate: (date: string) => void;
  onThumbnailError: (videoId: string) => void;
};

export function WatchActivityMonth({
  month,
  weekdayLabels,
  metric,
  maxMetricValue,
  selectedDate,
  carouselCardsByDate,
  carouselTick,
  getMetricValue,
  formatDate,
  formatMetric,
  onSelectDate,
  onThumbnailError,
}: WatchActivityMonthProps) {
  return (
    <section className="watch-activity-month" aria-label={`${month.label}观看分布`}>
      <div className="watch-activity-month-header">
        <strong>{month.label}</strong>
        <span>{month.activeDays} 个活跃日</span>
      </div>
      <div className="watch-activity-weekdays" aria-hidden="true">
        {weekdayLabels.map((label) => (
          <span key={`${month.key}-${label}`}>{label}</span>
        ))}
      </div>
      <div className="watch-activity-month-days" role="list">
        {Array.from({ length: month.leadingEmptyDays }).map((_, index) => (
          <span className="watch-activity-day-placeholder" key={`${month.key}-empty-${index}`} aria-hidden="true" />
        ))}
        {month.days.map((day) => (
          <WatchActivityDay
            carouselCards={carouselCardsByDate.get(day.date) ?? []}
            carouselTick={carouselTick}
            day={day}
            formatDate={formatDate}
            formatMetric={formatMetric}
            getMetricValue={getMetricValue}
            key={day.date}
            maxMetricValue={maxMetricValue}
            metric={metric}
            onSelectDate={onSelectDate}
            onThumbnailError={onThumbnailError}
            selectedDate={selectedDate}
          />
        ))}
      </div>
    </section>
  );
}

type WatchActivityTagButtonProps = {
  insight: WatchActivityTagInsight;
  index: number;
  metric: WatchActivityMetric;
  formatMetric: (value: number, metric: WatchActivityMetric) => string;
};

export function WatchActivityTagButton({ insight, index, metric, formatMetric }: WatchActivityTagButtonProps) {
  const metricValue =
    metric === "plays"
      ? insight.playCount
      : metric === "completed"
        ? insight.completedCount
        : metric === "emission"
          ? insight.emissionCount
          : insight.watchedSeconds;

  return (
    <div className="watch-activity-tag" title={insight.tag}>
      <span>{index + 1}</span>
      <strong>{insight.tag}</strong>
      <small>{formatMetric(metricValue, metric)}</small>
    </div>
  );
}
