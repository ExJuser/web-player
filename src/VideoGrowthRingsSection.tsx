import { useEffect, useMemo, type CSSProperties, type KeyboardEvent } from "react";
import { Clock3, Film, History, Layers3, Play, Search, Sparkles, TreePine } from "lucide-react";

import type { VideoItem } from "./playerTypes";
import { useVideoThumbnail } from "./useVideoThumbnail";
import {
  createOrganicGrowthRingPath,
  sortVideoGrowthRings,
  type VideoGrowthRing,
  type VideoGrowthRingForest,
  type VideoGrowthRingLayer,
  type VideoGrowthRingSort,
} from "./videoGrowthRings";

const pageSize = 36;

type VideoGrowthRingsSectionProps = {
  forest: VideoGrowthRingForest;
  query: string;
  selectedLayerKey: string | null;
  selectedVideoId: string | null;
  sort: VideoGrowthRingSort;
  visibleLimit: number;
  formatDuration: (seconds: number) => string;
  onOpenVideo: (video: VideoItem) => void;
  onQueryChange: (query: string) => void;
  onSelectLayer: (layerKey: string | null) => void;
  onSelectVideo: (videoId: string) => void;
  onSortChange: (sort: VideoGrowthRingSort) => void;
  onThumbnailError: (videoId: string) => void;
  onVisibleLimitChange: (limit: number) => void;
  onVisibleVideoIdsChange: (videoIds: string[]) => void;
};

type GrowthRingArtworkProps = {
  interactive?: boolean;
  layers: VideoGrowthRingLayer[];
  ring: VideoGrowthRing;
  selectedLayerKey?: string | null;
  size: "forest" | "detail";
  onSelectLayer?: (layer: VideoGrowthRingLayer) => void;
  onThumbnailError: (videoId: string) => void;
};

function formatDate(date: string) {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("zh-Hans-CN", { year: "numeric", month: "short", day: "numeric" });
}

function formatDateRange(layer: VideoGrowthRingLayer) {
  return layer.startDate === layer.endDate
    ? formatDate(layer.startDate)
    : `${formatDate(layer.startDate)} – ${formatDate(layer.endDate)}`;
}

function createLayerGeometry(layers: VideoGrowthRingLayer[], size: "forest" | "detail") {
  const coreRadius = size === "detail" ? 43 : 28;
  const outerRadius = size === "detail" ? 137 : 73;
  const maxWatched = Math.max(1, ...layers.map((layer) => layer.watchedSeconds));
  const weights = layers.map((layer) => ({
    gap: Math.min(2.2, Math.log2(layer.gapDays + 1) * 0.32),
    stroke: 0.72 + Math.sqrt(layer.watchedSeconds / maxWatched) * 1.9,
  }));
  const totalWeight = weights.reduce((sum, weight) => sum + weight.gap + weight.stroke, 0) || 1;
  const scale = (outerRadius - coreRadius) / totalWeight;
  let cursor = coreRadius;
  return layers.map((layer, index) => {
    cursor += weights[index].gap * scale;
    const strokeWidth = Math.max(size === "detail" ? 0.8 : 0.65, weights[index].stroke * scale);
    const radius = cursor + strokeWidth / 2;
    cursor += strokeWidth;
    return { layer, radius, strokeWidth };
  });
}

function markerPoint(radius: number, seed: number, offset: number) {
  const angle = (((seed + offset * 97) % 360) * Math.PI) / 180 - Math.PI / 2;
  return {
    x: 150 + Math.cos(angle) * radius,
    y: 150 + Math.sin(angle) * radius,
  };
}

function GrowthRingArtwork({
  interactive = false,
  layers,
  ring,
  selectedLayerKey,
  size,
  onSelectLayer,
  onThumbnailError,
}: GrowthRingArtworkProps) {
  const geometry = useMemo(() => createLayerGeometry(layers, size), [layers, size]);
  const { url: generatedThumbnailUrl } = useVideoThumbnail(ring.video.id);
  const imageUrl = ring.video.posterUrl ?? generatedThumbnailUrl ?? ring.video.thumbUrl ?? ring.video.fanartUrl;
  const style = {
    "--growth-ring-hue": 25 + (ring.seed % 22),
    "--growth-ring-cool-hue": 184 + (ring.seed % 24),
  } as CSSProperties;

  const handleLayerKeyDown = (event: KeyboardEvent<SVGPathElement>, layer: VideoGrowthRingLayer) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onSelectLayer?.(layer);
  };

  return (
    <span className={`growth-ring-artwork ${size}`} style={style}>
      <svg viewBox="0 0 300 300" aria-hidden={!interactive}>
        <circle className="growth-ring-bed" cx="150" cy="150" r={size === "detail" ? 140 : 76} />
        {geometry.map(({ layer, radius, strokeWidth }) => {
          const selected = selectedLayerKey === layer.key;
          const completedMarker = markerPoint(radius, layer.seed, 1);
          const emissionMarker = markerPoint(radius, layer.seed, 2);
          const label = `${formatDateRange(layer)}，观看 ${Math.round(layer.watchedSeconds)} 秒，播放 ${layer.playCount} 次`;
          return (
            <g className={`growth-ring-layer ${selected ? "selected" : ""}`} key={layer.key}>
              <path
                d={createOrganicGrowthRingPath(radius, layer.seed, size === "detail" ? 52 : 32)}
                fill="none"
                strokeWidth={strokeWidth}
                className={interactive ? "interactive" : undefined}
                style={{
                  opacity: Math.min(0.94, 0.42 + Math.log2(layer.playCount + 1) * 0.12),
                  strokeDasharray: layer.playCount > 1
                    ? `${Math.max(1.1, 7 - Math.log2(layer.playCount + 1) * 1.2)} ${Math.max(0.7, 2.8 - Math.log2(layer.playCount + 1) * 0.35)}`
                    : undefined,
                }}
                role={interactive ? "button" : undefined}
                tabIndex={interactive ? 0 : undefined}
                aria-label={interactive ? label : undefined}
                onClick={interactive ? () => onSelectLayer?.(layer) : undefined}
                onKeyDown={interactive ? (event) => handleLayerKeyDown(event, layer) : undefined}
              />
              {layer.completedCount ? (
                <circle
                  className="growth-ring-knot completed"
                  cx={completedMarker.x}
                  cy={completedMarker.y}
                  r={Math.min(size === "detail" ? 5.5 : 3.2, 1.7 + Math.log2(layer.completedCount + 1))}
                />
              ) : null}
              {layer.emissionCount ? (
                <circle
                  className="growth-ring-knot emission"
                  cx={emissionMarker.x}
                  cy={emissionMarker.y}
                  r={Math.min(size === "detail" ? 5.5 : 3.2, 1.7 + Math.log2(layer.emissionCount + 1))}
                />
              ) : null}
            </g>
          );
        })}
        <circle className="growth-ring-core-border" cx="150" cy="150" r={size === "detail" ? 40 : 25} />
      </svg>
      <span className="growth-ring-core">
        {imageUrl ? (
          <>
            <Film size={size === "detail" ? 30 : 20} aria-hidden="true" />
            <img
              src={imageUrl}
              alt=""
              draggable={false}
              onError={(event) => {
                event.currentTarget.style.display = "none";
                if (imageUrl === generatedThumbnailUrl) onThumbnailError(ring.video.id);
              }}
            />
          </>
        ) : (
          <Film size={size === "detail" ? 30 : 20} aria-hidden="true" />
        )}
      </span>
    </span>
  );
}

const sortOptions: Array<{ value: VideoGrowthRingSort; label: string }> = [
  { value: "recent", label: "最近活动" },
  { value: "watched", label: "观看时长" },
  { value: "activeDays", label: "活跃日" },
  { value: "plays", label: "播放次数" },
  { value: "title", label: "片名" },
];

export function VideoGrowthRingsSection({
  forest,
  query,
  selectedLayerKey,
  selectedVideoId,
  sort,
  visibleLimit,
  formatDuration,
  onOpenVideo,
  onQueryChange,
  onSelectLayer,
  onSelectVideo,
  onSortChange,
  onThumbnailError,
  onVisibleLimitChange,
  onVisibleVideoIdsChange,
}: VideoGrowthRingsSectionProps) {
  const filteredRings = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("zh-Hans-CN");
    const matching = normalizedQuery
      ? forest.rings.filter((ring) =>
          `${ring.video.name} ${ring.video.relativePath}`.toLocaleLowerCase("zh-Hans-CN").includes(normalizedQuery))
      : forest.rings;
    return sortVideoGrowthRings(matching, sort);
  }, [forest.rings, query, sort]);
  const visibleRings = filteredRings.slice(0, visibleLimit);
  const selectedRing = filteredRings.find((ring) => ring.video.id === selectedVideoId) ?? filteredRings[0] ?? null;
  const selectedLayer = selectedRing
    ? selectedRing.detailLayers.find((layer) => layer.key === selectedLayerKey) ?? selectedRing.detailLayers.at(-1) ?? null
    : null;
  const visibleVideoIdsKey = visibleRings.map((ring) => ring.video.id).concat(selectedRing?.video.id ?? []).join("\n");

  useEffect(() => {
    const videoIds = Array.from(new Set(visibleVideoIdsKey.split("\n").filter(Boolean)));
    onVisibleVideoIdsChange(videoIds);
  }, [onVisibleVideoIdsChange, visibleVideoIdsKey]);

  const updateQuery = (nextQuery: string) => {
    onVisibleLimitChange(pageSize);
    onQueryChange(nextQuery);
  };
  const updateSort = (nextSort: VideoGrowthRingSort) => {
    onVisibleLimitChange(pageSize);
    onSortChange(nextSort);
  };

  return (
    <section className="growth-rings-studio">
      <header className="growth-rings-hero">
        <div>
          <span className="growth-rings-eyebrow"><TreePine size={15} /> Personal cinema archive</span>
          <h2>你的观看，正在长成一片森林</h2>
          <p>每一层都是一次真实发生过的观看。时间越久，纹理越深；完成与发射，则成为留在树轮里的结节与光点。</p>
        </div>
        <div className="growth-rings-summary" aria-label="影像年轮汇总">
          <span><strong>{forest.rings.length}</strong><small>影片年轮</small></span>
          <span><strong>{formatDuration(forest.totalWatchedSeconds)}</strong><small>累计观看</small></span>
          <span><strong>{forest.activeDays}</strong><small>活跃日</small></span>
          <span><strong>{forest.firstWatchedDate ? formatDate(forest.firstWatchedDate) : "尚未生长"}</strong><small>首次记录</small></span>
          <span><strong>{forest.lastWatchedDate ? formatDate(forest.lastWatchedDate) : "尚未生长"}</strong><small>最近记录</small></span>
        </div>
      </header>

      {forest.rings.length ? (
        <div className="growth-rings-layout">
          <div className="growth-rings-forest-panel">
            <div className="growth-rings-toolbar">
              <label className="growth-rings-search">
                <Search size={16} aria-hidden="true" />
                <input
                  type="search"
                  value={query}
                  placeholder="搜索影片年轮"
                  onChange={(event) => updateQuery(event.target.value)}
                />
              </label>
              <label className="growth-rings-sort">
                <span>排序</span>
                <select value={sort} onChange={(event) => updateSort(event.target.value as VideoGrowthRingSort)}>
                  {sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <small>{filteredRings.length} 枚年轮</small>
            </div>

            <div className="growth-rings-forest" aria-label="影像年轮森林">
              {visibleRings.map((ring) => (
                <button
                  className={`growth-ring-card ${selectedRing?.video.id === ring.video.id ? "active" : ""}`}
                  key={ring.video.id}
                  type="button"
                  onClick={() => {
                    onSelectVideo(ring.video.id);
                    onSelectLayer(null);
                  }}
                >
                  <GrowthRingArtwork
                    layers={ring.forestLayers}
                    ring={ring}
                    size="forest"
                    onThumbnailError={onThumbnailError}
                  />
                  <span className="growth-ring-card-copy">
                    <strong>{ring.video.name}</strong>
                    <small>{ring.activeDays} 个活跃日 · {formatDuration(ring.totalWatchedSeconds)}</small>
                  </span>
                </button>
              ))}
            </div>
            {visibleRings.length < filteredRings.length ? (
              <button
                className="secondary-button growth-rings-load-more"
                type="button"
                onClick={() => onVisibleLimitChange(visibleLimit + pageSize)}
              >
                再生长 {Math.min(pageSize, filteredRings.length - visibleRings.length)} 枚
              </button>
            ) : null}
            {!filteredRings.length ? <div className="growth-rings-filter-empty">没有匹配的影片年轮。</div> : null}
          </div>

          <aside className="growth-ring-detail">
            {selectedRing && selectedLayer ? (
              <>
                <div className="growth-ring-detail-heading">
                  <span><Layers3 size={15} /> 单片年轮</span>
                  <h3>{selectedRing.video.name}</h3>
                  <small>{formatDate(selectedRing.firstWatchedDate)} – {formatDate(selectedRing.lastWatchedDate)}</small>
                </div>
                <div className="growth-ring-detail-artwork">
                  <GrowthRingArtwork
                    interactive
                    layers={selectedRing.detailLayers}
                    ring={selectedRing}
                    selectedLayerKey={selectedLayer.key}
                    size="detail"
                    onSelectLayer={(layer) => onSelectLayer(layer.key)}
                    onThumbnailError={onThumbnailError}
                  />
                </div>
                <div className="growth-ring-detail-totals">
                  <span><Clock3 size={14} /><strong>{formatDuration(selectedRing.totalWatchedSeconds)}</strong><small>观看</small></span>
                  <span><History size={14} /><strong>{selectedRing.totalPlayCount}</strong><small>播放</small></span>
                  <span><Layers3 size={14} /><strong>{selectedRing.activeDays}</strong><small>活跃日</small></span>
                  <span><Sparkles size={14} /><strong>{selectedRing.totalEmissionCount}</strong><small>发射</small></span>
                </div>
                <div className="growth-ring-layer-detail">
                  <div>
                    <span>当前层</span>
                    <strong>{formatDateRange(selectedLayer)}</strong>
                    {selectedLayer.activeDays > 1 ? <small>合并 {selectedLayer.activeDays} 个活跃日</small> : null}
                  </div>
                  <dl>
                    <div><dt>观看时长</dt><dd>{formatDuration(selectedLayer.watchedSeconds)}</dd></div>
                    <div><dt>播放次数</dt><dd>{selectedLayer.playCount}</dd></div>
                    <div><dt>完成次数</dt><dd>{selectedLayer.completedCount}</dd></div>
                    <div><dt>发射次数</dt><dd>{selectedLayer.emissionCount}</dd></div>
                    <div><dt>此前休眠</dt><dd>{selectedLayer.gapDays ? `${selectedLayer.gapDays} 天` : "连续生长"}</dd></div>
                  </dl>
                </div>
                <button className="primary-button growth-ring-play" type="button" onClick={() => onOpenVideo(selectedRing.video)}>
                  <Play size={16} fill="currentColor" /> 播放影片
                </button>
              </>
            ) : null}
          </aside>
        </div>
      ) : (
        <div className="growth-rings-empty">
          <span><TreePine size={46} /></span>
          <h3>这片森林还没有开始生长</h3>
          <p>播放特殊媒体库中的影片后，观看日期、时长和完成记录会自然沉积成第一层年轮。</p>
        </div>
      )}
    </section>
  );
}
