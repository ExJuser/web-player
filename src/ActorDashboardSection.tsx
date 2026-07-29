import { ArrowLeft, Clock3, Film, History, ImageMinus, ImagePlus, Pencil, Play, Rocket, Search, Shuffle, Upload, UserRound, Users } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { ActorInsight } from "./actorUtils";
import { ControlSelect } from "./ControlSelect";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { RatingChip, TagChips } from "./MetadataChips";
import { readActorCover } from "./playerStorage";
import type { VideoCommentStore, VideoItem, VideoRatingStore, VideoStatsStore, VideoTagStore } from "./playerTypes";
import { createVideoStatsKey } from "./playerUiState";

const defaultActorPageSize = 12;
const actorPageSizeOptions = [12, 24, 48, 96] as const;
const actorPageSizeStorageKey = "local-web-player-actor-page-size";
const actorDiscoveryStoragePrefix = "local-web-player-actor-discovery";
const actorVideoPageSize = 12;
const unresolvedPageSize = 24;
const maxRecentActorCount = 96;
const maxRecentCoverCount = 3;

type ActorSort = "explore" | "name" | "count" | "recent" | "playCount" | "duration" | "emissionCount";

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

function hashActorDiscoveryValue(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function selectActorCoverVideo(entry: ActorInsight, seed: string, recentVideoIds: string[]) {
  const candidates = entry.videos.map(({ video }) => video);
  if (candidates.length <= 1) return candidates[0] ?? entry.representativeVideo;
  const unseenCandidates = candidates.filter((video) => !recentVideoIds.includes(video.id));
  const candidatePool = unseenCandidates.length
    ? unseenCandidates
    : candidates.filter((video) => video.id !== recentVideoIds[0]);
  return candidatePool[hashActorDiscoveryValue(`${seed}:${entry.actor.id}`) % candidatePool.length] ?? entry.representativeVideo;
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
  return <span className={`actor-cover ${visibleCoverUrl ? "has-image" : ""} ${isGeneratedThumbnail ? "generated-thumbnail" : ""}`}>{visibleCoverUrl ? <img src={visibleCoverUrl} alt="" decoding="async" loading="lazy" draggable={false} onError={() => {
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

  const filteredActors = useMemo(() => {
    const normalizedQuery = query.normalize("NFKC").trim().toLocaleLowerCase();
    const matchingActors = actors.filter((entry) => !normalizedQuery || entry.actor.name.toLocaleLowerCase().includes(normalizedQuery) || entry.actor.aliases.some((alias) => alias.label.toLocaleLowerCase().includes(normalizedQuery)));
    const maxVideoCount = Math.max(1, ...matchingActors.map((entry) => entry.videos.length));
    const latestModified = Math.max(0, ...matchingActors.map((entry) => entry.latestModified));
    const earliestModified = Math.min(latestModified, ...matchingActors.map((entry) => entry.latestModified));
    const modifiedRange = Math.max(1, latestModified - earliestModified);
    const recentActorIds = new Set(discoveryState.recentActorIds);
    const discoverySeed = `${discoveryScope}:${discoveryDateKey}:${discoveryState.batch}`;
    return matchingActors
      .sort((a, b) => {
        const nameComparison = a.actor.name.localeCompare(b.actor.name, undefined, { numeric: true, sensitivity: "base" });
        const direction = sortDirection === "asc" ? 1 : -1;
        if (sort === "explore") {
          const getDiscoveryScore = (entry: ActorInsight) => {
            const videoCountScore = Math.log1p(entry.videos.length) / Math.log1p(maxVideoCount);
            const recencyScore = (entry.latestModified - earliestModified) / modifiedRange;
            const unseenScore = recentActorIds.has(entry.actor.id) ? 0 : 1;
            const randomScore = hashActorDiscoveryValue(`${discoverySeed}:${entry.actor.id}`) / 0xffffffff;
            return videoCountScore * 0.4 + recencyScore * 0.25 + unseenScore * 0.2 + randomScore * 0.15;
          };
          return getDiscoveryScore(b) - getDiscoveryScore(a) || nameComparison;
        }
        if (sort === "name") return nameComparison * direction;
        if (sort === "recent") return (a.latestModified - b.latestModified) * direction || nameComparison;
        if (sort === "playCount") return (a.stats.playCount - b.stats.playCount) * direction || nameComparison;
        if (sort === "duration") return (a.stats.totalPlayedSeconds - b.stats.totalPlayedSeconds) * direction || nameComparison;
        if (sort === "emissionCount") return (a.stats.emissionCount - b.stats.emissionCount) * direction || nameComparison;
        return (a.videos.length - b.videos.length) * direction || nameComparison;
      });
  }, [actors, discoveryDateKey, discoveryScope, discoveryState.batch, discoveryState.recentActorIds, query, sort, sortDirection]);
  const actorPageCount = Math.max(1, Math.ceil(filteredActors.length / actorPageSize));
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
  const visibleActors = useMemo(() => filteredActors.slice((actorPage - 1) * actorPageSize, actorPage * actorPageSize), [actorPage, actorPageSize, filteredActors]);
  const actorCoverSeed = `${discoveryScope}:${discoveryDateKey}:${sort === "explore" ? discoveryState.batch : 0}`;
  const visibleActorCards = useMemo(() => visibleActors.map((entry) => ({
    entry,
    coverVideo: selectActorCoverVideo(entry, actorCoverSeed, discoveryState.recentCoverVideoIds[entry.actor.id] ?? []),
  })), [actorCoverSeed, discoveryState.recentCoverVideoIds, visibleActors]);
  const visibleActorVideos = useMemo(
    () => selected?.videos.slice(0, visibleActorVideoCount) ?? [],
    [selected?.videos, visibleActorVideoCount],
  );
  const missingActorThumbnailVideoIds = useMemo(() => visibleActorCards.every(({ entry }) => actorCoverAvailability[entry.actor.id] !== undefined)
    ? visibleActorCards.filter(({ entry }) => !actorCoverAvailability[entry.actor.id]).map(({ coverVideo }) => coverVideo.id)
    : [], [actorCoverAvailability, visibleActorCards]);
  const actorThumbnailVideoIds = useMemo(() => selected
    ? visibleActorVideos.map(({ video }) => video.id)
    : showUnresolved
      ? []
      : missingActorThumbnailVideoIds,
  [missingActorThumbnailVideoIds, selected, showUnresolved, visibleActorVideos]);
  useEffect(() => {
    onActorThumbnailVideosChange(actorThumbnailVideoIds);
  }, [actorThumbnailVideoIds, onActorThumbnailVideosChange]);
  const pagedUnresolvedVideos = unresolvedVideos.slice((unresolvedPage - 1) * unresolvedPageSize, unresolvedPage * unresolvedPageSize);
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
          {visibleActorVideos.map(({ video, source, lastWatchedAt }) => {
            const stats = videoStats[createVideoStatsKey(video)];
            const tags = videoTags[video.id] ?? [];
            const rating = videoRatings[video.id];
            const comment = videoComments[video.id];
            const hasRating = typeof rating === "number" || Boolean(comment?.trim());
            return <article className="actor-video-card" key={video.id}>
              <button type="button" onClick={() => onOpenVideo(video)}>
                <span className={`actor-cover ${video.thumbnailUrl ? "has-image" : ""} ${video.thumbnailUrl && !hasNamedVideoArtwork(video) ? "generated-thumbnail" : ""}`}>{video.thumbnailUrl ? <img src={video.thumbnailUrl} alt="" decoding="async" loading="lazy" draggable={false} onError={() => onThumbnailError(video.id)} /> : <Film size={28} />}</span>
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
      <div className="actor-toolbar"><label><Search size={16} /><input value={query} placeholder="搜索演员姓名或别名" onChange={(event) => setQuery(event.target.value)} /></label><div className="actor-sort-controls"><ControlSelect label="" ariaLabel="演员排序字段" value={sort} options={[{ value: "explore", label: "每日探索" }, { value: "count", label: "影片数" }, { value: "playCount", label: "播放次数" }, { value: "duration", label: "时长" }, { value: "emissionCount", label: "发射次数" }, { value: "name", label: "姓名" }, { value: "recent", label: "最近影片" }]} onChange={setSort} className="actor-sort-control" />{sort === "explore" ? <button className="secondary-button actor-shuffle-button" type="button" disabled={!visibleActorCards.length} title="更换演员顺序和自动封面" onClick={showNextActorBatch}><Shuffle size={15} /> 换一批</button> : <ControlSelect label="" ariaLabel="演员排序方向" value={sortDirection} options={[{ value: "desc", label: "降序" }, { value: "asc", label: "升序" }]} onChange={setSortDirection} className="actor-sort-direction-control" />}<ControlSelect label="" ariaLabel="演员每页数量" value={actorPageSize} options={actorPageSizeOptions.map((pageSize) => ({ value: pageSize, label: `每页 ${pageSize} 名` }))} onChange={setActorPageSize} className="actor-page-size-control" /></div></div>
      {visibleActorCards.length ? <div className="actor-card-grid">{visibleActorCards.map(({ entry, coverVideo }) => <button className="actor-card" type="button" key={entry.actor.id} onClick={() => onSelectActor(entry.actor.id)}><StoredActorCover actorId={entry.actor.id} actorName={entry.actor.name} fallbackVideo={coverVideo} libraryId={libraryId} onAvailabilityChange={handleActorCoverAvailabilityChange} onThumbnailError={onThumbnailError} version={actorCoverVersions[entry.actor.id] ?? 0} /><span className="actor-card-details"><span className="actor-card-heading"><strong>{entry.actor.name}</strong><small><Users size={13} /> {entry.videos.length} 部影片</small></span><span className="actor-card-tags">{entry.commonTags.length ? entry.commonTags.map((tag) => <span key={tag}>{tag}</span>) : <em>暂无常用标签</em>}</span><span className="actor-card-stats"><small title={`播放次数：${entry.stats.playCount}`}><Play size={13} /> {entry.stats.playCount} 次</small><small title={`累计播放时长：${formatDuration(entry.stats.totalPlayedSeconds)}`}><Clock3 size={13} /> {formatDuration(entry.stats.totalPlayedSeconds)}</small><small title={`发射次数：${entry.stats.emissionCount}`}><Rocket size={13} /> {entry.stats.emissionCount} 次</small><small title={`上次观看：${entry.stats.lastWatchedAt ? formatRelativeTime(entry.stats.lastWatchedAt) : "暂无"}`}><History size={13} /> {entry.stats.lastWatchedAt ? formatRelativeTime(entry.stats.lastWatchedAt) : "暂无观看"}</small></span></span></button>)}</div> : <div className="ai-empty-state">没有符合条件的演员。</div>}
      {actorPageCount > 1 ? <div className="pagination-controls"><button className="secondary-button" type="button" disabled={actorPage <= 1} onClick={() => setActorPage((value) => value - 1)}>上一页</button><span>{actorPage} / {actorPageCount}</span><button className="secondary-button" type="button" disabled={actorPage >= actorPageCount} onClick={() => setActorPage((value) => value + 1)}>下一页</button></div> : null}
    </section>
  );
}
