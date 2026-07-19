import { ArrowLeft, Clock3, Film, History, ImageMinus, ImagePlus, Pencil, Play, Rocket, Search, Upload, UserRound, Users } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { ActorInsight } from "./actorUtils";
import { ControlSelect } from "./ControlSelect";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { RatingChip, TagChips } from "./MetadataChips";
import { readActorCover } from "./playerStorage";
import type { VideoCommentStore, VideoItem, VideoRatingStore, VideoStatsStore, VideoTagStore } from "./playerTypes";
import { createVideoStatsKey } from "./playerUiState";

const actorPageSize = 12;
const actorVideoPageSize = 12;
const unresolvedPageSize = 24;

function hasNamedVideoArtwork(video: VideoItem) {
  return Boolean(video.posterFile || video.posterUrl || video.fanartFile || video.fanartUrl || video.thumbFile || video.thumbUrl);
}

type ActorDashboardSectionProps = {
  actors: ActorInsight[];
  unresolvedVideos: VideoItem[];
  selectedActorId: string | null;
  onSelectActor: (actorId: string | null) => void;
  onOpenVideo: (video: VideoItem) => void;
  onEditVideoActors: (video: VideoItem) => void;
  onThumbnailError: (videoId: string) => void;
  libraryId: string | null;
  actorCoverVersions: Record<string, number>;
  actorCoverPendingAction: string | null;
  videoComments: VideoCommentStore;
  videoRatings: VideoRatingStore;
  videoStats: VideoStatsStore;
  videoTags: VideoTagStore;
  formatDuration: (seconds: number) => string;
  formatRelativeTime: (timestamp: number) => string;
  onSetActorCover: (actorId: string, video: VideoItem) => void;
  onUploadActorCover: (actorId: string, file: File) => void;
  onRemoveActorCover: (actorId: string) => void;
  onMissingActorThumbnailVideosChange: (videoIds: string[]) => void;
};

function StoredActorCover({ actorId, actorName, fallbackVideo, libraryId, onAvailabilityChange, onThumbnailError, version }: { actorId: string; actorName: string; fallbackVideo: VideoItem; libraryId: string | null; onAvailabilityChange: (actorId: string, isAvailable: boolean) => void; onThumbnailError: (videoId: string) => void; version: number }) {
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [hasResolvedCover, setHasResolvedCover] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    let nextUrl: string | null = null;
    setCoverUrl(null);
    setHasResolvedCover(false);
    void readActorCover(libraryId, actorId).then((cover) => {
      if (isCancelled) return;
      onAvailabilityChange(actorId, Boolean(cover));
      setHasResolvedCover(true);
      if (!cover) return;
      nextUrl = URL.createObjectURL(cover);
      setCoverUrl(nextUrl);
    }).catch(() => {
      if (!isCancelled) {
        onAvailabilityChange(actorId, false);
        setHasResolvedCover(true);
      }
    });
    return () => {
      isCancelled = true;
      if (nextUrl) URL.revokeObjectURL(nextUrl);
    };
  }, [actorId, libraryId, onAvailabilityChange, version]);

  const visibleCoverUrl = coverUrl ?? fallbackVideo.thumbnailUrl;
  const isGeneratedThumbnail = Boolean(visibleCoverUrl && !coverUrl && !hasNamedVideoArtwork(fallbackVideo));
  return <span className={`actor-cover ${visibleCoverUrl ? "has-image" : ""} ${isGeneratedThumbnail ? "generated-thumbnail" : ""}`}>{visibleCoverUrl ? <img src={visibleCoverUrl} alt="" onError={() => {
    if (coverUrl) {
      setCoverUrl(null);
      onAvailabilityChange(actorId, false);
    } else {
      onThumbnailError(fallbackVideo.id);
    }
  }} /> : <UserRound size={32} aria-label={`${actorName}暂无封面`} />}{hasResolvedCover && visibleCoverUrl ? <small className={`actor-cover-source${coverUrl ? " stored" : " automatic"}`}>{coverUrl ? "独立封面" : "自动封面"}</small> : null}</span>;
}

export function ActorDashboardSection({
  actors,
  unresolvedVideos,
  selectedActorId,
  onSelectActor,
  onOpenVideo,
  onEditVideoActors,
  onThumbnailError,
  libraryId,
  actorCoverVersions,
  actorCoverPendingAction,
  videoComments,
  videoRatings,
  videoStats,
  videoTags,
  formatDuration,
  formatRelativeTime,
  onSetActorCover,
  onUploadActorCover,
  onRemoveActorCover,
  onMissingActorThumbnailVideosChange,
}: ActorDashboardSectionProps) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"name" | "count" | "recent" | "playCount" | "duration" | "emissionCount">("count");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [actorPage, setActorPage] = useState(1);
  const [visibleActorVideoCount, setVisibleActorVideoCount] = useState(actorVideoPageSize);
  const [unresolvedPage, setUnresolvedPage] = useState(1);
  const [showUnresolved, setShowUnresolved] = useState(false);
  const [actorCoverAvailability, setActorCoverAvailability] = useState<Record<string, boolean>>({});
  const [pendingCoverRemovalActorId, setPendingCoverRemovalActorId] = useState<string | null>(null);
  const actorDashboardRef = useRef<HTMLElement>(null);
  const actorVideoLoadMoreRef = useRef<HTMLDivElement>(null);
  const actorCoverFileInputRef = useRef<HTMLInputElement>(null);
  const wasRemovingActorCoverRef = useRef(false);
  const selected = actors.find((entry) => entry.actor.id === selectedActorId) ?? null;
  const selectedActorCoverVersion = selected ? actorCoverVersions[selected.actor.id] ?? 0 : 0;
  const handleActorCoverAvailabilityChange = useCallback((actorId: string, isAvailable: boolean) => {
    setActorCoverAvailability((availability) => availability[actorId] === isAvailable ? availability : { ...availability, [actorId]: isAvailable });
  }, []);

  const filteredActors = useMemo(() => {
    const normalizedQuery = query.normalize("NFKC").trim().toLocaleLowerCase();
    return actors
      .filter((entry) => !normalizedQuery || entry.actor.name.toLocaleLowerCase().includes(normalizedQuery) || entry.actor.aliases.some((alias) => alias.label.toLocaleLowerCase().includes(normalizedQuery)))
      .sort((a, b) => {
        const nameComparison = a.actor.name.localeCompare(b.actor.name, undefined, { numeric: true, sensitivity: "base" });
        const direction = sortDirection === "asc" ? 1 : -1;
        if (sort === "name") return nameComparison * direction;
        if (sort === "recent") return (a.latestModified - b.latestModified) * direction || nameComparison;
        if (sort === "playCount") return (a.stats.playCount - b.stats.playCount) * direction || nameComparison;
        if (sort === "duration") return (a.stats.totalPlayedSeconds - b.stats.totalPlayedSeconds) * direction || nameComparison;
        if (sort === "emissionCount") return (a.stats.emissionCount - b.stats.emissionCount) * direction || nameComparison;
        return (a.videos.length - b.videos.length) * direction || nameComparison;
      });
  }, [actors, query, sort, sortDirection]);
  const actorPageCount = Math.max(1, Math.ceil(filteredActors.length / actorPageSize));
  const unresolvedPageCount = Math.max(1, Math.ceil(unresolvedVideos.length / unresolvedPageSize));
  useEffect(() => setActorPage(1), [query, sort, sortDirection]);
  useEffect(() => setVisibleActorVideoCount(actorVideoPageSize), [selected?.actor.id]);
  useEffect(() => setPendingCoverRemovalActorId(null), [selected?.actor.id]);
  useLayoutEffect(() => {
    if (selectedActorId) actorDashboardRef.current?.scrollIntoView({ block: "start", inline: "nearest" });
  }, [selectedActorId]);
  useEffect(() => {
    if (!selected) return undefined;
    let isCancelled = false;
    void readActorCover(libraryId, selected.actor.id).then((cover) => {
      if (!isCancelled) handleActorCoverAvailabilityChange(selected.actor.id, Boolean(cover));
    }).catch(() => {
      if (!isCancelled) handleActorCoverAvailabilityChange(selected.actor.id, false);
    });
    return () => {
      isCancelled = true;
    };
  }, [handleActorCoverAvailabilityChange, libraryId, selected, selectedActorCoverVersion]);
  useEffect(() => {
    const isRemoving = actorCoverPendingAction?.startsWith("remove:") ?? false;
    if (wasRemovingActorCoverRef.current && !isRemoving) setPendingCoverRemovalActorId(null);
    wasRemovingActorCoverRef.current = isRemoving;
  }, [actorCoverPendingAction]);
  useEffect(() => setActorCoverAvailability({}), [libraryId]);
  useEffect(() => setActorPage((value) => Math.min(value, actorPageCount)), [actorPageCount]);
  useEffect(() => setUnresolvedPage((value) => Math.min(value, unresolvedPageCount)), [unresolvedPageCount]);
  useEffect(() => {
    const target = actorVideoLoadMoreRef.current;
    const videoCount = selected?.videos.length ?? 0;
    if (!target || visibleActorVideoCount >= videoCount) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setVisibleActorVideoCount((value) => Math.min(value + actorVideoPageSize, videoCount));
    }, { rootMargin: "240px 0px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [selected?.videos.length, visibleActorVideoCount]);
  const visibleActors = useMemo(() => filteredActors.slice((actorPage - 1) * actorPageSize, actorPage * actorPageSize), [actorPage, filteredActors]);
  const visibleActorVideos = selected?.videos.slice(0, visibleActorVideoCount) ?? [];
  const missingActorThumbnailVideoIds = useMemo(() => visibleActors.every((entry) => actorCoverAvailability[entry.actor.id] !== undefined)
    ? visibleActors.filter((entry) => !actorCoverAvailability[entry.actor.id]).map((entry) => entry.representativeVideo.id)
    : [], [actorCoverAvailability, visibleActors]);
  useEffect(() => {
    onMissingActorThumbnailVideosChange(selected || showUnresolved ? [] : missingActorThumbnailVideoIds);
  }, [missingActorThumbnailVideoIds, onMissingActorThumbnailVideosChange, selected, showUnresolved]);
  const pagedUnresolvedVideos = unresolvedVideos.slice((unresolvedPage - 1) * unresolvedPageSize, unresolvedPage * unresolvedPageSize);

  if (selected) {
    return (
      <section ref={actorDashboardRef} className="actor-dashboard actor-detail" aria-label={`${selected.actor.name}演员详情`}>
        <div className="actor-dashboard-header">
          <button className="secondary-button" type="button" onClick={() => onSelectActor(null)}><ArrowLeft size={16} /> 返回演员列表</button>
          <span className="actor-cover-header-actions">
            <input ref={actorCoverFileInputRef} type="file" accept="image/*" hidden onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) onUploadActorCover(selected.actor.id, file);
            }} />
            <button className="secondary-button" type="button" disabled={Boolean(actorCoverPendingAction)} onClick={() => { setPendingCoverRemovalActorId(null); actorCoverFileInputRef.current?.click(); }}><Upload size={15} /> {actorCoverPendingAction === `upload:${selected.actor.id}` ? "上传中..." : "上传封面"}</button>
            {actorCoverAvailability[selected.actor.id] ? <button className="secondary-button" type="button" disabled={Boolean(actorCoverPendingAction)} onClick={() => setPendingCoverRemovalActorId(selected.actor.id)}><ImageMinus size={15} /> 移除独立封面</button> : null}
          </span>
          <div><h2>{selected.actor.name}</h2><p>{selected.videos.length} 部影片</p></div>
        </div>
        <div className="actor-video-grid">
          {visibleActorVideos.map(({ video, source }) => {
            const stats = videoStats[createVideoStatsKey(video)];
            return <article className="actor-video-card" key={video.id}>
              <button type="button" onClick={() => onOpenVideo(video)}>
                <span className={`actor-cover ${video.thumbnailUrl ? "has-image" : ""} ${video.thumbnailUrl && !hasNamedVideoArtwork(video) ? "generated-thumbnail" : ""}`}>{video.thumbnailUrl ? <img src={video.thumbnailUrl} alt="" onError={() => onThumbnailError(video.id)} /> : <Film size={28} />}</span>
                <strong>{video.name}</strong>
                <span className="actor-video-metadata">
                  <TagChips tags={videoTags[video.id] ?? []} limit={8} compact />
                  <RatingChip rating={videoRatings[video.id]} comment={videoComments[video.id]} />
                  <span className="actor-video-playback-stats">
                    <small title={`播放次数：${stats?.playCount ?? 0}`}><Play size={13} /> {stats?.playCount ?? 0} 次播放</small>
                    <small title={`累计播放时长：${formatDuration(stats?.totalPlayedSeconds ?? 0)}`}><Clock3 size={13} /> {formatDuration(stats?.totalPlayedSeconds ?? 0)}</small>
                    <small title={`发射次数：${stats?.emissionCount ?? 0}`}><Rocket size={13} /> {stats?.emissionCount ?? 0} 次</small>
                  </span>
                </span>
              </button>
              <div><span className={`actor-source ${source}`}>{source === "manual" ? "人工" : source === "nfo" ? "NFO" : "演员标签"}</span><span className="actor-video-actions"><button className="secondary-button actor-correction-button" type="button" disabled={Boolean(actorCoverPendingAction)} onClick={() => { setPendingCoverRemovalActorId(null); onSetActorCover(selected.actor.id, video); }}><ImagePlus size={13} /> {actorCoverPendingAction === `set:${video.id}` ? "保存中..." : "设为封面"}</button><button className="secondary-button actor-correction-button" type="button" onClick={() => onEditVideoActors(video)}><Pencil size={13} /> 纠正演员</button></span></div>
            </article>
          })}
        </div>
        {visibleActorVideoCount < selected.videos.length ? <div ref={actorVideoLoadMoreRef} className="actor-infinite-loader">继续向下滚动加载更多影片</div> : null}
        <DeleteConfirmDialog
          isOpen={pendingCoverRemovalActorId === selected.actor.id}
          titleId="actor-cover-remove-title"
          title="移除独立封面？"
          description="移除后将恢复使用影片缩略图作为演员封面。"
          primaryText="移除封面"
          pendingText="移除中..."
          isPending={actorCoverPendingAction === `remove:${selected.actor.id}`}
          previewTitle={selected.actor.name}
          previewMeta="之后仍可重新上传或从影片缩略图设置独立封面。"
          onClose={() => setPendingCoverRemovalActorId(null)}
          onConfirm={() => onRemoveActorCover(selected.actor.id)}
        />
      </section>
    );
  }

  if (showUnresolved) {
    return (
      <section className="actor-dashboard" aria-label="未识别影片">
        <div className="actor-dashboard-header"><button className="secondary-button" type="button" onClick={() => setShowUnresolved(false)}><ArrowLeft size={16} /> 返回演员列表</button><div><h2>未识别影片</h2><p>{unresolvedVideos.length} 部影片</p></div></div>
        <div className="actor-unresolved-list">{pagedUnresolvedVideos.map((video) => <div key={video.id}><button className="actor-unresolved-video-button" type="button" onClick={() => onOpenVideo(video)} title={`播放 ${video.name}`}><Film size={16} /><strong>{video.name}</strong></button><button className="primary-button" type="button" onClick={() => onEditVideoActors(video)}>指定演员</button></div>)}</div>
        {unresolvedPageCount > 1 ? <div className="pagination-controls"><button className="secondary-button" type="button" disabled={unresolvedPage <= 1} onClick={() => setUnresolvedPage((value) => value - 1)}>上一页</button><span>{unresolvedPage} / {unresolvedPageCount}</span><button className="secondary-button" type="button" disabled={unresolvedPage >= unresolvedPageCount} onClick={() => setUnresolvedPage((value) => value + 1)}>下一页</button></div> : null}
      </section>
    );
  }

  return (
    <section className="actor-dashboard" aria-label="演员视图">
      <div className="actor-dashboard-header"><div><h2>演员视图</h2><p>{actors.length} 名演员 · {unresolvedVideos.length} 部未识别影片</p></div><button className="secondary-button" type="button" onClick={() => { setUnresolvedPage(1); setShowUnresolved(true); }}><Film size={15} /> 未识别影片</button></div>
      <div className="actor-toolbar"><label><Search size={16} /><input value={query} placeholder="搜索演员姓名或别名" onChange={(event) => setQuery(event.target.value)} /></label><div className="actor-sort-controls"><ControlSelect label="" ariaLabel="演员排序字段" value={sort} options={[{ value: "count", label: "影片数" }, { value: "playCount", label: "播放次数" }, { value: "duration", label: "时长" }, { value: "emissionCount", label: "发射次数" }, { value: "name", label: "姓名" }, { value: "recent", label: "最近影片" }]} onChange={setSort} className="actor-sort-control" /><ControlSelect label="" ariaLabel="演员排序方向" value={sortDirection} options={[{ value: "desc", label: "降序" }, { value: "asc", label: "升序" }]} onChange={setSortDirection} className="actor-sort-direction-control" /></div></div>
      {visibleActors.length ? <div className="actor-card-grid">{visibleActors.map((entry) => <button className="actor-card" type="button" key={entry.actor.id} onClick={() => onSelectActor(entry.actor.id)}><StoredActorCover actorId={entry.actor.id} actorName={entry.actor.name} fallbackVideo={entry.representativeVideo} libraryId={libraryId} onAvailabilityChange={handleActorCoverAvailabilityChange} onThumbnailError={onThumbnailError} version={actorCoverVersions[entry.actor.id] ?? 0} /><span className="actor-card-details"><span className="actor-card-heading"><strong>{entry.actor.name}</strong><small><Users size={13} /> {entry.videos.length} 部影片</small></span><span className="actor-card-tags">{entry.commonTags.length ? entry.commonTags.map((tag) => <span key={tag}>{tag}</span>) : <em>暂无常用标签</em>}</span><span className="actor-card-stats"><small title={`播放次数：${entry.stats.playCount}`}><Play size={13} /> {entry.stats.playCount} 次</small><small title={`累计播放时长：${formatDuration(entry.stats.totalPlayedSeconds)}`}><Clock3 size={13} /> {formatDuration(entry.stats.totalPlayedSeconds)}</small><small title={`发射次数：${entry.stats.emissionCount}`}><Rocket size={13} /> {entry.stats.emissionCount} 次</small><small title={`上次观看：${entry.stats.lastWatchedAt ? formatRelativeTime(entry.stats.lastWatchedAt) : "暂无"}`}><History size={13} /> {entry.stats.lastWatchedAt ? formatRelativeTime(entry.stats.lastWatchedAt) : "暂无观看"}</small></span></span></button>)}</div> : <div className="ai-empty-state">没有符合条件的演员。</div>}
      {actorPageCount > 1 ? <div className="pagination-controls"><button className="secondary-button" type="button" disabled={actorPage <= 1} onClick={() => setActorPage((value) => value - 1)}>上一页</button><span>{actorPage} / {actorPageCount}</span><button className="secondary-button" type="button" disabled={actorPage >= actorPageCount} onClick={() => setActorPage((value) => value + 1)}>下一页</button></div> : null}
    </section>
  );
}
