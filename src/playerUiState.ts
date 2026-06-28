import {
  formatFileSize,
  formatModifiedTime,
  formatResolution,
  formatTime,
} from "./playerFormatUtils";
import type { HomeMediaMode } from "./playerTypes";

export type { HomeMediaMode };

type MediaRootForUi = {
  label?: string;
  source?: "browser" | "local";
  localPath?: string;
};

type MediaRootStatusForUi = {
  status: "ready" | "needsAccess" | "error";
  videoCount: number;
  error?: string;
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
  };
};

type VideoForStatsUi = {
  name?: string;
  size?: number;
  lastModified?: number;
};

type SubtitleForUi = {
  id: string;
  name?: string;
  isManual?: boolean;
  relativePath?: string;
  source?: "external" | "manual" | "embedded";
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
  return formatRootStatus(status, "本写真集");
}

export function getPlayableVideoUrl(video: VideoForCompatibilityUi) {
  return video.playability?.compatibleUrl || video.url || "";
}

export function formatPlayabilityStatus(playability?: VideoForCompatibilityUi["playability"]) {
  if (!playability) return "未探测";
  if (playability.compatibleUrl) return "兼容 MP4";
  if (playability.status === "direct") return "可直接播放";
  if (playability.status === "remuxRecommended") return "建议转封装";
  if (playability.status === "unsupported") return "需转码";
  if (playability.status === "needsLocalPath") return "需本机路径";
  return "兼容性未知";
}

export function formatCodecSummary(playability?: VideoForCompatibilityUi["playability"]) {
  if (!playability) return "未探测";
  return [playability.videoCodec, playability.audioCodec, playability.pixelFormat].filter(Boolean).join(" / ") || "未探测";
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
  const canCreate =
    Boolean(video) &&
    video?.playbackSource === "server" &&
    options.canUseServerTools &&
    video.playability?.status === "remuxRecommended" &&
    !video.playability.compatibleUrl;
  const shouldExplainPlayability = Boolean(
    video?.playability &&
      !video.playability.compatibleUrl &&
      video.playability.status !== "direct",
  );

  return {
    visible: shouldExplainPlayability || canCreate,
    disabled: !canCreate,
    canCreate,
    label: canCreate ? "生成兼容 MP4" : "",
  };
}

export function isMediaRootInHomeMode(root: MediaRootForUi, mode: HomeMediaMode) {
  if (mode === "all") return true;

  const normalizedLabel = (root.label ?? "").trim();
  if (mode === "anime") return normalizedLabel.toLowerCase() === "anime";
  return normalizedLabel.toUpperCase().endsWith("AV");
}

export function createVideoStatsKey(video: VideoForStatsUi) {
  const normalizedName = (video.name ?? "").trim().normalize("NFKC").toLowerCase();
  const size = Number.isFinite(video.size) ? Math.max(0, Math.floor(video.size ?? 0)) : 0;
  const lastModified = Number.isFinite(video.lastModified) ? Math.max(0, Math.round(video.lastModified ?? 0)) : 0;
  return `${normalizedName}|${size}|${lastModified}`;
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
