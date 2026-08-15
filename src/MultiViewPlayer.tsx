import {
  Check,
  Grid2X2,
  Link2,
  Pause,
  Play,
  Plus,
  Search,
  Unlink,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { Component, useMemo, useRef, useState, type CSSProperties, type ErrorInfo, type ReactNode } from "react";

import { formatTime } from "./playerFormatUtils";
import type { VideoItem } from "./playerTypes";

type MultiViewPlayerProps = {
  videos: VideoItem[];
  selectedVideoIds: string[];
  getVideoUrl: (video: VideoItem) => string;
  onChangeSelectedVideoIds: (videoIds: string[]) => void;
  onClose: () => void;
};

type PickerState = { targetIndex: number | null } | null;

const layoutOptions = [2, 3, 4] as const;

class MultiViewErrorBoundary extends Component<
  { children: ReactNode; onClose: () => void },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("多路播放渲染失败", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <section className="multi-view-player multi-view-fatal-error" role="alert">
          <strong>多路播放加载失败</strong>
          <span>普通播放器未受影响，可以退出后继续播放。</span>
          <button type="button" onClick={this.props.onClose}>退出多路播放</button>
        </section>
      );
    }
    return this.props.children;
  }
}

export function MultiViewPlayer(props: MultiViewPlayerProps) {
  return (
    <MultiViewErrorBoundary onClose={props.onClose}>
      <MultiViewPlayerContent {...props} />
    </MultiViewErrorBoundary>
  );
}

function MultiViewPlayerContent({
  videos,
  selectedVideoIds,
  getVideoUrl,
  onChangeSelectedVideoIds,
  onClose,
}: MultiViewPlayerProps) {
  const [layoutSize, setLayoutSize] = useState<(typeof layoutOptions)[number]>(2);
  const [isLinked, setIsLinked] = useState(true);
  const [pickerState, setPickerState] = useState<PickerState>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [mutedById, setMutedById] = useState<Record<string, boolean>>({});
  const [playingById, setPlayingById] = useState<Record<string, boolean>>({});
  const [timeById, setTimeById] = useState<Record<string, number>>({});
  const [durationById, setDurationById] = useState<Record<string, number>>({});
  const [failedVideoIds, setFailedVideoIds] = useState<Record<string, boolean>>({});
  const videoElementsRef = useRef(new Map<string, HTMLVideoElement>());
  const slotCount = layoutSize * layoutSize;
  const visibleVideoIds = selectedVideoIds.slice(0, slotCount);
  const videoById = useMemo(() => new Map(videos.map((video) => [video.id, video])), [videos]);
  const visibleVideos = visibleVideoIds.map((videoId) => videoById.get(videoId)).filter((video): video is VideoItem => Boolean(video));
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const filteredVideos = useMemo(() => {
    if (!normalizedQuery) return videos;
    return videos.filter((video) => `${video.name} ${video.relativePath}`.toLocaleLowerCase().includes(normalizedQuery));
  }, [normalizedQuery, videos]);
  const areAllPlaying = Boolean(visibleVideos.length) && visibleVideos.every((video) => playingById[video.id]);
  const areAllMuted = Boolean(visibleVideos.length) && visibleVideos.every((video) => mutedById[video.id] !== false);

  const playVideos = (videoIds: string[]) => {
    videoIds.forEach((videoId) => {
      void videoElementsRef.current.get(videoId)?.play().catch(() => undefined);
    });
  };

  const pauseVideos = (videoIds: string[]) => {
    videoIds.forEach((videoId) => videoElementsRef.current.get(videoId)?.pause());
  };

  const toggleAllPlayback = () => {
    if (areAllPlaying) pauseVideos(visibleVideoIds);
    else playVideos(visibleVideoIds);
  };

  const toggleVideoPlayback = (videoId: string) => {
    const targets = isLinked ? visibleVideoIds : [videoId];
    if (playingById[videoId]) pauseVideos(targets);
    else playVideos(targets);
  };

  const toggleAllAudio = () => {
    const nextMuted = !areAllMuted;
    setMutedById((current) => {
      const next = { ...current };
      visibleVideoIds.forEach((videoId) => { next[videoId] = nextMuted; });
      return next;
    });
  };

  const selectVideo = (videoId: string) => {
    if (pickerState?.targetIndex !== null && pickerState?.targetIndex !== undefined) {
      const next = selectedVideoIds.filter((id) => id !== videoId);
      next.splice(pickerState.targetIndex, 0, videoId);
      onChangeSelectedVideoIds(next.slice(0, 16));
      setPickerState(null);
      return;
    }
    onChangeSelectedVideoIds(
      selectedVideoIds.includes(videoId)
        ? selectedVideoIds.filter((id) => id !== videoId)
        : [...selectedVideoIds, videoId].slice(0, 16),
    );
  };

  const seekVideo = (videoId: string, time: number) => {
    const targets = isLinked ? visibleVideoIds : [videoId];
    targets.forEach((targetId) => {
      const element = videoElementsRef.current.get(targetId);
      if (element) element.currentTime = Math.min(time, element.duration || time);
    });
  };

  return (
    <section className="multi-view-player" aria-label="多路播放">
      <header className="multi-view-toolbar">
        <div className="multi-view-heading">
          <span className="multi-view-heading-icon"><Grid2X2 size={18} /></span>
          <div>
            <strong>多路播放</strong>
            <span>{visibleVideos.length} / {slotCount} 路</span>
          </div>
        </div>

        <div className="multi-view-layout-switch" aria-label="画面布局">
          {layoutOptions.map((size) => (
            <button
              key={size}
              type="button"
              className={layoutSize === size ? "active" : ""}
              onClick={() => setLayoutSize(size)}
              aria-pressed={layoutSize === size}
            >
              {size}×{size}
            </button>
          ))}
        </div>

        <div className="multi-view-actions">
          <button type="button" onClick={() => setPickerState({ targetIndex: null })}>
            <Plus size={16} /> 选择影片
          </button>
          <button type="button" className={isLinked ? "active" : ""} onClick={() => setIsLinked((value) => !value)} aria-pressed={isLinked}>
            {isLinked ? <Link2 size={16} /> : <Unlink size={16} />} {isLinked ? "联动" : "独立"}
          </button>
          <button type="button" onClick={toggleAllPlayback} disabled={!visibleVideos.length}>
            {areAllPlaying ? <Pause size={16} /> : <Play size={16} />} {areAllPlaying ? "全部暂停" : "全部播放"}
          </button>
          <button type="button" onClick={toggleAllAudio} disabled={!visibleVideos.length}>
            {areAllMuted ? <Volume2 size={16} /> : <VolumeX size={16} />} {areAllMuted ? "全部有声" : "全部静音"}
          </button>
          <button className="multi-view-close" type="button" onClick={onClose} title="退出多路播放" aria-label="退出多路播放">
            <X size={19} />
          </button>
        </div>
      </header>

      <div className="multi-view-grid" style={{ "--multi-view-columns": layoutSize } as CSSProperties}>
        {Array.from({ length: slotCount }, (_, index) => {
          const video = visibleVideos[index];
          if (!video) {
            return (
              <button key={`empty-${index}`} className="multi-view-empty" type="button" onClick={() => setPickerState({ targetIndex: index })}>
                <span><Plus size={20} /></span>
                <strong>添加影片</strong>
                <small>通道 {String(index + 1).padStart(2, "0")}</small>
              </button>
            );
          }
          const isMuted = mutedById[video.id] !== false;
          const currentTime = timeById[video.id] ?? 0;
          const duration = durationById[video.id] ?? video.duration ?? 0;
          return (
            <article className="multi-view-channel" key={video.id}>
              <video
                ref={(element) => {
                  if (element) videoElementsRef.current.set(video.id, element);
                  else videoElementsRef.current.delete(video.id);
                }}
                src={getVideoUrl(video)}
                poster={video.thumbnailUrl || video.posterUrl || undefined}
                muted={isMuted}
                autoPlay
                playsInline
                preload="metadata"
                onClick={() => toggleVideoPlayback(video.id)}
                onPlay={() => setPlayingById((current) => ({ ...current, [video.id]: true }))}
                onPause={() => setPlayingById((current) => ({ ...current, [video.id]: false }))}
                onTimeUpdate={(event) => {
                  const nextTime = event.currentTarget.currentTime;
                  setTimeById((current) => ({ ...current, [video.id]: nextTime }));
                }}
                onDurationChange={(event) => {
                  const nextDuration = event.currentTarget.duration || 0;
                  setDurationById((current) => ({ ...current, [video.id]: nextDuration }));
                }}
                onLoadedData={() => setFailedVideoIds((current) => current[video.id] ? { ...current, [video.id]: false } : current)}
                onError={() => setFailedVideoIds((current) => ({ ...current, [video.id]: true }))}
              />
              {failedVideoIds[video.id] ? (
                <div className="multi-view-channel-error" role="status">
                  <strong>无法播放此影片</strong>
                  <span>请在普通播放器中检查格式或兼容版本</span>
                </div>
              ) : null}
              <div className="multi-view-channel-label">
                <span>CH {String(index + 1).padStart(2, "0")}</span>
                <strong title={video.relativePath}>{video.name}</strong>
                <button type="button" onClick={() => toggleVideoPlayback(video.id)} title={playingById[video.id] ? "暂停" : "播放"}>
                  {playingById[video.id] ? <Pause size={14} /> : <Play size={14} />}
                </button>
                <button
                  type="button"
                  onClick={() => setMutedById((current) => ({ ...current, [video.id]: !isMuted }))}
                  title={isMuted ? "打开声音" : "静音"}
                >
                  {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                </button>
                <button type="button" onClick={() => onChangeSelectedVideoIds(selectedVideoIds.filter((id) => id !== video.id))} title="移除通道">
                  <X size={14} />
                </button>
              </div>
              <div className="multi-view-channel-timeline">
                <input
                  type="range"
                  min="0"
                  max={duration || 0}
                  step="0.1"
                  value={Math.min(currentTime, duration || 0)}
                  onChange={(event) => seekVideo(video.id, Number(event.target.value))}
                  aria-label={`${video.name} 播放进度`}
                />
                <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
              </div>
            </article>
          );
        })}
      </div>

      {pickerState ? (
        <div className="multi-view-picker-backdrop" role="presentation" onMouseDown={() => setPickerState(null)}>
          <section className="multi-view-picker" role="dialog" aria-modal="true" aria-label="选择多路播放影片" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <strong>{pickerState.targetIndex === null ? "选择播放通道" : `选择通道 ${String(pickerState.targetIndex + 1).padStart(2, "0")}`}</strong>
                <span>{selectedVideoIds.length} / 16 部已选</span>
              </div>
              <button type="button" onClick={() => setPickerState(null)} aria-label="关闭选片"><X size={18} /></button>
            </header>
            <label className="multi-view-search">
              <Search size={16} />
              <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="搜索片名或路径" autoFocus />
            </label>
            <div className="multi-view-picker-list">
              {filteredVideos.map((video) => {
                const isSelected = selectedVideoIds.includes(video.id);
                return (
                  <button key={video.id} type="button" className={isSelected ? "selected" : ""} onClick={() => selectVideo(video.id)}>
                    <span className="multi-view-picker-thumb">
                      {video.thumbnailUrl || video.posterUrl ? <img src={video.thumbnailUrl || video.posterUrl} alt="" /> : <Grid2X2 size={18} />}
                    </span>
                    <span className="multi-view-picker-copy">
                      <strong>{video.name}</strong>
                      <small>{video.relativePath}</small>
                    </span>
                    <span className="multi-view-picker-check">{isSelected ? <Check size={15} /> : null}</span>
                  </button>
                );
              })}
            </div>
            <footer>
              <span>最多同时保留 16 路</span>
              <button type="button" onClick={() => setPickerState(null)}>完成</button>
            </footer>
          </section>
        </div>
      ) : null}
    </section>
  );
}
