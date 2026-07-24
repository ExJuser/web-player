import type { PlayerDataStore, SubtitleItem, VideoItem } from "./playerTypes";
import {
  normalizeSubtitleText,
  srtToVtt,
  stripVttStyleBlocks,
} from "./subtitleUtils";
import { isObjectUrl } from "./playerLibraryUtils";

export type ExtractedEmbeddedSubtitle = {
  id?: string;
  text: string;
  format: "srt" | "vtt";
};

export type FetchEmbeddedSubtitle = <T>(path: string, init?: RequestInit) => Promise<T>;

export async function createSubtitleUrl(subtitle: SubtitleItem) {
  if (subtitle.url && !isObjectUrl(subtitle.url)) {
    const response = await fetch(subtitle.url, { headers: { Accept: "text/plain,text/vtt,*/*" } });
    if (!response.ok) throw new Error("Subtitle file is unavailable.");
    const normalizedText = normalizeSubtitleText(await response.text());
    const vtt = normalizedText.startsWith("WEBVTT") ? stripVttStyleBlocks(normalizedText) : srtToVtt(normalizedText);
    return URL.createObjectURL(new Blob([vtt], { type: "text/vtt" }));
  }
  const rawText = subtitle.rawText ?? (subtitle.file ? await subtitle.file.text() : "");
  if (rawText) {
    const normalizedText = normalizeSubtitleText(rawText);
    const vtt =
      subtitle.format === "vtt" || normalizedText.startsWith("WEBVTT")
        ? stripVttStyleBlocks(normalizedText)
        : srtToVtt(normalizedText);
    return URL.createObjectURL(new Blob([vtt], { type: "text/vtt" }));
  }
  if (!subtitle.file) throw new Error("Subtitle file is unavailable.");
  return URL.createObjectURL(subtitle.file);
}

export async function readSubtitleText(subtitle: SubtitleItem) {
  if (subtitle.rawText) return normalizeSubtitleText(subtitle.rawText);
  if (subtitle.url && !isObjectUrl(subtitle.url)) {
    const response = await fetch(subtitle.url, { headers: { Accept: "text/plain,text/vtt,*/*" } });
    if (!response.ok) return "";
    return normalizeSubtitleText(await response.text());
  }
  if (!subtitle.file) return "";
  return normalizeSubtitleText(await subtitle.file.text());
}

export async function restoreCachedEmbeddedSubtitles(
  persistedSubtitles: PlayerDataStore["embeddedSubtitles"],
  videos: VideoItem[],
  fallbackRootId: string | null,
  fetchJson: FetchEmbeddedSubtitle,
) {
  const videosById = new Map(videos.map((video) => [video.id, video]));
  const restored = await Promise.all(
    persistedSubtitles.map(async (persisted) => {
      const video = videosById.get(persisted.videoId);
      const relativePath = video?.relativePath ?? persisted.relativePath.split("#subtitle-")[0];
      const rootId = video?.mediaRootId ?? fallbackRootId;
      if (!rootId || !relativePath || !persisted.embeddedTrack) return null;

      try {
        const payload = await fetchJson<ExtractedEmbeddedSubtitle>("/api/subtitles/embedded/cached", {
          method: "POST",
          body: JSON.stringify({
            rootId,
            relativePath,
            streamIndex: persisted.embeddedTrack.streamIndex,
          }),
        });
        if (!payload.text.trim()) return null;
        const subtitle: SubtitleItem = {
          ...persisted,
          source: "embedded",
          rawText: payload.text,
          format: payload.format,
          url: "",
          videoId: video?.id ?? persisted.videoId,
        };
        return {
          ...subtitle,
          url: await createSubtitleUrl(subtitle),
        };
      } catch {
        return null;
      }
    }),
  );

  return restored.filter((subtitle): subtitle is SubtitleItem => Boolean(subtitle));
}
