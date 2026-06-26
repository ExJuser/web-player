import type { HomeMediaMode } from "./playerTypes";

export type { HomeMediaMode };

type MediaRootForUi = {
  label?: string;
  source?: "browser" | "local";
  localPath?: string;
};

type VideoForCompatibilityUi = {
  playbackSource?: "browser" | "server";
  playability?: {
    status: "direct" | "remuxRecommended" | "unsupported" | "unknown" | "needsLocalPath";
    reason?: string;
    compatibleUrl?: string;
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

export function getCompatibleMediaAction(video: VideoForCompatibilityUi | null | undefined, options: { canUseServerTools: boolean }) {
  const canCreate =
    Boolean(video) &&
    video?.playbackSource === "server" &&
    options.canUseServerTools &&
    video.playability?.status === "remuxRecommended" &&
    !video.playability.compatibleUrl;

  return {
    visible: Boolean(video?.playability || canCreate),
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
