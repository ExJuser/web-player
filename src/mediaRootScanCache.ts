import type {
  CachedMediaRootScan,
  PlayerGlobalMetadata,
  PlayerMediaRootStatus,
  SubtitleItem,
  VideoItem,
} from "./playerTypes";
import { mediaRootScanCacheVersion } from "./playerStorage";

export type LocalMediaRoot = {
  id: string;
  label: string;
  basename: string;
  path: string;
  source?: "browser" | "local";
  localPath?: string;
};

export type LocalConfig = {
  mediaRoots: LocalMediaRoot[];
  ffmpeg: { ffmpeg: boolean; ffprobe: boolean };
  lada: { available: boolean };
  ai: { configured: boolean; model: string };
  bangumi: { configured: boolean; proxyConfigured: boolean };
};

export type ScannedServerVideo = VideoItem & {
  legacyId?: string;
};

export type ScannedServerSubtitle = SubtitleItem & {
  legacyId?: string;
  size?: number;
  lastModified?: number;
};

export type MediaRootScanResult = {
  root: LocalMediaRoot;
  status: PlayerMediaRootStatus;
  videos: ScannedServerVideo[];
  subtitles: ScannedServerSubtitle[];
  filteredSmallVideos: number;
};

export type MediaRootsScanResponse = {
  roots: MediaRootScanResult[];
  videos: ScannedServerVideo[];
  subtitles: ScannedServerSubtitle[];
  scannedFiles: number;
  filteredSmallVideos: number;
  metadata: PlayerGlobalMetadata;
};

export type MediaScanTaskSnapshot = {
  runId?: string;
  status: "idle" | "running" | "completed" | "error";
  rootsTotal: number;
  rootsCompleted: number;
  visitedFiles: number;
  reusedFiles: number;
  changedFiles: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
  roots?: Array<{
    id: string;
    label: string;
    status: "pending" | "running" | "ready" | "needsAccess" | "error";
    visitedDirectories: number;
    reusedDirectories: number;
    changedDirectories: number;
    error?: string;
  }>;
};

export type UpsertMediaRootResponse = LocalConfig & {
  mediaRoot: LocalMediaRoot;
};

export type UpdateMediaRootLocalPathResponse = LocalConfig & {
  mediaRoot: LocalMediaRoot;
};

export function createCachedMediaRootScan(scan: MediaRootsScanResponse, videos: VideoItem[], subtitles: SubtitleItem[]): CachedMediaRootScan {
  const updatedAt = Date.now();
  return {
    version: mediaRootScanCacheVersion,
    videos,
    subtitles: subtitles.filter((subtitle) => !subtitle.source || subtitle.source === "external"),
    scannedFiles: scan.scannedFiles,
    filteredSmallVideos: scan.filteredSmallVideos,
    metadata: {
      ...scan.metadata,
      updatedAt,
    },
    updatedAt,
  };
}

export function alignCachedMediaRootScanWithConfig(cache: CachedMediaRootScan, config: LocalConfig): CachedMediaRootScan {
  const configuredRootIds = new Set(config.mediaRoots.map((root) => root.id));
  const cachedStatusesById = new Map(cache.metadata.mediaRoots.map((status) => [status.id, status]));
  const mediaRoots = config.mediaRoots.map((root) => {
    const cachedStatus = cachedStatusesById.get(root.id);
    return cachedStatus
      ? {
          ...cachedStatus,
          label: root.label,
          source: root.source,
        }
      : {
          id: root.id,
          label: root.label,
          source: root.source,
          status: "needsAccess" as const,
          videoCount: 0,
          scannedFiles: 0,
          updatedAt: cache.updatedAt,
          error: "这个媒体库尚未刷新到缓存。",
        };
  });
  const videos = cache.videos.filter((video) => video.mediaRootId && configuredRootIds.has(video.mediaRootId));
  const subtitles = cache.subtitles.filter((subtitle) => subtitle.mediaRootId && configuredRootIds.has(subtitle.mediaRootId));
  return {
    ...cache,
    videos,
    subtitles,
    scannedFiles: mediaRoots.reduce((sum, status) => sum + status.scannedFiles, 0),
    metadata: {
      ...cache.metadata,
      videoCount: videos.length,
      scannedFiles: mediaRoots.reduce((sum, status) => sum + status.scannedFiles, 0),
      mediaRoots,
    },
  };
}
