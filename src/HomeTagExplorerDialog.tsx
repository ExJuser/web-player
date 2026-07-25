import { Film, Minus, Play, Plus, RefreshCw, Shuffle, Star, Tags, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { HomeVideoCard } from "./playerTypes";
import { matchesTagExplorerSelection, type TagExplorerSelection } from "./tagExplorer";
import { normalizeTagKey } from "./tagUtils";

type HomeTagExplorerDialogProps = {
  initialTagKey: string | null;
  videos: HomeVideoCard[];
  onClose: () => void;
  onOpenPlaylist: (selection: TagExplorerSelection, startVideoId?: string) => void;
  onRequestThumbnails: (videoIds: string[]) => void;
  onThumbnailError: (videoId: string) => void;
};

function getStableShuffleScore(value: string, batch: number) {
  let hash = 2166136261 ^ batch;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function HomeTagExplorerDialog({
  initialTagKey,
  videos,
  onClose,
  onOpenPlaylist,
  onRequestThumbnails,
  onThumbnailError,
}: HomeTagExplorerDialogProps) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const [includedKeys, setIncludedKeys] = useState<string[]>([]);
  const [excludedKeys, setExcludedKeys] = useState<string[]>([]);
  const [previewBatch, setPreviewBatch] = useState(0);

  const tagLabelsByKey = useMemo(() => {
    const labels = new Map<string, string>();
    videos.forEach((card) => {
      (card.tags ?? []).forEach((tag) => {
        const key = normalizeTagKey(tag);
        if (key && !labels.has(key)) labels.set(key, tag.trim());
      });
    });
    return labels;
  }, [videos]);

  useEffect(() => {
    if (!initialTagKey) return;
    setIncludedKeys([initialTagKey]);
    setExcludedKeys([]);
    setPreviewBatch(0);
    window.requestAnimationFrame(() => dialogRef.current?.focus());
  }, [initialTagKey]);

  useEffect(() => {
    if (!initialTagKey) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [initialTagKey, onClose]);

  const selection = useMemo<TagExplorerSelection>(() => ({
    included: includedKeys.flatMap((key) => {
      const label = tagLabelsByKey.get(key);
      return label ? [{ key, label }] : [];
    }),
    excluded: excludedKeys.flatMap((key) => {
      const label = tagLabelsByKey.get(key);
      return label ? [{ key, label }] : [];
    }),
  }), [excludedKeys, includedKeys, tagLabelsByKey]);

  const matchingVideos = useMemo(
    () => videos.filter((card) => matchesTagExplorerSelection(card.tags ?? [], selection)),
    [selection, videos],
  );
  const completedCount = matchingVideos.filter((card) => card.progress?.completed).length;
  const ratedVideos = matchingVideos.filter((card) => typeof card.rating === "number");
  const averageRating = ratedVideos.length
    ? ratedVideos.reduce((total, card) => total + (card.rating ?? 0), 0) / ratedVideos.length
    : null;

  const relatedTags = useMemo(() => {
    const selectedKeys = new Set([...includedKeys, ...excludedKeys]);
    const counts = new Map<string, number>();
    matchingVideos.forEach((card) => {
      const seen = new Set<string>();
      (card.tags ?? []).forEach((tag) => {
        const key = normalizeTagKey(tag);
        if (!key || seen.has(key) || selectedKeys.has(key)) return;
        seen.add(key);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      });
    });
    return Array.from(counts, ([key, count]) => ({ key, count, label: tagLabelsByKey.get(key) ?? key }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "zh-Hans-CN", { numeric: true }))
      .slice(0, 8);
  }, [excludedKeys, includedKeys, matchingVideos, tagLabelsByKey]);

  const recommendedVideos = useMemo(() => {
    const prioritizedVideos = [...matchingVideos]
      .sort((a, b) => {
        const completedDifference = Number(Boolean(a.progress?.completed)) - Number(Boolean(b.progress?.completed));
        if (completedDifference) return completedDifference;
        const ratingDifference = (b.rating ?? -1) - (a.rating ?? -1);
        if (ratingDifference) return ratingDifference;
        return getStableShuffleScore(a.video.id, previewBatch) - getStableShuffleScore(b.video.id, previewBatch);
      });
    if (prioritizedVideos.length <= 6) return prioritizedVideos;
    const startIndex = (previewBatch * 6) % prioritizedVideos.length;
    return [...prioritizedVideos.slice(startIndex), ...prioritizedVideos.slice(0, startIndex)].slice(0, 6);
  }, [matchingVideos, previewBatch]);
  const recommendedVideoIdsKey = recommendedVideos.map((card) => card.video.id).join("\n");

  useEffect(() => {
    if (!initialTagKey) return;
    onRequestThumbnails(recommendedVideoIdsKey ? recommendedVideoIdsKey.split("\n") : []);
  }, [initialTagKey, onRequestThumbnails, recommendedVideoIdsKey]);

  if (!initialTagKey) return null;

  const resetPreview = () => setPreviewBatch((batch) => batch + 1);
  const addIncludedTag = (key: string) => {
    setExcludedKeys((current) => current.filter((item) => item !== key));
    setIncludedKeys((current) => current.includes(key) ? current : [...current, key]);
    setPreviewBatch(0);
  };
  const addExcludedTag = (key: string) => {
    setIncludedKeys((current) => current.filter((item) => item !== key));
    setExcludedKeys((current) => current.includes(key) ? current : [...current, key]);
    setPreviewBatch(0);
  };
  const removeTag = (key: string) => {
    setIncludedKeys((current) => current.filter((item) => item !== key));
    setExcludedKeys((current) => current.filter((item) => item !== key));
    setPreviewBatch(0);
  };
  const openPlaylist = (startVideoId?: string) => {
    if (!matchingVideos.length || (!selection.included.length && !selection.excluded.length)) return;
    onOpenPlaylist(selection, startVideoId);
    onClose();
  };
  const playRandomVideo = () => {
    if (!matchingVideos.length) return;
    const video = matchingVideos[Math.floor(Math.random() * matchingVideos.length)];
    if (!video) return;
    openPlaylist(video.video.id);
  };
  const criterionCount = selection.included.length + selection.excluded.length;

  return (
    <div className="modal-backdrop tag-dialog-backdrop home-tag-explorer-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className="home-tag-explorer-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="home-tag-explorer-title"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="home-tag-explorer-header">
          <span className="home-tag-explorer-icon" aria-hidden="true"><Tags size={22} /></span>
          <div>
            <h2 id="home-tag-explorer-title">标签探索</h2>
            <span>{matchingVideos.length} 部匹配视频</span>
          </div>
          <button className="dialog-close" type="button" onClick={onClose} title="关闭" aria-label="关闭标签探索">
            <X size={18} />
          </button>
        </header>

        <div className="home-tag-explorer-criteria" aria-label="当前标签条件">
          {selection.included.map((tag) => (
            <div className="home-tag-explorer-criterion include" key={`include:${tag.key}`}>
              <button type="button" onClick={() => addExcludedTag(tag.key)} title={`将“${tag.label}”改为排除`} aria-label={`将${tag.label}改为排除`}>
                <Plus size={13} />
              </button>
              <span>{tag.label}</span>
              <button type="button" onClick={() => removeTag(tag.key)} disabled={criterionCount === 1} title={`移除“${tag.label}”`} aria-label={`移除${tag.label}`}>
                <X size={12} />
              </button>
            </div>
          ))}
          {selection.excluded.map((tag) => (
            <div className="home-tag-explorer-criterion exclude" key={`exclude:${tag.key}`}>
              <button type="button" onClick={() => addIncludedTag(tag.key)} title={`将“${tag.label}”改为包含`} aria-label={`将${tag.label}改为包含`}>
                <Minus size={13} />
              </button>
              <span>{tag.label}</span>
              <button type="button" onClick={() => removeTag(tag.key)} disabled={criterionCount === 1} title={`移除“${tag.label}”`} aria-label={`移除${tag.label}`}>
                <X size={12} />
              </button>
            </div>
          ))}
        </div>

        <div className="home-tag-explorer-stats" aria-label="匹配视频概况">
          <div><span>匹配视频</span><strong>{matchingVideos.length}</strong></div>
          <div><span>未看完</span><strong>{matchingVideos.length - completedCount}</strong></div>
          <div><span>已观看</span><strong>{completedCount}</strong></div>
          <div><span>平均评分</span><strong>{averageRating === null ? "-" : averageRating.toFixed(1)}</strong></div>
        </div>

        <div className="home-tag-explorer-body custom-scrollbar">
          <section className="home-tag-explorer-related" aria-labelledby="home-tag-related-title">
            <div className="home-tag-explorer-section-header">
              <h3 id="home-tag-related-title">关联标签</h3>
              <span>{relatedTags.length} 项</span>
            </div>
            <div className="home-tag-explorer-related-list">
              {relatedTags.map((tag) => (
                <div className="home-tag-explorer-related-row" key={tag.key}>
                  <button type="button" onClick={() => addIncludedTag(tag.key)} title={`同时包含“${tag.label}”`}>
                    <Plus size={14} />
                    <span>{tag.label}</span>
                    <small>{tag.count}</small>
                  </button>
                  <button type="button" onClick={() => addExcludedTag(tag.key)} title={`排除“${tag.label}”`} aria-label={`排除${tag.label}`}>
                    <Minus size={14} />
                  </button>
                </div>
              ))}
              {!relatedTags.length ? <div className="home-tag-explorer-empty">当前组合没有更多关联标签</div> : null}
            </div>
          </section>

          <section className="home-tag-explorer-recommendations" aria-labelledby="home-tag-recommendations-title">
            <div className="home-tag-explorer-section-header">
              <h3 id="home-tag-recommendations-title">优先推荐</h3>
              <button type="button" onClick={resetPreview} disabled={matchingVideos.length <= 6} title="换一批" aria-label="换一批推荐视频">
                <RefreshCw size={15} />
              </button>
            </div>
            <div className="home-tag-explorer-video-grid">
              {recommendedVideos.map((card) => (
                <button
                  className="home-tag-explorer-video"
                  type="button"
                  key={card.video.id}
                  onClick={() => openPlaylist(card.video.id)}
                  title={`播放《${card.video.name}》`}
                >
                  <span className={`home-tag-explorer-thumbnail ${card.video.thumbnailUrl ? "has-image" : ""}`} aria-hidden="true">
                    {card.video.thumbnailUrl ? (
                      <img src={card.video.thumbnailUrl} alt="" loading="lazy" decoding="async" draggable={false} onError={() => onThumbnailError(card.video.id)} />
                    ) : <Film size={24} />}
                    {card.progressPercent > 0 ? <span className="home-tag-explorer-progress" style={{ width: `${card.progressPercent}%` }} /> : null}
                  </span>
                  <span className="home-tag-explorer-video-copy">
                    <strong>{card.video.name}</strong>
                    <small>
                      {card.progress?.completed ? "已观看" : "未看完"}
                      {typeof card.rating === "number" ? <><Star size={11} />{card.rating.toFixed(1)}</> : null}
                    </small>
                  </span>
                </button>
              ))}
              {!recommendedVideos.length ? <div className="home-tag-explorer-empty">当前条件没有匹配视频</div> : null}
            </div>
          </section>
        </div>

        <footer className="home-tag-explorer-actions">
          <button className="secondary-button" type="button" onClick={playRandomVideo} disabled={!matchingVideos.length}>
            <Shuffle size={16} />
            随机播放
          </button>
          <button className="primary-button" type="button" onClick={() => openPlaylist(recommendedVideos[0]?.video.id)} disabled={!matchingVideos.length}>
            <Play size={16} />
            进入组合片单
          </button>
        </footer>
      </section>
    </div>
  );
}
