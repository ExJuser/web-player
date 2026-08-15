import { ArrowLeft, Film, LoaderCircle, Play, SkipForward, Volume2, VolumeX, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";

import { formatTime } from "./playerFormatUtils";
import type { HomeMediaMode } from "./playerTypes";
import {
  loadRecommendationFeed,
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef(new Map<string, HTMLVideoElement>());
  const requestIdRef = useRef(0);
  const completedItemIdsRef = useRef(new Set<string>());
  const skippedItemIdsRef = useRef(new Set<string>());
  const previousActiveIndexRef = useRef(0);
  const sessionSeedRef = useRef("");
  const activeItem = items[activeIndex] ?? null;

  const loadPage = useCallback(async (cursor?: string | null, append = false) => {
    if (isLoading) return;
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError("");
    try {
      const response = await loadRecommendationFeed(mode, cursor, sessionSeedRef.current);
      if (requestId !== requestIdRef.current) return;
      setItems((current) => append
        ? [...current, ...response.items.filter((item) => !current.some((existing) => existing.id === item.id))]
        : response.items);
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

  useEffect(() => {
    if (!active) return;
    sessionSeedRef.current = crypto.randomUUID();
    setItems([]);
    setNextCursor(null);
    setActiveIndex(0);
    scrollRef.current?.scrollTo({ top: 0 });
    void loadPage(null, false);
    // mode is the reset boundary; loadPage intentionally stays out to avoid resetting after loading state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, mode]);

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
    void sendRecommendationFeedback(previous.videoId, "skip").catch(() => undefined);
  }, [activeIndex, items]);

  useEffect(() => {
    videoRefs.current.forEach((video, id) => {
      const shouldPlay = active && id === activeItem?.id;
      video.muted = isMuted;
      video.volume = volume;
      if (shouldPlay) {
        if (video.readyState >= HTMLMediaElement.HAVE_METADATA && activeItem && (video.currentTime < activeItem.startTime || video.currentTime >= activeItem.endTime)) {
          video.currentTime = activeItem.startTime;
        }
        void video.play().catch(() => undefined);
      } else {
        video.pause();
      }
    });
  }, [active, activeItem, isMuted, volume]);

  useEffect(() => {
    if (!active || !nextCursor || activeIndex < items.length - 3 || isLoading) return;
    void loadPage(nextCursor, true);
  }, [active, activeIndex, isLoading, items.length, loadPage, nextCursor]);

  useEffect(() => {
    if (activeIndex < items.length) return;
    setActiveIndex(Math.max(0, items.length - 1));
  }, [activeIndex, items.length]);

  const moveTo = useCallback((index: number) => {
    const nextIndex = Math.max(0, Math.min(items.length - 1, index));
    scrollRef.current?.scrollTo({ top: nextIndex * (scrollRef.current.clientHeight || 1), behavior: "smooth" });
    setActiveIndex(nextIndex);
  }, [items.length]);

  useEffect(() => {
    if (!active) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowDown" || event.key === "PageDown") {
        event.preventDefault();
        moveTo(activeIndex + 1);
      } else if (event.key === "ArrowUp" || event.key === "PageUp") {
        event.preventDefault();
        moveTo(activeIndex - 1);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, activeIndex, moveTo]);

  const progress = activeItem
    ? Math.max(0, Math.min(1, (currentTime - activeItem.startTime) / Math.max(1, activeItem.endTime - activeItem.startTime)))
    : 0;
  const positionLabel = useMemo(() => items.length ? `${activeIndex + 1} / ${items.length}${nextCursor ? "+" : ""}` : "", [activeIndex, items.length, nextCursor]);

  const dismiss = useCallback((item: RecommendationFeedItem) => {
    void sendRecommendationFeedback(item.videoId, "dismiss").catch(() => undefined);
    setItems((current) => current.filter((candidate) => candidate.videoId !== item.videoId));
  }, []);

  const finishItem = useCallback((item: RecommendationFeedItem) => {
    if (!completedItemIdsRef.current.has(item.id)) {
      completedItemIdsRef.current.add(item.id);
      void sendRecommendationFeedback(item.videoId, "complete").catch(() => undefined);
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
                <video
                  ref={(element) => {
                    if (element) videoRefs.current.set(item.id, element);
                    else videoRefs.current.delete(item.id);
                  }}
                  src={Math.abs(index - activeIndex) <= 1 ? item.playbackUrl : undefined}
                  poster={item.thumbnailUrl}
                  preload={index === activeIndex ? "auto" : "metadata"}
                  playsInline
                  muted={isMuted}
                  onLoadedMetadata={(event) => {
                    event.currentTarget.currentTime = Math.min(item.startTime, Math.max(0, event.currentTarget.duration - 0.1));
                    if (index === activeIndex && active) void event.currentTarget.play().catch(() => undefined);
                  }}
                  onTimeUpdate={(event) => {
                    if (index !== activeIndex) return;
                    setCurrentTime(event.currentTarget.currentTime);
                    if (event.currentTarget.currentTime >= item.endTime - 0.15) finishItem(item);
                  }}
                  onEnded={() => finishItem(item)}
                  onClick={(event) => {
                    if (event.currentTarget.paused) void event.currentTarget.play().catch(() => undefined);
                    else event.currentTarget.pause();
                  }}
                />
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
                  <div className="recommendation-feed-reasons">
                    {item.reasons.map((reason) => <span key={reason}>{reason}</span>)}
                    <span>{formatTime(item.startTime)} – {formatTime(item.endTime)}</span>
                  </div>
                  {item.tags.length ? <div className="recommendation-feed-tags">{item.tags.slice(0, 6).map((tag) => <span key={tag}>{tag}</span>)}</div> : null}
                </div>
                <div className="recommendation-feed-actions">
                  <button type="button" onClick={() => onOpenOriginal(item.videoId, Math.max(0, item.startTime - 10))}><Play size={18} />看原片</button>
                  <button
                    type="button"
                    onClick={() => {
                      if (isMuted && volume === 0) setVolume(0.8);
                      setIsMuted((value) => !value);
                    }}
                  >
                    {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}{isMuted ? "开启声音" : "静音"}
                  </button>
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
                  <button type="button" onClick={() => moveTo(index + 1)} disabled={index >= items.length - 1 && !nextCursor}><SkipForward size={18} />下一条</button>
                  <button type="button" className="recommendation-feed-dismiss" onClick={() => dismiss(item)}><X size={18} />不再推荐</button>
                </div>
              </aside>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
