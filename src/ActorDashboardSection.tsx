import { ArrowLeft, Clock3, Film, History, ImageMinus, ImagePlus, Pencil, Play, Rocket, Search, Shuffle, Upload, UserRound } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { filterAndSortActors, selectActorCoverVideo, type ActorSort } from "./actorDiscovery";
import type { ActorInsight } from "./actorUtils";
import { ControlSelect } from "./ControlSelect";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { RatingChip, TagChips } from "./MetadataChips";
import { readActorCover } from "./playerStorage";
import type { VideoCommentStore, VideoItem, VideoRatingStore, VideoStatsStore, VideoTagStore } from "./playerTypes";
import { createVideoStatsKey } from "./playerUiState";
import { useVideoThumbnail } from "./useVideoThumbnail";

const defaultActorPageSize = 12;
const actorPageSizeOptions = [12, 24, 48, 96] as const;
const actorPageSizeStorageKey = "local-web-player-actor-page-size";
const actorDiscoveryStoragePrefix = "local-web-player-actor-discovery";
const actorVideoPageSize = 12;
const unresolvedPageSize = 24;
const maxRecentActorCount = 96;
const maxRecentCoverCount = 3;

type ActorDiscoveryState = {
  scope: string;
  dateKey: string;
  batch: number;
  recentActorIds: string[];
  recentCoverVideoIds: Record<string, string[]>;
};

function readStoredActorPageSize() {
  if (typeof window === "undefined") return defaultActorPageSize;
  try {
    const storedPageSize = Number(window.localStorage.getItem(actorPageSizeStorageKey));
    return actorPageSizeOptions.includes(storedPageSize as (typeof actorPageSizeOptions)[number])
      ? storedPageSize
      : defaultActorPageSize;
  } catch {
    return defaultActorPageSize;
  }
}

function getActorDiscoveryDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getActorDiscoveryScope(libraryId: string | null) {
  return libraryId ?? "all";
}

function readActorDiscoveryState(scope: string, dateKey: string): ActorDiscoveryState {
  const fallback = { scope, dateKey, batch: 0, recentActorIds: [], recentCoverVideoIds: {} };
  if (typeof window === "undefined") return fallback;
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(`${actorDiscoveryStoragePrefix}:${scope}`) ?? "null") as Partial<ActorDiscoveryState> | null;
    if (!parsed || parsed.scope !== scope || parsed.dateKey !== dateKey) return fallback;
    return {
      scope,
      dateKey,
      batch: Number.isInteger(parsed.batch) && Number(parsed.batch) >= 0 ? Number(parsed.batch) : 0,
      recentActorIds: Array.isArray(parsed.recentActorIds) ? parsed.recentActorIds.filter((id): id is string => typeof id === "string").slice(0, maxRecentActorCount) : [],
      recentCoverVideoIds: parsed.recentCoverVideoIds && typeof parsed.recentCoverVideoIds === "object"
        ? Object.fromEntries(Object.entries(parsed.recentCoverVideoIds).map(([actorId, videoIds]) => [
          actorId,
          Array.isArray(videoIds) ? videoIds.filter((id): id is string => typeof id === "string").slice(0, maxRecentCoverCount) : [],
        ]))
        : {},
    };
  } catch {
    return fallback;
  }
}

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
  systemVideoTags: VideoTagStore;
  formatDuration: (seconds: number) => string;
  formatRelativeTime: (timestamp: number) => string;
  onSetActorCover: (actorId: string, video: VideoItem) => void;
  onUploadActorCover: (actorId: string, file: File) => void;
  onRemoveActorCover: (actorId: string) => void;
  onActorThumbnailVideosChange: (videoIds: string[]) => void;
};

function ActorVideoCover({ video, onThumbnailError }: { video: VideoItem; onThumbnailError: (videoId: string) => void }) {
  const { url } = useVideoThumbnail(video.id);
  return (
    <span className={`actor-cover ${url ? "has-image" : ""} ${url && !hasNamedVideoArtwork(video) ? "generated-thumbnail" : ""}`}>
      {url ? (
        <img src={url} alt="" decoding="async" loading="lazy" draggable={false} onError={() => onThumbnailError(video.id)} />
      ) : <Film size={28} />}
    </span>
  );
}

function StoredActorCover({ actorId, actorName, fallbackVideo, libraryId, onAvailabilityChange, onThumbnailError, version }: { actorId: string; actorName: string; fallbackVideo: VideoItem; libraryId: string | null; onAvailabilityChange: (actorId: string, isAvailable: boolean) => void; onThumbnailError: (videoId: string) => void; version: number }) {
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [hasResolvedCover, setHasResolvedCover] = useState(false);
  const { url: fallbackThumbnailUrl } = useVideoThumbnail(fallbackVideo.id);

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

  const visibleCoverUrl = coverUrl ?? fallbackThumbnailUrl;
  const isGeneratedThumbnail = Boolean(visibleCoverUrl && !coverUrl && !hasNamedVideoArtwork(fallbackVideo));
  return <span className={`actor-cover ${visibleCoverUrl ? "has-image" : ""} ${isGeneratedThumbnail ? "generated-thumbnail" : ""}`}>{visibleCoverUrl ? <img src={visibleCoverUrl} alt="" decoding="async" loading="lazy" draggable={false} onError={() => {
    if (coverUrl) {
      setCoverUrl(null);
      onAvailabilityChange(actorId, false);
    } else {
      onThumbnailError(fallbackVideo.id);
    }
  }} /> : <UserRound size={32} aria-label={`${actorName}暂无封面`} />}{hasResolvedCover && visibleCoverUrl ? <small className={`actor-cover-source${coverUrl ? " stored" : " automatic"}`}>{coverUrl ? "独立封面" : "自动封面"}</small> : null}</span>;
}

function ActorCreditStrip({ entry, formatDuration, formatRelativeTime }: {
  entry: ActorInsight;
  formatDuration: (seconds: number) => string;
  formatRelativeTime: (timestamp: number) => string;
}) {
  return (
    <span className="actor-credit-strip" aria-label={`${entry.actor.name}观看统计`}>
      <span><small>影片</small><strong>{entry.videos.length}</strong></span>
      <span><small>播放</small><strong>{entry.stats.playCount}</strong></span>
      <span><small>时长</small><strong>{formatDuration(entry.stats.totalPlayedSeconds)}</strong></span>
      <span><small>发射</small><strong>{entry.stats.emissionCount}</strong></span>
      <span><small>最近</small><strong>{entry.stats.lastWatchedAt ? formatRelativeTime(entry.stats.lastWatchedAt) : "暂无"}</strong></span>
    </span>
  );
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
  systemVideoTags,
  formatDuration,
  formatRelativeTime,
  onSetActorCover,
  onUploadActorCover,
  onRemoveActorCover,
  onActorThumbnailVideosChange,
}: ActorDashboardSectionProps) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ActorSort>("explore");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [actorPage, setActorPage] = useState(1);
  const [actorPageSize, setActorPageSize] = useState(readStoredActorPageSize);
  const [visibleActorVideoCount, setVisibleActorVideoCount] = useState(actorVideoPageSize);
  const [unresolvedPage, setUnresolvedPage] = useState(1);
  const [showUnresolved, setShowUnresolved] = useState(false);
  const [actorCoverAvailability, setActorCoverAvailability] = useState<Record<string, boolean>>({});
  const [pendingCoverRemovalActorId, setPendingCoverRemovalActorId] = useState<string | null>(null);
  const actorDashboardRef = useRef<HTMLElement>(null);
  const actorVideoLoadMoreRef = useRef<HTMLDivElement>(null);
  const actorCoverFileInputRef = useRef<HTMLInputElement>(null);
  const wasRemovingActorCoverRef = useRef(false);
  const discoveryScope = getActorDiscoveryScope(libraryId);
  const discoveryDateKey = getActorDiscoveryDateKey();
  const [discoveryState, setDiscoveryState] = useState(() => readActorDiscoveryState(discoveryScope, discoveryDateKey));
  const selected = actors.find((entry) => entry.actor.id === selectedActorId) ?? null;
  const selectedActorCoverVersion = selected ? actorCoverVersions[selected.actor.id] ?? 0 : 0;
  const handleActorCoverAvailabilityChange = useCallback((actorId: string, isAvailable: boolean) => {
    setActorCoverAvailability((availability) => availability[actorId] === isAvailable ? availability : { ...availability, [actorId]: isAvailable });
  }, []);

  const filteredActors = useMemo(() => filterAndSortActors({
    actors,
    discoveryBatch: discoveryState.batch,
    discoveryDateKey,
    discoveryScope,
    query,
    recentActorIds: discoveryState.recentActorIds,
    sort,
    sortDirection,
  }), [actors, discoveryDateKey, discoveryScope, discoveryState.batch, discoveryState.recentActorIds, query, sort, sortDirection]);
  const actorPageItemCount = actorPageSize + (sort === "explore" ? 1 : 0);
  const actorPageCount = Math.max(1, Math.ceil(filteredActors.length / actorPageItemCount));
  const unresolvedPageCount = Math.max(1, Math.ceil(unresolvedVideos.length / unresolvedPageSize));
  useEffect(() => setActorPage(1), [actorPageSize, discoveryState.batch, query, sort, sortDirection]);
  useEffect(() => {
    if (discoveryState.scope === discoveryScope && discoveryState.dateKey === discoveryDateKey) return;
    setDiscoveryState(readActorDiscoveryState(discoveryScope, discoveryDateKey));
  }, [discoveryDateKey, discoveryScope, discoveryState.dateKey, discoveryState.scope]);
  useEffect(() => {
    try {
      window.sessionStorage.setItem(`${actorDiscoveryStoragePrefix}:${discoveryState.scope}`, JSON.stringify(discoveryState));
    } catch {
      // Storage can be unavailable in private or restricted browser contexts.
    }
  }, [discoveryState]);
  useEffect(() => {
    try {
      window.localStorage.setItem(actorPageSizeStorageKey, String(actorPageSize));
    } catch {
      // Storage can be unavailable in private or restricted browser contexts.
    }
  }, [actorPageSize]);
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
  const visibleActors = useMemo(() => filteredActors.slice((actorPage - 1) * actorPageItemCount, actorPage * actorPageItemCount), [actorPage, actorPageItemCount, filteredActors]);
  const actorCoverSeed = `${discoveryScope}:${discoveryDateKey}:${sort === "explore" ? discoveryState.batch : 0}`;
  const visibleActorCards = useMemo(() => visibleActors.map((entry) => ({
    entry,
    coverVideo: selectActorCoverVideo(entry, actorCoverSeed, discoveryState.recentCoverVideoIds[entry.actor.id] ?? []),
  })), [actorCoverSeed, discoveryState.recentCoverVideoIds, visibleActors]);
  const visibleActorVideos = useMemo(
    () => selected?.videos.slice(0, visibleActorVideoCount) ?? [],
    [selected?.videos, visibleActorVideoCount],
  );
  const pagedUnresolvedVideos = useMemo(
    () => unresolvedVideos.slice((unresolvedPage - 1) * unresolvedPageSize, unresolvedPage * unresolvedPageSize),
    [unresolvedPage, unresolvedVideos],
  );
  const missingActorThumbnailVideoIds = useMemo(() => visibleActorCards.every(({ entry }) => actorCoverAvailability[entry.actor.id] !== undefined)
    ? visibleActorCards.filter(({ entry }) => !actorCoverAvailability[entry.actor.id]).map(({ coverVideo }) => coverVideo.id)
    : [], [actorCoverAvailability, visibleActorCards]);
  const actorThumbnailVideoIds = useMemo(() => selected
    ? visibleActorVideos.map(({ video }) => video.id)
    : showUnresolved
      ? pagedUnresolvedVideos.map((video) => video.id)
      : missingActorThumbnailVideoIds,
  [missingActorThumbnailVideoIds, pagedUnresolvedVideos, selected, showUnresolved, visibleActorVideos]);
  useEffect(() => {
    onActorThumbnailVideosChange(actorThumbnailVideoIds);
  }, [actorThumbnailVideoIds, onActorThumbnailVideosChange]);
  const showNextActorBatch = () => {
    setDiscoveryState((current) => {
      const recentActorIds = [
        ...visibleActorCards.map(({ entry }) => entry.actor.id),
        ...current.recentActorIds,
      ].filter((actorId, index, values) => values.indexOf(actorId) === index).slice(0, maxRecentActorCount);
      const recentActorIdSet = new Set(recentActorIds);
      const recentCoverVideoIds = Object.fromEntries(
        Object.entries(current.recentCoverVideoIds).filter(([actorId]) => recentActorIdSet.has(actorId)),
      );
      visibleActorCards.forEach(({ entry, coverVideo }) => {
        recentCoverVideoIds[entry.actor.id] = [
          coverVideo.id,
          ...(recentCoverVideoIds[entry.actor.id] ?? []),
        ].filter((videoId, index, values) => values.indexOf(videoId) === index).slice(0, maxRecentCoverCount);
      });
      return { ...current, batch: current.batch + 1, recentActorIds, recentCoverVideoIds };
    });
  };

  if (selected) {
    return (
      <section ref={actorDashboardRef} className="actor-dashboard actor-archive actor-detail" aria-label={`${selected.actor.name}演员详情`}>
        <div className="actor-detail-toolbar">
          <button className="secondary-button" type="button" onClick={() => onSelectActor(null)}><ArrowLeft size={16} /> 返回演员档案</button>
          <span className="actor-cover-header-actions">
            <input ref={actorCoverFileInputRef} type="file" accept="image/*" hidden onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) onUploadActorCover(selected.actor.id, file);
            }} />
            <button className="secondary-button" type="button" disabled={Boolean(actorCoverPendingAction)} onClick={() => { setPendingCoverRemovalActorId(null); actorCoverFileInputRef.current?.click(); }}><Upload size={15} /> {actorCoverPendingAction === `upload:${selected.actor.id}` ? "上传中..." : "上传封面"}</button>
            {actorCoverAvailability[selected.actor.id] ? <button className="secondary-button" type="button" disabled={Boolean(actorCoverPendingAction)} onClick={() => setPendingCoverRemovalActorId(selected.actor.id)}><ImageMinus size={15} /> 移除独立封面</button> : null}
          </span>
        </div>
        <header className="actor-profile-hero">
          <div className="actor-profile-cover">
            <StoredActorCover actorId={selected.actor.id} actorName={selected.actor.name} fallbackVideo={selected.representativeVideo} libraryId={libraryId} onAvailabilityChange={handleActorCoverAvailabilityChange} onThumbnailError={onThumbnailError} version={selectedActorCoverVersion} />
          </div>
          <div className="actor-profile-copy">
            <span className="actor-archive-eyebrow">Cast profile</span>
            <h1>{selected.actor.name}</h1>
            <p>由 {selected.videos.length} 部影片组成的个人放映档案。</p>
            <span className="actor-card-tags actor-profile-tags">
              {selected.commonTags.length ? selected.commonTags.map((tag) => <span key={tag}>{tag}</span>) : <em>暂无常用标签</em>}
            </span>
            <ActorCreditStrip entry={selected} formatDuration={formatDuration} formatRelativeTime={formatRelativeTime} />
          </div>
        </header>
        <div className="actor-section-heading">
          <div><span className="actor-archive-eyebrow">Filmography ledger</span><h2>出演目录</h2></div>
          <p>点击影片开始播放；维护操作保留在卡片底部。</p>
        </div>
        <div className="actor-video-grid actor-filmography-grid">
          {visibleActorVideos.map(({ video, source, lastWatchedAt }) => {
            const stats = videoStats[createVideoStatsKey(video)];
            const tags = videoTags[video.id] ?? [];
            const rating = videoRatings[video.id];
            const comment = videoComments[video.id];
            const hasRating = typeof rating === "number" || Boolean(comment?.trim());
            return <article className="actor-video-card" key={video.id}>
              <button type="button" onClick={() => onOpenVideo(video)}>
                <ActorVideoCover video={video} onThumbnailError={onThumbnailError} />
                <strong>{video.name}</strong>
                <span className="actor-video-metadata">
                  <span className="actor-video-rating-tags">
                    {hasRating ? <RatingChip rating={rating} comment={comment} /> : <span className="rating-chip actor-video-empty-chip">暂无评分</span>}
                    {tags.length ? <TagChips tags={tags} systemTags={systemVideoTags[video.id]} limit={8} compact /> : <span className="tag-chip-row compact"><span className="tag-chip actor-video-empty-chip">暂无标签</span></span>}
                  </span>
                  <span className="actor-video-playback-stats">
                    <small title={`播放次数：${stats?.playCount ?? 0}`}><Play size={13} /> {stats?.playCount ?? 0} 次播放</small>
                    <small title={`累计播放时长：${formatDuration(stats?.totalPlayedSeconds ?? 0)}`}><Clock3 size={13} /> {formatDuration(stats?.totalPlayedSeconds ?? 0)}</small>
                    <small title={`发射次数：${stats?.emissionCount ?? 0}`}><Rocket size={13} /> {stats?.emissionCount ?? 0} 次</small>
                    <small title={`上次播放：${lastWatchedAt ? formatRelativeTime(lastWatchedAt) : "暂无"}`}><History size={13} /> {lastWatchedAt ? `上次 ${formatRelativeTime(lastWatchedAt)}` : "暂无播放"}</small>
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
      <section className="actor-dashboard actor-archive actor-unresolved" aria-label="待归档片目">
        <div className="actor-detail-toolbar"><button className="secondary-button" type="button" onClick={() => setShowUnresolved(false)}><ArrowLeft size={16} /> 返回演员档案</button></div>
        <header className="actor-archive-hero actor-unresolved-hero">
          <div><span className="actor-archive-eyebrow">Unfiled titles</span><h1>待归档片目</h1><p>这些影片尚未关联演员，可逐一补全人物资料。</p></div>
          <div className="actor-unresolved-count"><span>等待整理</span><strong>{unresolvedVideos.length}</strong><small>部影片</small></div>
        </header>
        <div className="actor-video-grid actor-unresolved-grid">
          {pagedUnresolvedVideos.map((video) => {
            const stats = videoStats[createVideoStatsKey(video)];
            const tags = videoTags[video.id] ?? [];
            const rating = videoRatings[video.id];
            const comment = videoComments[video.id];
            const hasRating = typeof rating === "number" || Boolean(comment?.trim());
            return <article className="actor-video-card actor-unresolved-card" key={video.id}>
              <button type="button" onClick={() => onOpenVideo(video)} title={`播放 ${video.name}`}>
                <ActorVideoCover video={video} onThumbnailError={onThumbnailError} />
                <span className="actor-video-copy">
                  <span className="actor-archive-eyebrow">Needs actor</span>
                  <strong>{video.name}</strong>
                  <span className="actor-video-metadata">
                    <span className="actor-video-rating-tags">
                      {hasRating ? <RatingChip rating={rating} comment={comment} /> : <span className="rating-chip actor-video-empty-chip">暂无评分</span>}
                      {tags.length ? <TagChips tags={tags} systemTags={systemVideoTags[video.id]} limit={8} compact /> : <span className="tag-chip-row compact"><span className="tag-chip actor-video-empty-chip">暂无标签</span></span>}
                    </span>
                    <span className="actor-video-playback-stats">
                      <small title={`播放次数：${stats?.playCount ?? 0}`}><Play size={13} /> {stats?.playCount ?? 0} 次播放</small>
                      <small title={`累计播放时长：${formatDuration(stats?.totalPlayedSeconds ?? 0)}`}><Clock3 size={13} /> {formatDuration(stats?.totalPlayedSeconds ?? 0)}</small>
                      <small title={`发射次数：${stats?.emissionCount ?? 0}`}><Rocket size={13} /> {stats?.emissionCount ?? 0} 次</small>
                    </span>
                  </span>
                </span>
              </button>
              <div><span className="actor-source">待归档</span><button className="primary-button actor-correction-button" type="button" onClick={() => onEditVideoActors(video)}><Pencil size={13} /> 指定演员</button></div>
            </article>;
          })}
        </div>
        {unresolvedPageCount > 1 ? <div className="pagination-controls"><button className="secondary-button" type="button" disabled={unresolvedPage <= 1} onClick={() => setUnresolvedPage((value) => value - 1)}>上一页</button><span>{unresolvedPage} / {unresolvedPageCount}</span><button className="secondary-button" type="button" disabled={unresolvedPage >= unresolvedPageCount} onClick={() => setUnresolvedPage((value) => value + 1)}>下一页</button></div> : null}
      </section>
    );
  }

  return (
    <section className="actor-dashboard actor-archive" aria-label="演员档案">
      <header className="actor-archive-hero">
        <div><span className="actor-archive-eyebrow">Cast archive</span><h1>银幕人物档案</h1><p>从反复出现的面孔，辨认自己的观看轨迹。</p></div>
        <div className="actor-archive-index" aria-label="演员档案摘要">
          <div><span>收录演员</span><strong>{actors.length}</strong><small>名演员</small></div>
          <button type="button" onClick={() => { setUnresolvedPage(1); setShowUnresolved(true); }}><span>待归档片目</span><strong>{unresolvedVideos.length}</strong><small>进入整理 <span aria-hidden="true">→</span></small></button>
        </div>
      </header>
      <div className="actor-toolbar">
        <div className="actor-toolbar-copy"><span className="actor-archive-eyebrow">Directory search</span><strong>目录检索</strong></div>
        <label><Search size={16} /><input value={query} aria-label="搜索演员姓名或别名" placeholder="搜索演员姓名或别名" onChange={(event) => setQuery(event.target.value)} /></label>
        <div className="actor-sort-controls"><ControlSelect label="" ariaLabel="演员排序字段" value={sort} options={[{ value: "explore", label: "每日探索" }, { value: "count", label: "影片数" }, { value: "playCount", label: "播放次数" }, { value: "duration", label: "时长" }, { value: "emissionCount", label: "发射次数" }, { value: "name", label: "姓名" }, { value: "recent", label: "最近影片" }]} onChange={setSort} className="actor-sort-control" />{sort === "explore" ? <button className="secondary-button actor-shuffle-button" type="button" disabled={!visibleActorCards.length} title="更换演员顺序和自动封面" onClick={showNextActorBatch}><Shuffle size={15} /> 换一批</button> : <ControlSelect label="" ariaLabel="演员排序方向" value={sortDirection} options={[{ value: "desc", label: "降序" }, { value: "asc", label: "升序" }]} onChange={setSortDirection} className="actor-sort-direction-control" />}<ControlSelect label="" ariaLabel="演员每页数量" value={actorPageSize} options={actorPageSizeOptions.map((pageSize) => ({ value: pageSize, label: `每页 ${pageSize} 名` }))} onChange={setActorPageSize} className="actor-page-size-control" /></div>
      </div>
      {visibleActorCards.length ? <div className={`actor-card-grid${sort === "explore" ? " is-exploring" : ""}`}>{visibleActorCards.map(({ entry, coverVideo }, index) => {
        const isFeatured = sort === "explore" && index === 0;
        const sortedPosition = (actorPage - 1) * actorPageSize + index + 1;
        return <button className={`actor-card${isFeatured ? " actor-card-featured" : ""}`} type="button" key={entry.actor.id} onClick={() => onSelectActor(entry.actor.id)}>
          <StoredActorCover actorId={entry.actor.id} actorName={entry.actor.name} fallbackVideo={coverVideo} libraryId={libraryId} onAvailabilityChange={handleActorCoverAvailabilityChange} onThumbnailError={onThumbnailError} version={actorCoverVersions[entry.actor.id] ?? 0} />
          <span className="actor-card-details">
            <span className="actor-card-index">{isFeatured ? "今日主档案" : sort === "explore" ? "本次探索" : `排序 ${String(sortedPosition).padStart(2, "0")}`}</span>
            <span className="actor-card-heading"><strong>{entry.actor.name}</strong><small>打开档案 <span aria-hidden="true">→</span></small></span>
            <span className="actor-card-tags">{entry.commonTags.length ? entry.commonTags.map((tag) => <span key={tag}>{tag}</span>) : <em>暂无常用标签</em>}</span>
            <ActorCreditStrip entry={entry} formatDuration={formatDuration} formatRelativeTime={formatRelativeTime} />
          </span>
        </button>;
      })}</div> : <div className="actor-empty-state"><span className="actor-archive-eyebrow">No matching records</span><h2>没有找到演员</h2><p>尝试缩短关键词，或清空搜索后浏览全部档案。</p></div>}
      {actorPageCount > 1 ? <div className="pagination-controls actor-pagination"><button className="secondary-button" type="button" disabled={actorPage <= 1} onClick={() => setActorPage((value) => value - 1)}>上一页</button><span>第 {actorPage} / {actorPageCount} 页</span><button className="secondary-button" type="button" disabled={actorPage >= actorPageCount} onClick={() => setActorPage((value) => value + 1)}>下一页</button></div> : null}
    </section>
  );
}
