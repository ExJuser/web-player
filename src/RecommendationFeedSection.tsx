import { ArrowLeft, ChevronDown, Film, Gauge, Heart, LoaderCircle, Play, Repeat, SkipForward, Star, Volume2, VolumeX, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";

import { formatTime } from "./playerFormatUtils";
import { savePlayerFavorite } from "./playerStorage";
import type { HomeMediaMode } from "./playerTypes";
import {
  loadRecommendationFeed,
  loadRecommendationFeedStatus,
  sendRecommendationFeedback,
  type RecommendationFeedItem,
} from "./recommendationFeedClient";

type RecommendationFeedSectionProps = {
  active: boolean;
  mode: HomeMediaMode;
  modeLabel: string;
  onClose: () => void;
  onActiveTitleChange: (title: string) => void;
  onOpenOriginal: (videoId: string, startTime: number) => void;
};

const MAX_RETAINED_ITEMS = 40;
const VIDEO_WINDOW_RADIUS = 2;
const FEED_PAGE_SIZE = 8;

/**
 * 解析条目实际播放窗口。服务端在影片尚未分析且时长未知时给出的兜底
 * （startTime=0、duration=0）会命中这里：等前端拿到真实时长后，把起点挪到
 * 片内 35% 处，避开通常没有有效内容的片头。
 */
function resolveSegmentWindow(item: RecommendationFeedItem, videoDuration: number) {
  if (
    item.source === "fallback"
    && item.duration <= 0
    && item.startTime === 0
    && Number.isFinite(videoDuration)
    && videoDuration > 0
  ) {
    const span = Math.max(1, item.endTime - item.startTime);
    const start = Math.min(Math.max(videoDuration * 0.35, 0), Math.max(0, videoDuration - 1));
    return { start, end: Math.min(videoDuration, start + span) };
  }
  return { start: item.startTime, end: item.endTime };
}

/** 消费状态徽标文案：没看过 / 看到中途（带百分比）/ 已看完。 */
function viewStateLabel(item: RecommendationFeedItem): string {
  if (item.viewState === "completed") return "已看完";
  if (item.viewState === "partial") {
    const currentTime = item.progressCurrentTime;
    const duration = item.progressDuration;
    if (typeof currentTime === "number" && typeof duration === "number" && duration > 0) {
      const percent = Math.max(0, Math.min(100, Math.round((currentTime / duration) * 100)));
      return `看到 ${percent}%`;
    }
    return "看到中途";
  }
  return "未观看";
}

/** 片段时长预期文案：让用户一眼知道这段很快能刷完。 */
function segmentDurationLabel(startTime: number, endTime: number): string {
  const seconds = Math.max(0, Math.round(endTime - startTime));
  if (seconds >= 60) {
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return rest > 0 ? `约 ${minutes} 分 ${rest} 秒` : `约 ${minutes} 分钟`;
  }
  return `约 ${seconds} 秒`;
}

/** 个人信号来源（行为回看 / 人工高能片段）的推荐理由需要视觉置顶。 */
function isPersonalReason(item: RecommendationFeedItem, reasonIndex: number): boolean {
  return reasonIndex === 0 && (item.source === "behavior" || item.source === "manual");
}

/** 累计播放时长文案：秒数 → "45 秒 / 12 分钟 / 1 小时 25 分"。 */
function formatPlayedDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours} 小时 ${minutes} 分`;
  if (minutes > 0) return `${minutes} 分钟`;
  return `${seconds} 秒`;
}

const PLAYBACK_RATES = [1, 1.25, 1.5, 2];

export function RecommendationFeedSection({ active, mode, modeLabel, onActiveTitleChange, onClose, onOpenOriginal }: RecommendationFeedSectionProps) {
  const [items, setItems] = useState<RecommendationFeedItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [isMuted, setIsMuted] = useState(true);
  const [volume, setVolume] = useState(0.8);
  const [currentTime, setCurrentTime] = useState(0);
  const [analysisQueued, setAnalysisQueued] = useState(0);
  const [openDismissId, setOpenDismissId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef(new Map<string, HTMLVideoElement>());
  const requestIdRef = useRef(0);
  const lastQueuedRef = useRef<number | null>(null);
  const completedItemIdsRef = useRef(new Set<string>());
  const skippedItemIdsRef = useRef(new Set<string>());
  const previousActiveIndexRef = useRef(0);
  const sessionSeedRef = useRef("");
  const seenVideoIdsRef = useRef(new Set<string>());
  const activeItem = items[activeIndex] ?? null;

  const loadPage = useCallback(async (cursor?: string | null, append = false) => {
    if (isLoading) return;
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError("");
    try {
      const response = await loadRecommendationFeed(mode, cursor, sessionSeedRef.current);
      if (requestId !== requestIdRef.current) return;
      if (!append) seenVideoIdsRef.current.clear();
      const nextItems = response.items.filter((item) => {
        if (seenVideoIdsRef.current.has(item.videoId)) return false;
        seenVideoIdsRef.current.add(item.videoId);
        return true;
      });
      setItems((current) => append ? [...current, ...nextItems] : nextItems);
      setNextCursor(response.nextCursor);
      setAnalysisQueued(response.analysis.queued);
      if (!append) setActiveIndex(0);
    } catch (loadError) {
      if (requestId === requestIdRef.current) {
        setError(loadError instanceof Error ? loadError.message : "推荐流加载失败。");
      }
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }, [isLoading, mode]);

  // 后台分析完成后，把当前页里仍是兜底的条目按 videoId 原位替换为正式片段；
  // 不重置 activeIndex，也不改动列表长度，避免打断用户正在看的位置。
  const refreshCurrentPage = useCallback(async () => {
    const cursor = String(Math.floor(activeIndex / FEED_PAGE_SIZE) * FEED_PAGE_SIZE);
    const requestId = ++requestIdRef.current;
    try {
      const response = await loadRecommendationFeed(mode, cursor, sessionSeedRef.current);
      if (requestId !== requestIdRef.current) return;
      setItems((current) => current.map((existing) => {
        const fresh = response.items.find((item) => item.videoId === existing.videoId);
        return fresh ?? existing;
      }));
    } catch {
      // 刷新失败保留现有条目，等待下一次轮询。
    }
  }, [activeIndex, mode]);

  useEffect(() => {
    if (!active) return;
    sessionSeedRef.current = crypto.randomUUID();
    seenVideoIdsRef.current.clear();
    setItems([]);
    setNextCursor(null);
    setActiveIndex(0);
    lastQueuedRef.current = null;
    scrollRef.current?.scrollTo({ top: 0 });
    void loadPage(null, false);
    // mode is the reset boundary; loadPage intentionally stays out to avoid resetting after loading state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, mode]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const intervalId = window.setInterval(() => {
      void loadRecommendationFeedStatus()
        .then((status) => {
          if (cancelled) return;
          setAnalysisQueued(status.queued);
          const last = lastQueuedRef.current;
          lastQueuedRef.current = status.queued;
          // 队列从非空变为清空，说明本轮兜底条目基本都有正式片段了，刷新当前页替换。
          if (last != null && last > 0 && status.queued === 0) void refreshCurrentPage();
        })
        .catch(() => undefined);
    }, 3_000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [active, refreshCurrentPage]);

  useEffect(() => {
    onActiveTitleChange(active ? activeItem?.title ?? "刷片" : "");
  }, [active, activeItem?.title, onActiveTitleChange]);

  useEffect(() => {
    const previousIndex = previousActiveIndexRef.current;
    previousActiveIndexRef.current = activeIndex;
    if (previousIndex === activeIndex) return;
    const previous = items[previousIndex];
    if (!previous || completedItemIdsRef.current.has(previous.id) || skippedItemIdsRef.current.has(previous.id)) return;
    skippedItemIdsRef.current.add(previous.id);
    void sendRecommendationFeedback(previous.videoId, "skip", previous.startTime).catch(() => undefined);
  }, [activeIndex, items]);

  useEffect(() => {
    videoRefs.current.forEach((video, id) => {
      const shouldPlay = active && id === activeItem?.id;
      video.muted = isMuted;
      video.volume = volume;
      video.playbackRate = playbackRate;
      if (shouldPlay) {
        if (video.readyState >= HTMLMediaElement.HAVE_METADATA && activeItem && (video.currentTime < activeItem.startTime || video.currentTime >= activeItem.endTime)) {
          video.currentTime = activeItem.startTime;
        }
        void video.play().catch(() => undefined);
      } else {
        video.pause();
      }
    });
  }, [active, activeItem, isMuted, volume, playbackRate]);

  useEffect(() => {
    if (!active || !nextCursor || activeIndex < items.length - 3 || isLoading) return;
    void loadPage(nextCursor, true);
  }, [active, activeIndex, isLoading, items.length, loadPage, nextCursor]);

  useLayoutEffect(() => {
    const overflow = items.length - MAX_RETAINED_ITEMS;
    if (overflow <= 0) return;
    const scroll = scrollRef.current;
    const viewport = scroll?.clientHeight || 1;
    previousActiveIndexRef.current = Math.max(0, previousActiveIndexRef.current - overflow);
    setItems((current) => current.slice(Math.max(0, current.length - MAX_RETAINED_ITEMS)));
    setActiveIndex((index) => Math.max(0, index - overflow));
    scroll?.scrollTo({ top: Math.max(0, scroll.scrollTop - overflow * viewport) });
  }, [items.length]);

  useEffect(() => {
    if (activeIndex < items.length) return;
    setActiveIndex(Math.max(0, items.length - 1));
  }, [activeIndex, items.length]);

  // 切换条目时收起"不感兴趣"菜单与详情区，避免它们悬在错误的卡片上。
  useEffect(() => {
    setOpenDismissId(null);
    setExpandedId(null);
  }, [activeIndex]);

  const moveTo = useCallback((index: number) => {
    const nextIndex = Math.max(0, Math.min(items.length - 1, index));
    scrollRef.current?.scrollTo({ top: nextIndex * (scrollRef.current.clientHeight || 1), behavior: "smooth" });
    setActiveIndex(nextIndex);
  }, [items.length]);

  const toggleMute = useCallback(() => {
    const nextMuted = !isMuted;
    // 从静音恢复时若音量为 0，先给默认音量，避免"开启声音"后仍是 0。
    if (!nextMuted && volume === 0) setVolume(0.8);
    setIsMuted(nextMuted);
  }, [isMuted, volume]);

  const togglePlayActive = useCallback(() => {
    if (!activeItem) return;
    const video = videoRefs.current.get(activeItem.id);
    if (!video) return;
    if (video.paused) void video.play().catch(() => undefined);
    else video.pause();
  }, [activeItem]);

  const cyclePlaybackRate = useCallback(() => {
    setPlaybackRate((current) => PLAYBACK_RATES[(PLAYBACK_RATES.indexOf(current) + 1) % PLAYBACK_RATES.length]);
  }, []);

  useEffect(() => {
    if (!active) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTypingTarget = Boolean(target
        && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable));
      if (isTypingTarget) return;
      if (event.key === "ArrowDown" || event.key === "PageDown") {
        event.preventDefault();
        moveTo(activeIndex + 1);
      } else if (event.key === "ArrowUp" || event.key === "PageUp") {
        event.preventDefault();
        moveTo(activeIndex - 1);
      } else if (event.key === " ") {
        // 焦点在按钮上时把空格让给按钮本身（触发点击），不劫持。
        if (target?.tagName === "BUTTON") return;
        event.preventDefault();
        togglePlayActive();
      } else if (event.key === "m" || event.key === "M") {
        toggleMute();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, activeIndex, moveTo, togglePlayActive, toggleMute]);

  const progress = activeItem
    ? Math.max(0, Math.min(1, (currentTime - activeItem.startTime) / Math.max(1, activeItem.endTime - activeItem.startTime)))
    : 0;
  const positionLabel = useMemo(() => items.length ? `${activeIndex + 1} / ${items.length}${nextCursor ? "+" : ""}` : "", [activeIndex, items.length, nextCursor]);

  const dismiss = useCallback((item: RecommendationFeedItem) => {
    void sendRecommendationFeedback(item.videoId, "dismiss").catch(() => undefined);
    setOpenDismissId(null);
    setItems((current) => current.filter((candidate) => candidate.videoId !== item.videoId));
  }, []);

  /** 不感兴趣：这类标签 —— 屏蔽当前影片及其全部标签，其他带同标签的影片也不再推荐。 */
  const dismissTags = useCallback((item: RecommendationFeedItem) => {
    const tags = item.tags.filter(Boolean);
    void sendRecommendationFeedback(item.videoId, "dismiss", undefined, { scope: "tags", tags }).catch(() => undefined);
    setOpenDismissId(null);
    setItems((current) => current.filter((candidate) => candidate.videoId !== item.videoId));
  }, []);

  const toggleFavorite = useCallback((item: RecommendationFeedItem) => {
    const nextValue = !item.isFavorite;
    // 乐观更新：先改本地状态，接口失败再回滚，避免刷片节奏被网络打断。
    setItems((current) => current.map((candidate) =>
      candidate.videoId === item.videoId ? { ...candidate, isFavorite: nextValue } : candidate));
    void savePlayerFavorite(item.videoId, nextValue).catch(() => {
      setItems((current) => current.map((candidate) =>
        candidate.videoId === item.videoId ? { ...candidate, isFavorite: !nextValue } : candidate));
    });
  }, []);

  const finishItem = useCallback((item: RecommendationFeedItem) => {
    if (!completedItemIdsRef.current.has(item.id)) {
      completedItemIdsRef.current.add(item.id);
      void sendRecommendationFeedback(item.videoId, "complete", item.startTime).catch(() => undefined);
    }
    if (activeIndex < items.length - 1) moveTo(activeIndex + 1);
  }, [activeIndex, items.length, moveTo]);

  return (
    <section className="recommendation-feed" hidden={!active} aria-label={`${modeLabel}刷片推荐流`}>
      <header className="recommendation-feed-header">
        <button className="recommendation-feed-back" type="button" onClick={onClose} aria-label="返回首页"><ArrowLeft size={20} /></button>
        <div>
          <strong title={activeItem?.title}>{activeItem?.title ?? "刷片"}</strong>
          <span>{modeLabel} · {positionLabel || "正在准备"}</span>
        </div>
        <p>{analysisQueued ? <><LoaderCircle className="spin-icon" size={14} /> 后台分析 {analysisQueued} 部</> : "片段已就绪"}</p>
      </header>

      {error ? (
        <div className="recommendation-feed-state">
          <strong>推荐流暂时无法加载</strong><span>{error}</span>
          <button type="button" onClick={() => void loadPage(null, false)}>重新加载</button>
        </div>
      ) : !items.length ? (
        <div className="recommendation-feed-state">
          {isLoading ? <LoaderCircle className="spin-icon" size={30} /> : <Film size={30} />}
          <strong>{isLoading ? "正在挑选片段" : "当前模式还没有可推荐的影片"}</strong>
          <span>{isLoading ? "先返回人工高能和快速候选，深度分析会在后台继续。" : `请先向${modeLabel}媒体库添加影片。`}</span>
        </div>
      ) : (
        <div
          className="recommendation-feed-scroll"
          ref={scrollRef}
          onScroll={(event) => {
            const viewport = event.currentTarget.clientHeight || 1;
            const index = Math.round(event.currentTarget.scrollTop / viewport);
            if (index !== activeIndex) setActiveIndex(Math.max(0, Math.min(items.length - 1, index)));
          }}
        >
          {items.map((item, index) => (
            <article className="recommendation-feed-card" key={item.id} aria-current={index === activeIndex ? "true" : undefined}>
              <div className="recommendation-feed-stage">
                {Math.abs(index - activeIndex) <= VIDEO_WINDOW_RADIUS ? (
                  <video
                    ref={(element) => {
                      if (element) videoRefs.current.set(item.id, element);
                      else videoRefs.current.delete(item.id);
                    }}
                    src={item.playbackUrl}
                    poster={item.thumbnailUrl}
                    preload={index === activeIndex ? "auto" : "metadata"}
                    playsInline
                    muted={isMuted}
                    onLoadedMetadata={(event) => {
                      const video = event.currentTarget;
                      const window = resolveSegmentWindow(item, video.duration);
                      video.currentTime = Math.min(window.start, Math.max(0, video.duration - 0.1));
                      // 把修正后的窗口持久化到条目上，让进度条与时间文案与实际播放一致。
                      if (window.start !== item.startTime || window.end !== item.endTime) {
                        setItems((current) => current.map((candidate) => candidate.id === item.id
                          ? { ...candidate, startTime: window.start, endTime: window.end, duration: video.duration }
                          : candidate));
                      }
                      if (index === activeIndex && active) void video.play().catch(() => undefined);
                    }}
                    onTimeUpdate={(event) => {
                      if (index !== activeIndex) return;
                      const video = event.currentTarget;
                      setCurrentTime(video.currentTime);
                      const window = resolveSegmentWindow(item, video.duration);
                      if (video.currentTime >= window.end - 0.15) {
                        if (loopEnabled) {
                          video.currentTime = window.start;
                          setCurrentTime(window.start);
                        } else {
                          finishItem(item);
                        }
                      }
                    }}
                    onEnded={() => {
                      if (loopEnabled) {
                        const video = videoRefs.current.get(item.id);
                        if (video) {
                          const window = resolveSegmentWindow(item, video.duration);
                          video.currentTime = window.start;
                          void video.play().catch(() => undefined);
                        }
                      } else {
                        finishItem(item);
                      }
                    }}
                    onClick={(event) => {
                      if (event.currentTarget.paused) void event.currentTarget.play().catch(() => undefined);
                      else event.currentTarget.pause();
                    }}
                  />
                ) : item.thumbnailUrl ? (
                  <img className="recommendation-feed-poster" src={item.thumbnailUrl} alt="" loading="lazy" />
                ) : (
                  <div className="recommendation-feed-poster" aria-hidden="true" />
                )}
                <input
                  className="recommendation-feed-progress"
                  type="range"
                  min={item.startTime}
                  max={Math.max(item.startTime + 0.1, item.endTime)}
                  step="0.1"
                  value={index === activeIndex ? Math.max(item.startTime, Math.min(item.endTime, currentTime)) : item.startTime}
                  disabled={index !== activeIndex}
                  aria-label={`跳转片段进度：${formatTime(index === activeIndex ? currentTime : item.startTime)}`}
                  style={{ "--feed-progress": `${(index === activeIndex ? progress : 0) * 100}%` } as CSSProperties}
                  onChange={(event) => {
                    const nextTime = Number(event.currentTarget.value);
                    const video = videoRefs.current.get(item.id);
                    if (!video || !Number.isFinite(nextTime)) return;
                    video.currentTime = nextTime;
                    if (index === activeIndex) setCurrentTime(nextTime);
                  }}
                />
              </div>

              <aside className="recommendation-feed-info">
                <div className="recommendation-feed-count"><span>推荐片段</span><strong>{String(index + 1).padStart(2, "0")}</strong></div>
                <div className="recommendation-feed-copy">
                  <h1>{item.title}</h1>
                  <p title={item.relativePath}>{item.relativePath}</p>
                  <div className="recommendation-feed-meta">
                    <span className={`recommendation-feed-meta-chip status-${item.viewState ?? "untouched"}`}>{viewStateLabel(item)}</span>
                    {typeof item.rating === "number" ? (
                      <span className="recommendation-feed-meta-chip rating"><Star size={12} fill="currentColor" />{item.rating}/10</span>
                    ) : null}
                  </div>
                  <div className="recommendation-feed-reasons">
                    {item.reasons.map((reason, reasonIndex) => (
                      <span key={reason} className={`recommendation-feed-reason${isPersonalReason(item, reasonIndex) ? " reason-personal" : ""}`}>
                        {isPersonalReason(item, reasonIndex) ? <Heart size={12} fill="currentColor" /> : null}
                        {reason}
                      </span>
                    ))}
                    <span className="recommendation-feed-segment">{formatTime(item.startTime)} – {formatTime(item.endTime)} · {segmentDurationLabel(item.startTime, item.endTime)}</span>
                  </div>
                  {item.tags.length ? <div className="recommendation-feed-tags">{item.tags.slice(0, 6).map((tag) => <span key={tag}>{tag}</span>)}</div> : null}
                </div>
                <button
                  type="button"
                  className="recommendation-feed-more"
                  aria-expanded={expandedId === item.id}
                  onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                >
                  <ChevronDown size={14} />{expandedId === item.id ? "收起详情" : "更多详情"}
                </button>
                {expandedId === item.id ? (
                  <div className="recommendation-feed-details">
                    {item.tags.length ? (
                      <div className="recommendation-feed-details-block">
                        <span className="recommendation-feed-details-label">标签</span>
                        <div className="recommendation-feed-details-tags">{item.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
                      </div>
                    ) : null}
                    {item.stats && (item.stats.playCount > 0 || item.stats.totalPlayedSeconds > 0) ? (
                      <div className="recommendation-feed-details-block">
                        <span className="recommendation-feed-details-label">观看</span>
                        <span className="recommendation-feed-details-value">播放 {item.stats.playCount} 次 · 累计 {formatPlayedDuration(item.stats.totalPlayedSeconds)}</span>
                      </div>
                    ) : null}
                    {item.series?.length ? (
                      <div className="recommendation-feed-details-block">
                        <span className="recommendation-feed-details-label">同系列</span>
                        <div className="recommendation-feed-details-series">
                          {item.series.map((sibling) => (
                            <button key={sibling.videoId} type="button" title={`打开《${sibling.title}》`} onClick={() => onOpenOriginal(sibling.videoId, 0)}>{sibling.title}</button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <div className="recommendation-feed-details-block">
                      <span className="recommendation-feed-details-label">播放</span>
                      <div className="recommendation-feed-details-controls">
                        <button type="button" className={loopEnabled ? "active" : ""} aria-pressed={loopEnabled} onClick={() => setLoopEnabled((value) => !value)}><Repeat size={14} />片段循环</button>
                        <button type="button" onClick={cyclePlaybackRate}><Gauge size={14} />倍速 {String(playbackRate)}×</button>
                      </div>
                    </div>
                  </div>
                ) : null}
                <div className="recommendation-feed-actions">
                  <div className="recommendation-feed-actions-row">
                    <button
                      type="button"
                      className={`recommendation-feed-favorite${item.isFavorite ? " active" : ""}`}
                      aria-pressed={item.isFavorite}
                      onClick={() => toggleFavorite(item)}
                    >
                      <Star size={18} fill={item.isFavorite ? "currentColor" : "none"} />{item.isFavorite ? "已收藏" : "收藏"}
                    </button>
                    <button
                      type="button"
                      onClick={toggleMute}
                    >
                      {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}{isMuted ? "开启声音" : "静音"}
                    </button>
                  </div>
                  <label className="recommendation-feed-volume">
                    <Volume2 size={17} aria-hidden="true" />
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={volume}
                      aria-label="刷片音量"
                      onChange={(event) => {
                        const nextVolume = Number(event.currentTarget.value);
                        setVolume(nextVolume);
                        setIsMuted(nextVolume === 0);
                      }}
                    />
                    <span>{Math.round(volume * 100)}%</span>
                  </label>
                  <button
                    type="button"
                    className="recommendation-feed-next"
                    onClick={() => moveTo(index + 1)}
                    disabled={index >= items.length - 1 && !nextCursor}
                  >
                    <SkipForward size={18} />下一条
                  </button>
                  <div className="recommendation-feed-actions-row">
                    <button type="button" className="recommendation-feed-ghost" onClick={() => onOpenOriginal(item.videoId, Math.max(0, item.startTime - 10))}><Play size={16} />看原片</button>
                    {openDismissId === item.id ? (
                      <>
                        <button type="button" className="recommendation-feed-ghost recommendation-feed-dismiss" title="不再推荐这部片" onClick={() => dismiss(item)}><X size={16} />这部片</button>
                      </>
                    ) : (
                      <button type="button" className="recommendation-feed-ghost recommendation-feed-dismiss" title="不感兴趣" onClick={() => setOpenDismissId(item.id)}><X size={16} />不感兴趣</button>
                    )}
                  </div>
                  {openDismissId === item.id ? (
                    <div className="recommendation-feed-dismiss-menu">
                      <button type="button" className="recommendation-feed-ghost recommendation-feed-dismiss" title="不再推荐带这些标签的影片" disabled={!item.tags.length} onClick={() => dismissTags(item)}><X size={16} />这类标签</button>
                      <button type="button" className="recommendation-feed-ghost recommendation-feed-dismiss-cancel" onClick={() => setOpenDismissId(null)}>取消</button>
                    </div>
                  ) : null}
                </div>
                <p className="recommendation-feed-shortcuts">↑/↓ 切换 · 空格 播放/暂停 · M 静音</p>
              </aside>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
