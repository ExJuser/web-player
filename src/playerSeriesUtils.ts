import { baseNameWithoutExtension } from "./mediaPathUtils";

export type SeriesVideo = {
  name: string;
  relativePath: string;
  mediaRootId?: string;
};

export function inferSeriesTitle(video: SeriesVideo) {
  const normalizedPath = video.relativePath.replace(/\\/g, "/");
  const pathParts = normalizedPath.split("/").filter(Boolean);
  if (pathParts.length > 1) return pathParts[0];

  return (
    baseNameWithoutExtension(video.name)
      .replace(/\[[^\]]+\]/g, " ")
      .replace(/【[^】]+】/g, " ")
      .replace(/\b(?:S\d{1,2}E\d{1,3}|EP?\s*\d{1,4}|第\s*\d{1,4}\s*[集话話]|[._ -]\d{1,4})\b/gi, " ")
      .replace(/\b(?:1080p|2160p|720p|4k|8k|x264|x265|h264|h265|hevc|avc|aac|web-dl|bdrip|bluray)\b/gi, " ")
      .replace(/[._-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim() || baseNameWithoutExtension(video.name)
  );
}

export function seriesKeyFromTitle(title: string) {
  return title.trim().toLowerCase();
}

export function scopedSeriesKeyForVideo(video: SeriesVideo, title: string) {
  const titleKey = seriesKeyFromTitle(title);
  return video.mediaRootId ? `${video.mediaRootId}:${titleKey}` : titleKey;
}
