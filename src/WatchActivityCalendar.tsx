import type { CSSProperties } from "react";

import type {
  WatchActivityDayInsight,
  WatchActivityMetric,
  WatchActivityMonthGroup,
  WatchActivityTagInsight,
} from "./watchActivityInsights";

type WatchActivityDayProps = {
  day: WatchActivityDayInsight;
  metric: WatchActivityMetric;
  maxMetricValue: number;
  selectedDate?: string;
  getMetricValue: (day: WatchActivityDayInsight, metric: WatchActivityMetric) => number;
  formatDate: (date: string) => string;
  formatMetric: (value: number, metric: WatchActivityMetric) => string;
  onSelectDate: (date: string) => void;
};

function WatchActivityDay({
  day,
  metric,
  maxMetricValue,
  selectedDate,
  getMetricValue,
  formatDate,
  formatMetric,
  onSelectDate,
}: WatchActivityDayProps) {
  const metricValue = getMetricValue(day, metric);
  const share = maxMetricValue > 0 ? Math.log1p(metricValue) / Math.log1p(maxMetricValue) : 0;
  const level = metricValue > 0 ? Math.max(0.18, share) : 0;
  const isSelected = selectedDate === day.date;

  return (
    <button
      className={`watch-activity-day ${isSelected ? "active" : ""}`}
      type="button"
      onClick={() => onSelectDate(day.date)}
      style={{ "--activity-level": level } as CSSProperties}
      title={`${formatDate(day.date)}：${formatMetric(metricValue, metric)}`}
      aria-label={`${formatDate(day.date)}，${formatMetric(metricValue, metric)}`}
      aria-pressed={isSelected}
    >
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
  getMetricValue: (day: WatchActivityDayInsight, metric: WatchActivityMetric) => number;
  formatDate: (date: string) => string;
  formatMetric: (value: number, metric: WatchActivityMetric) => string;
  onSelectDate: (date: string) => void;
};

export function WatchActivityMonth({
  month,
  weekdayLabels,
  metric,
  maxMetricValue,
  selectedDate,
  getMetricValue,
  formatDate,
  formatMetric,
  onSelectDate,
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
      <div className="watch-activity-month-days">
        {Array.from({ length: month.leadingEmptyDays }).map((_, index) => (
          <span className="watch-activity-day-placeholder" key={`${month.key}-empty-${index}`} aria-hidden="true" />
        ))}
        {month.days.map((day) => (
          <WatchActivityDay
            day={day}
            formatDate={formatDate}
            formatMetric={formatMetric}
            getMetricValue={getMetricValue}
            key={day.date}
            maxMetricValue={maxMetricValue}
            metric={metric}
            onSelectDate={onSelectDate}
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
