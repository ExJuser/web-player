import { ChevronDown } from "lucide-react";

import type { SeriesOption } from "./playerUiState";

type SeriesMenuProps = {
  isOpen: boolean;
  options: SeriesOption[];
  selectedSeriesKey: string;
  onSelectSeries: (seriesKey: string) => void;
  onToggleOpen: () => void;
};

function formatSeriesLabel(series: SeriesOption) {
  return [series.title, series.mediaRootLabel].filter(Boolean).join(" · ");
}

export function SeriesMenu({
  isOpen,
  options,
  selectedSeriesKey,
  onSelectSeries,
  onToggleOpen,
}: SeriesMenuProps) {
  const selectedSeries = options.find((series) => series.key === selectedSeriesKey);
  const selectedLabel = selectedSeriesKey === "all" || !selectedSeries ? "全部系列" : formatSeriesLabel(selectedSeries);

  return (
    <div className="series-menu">
      <button
        className="series-menu-trigger"
        type="button"
        onClick={onToggleOpen}
        disabled={!options.length}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label="选择系列"
        title="选择系列"
      >
        <span>{selectedLabel}</span>
        <ChevronDown className="series-menu-chevron" size={15} aria-hidden="true" />
      </button>
      {isOpen ? (
        <div className="series-menu-list" role="listbox" aria-label="选择系列">
          <button
            className={selectedSeriesKey === "all" ? "active" : ""}
            type="button"
            role="option"
            aria-selected={selectedSeriesKey === "all"}
            onClick={() => onSelectSeries("all")}
          >
            全部系列
          </button>
          {options.map((series) => (
            <button
              key={series.key}
              className={selectedSeriesKey === series.key ? "active" : ""}
              type="button"
              role="option"
              aria-selected={selectedSeriesKey === series.key}
              onClick={() => onSelectSeries(series.key)}
            >
              {formatSeriesLabel(series)} ({series.count})
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
