import {
  formatFileSize,
  formatModifiedTime,
  formatResolution,
  formatTime,
} from "./playerFormatUtils";
import { fallbackMediaRootLabelForVideo } from "./mediaPathUtils";
import { collator, playlistPageSizeOptions } from "./playerConstants";
import { compareNaturalRelativePath } from "./playerMediaUtils";
import { inferSeriesTitle, scopedSeriesKeyForVideo, type SeriesVideo } from "./playerSeriesUtils";
import type { HomeMediaMode } from "./playerTypes";
import { createWatchActivityKey, type WatchActivityDayInsight } from "./watchActivityInsights";

export type { HomeMediaMode };

export type RatingFilterOperator = "gt" | "lt" | "eq";
export type RatingPlaylistMode = "numeric" | "unrated";

export type DuplicatePlaylistVideoMeta = {
  groupIndex: number;
  groupSize: number;
  severity: string;
  reasons: string[];
};

export type SeriesOption = {
  key: string;
  title: string;
  count: number;
  mediaRootLabel?: string;
};

type MediaRootForUi = {
  id?: string;
  label?: string;
  source?: "browser" | "local";
  localPath?: string;
};

type SeriesVideoForUi = SeriesVideo & {
  id: string;
};

type MediaRootStatusForUi = {
  status: "ready" | "needsAccess" | "error";
  videoCount: number;
  error?: string;
};

type MediaRootStatusWithIdForUi = MediaRootStatusForUi & {
  id: string;
};

type VideoForCompatibilityUi = {
  url?: string;
  name?: string;
  size?: number;
  duration?: number;
  width?: number;
  height?: number;
  lastModified?: number;
  playbackSource?: "browser" | "server";
  playability?: {
    status: "direct" | "remuxRecommended" | "unsupported" | "unknown" | "needsLocalPath";
    reason?: string;
    compatibleUrl?: string;
    videoCodec?: string;
    audioCodec?: string;
    pixelFormat?: string;
    videoProfile?: string;
    videoLevel?: number;
    frameRate?: number;
    bitRate?: number;
    performanceWarning?: string;
    canRemux?: boolean;
  };
};

type VideoForStatsUi = {
  id?: string;
  name?: string;
  size?: number;
  lastModified?: number;
};

type RatedVideoForUi = {
  id: string;
};

type IdentifiedVideoForUi = {
  id: string;
};

type ModeVideoForUi = IdentifiedVideoForUi & {
  mediaRootId?: string;
};

type ProgressForUi = {
  completed?: boolean;
  updatedAt?: number;
};

type HomeCardVideoForUi = IdentifiedVideoForUi & {
  name: string;
  relativePath: string;
  lastModified: number;
};

type HomeCardForUi<Video extends HomeCardVideoForUi, Progress extends ProgressForUi = ProgressForUi> = {
  video: Video;
  progress?: Progress;
};

type WatchActivityVideoForUi = IdentifiedVideoForUi & {
  relativePath: string;
};

type WatchActivityCardForUi<Video extends WatchActivityVideoForUi> = {
  video: Video;
};

type IdentifiedCardForUi<Video extends IdentifiedVideoForUi = IdentifiedVideoForUi> = {
  video: Video;
};

type WatchActivityStoreForUi = Record<string, { watchedSeconds?: number } | undefined>;

type DuplicateVideoGroupForUi<Video extends RatedVideoForUi> = {
  videos: Video[];
  severity: string;
  reasons: string[];
};

type SubtitleForUi = {
  id: string;
  name?: string;
  isManual?: boolean;
  relativePath?: string;
  source?: "external" | "manual" | "embedded" | "generated";
  format?: "srt" | "vtt";
  videoId?: string;
  embeddedTrack?: {
    streamIndex: number;
    codec: string;
    language?: string;
    title?: string;
    extractable: boolean;
    reason?: string;
  };
};

type PersistedEmbeddedSubtitleForUi = {
  id: string;
  name: string;
  relativePath: string;
  format: "srt" | "vtt";
  videoId: string;
  embeddedTrack: NonNullable<SubtitleForUi["embeddedTrack"]>;
};

const playabilityStatusLabels: Record<NonNullable<VideoForCompatibilityUi["playability"]>["status"], string> = {
  direct: "可直接播放",
  remuxRecommended: "建议转封装",
  unsupported: "需转码",
  unknown: "兼容性未知",
  needsLocalPath: "需本机路径",
};

export function getMediaRootLocalPathAction(root: MediaRootForUi) {
  if (root.source !== "browser") {
    return { visible: false, disabled: true, label: "" };
  }

  const isConfigured = Boolean(root.localPath);
  return {
    visible: true,
    disabled: isConfigured,
    label: isConfigured ? "本机路径已配置" : "配置本机路径",
  };
}

function formatRootStatus(status: MediaRootStatusForUi | undefined, readyUnit: string) {
  if (!status) return "等待扫描";
  if (status.status === "ready") return `${status.videoCount} ${readyUnit}`;
  if (status.status === "needsAccess") return "需配置本机路径";
  return status.error ? `扫描失败：${status.error}` : "扫描失败";
}

export function formatMediaRootStatus(status?: MediaRootStatusForUi) {
  return formatRootStatus(status, "个视频");
}

export function formatPhotoRootStatus(status?: MediaRootStatusForUi) {
  return formatRootStatus(status, "个图集");
}

export function getPlayableVideoUrl(video: VideoForCompatibilityUi, source: "original" | "compatible" = "compatible") {
  if (source === "original") return video.url || "";
  return video.playability?.compatibleUrl || video.url || "";
}

export function formatPlayabilityStatus(playability?: VideoForCompatibilityUi["playability"]) {
  if (!playability) return "未探测";
  if (playability.compatibleUrl) return "兼容 MP4";
  return playabilityStatusLabels[playability.status];
}

export function formatCodecSummary(playability?: VideoForCompatibilityUi["playability"]) {
  if (!playability) return "未探测";
  const videoParts = [
    playability.videoCodec,
    playability.videoProfile,
    playability.videoLevel ? `L${(playability.videoLevel / 10).toFixed(1)}` : undefined,
  ].filter(Boolean);
  const performanceParts = [
    playability.frameRate ? `${playability.frameRate.toFixed(playability.frameRate % 1 ? 2 : 0)}fps` : undefined,
    playability.bitRate ? formatBitRate(playability.bitRate) : undefined,
  ].filter(Boolean);
  return [
    videoParts.join(" "),
    ...performanceParts,
    playability.audioCodec,
    playability.pixelFormat,
  ].filter(Boolean).join(" / ") || "未探测";
}

function formatBitRate(bitRate: number) {
  if (!Number.isFinite(bitRate) || bitRate <= 0) return undefined;
  if (bitRate >= 1000 * 1000) return `${(bitRate / 1000 / 1000).toFixed(bitRate >= 10 * 1000 * 1000 ? 0 : 1)}Mbps`;
  return `${Math.round(bitRate / 1000)}Kbps`;
}

export function createVideoMetadataRows(video: VideoForCompatibilityUi) {
  return [
    ["文件名", video.name ?? ""],
    ["大小", formatFileSize(video.size ?? Number.NaN)],
    ["时长", video.duration ? formatTime(video.duration) : "读取中"],
    ["分辨率", formatResolution(video.width, video.height)],
    ["播放兼容", formatPlayabilityStatus(video.playability)],
    ["编码", formatCodecSummary(video.playability)],
    ["修改", formatModifiedTime(video.lastModified ?? 0)],
  ] as const;
}

export function createVideoMetadataTitle(video: VideoForCompatibilityUi) {
  return createVideoMetadataRows(video)
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n");
}

export function getCompatibleMediaAction(video: VideoForCompatibilityUi | null | undefined, options: { canUseServerTools: boolean }) {
  const playability = video?.playability;
  const isDirectRepairCandidate = playability?.status === "direct" && Boolean(playability.canRemux);
  const canCreate = Boolean(
    video?.playbackSource === "server" &&
    options.canUseServerTools &&
    (playability?.status === "remuxRecommended" || isDirectRepairCandidate) &&
    !playability?.compatibleUrl,
  );
  const shouldExplainPlayability = Boolean(
    playability &&
      !playability.compatibleUrl &&
      (playability.status !== "direct" || playability.performanceWarning || isDirectRepairCandidate),
  );

  return {
    visible: shouldExplainPlayability || canCreate,
    disabled: !canCreate,
    canCreate,
    label: canCreate ? (isDirectRepairCandidate ? "生成修复 MP4" : "生成兼容 MP4") : "",
  };
}

export function isMediaRootInHomeMode(root: MediaRootForUi, mode: HomeMediaMode) {
  if (mode === "all") return true;

  const normalizedLabel = (root.label ?? "").trim();
  if (mode === "anime") return normalizedLabel.toLowerCase() === "anime";
  return normalizedLabel.toUpperCase().endsWith("AV");
}

export function getHomeModeMediaRoots<Root extends MediaRootForUi>(roots: Root[], mode: HomeMediaMode) {
  return roots.filter((root) => isMediaRootInHomeMode(root, mode));
}

export function createMediaRootIdSet(roots: Array<{ id?: string }>) {
  return new Set(roots.map((root) => root.id));
}

export function filterVideosByHomeMediaMode<Video extends ModeVideoForUi>(
  videos: Video[],
  mode: HomeMediaMode,
  mediaRootIds: ReadonlySet<string | undefined>,
) {
  if (mode === "all") return videos;
  return videos.filter((video) => Boolean(video.mediaRootId && mediaRootIds.has(video.mediaRootId)));
}

export function filterMediaRootStatusesByHomeMediaMode<Status extends MediaRootStatusWithIdForUi>(
  statuses: Status[],
  mode: HomeMediaMode,
  mediaRootIds: ReadonlySet<string | undefined>,
) {
  if (mode === "all") return statuses;
  return statuses.filter((status) => mediaRootIds.has(status.id));
}

export function createLibraryStats<Video extends IdentifiedVideoForUi, Progress extends ProgressForUi>(input: {
  videos: Video[];
  progressStore: Record<string, Progress | undefined>;
  favoriteVideoIds: ReadonlySet<string>;
  isResumableProgress: (progress?: Progress) => boolean;
}) {
  let unfinished = 0;
  let completed = 0;
  let favorites = 0;
  input.videos.forEach((video) => {
    const progress = input.progressStore[video.id];
    if (progress?.completed) completed += 1;
    if (input.isResumableProgress(progress)) unfinished += 1;
    if (input.favoriteVideoIds.has(video.id)) favorites += 1;
  });
  return {
    total: input.videos.length,
    unfinished,
    completed,
    favorites,
  };
}

export function createResumableHomeCards<Video extends HomeCardVideoForUi, Progress extends ProgressForUi, Card extends HomeCardForUi<Video, Progress>>(input: {
  videos: Video[];
  createCard: (video: Video) => Card;
  isResumableProgress: (progress?: Progress) => boolean;
}) {
  return input.videos
    .map(input.createCard)
    .filter((card) => input.isResumableProgress(card.progress))
    .sort((a, b) => (b.progress?.updatedAt ?? 0) - (a.progress?.updatedAt ?? 0));
}

export function createRecentHomeCards<Video extends HomeCardVideoForUi, Progress extends ProgressForUi, Card extends HomeCardForUi<Video, Progress>>(
  videos: Video[],
  createCard: (video: Video) => Card,
  limit = 6,
) {
  return videos
    .map(createCard)
    .filter((card) => Boolean(card.progress))
    .sort((a, b) => {
      const aCompleted = a.progress?.completed ? 1 : 0;
      const bCompleted = b.progress?.completed ? 1 : 0;
      return aCompleted - bCompleted || (b.progress?.updatedAt ?? 0) - (a.progress?.updatedAt ?? 0);
    })
    .slice(0, limit);
}

export function createFavoriteHomeCards<Video extends HomeCardVideoForUi, Progress extends ProgressForUi, Card extends HomeCardForUi<Video, Progress>>(input: {
  videos: Video[];
  favoriteVideoIds: ReadonlySet<string>;
  createCard: (video: Video) => Card;
  limit?: number;
}) {
  const limit = input.limit ?? 6;
  const statusRank = (card: Card) => (card.progress?.completed ? 2 : card.progress ? 0 : 1);
  return input.videos
    .filter((video) => input.favoriteVideoIds.has(video.id))
    .map(input.createCard)
    .sort(
      (a, b) =>
        statusRank(a) - statusRank(b) ||
        (b.progress?.updatedAt ?? b.video.lastModified) - (a.progress?.updatedAt ?? a.video.lastModified) ||
        compareNaturalRelativePath(a.video.relativePath, b.video.relativePath),
    )
    .slice(0, limit);
}

export function createNextEpisodeCard<Video extends HomeCardVideoForUi, Progress extends ProgressForUi, Card extends HomeCardForUi<Video, Progress>>(input: {
  enabled: boolean;
  primaryResumeCard?: Card | null;
  recentHomeCards: Card[];
  currentVideo?: Video | null;
  playlistVideos: Video[];
  seriesTitleByVideoId: ReadonlyMap<string, string>;
  createCard: (video: Video) => Card;
}) {
  if (!input.enabled) return null;
  const sourceVideo = input.primaryResumeCard?.video ?? input.recentHomeCards[0]?.video ?? input.currentVideo;
  if (!sourceVideo) return null;
  const sourceSeriesKey = scopedSeriesKeyForVideo(sourceVideo, input.seriesTitleByVideoId.get(sourceVideo.id) ?? inferSeriesTitle(sourceVideo));
  let foundSource = false;
  for (const video of input.playlistVideos) {
    const seriesKey = scopedSeriesKeyForVideo(video, input.seriesTitleByVideoId.get(video.id) ?? inferSeriesTitle(video));
    if (seriesKey !== sourceSeriesKey) continue;
    if (foundSource) return input.createCard(video);
    if (video.id === sourceVideo.id) foundSource = true;
  }
  return null;
}

export function createPrimaryHomeCard<Card>(primaryResumeCard: Card | null | undefined, firstPlaylistCard: Card | null | undefined) {
  return primaryResumeCard ?? firstPlaylistCard ?? null;
}

export function createVideoStatsKey(video: VideoForStatsUi) {
  const normalizedName = (video.name ?? "").trim().normalize("NFKC").toLowerCase();
  const size = Number.isFinite(video.size) ? Math.max(0, Math.floor(video.size ?? 0)) : 0;
  const lastModified = Number.isFinite(video.lastModified) ? Math.max(0, Math.round(video.lastModified ?? 0)) : 0;
  return `${normalizedName}|${size}|${lastModified}`;
}

export function getRatingFilterLabel(operator: RatingFilterOperator, threshold: number) {
  const symbol = operator === "gt" ? ">" : operator === "lt" ? "<" : "=";
  return `评分 ${symbol} ${threshold}`;
}

export function getHomeMediaModeLabel(mode: HomeMediaMode) {
  if (mode === "anime") return "追番模式";
  if (mode === "special") return "特殊模式";
  return "全部";
}

export function getPlayerMediaModeLabel(mode: HomeMediaMode) {
  if (mode === "anime") return "追番";
  if (mode === "special") return "特殊";
  return "全部";
}

export function getActiveRatingPlaylistLabel(mode: RatingPlaylistMode | null, filterLabel: string) {
  return mode === "unrated" ? "未评分" : filterLabel;
}

export function getFavoritePlaylistVideos<Video extends IdentifiedVideoForUi>(videos: Video[], favoriteVideoIds: ReadonlySet<string>) {
  return videos.filter((video) => favoriteVideoIds.has(video.id));
}

export function resolveVisiblePlaylistVideos<Video>(input: {
  isDuplicatePlaylistActive: boolean;
  duplicatePlaylistVideos: Video[];
  isVersionPlaylistActive: boolean;
  versionPlaylistVideos: Video[];
  ratingPlaylistMode: RatingPlaylistMode | null;
  ratingPlaylistVideos: Video[];
  playlistFilter: "all" | "favorites";
  favoritePlaylistVideos: Video[];
  seriesFilteredVideos: Video[];
}) {
  if (input.isDuplicatePlaylistActive) return input.duplicatePlaylistVideos;
  if (input.isVersionPlaylistActive) return input.versionPlaylistVideos;
  if (input.ratingPlaylistMode) return input.ratingPlaylistVideos;
  if (input.playlistFilter === "favorites") return input.favoritePlaylistVideos;
  return input.seriesFilteredVideos;
}

export function createVideoIndexById<Video extends IdentifiedVideoForUi>(videos: Video[]) {
  const indexes = new Map<string, number>();
  videos.forEach((video, index) => indexes.set(video.id, index));
  return indexes;
}

export function resolvePlaylistIndexVideos<Video>(input: {
  isDuplicatePlaylistActive: boolean;
  isRatingPlaylistActive: boolean;
  duplicatePlaylistVideos: Video[];
  isVersionPlaylistActive: boolean;
  versionPlaylistVideos: Video[];
  ratingPlaylistVideos: Video[];
  playlistVideos: Video[];
}) {
  if (input.isDuplicatePlaylistActive) return input.duplicatePlaylistVideos;
  if (input.isVersionPlaylistActive) return input.versionPlaylistVideos;
  if (input.isRatingPlaylistActive) return input.ratingPlaylistVideos;
  return input.playlistVideos;
}

export function isVideoVisible<Video extends IdentifiedVideoForUi>(videoId: string | null | undefined, visibleVideos: Video[]) {
  return Boolean(videoId && visibleVideos.some((video) => video.id === videoId));
}

export function createRatingStats<Video extends RatedVideoForUi>(
  videos: Video[],
  ratings: Record<string, number | undefined>,
) {
  let rated = 0;
  let high = 0;
  let low = 0;
  videos.forEach((video) => {
    const rating = ratings[video.id];
    if (typeof rating !== "number") return;
    rated += 1;
    if (rating > 8) high += 1;
    if (rating < 6) low += 1;
  });
  return {
    rated,
    unrated: Math.max(videos.length - rated, 0),
    high,
    low,
  };
}

export function doesVideoMatchRatingFilter(
  rating: number | undefined,
  operator: RatingFilterOperator,
  threshold: number,
) {
  if (typeof rating !== "number") return false;
  if (operator === "gt") return rating > threshold;
  if (operator === "lt") return rating < threshold;
  return rating === threshold;
}

export function filterRatingPlaylistVideos<Video extends RatedVideoForUi>(
  videos: Video[],
  ratings: Record<string, number | undefined>,
  mode: RatingPlaylistMode | null,
  operator: RatingFilterOperator,
  threshold: number,
) {
  if (!mode) return [];
  if (mode === "unrated") {
    return videos.filter((video) => typeof ratings[video.id] !== "number");
  }
  return videos.filter((video) => doesVideoMatchRatingFilter(ratings[video.id], operator, threshold));
}

export function countRatingFilterMatches<Video extends RatedVideoForUi>(
  videos: Video[],
  ratings: Record<string, number | undefined>,
  operator: RatingFilterOperator,
  threshold: number,
) {
  let matches = 0;
  videos.forEach((video) => {
    if (doesVideoMatchRatingFilter(ratings[video.id], operator, threshold)) matches += 1;
  });
  return matches;
}

export function createPlaylistPageLabels(input: {
  totalCount: number;
  startIndex: number;
  pageCount: number;
}) {
  const startLabel = input.totalCount ? input.startIndex + 1 : 0;
  const endLabel = Math.min(input.startIndex + input.pageCount, input.totalCount);
  return { startLabel, endLabel };
}

export function formatPlaylistVisibleCountLabel(input: {
  totalCount: number;
  pageSize: number;
  startLabel: number;
  endLabel: number;
}) {
  return input.totalCount > input.pageSize
    ? `${input.startLabel}-${input.endLabel} / ${input.totalCount}`
    : `${input.totalCount}`;
}

export function createPlaylistPageSizeSelectOptions(values = playlistPageSizeOptions) {
  return values.map((size) => ({ value: size, label: `${size}/页` }));
}

export function createPlaylistPanelLabels(input: {
  isDuplicatePlaylistActive: boolean;
  isVersionPlaylistActive: boolean;
  isRatingPlaylistActive: boolean;
  isPlaylistSeriesMode: boolean;
  playlistVisibleCountLabel: string;
  duplicateGroupCount: number;
  versionGroupCount: number;
  activeRatingPlaylistLabel: string;
  modeFilteredVideoCount: number;
  playlistFilter: "all" | "favorites";
  homeMediaMode: HomeMediaMode;
  homeMediaModeLabel: string;
  totalVideoCount: number;
}) {
  const ariaLabel = input.isDuplicatePlaylistActive
    ? "重复视频列表"
    : input.isVersionPlaylistActive
      ? "剪辑与修复版本列表"
    : input.isRatingPlaylistActive
      ? "评分视频列表"
      : input.isPlaylistSeriesMode
        ? "追番列表"
        : "播放列表";

  const title = input.isDuplicatePlaylistActive
    ? `重复列表 · ${input.playlistVisibleCountLabel} 个视频 · ${input.duplicateGroupCount} 组`
    : input.isVersionPlaylistActive
      ? `版本列表 · ${input.playlistVisibleCountLabel} 个视频 · ${input.versionGroupCount} 组`
    : input.isRatingPlaylistActive
      ? `评分列表 · ${input.playlistVisibleCountLabel} 个视频 · ${input.activeRatingPlaylistLabel}`
      : input.modeFilteredVideoCount
        ? input.playlistFilter === "favorites"
          ? `${input.playlistVisibleCountLabel} / ${input.modeFilteredVideoCount} 个收藏`
          : input.isPlaylistSeriesMode
            ? `${input.playlistVisibleCountLabel} / ${input.modeFilteredVideoCount} 个视频`
            : input.homeMediaMode === "all" || input.homeMediaMode === "special"
              ? `${input.playlistVisibleCountLabel} 个视频`
              : `${input.homeMediaModeLabel} · ${input.playlistVisibleCountLabel} 个视频`
        : input.totalVideoCount
          ? `当前${input.homeMediaModeLabel}没有视频`
          : "等待新增媒体库";

  return { ariaLabel, title };
}

export function createPlaylistThumbnailVideos<Video extends IdentifiedVideoForUi>(input: {
  visibleVideos: Video[];
  viewportVideos: Video[];
  visibleVideoIndexById: ReadonlyMap<string, number>;
  currentVideoId: string | null | undefined;
  activeRadius: number;
}) {
  const queuedVideos: Video[] = [];
  const seenIds = new Set<string>();
  const addVideoRange = (startIndex: number, endIndex: number) => {
    for (let index = Math.max(0, startIndex); index < Math.min(input.visibleVideos.length, endIndex); index += 1) {
      const video = input.visibleVideos[index];
      if (!video || seenIds.has(video.id)) continue;
      seenIds.add(video.id);
      queuedVideos.push(video);
    }
  };

  if (input.currentVideoId) {
    const activeIndex = input.visibleVideoIndexById.get(input.currentVideoId);
    if (activeIndex !== undefined) {
      addVideoRange(activeIndex - input.activeRadius, activeIndex + input.activeRadius + 1);
    }
  }

  input.viewportVideos.forEach((video) => {
    if (seenIds.has(video.id)) return;
    seenIds.add(video.id);
    queuedVideos.push(video);
  });
  return queuedVideos;
}

export function createThumbnailQueueVideoIds<Video extends IdentifiedVideoForUi>(input: {
  isHomeViewVisible: boolean;
  primaryHomeVideo?: Video | null;
  nextEpisodeVideo?: Video | null;
  recentHomeVideos: Array<Video | null | undefined>;
  favoriteHomeVideos: Array<Video | null | undefined>;
  watchActivityCarouselVideoIds: string[];
  modeFilteredVideoById: ReadonlyMap<string, Video>;
  playlistThumbnailVideos: Video[];
}) {
  const queuedVideos = input.isHomeViewVisible
    ? [
        input.primaryHomeVideo,
        input.nextEpisodeVideo,
        ...input.recentHomeVideos,
        ...input.favoriteHomeVideos,
        ...input.watchActivityCarouselVideoIds.map((videoId) => input.modeFilteredVideoById.get(videoId)),
        ...input.playlistThumbnailVideos,
      ]
    : input.playlistThumbnailVideos;
  const seenIds = new Set<string>();
  const ids: string[] = [];
  queuedVideos.forEach((video) => {
    if (!video || seenIds.has(video.id)) return;
    seenIds.add(video.id);
    ids.push(video.id);
  });
  return ids;
}

export function createWatchActivityCarouselCardsByDate<Video extends WatchActivityVideoForUi, Card extends WatchActivityCardForUi<Video>>(input: {
  days: WatchActivityDayInsight[];
  videoById: ReadonlyMap<string, Video>;
  createCard: (video: Video) => Card;
  maxCardsPerDay?: number;
}) {
  const maxCardsPerDay = input.maxCardsPerDay ?? 5;
  const cardsByDate = new Map<string, Card[]>();
  input.days.forEach((day) => {
    const cards = day.videoIds
      .slice(0, maxCardsPerDay)
      .map((videoId) => input.videoById.get(videoId))
      .filter((video): video is Video => Boolean(video))
      .map(input.createCard);
    if (cards.length) cardsByDate.set(day.date, cards);
  });
  return cardsByDate;
}

export function createWatchActivityCarouselVideoIds<Card extends IdentifiedCardForUi>(
  cardsByDate: ReadonlyMap<string, Card[]>,
) {
  const seenIds = new Set<string>();
  const ids: string[] = [];
  cardsByDate.forEach((cards) => {
    cards.forEach((card) => {
      if (seenIds.has(card.video.id)) return;
      seenIds.add(card.video.id);
      ids.push(card.video.id);
    });
  });
  return ids;
}

export function resolveSelectedWatchActivityDay(days: WatchActivityDayInsight[], selectedDate: string | null | undefined) {
  return (
    days.find((day) => day.date === selectedDate) ??
    [...days]
      .reverse()
      .find((day) => day.watchedSeconds > 0 || day.playCount > 0 || day.completedCount > 0 || day.emissionCount > 0) ??
    days[days.length - 1] ??
    null
  );
}

export function createSelectedWatchActivityCards<Video extends WatchActivityVideoForUi, Card extends WatchActivityCardForUi<Video>>(input: {
  day: WatchActivityDayInsight | null;
  videos: Video[];
  activityStore: WatchActivityStoreForUi;
  createCard: (video: Video) => Card;
  maxCards?: number;
}) {
  if (!input.day) return [];
  const day = input.day;
  const maxCards = input.maxCards ?? 6;
  const selectedIds = new Set(day.videoIds);
  return input.videos
    .filter((video) => selectedIds.has(video.id))
    .map(input.createCard)
    .sort((a, b) => {
      const aActivity = input.activityStore[createWatchActivityKey(day.date, a.video.id)];
      const bActivity = input.activityStore[createWatchActivityKey(day.date, b.video.id)];
      return (bActivity?.watchedSeconds ?? 0) - (aActivity?.watchedSeconds ?? 0) || compareNaturalRelativePath(a.video.relativePath, b.video.relativePath);
    })
    .slice(0, maxCards);
}

export function getDuplicatePlaylistVideos<Video extends RatedVideoForUi>(
  videos: Video[],
  groups: Array<DuplicateVideoGroupForUi<RatedVideoForUi>>,
) {
  const availableVideosById = new Map(videos.map((video) => [video.id, video]));
  const seenIds = new Set<string>();
  const nextVideos: Video[] = [];

  groups.forEach((group) => {
    group.videos.forEach((groupVideo) => {
      if (seenIds.has(groupVideo.id)) return;
      const video = availableVideosById.get(groupVideo.id);
      if (!video) return;
      seenIds.add(video.id);
      nextVideos.push(video);
    });
  });

  return nextVideos;
}

export function createDuplicatePlaylistMetaByVideoId(groups: Array<DuplicateVideoGroupForUi<RatedVideoForUi>>) {
  const metaById = new Map<string, DuplicatePlaylistVideoMeta>();
  groups.forEach((group, groupIndex) => {
    group.videos.forEach((video) => {
      if (metaById.has(video.id)) return;
      metaById.set(video.id, {
        groupIndex: groupIndex + 1,
        groupSize: group.videos.length,
        severity: group.severity,
        reasons: group.reasons,
      });
    });
  });
  return metaById;
}

export function createSeriesOptions<Video extends SeriesVideoForUi>(
  videos: Video[],
  mediaRoots: MediaRootForUi[] = [],
) {
  const mediaRootsById = new Map(mediaRoots.map((root) => [root.id, root]));
  const seriesByKey = new Map<string, SeriesOption>();
  videos.forEach((video) => {
    const title = inferSeriesTitle(video);
    const key = scopedSeriesKeyForVideo(video, title);
    const mediaRoot = video.mediaRootId ? mediaRootsById.get(video.mediaRootId) : null;
    const existing = seriesByKey.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      seriesByKey.set(key, {
        key,
        title,
        count: 1,
        mediaRootLabel: mediaRoot?.label ?? (video.mediaRootId ? fallbackMediaRootLabelForVideo(video) : undefined),
      });
    }
  });
  return Array.from(seriesByKey.values()).sort((a, b) => collator.compare(a.title, b.title));
}

export function createSeriesTitleByVideoId<Video extends SeriesVideoForUi>(videos: Video[]) {
  const titles = new Map<string, string>();
  videos.forEach((video) => titles.set(video.id, inferSeriesTitle(video)));
  return titles;
}

export function filterVideosBySeries<Video extends SeriesVideoForUi>(
  videos: Video[],
  options: SeriesOption[],
  titlesByVideoId: ReadonlyMap<string, string>,
  isSeriesMode: boolean,
  selectedSeriesKey: string,
) {
  if (!isSeriesMode || selectedSeriesKey === "all") return videos;
  if (!options.some((series) => series.key === selectedSeriesKey)) return videos;
  return videos.filter((video) => scopedSeriesKeyForVideo(video, titlesByVideoId.get(video.id) ?? "") === selectedSeriesKey);
}

export function createSeriesOptionsKey(options: SeriesOption[]) {
  return options.map((series) => `${series.key}\t${series.title}\t${series.count}`).join("\n");
}

export function getCurrentSeriesKey<Video extends SeriesVideoForUi>(
  currentVideo: Video | null | undefined,
  titlesByVideoId: ReadonlyMap<string, string>,
) {
  return currentVideo ? scopedSeriesKeyForVideo(currentVideo, titlesByVideoId.get(currentVideo.id) ?? inferSeriesTitle(currentVideo)) : "";
}

export function getActiveSeriesOption(
  options: SeriesOption[],
  input: { isSeriesMode: boolean; selectedSeriesKey: string; currentSeriesKey: string },
) {
  if (!input.isSeriesMode) return null;
  if (input.selectedSeriesKey !== "all") {
    return options.find((series) => series.key === input.selectedSeriesKey) ?? null;
  }
  if (input.currentSeriesKey) {
    return options.find((series) => series.key === input.currentSeriesKey) ?? null;
  }
  return options[0] ?? null;
}

export function shouldShowHomeRecapCard(mode: HomeMediaMode) {
  return mode === "anime";
}

export function shouldShowNextEpisodeCard(mode: HomeMediaMode) {
  return mode !== "special";
}

export function resolvePlayerEntrySeriesMode(mode: HomeMediaMode, seriesKey: string | null | undefined) {
  if (mode === "anime") {
    return {
      isSeriesMode: true,
      selectedSeriesKey: seriesKey || "all",
      resetPlaylistFilter: true,
    };
  }

  return {
    isSeriesMode: false,
    selectedSeriesKey: "all",
    resetPlaylistFilter: false,
  };
}

export function createSubtitleControlOptions(subtitles: SubtitleForUi[]) {
  return [
    { value: "off", label: "字幕关闭" },
    ...subtitles.map((subtitle) => ({
      value: subtitle.id,
      label: subtitle.isManual ? `手动: ${subtitle.name ?? ""}` : subtitle.name ?? "",
    })),
    { value: "manual", label: "选择字幕..." },
  ];
}

export function resolveSubtitleSelection(
  currentSelection: string,
  subtitles: SubtitleForUi[],
  options?: { autoSelectFromOff?: boolean },
) {
  if (subtitles.some((subtitle) => subtitle.id === currentSelection)) return currentSelection;
  if (currentSelection === "off" && !options?.autoSelectFromOff) return "off";
  return subtitles.find((subtitle) => !subtitle.isManual)?.id ?? "off";
}

export function resolveRestoredEmbeddedSubtitleSelection(
  currentSelection: string,
  restoredSubtitles: SubtitleForUi[],
  videoId: string,
  autoSelectVideoId: string | null,
) {
  if (currentSelection !== "off" || autoSelectVideoId !== videoId) return currentSelection;
  return restoredSubtitles.find((subtitle) => subtitle.source === "embedded" && subtitle.videoId === videoId)?.id ?? currentSelection;
}

export function createPersistedEmbeddedSubtitles(subtitles: SubtitleForUi[]): PersistedEmbeddedSubtitleForUi[] {
  return subtitles
    .flatMap((subtitle) => {
      if (
        subtitle.source === "embedded" &&
        subtitle.videoId &&
        subtitle.relativePath &&
        subtitle.embeddedTrack
      ) {
        return [
          {
            id: subtitle.id,
            name: subtitle.name ?? "内封字幕",
            relativePath: subtitle.relativePath,
            format: subtitle.format === "srt" ? "srt" : "vtt",
            videoId: subtitle.videoId,
            embeddedTrack: subtitle.embeddedTrack,
          },
        ];
      }
      return [];
    });
}
