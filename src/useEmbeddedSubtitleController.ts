import { useCallback, useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import { fetchLocalJson as fetchJson } from "./localApiClient";
import { revokeObjectUrl } from "./appResourceCleanup";
import type { ExtractedEmbeddedSubtitle } from "./subtitleMedia";
import { createSubtitleUrl } from "./subtitleMedia";
import { isObjectUrl } from "./playerLibraryUtils";
import type { EmbeddedSubtitleTrack, PlayerDataStore, SubtitleItem, VideoItem } from "./playerTypes";
import {
  createPersistedEmbeddedSubtitles,
  resolveRestoredEmbeddedSubtitleSelection,
} from "./playerUiState";

type UseEmbeddedSubtitleControllerOptions = {
  autoSubtitleSelectionVideoIdRef: MutableRefObject<string | null>;
  cachedEmbeddedSubtitleLookupKeysRef: MutableRefObject<Set<string>>;
  canUseEmbeddedSubtitles: boolean;
  currentMediaRootId: string | null;
  currentVideo: VideoItem | null;
  currentVideoSubtitles: SubtitleItem[];
  saveCurrentPlayerDataStore: (overrides?: Partial<PlayerDataStore>) => Promise<void>;
  selectedSubtitleIdRef: MutableRefObject<string>;
  setSubtitles: Dispatch<SetStateAction<SubtitleItem[]>>;
  subtitlesRef: MutableRefObject<SubtitleItem[]>;
  updateSelectedSubtitleId: (nextSubtitleId: string) => void;
};

export function useEmbeddedSubtitleController({
  autoSubtitleSelectionVideoIdRef,
  cachedEmbeddedSubtitleLookupKeysRef,
  canUseEmbeddedSubtitles,
  currentMediaRootId,
  currentVideo,
  currentVideoSubtitles,
  saveCurrentPlayerDataStore,
  selectedSubtitleIdRef,
  setSubtitles,
  subtitlesRef,
  updateSelectedSubtitleId,
}: UseEmbeddedSubtitleControllerOptions) {
  const probeEmbeddedSubtitleTracksForVideo = useCallback(async (video: VideoItem, rootId: string) => {
    const payload = await fetchJson<{ tracks: EmbeddedSubtitleTrack[] }>("/api/subtitles/embedded/probe", {
      method: "POST",
      body: JSON.stringify({
        rootId,
        relativePath: video.relativePath,
      }),
    });
    return payload.tracks;
  }, []);

  const loadCachedEmbeddedSubtitlesForVideo = useCallback(
    async (video: VideoItem, rootId: string) => {
      const tracks = await probeEmbeddedSubtitleTracksForVideo(video, rootId);
      const restoredSubtitles = (
        await Promise.all(
          tracks
            .filter((track) => track.extractable)
            .map(async (track) => {
              try {
                const payload = await fetchJson<ExtractedEmbeddedSubtitle>("/api/subtitles/embedded/cached", {
                  method: "POST",
                  body: JSON.stringify({
                    rootId,
                    relativePath: video.relativePath,
                    streamIndex: track.streamIndex,
                  }),
                });
                if (!payload.text.trim()) return null;

                const language = track.language ? ` ${track.language}` : "";
                const title = track.title ? ` ${track.title}` : "";
                const subtitle: SubtitleItem = {
                  id: `embedded:${video.id}:${payload.id}`,
                  name: `内封字幕${language}${title}`.trim(),
                  relativePath: `${video.relativePath}#subtitle-${track.streamIndex}`,
                  url: "",
                  source: "embedded",
                  rawText: payload.text,
                  format: payload.format,
                  videoId: video.id,
                  embeddedTrack: track,
                };
                return {
                  ...subtitle,
                  url: await createSubtitleUrl(subtitle),
                };
              } catch {
                return null;
              }
            }),
        )
      ).filter((subtitle): subtitle is SubtitleItem => Boolean(subtitle));

      if (!restoredSubtitles.length) return;
      const restoredIds = new Set(restoredSubtitles.map((subtitle) => subtitle.id));
      subtitlesRef.current
        .filter((subtitle) => restoredIds.has(subtitle.id) && subtitle.url && isObjectUrl(subtitle.url))
        .forEach((subtitle) => revokeObjectUrl(subtitle.url));
      const nextSubtitles = [
        ...subtitlesRef.current.filter((subtitle) => !restoredIds.has(subtitle.id)),
        ...restoredSubtitles,
      ];
      subtitlesRef.current = nextSubtitles;
      setSubtitles(nextSubtitles);
      const nextSelection = resolveRestoredEmbeddedSubtitleSelection(
        selectedSubtitleIdRef.current,
        restoredSubtitles,
        video.id,
        autoSubtitleSelectionVideoIdRef.current,
      );
      if (nextSelection !== selectedSubtitleIdRef.current) {
        autoSubtitleSelectionVideoIdRef.current = null;
        updateSelectedSubtitleId(nextSelection);
      }
      void saveCurrentPlayerDataStore({
        embeddedSubtitles: createPersistedEmbeddedSubtitles(nextSubtitles),
      });
    },
    [
      autoSubtitleSelectionVideoIdRef,
      probeEmbeddedSubtitleTracksForVideo,
      saveCurrentPlayerDataStore,
      selectedSubtitleIdRef,
      setSubtitles,
      subtitlesRef,
      updateSelectedSubtitleId,
    ],
  );

  const loadEmbeddedSubtitleForVideo = useCallback(
    async (video: VideoItem, rootId: string, track: EmbeddedSubtitleTrack, options?: { select?: boolean }) => {
      if (!track.extractable) return null;
      const existing = subtitlesRef.current.find(
        (subtitle) =>
          subtitle.source === "embedded" &&
          subtitle.videoId === video.id &&
          subtitle.embeddedTrack?.streamIndex === track.streamIndex,
      );
      if (existing) {
        if (options?.select) updateSelectedSubtitleId(existing.id);
        return existing;
      }

      const payload = await fetchJson<ExtractedEmbeddedSubtitle>("/api/subtitles/embedded/extract", {
        method: "POST",
        body: JSON.stringify({
          rootId,
          relativePath: video.relativePath,
          streamIndex: track.streamIndex,
        }),
      });
      const language = track.language ? ` ${track.language}` : "";
      const title = track.title ? ` ${track.title}` : "";
      const subtitle: SubtitleItem = {
        id: `embedded:${video.id}:${payload.id}`,
        name: `内封字幕${language}${title}`.trim(),
        relativePath: `${video.relativePath}#subtitle-${track.streamIndex}`,
        url: "",
        source: "embedded",
        rawText: payload.text,
        format: payload.format,
        videoId: video.id,
        embeddedTrack: track,
      };
      const subtitleWithUrl = {
        ...subtitle,
        url: await createSubtitleUrl(subtitle),
      };
      const nextPersistedEmbeddedSubtitles = createPersistedEmbeddedSubtitles([
        ...subtitlesRef.current.filter((item) => item.id !== subtitleWithUrl.id),
        subtitleWithUrl,
      ]);
      setSubtitles((previous) => {
        previous
          .filter((item) => item.id === subtitleWithUrl.id)
          .forEach((item) => revokeObjectUrl(item.url));
        const nextSubtitles = [...previous.filter((item) => item.id !== subtitleWithUrl.id), subtitleWithUrl];
        subtitlesRef.current = nextSubtitles;
        return nextSubtitles;
      });
      void saveCurrentPlayerDataStore({
        embeddedSubtitles: nextPersistedEmbeddedSubtitles,
      });
      if (options?.select) updateSelectedSubtitleId(subtitleWithUrl.id);
      return subtitleWithUrl;
    },
    [saveCurrentPlayerDataStore, setSubtitles, subtitlesRef, updateSelectedSubtitleId],
  );

  useEffect(() => {
    if (!currentVideo || !currentMediaRootId || !canUseEmbeddedSubtitles) return;
    if (currentVideoSubtitles.some((subtitle) => subtitle.source === "embedded")) return;

    const lookupKey = `${currentMediaRootId}:${currentVideo.id}`;
    if (cachedEmbeddedSubtitleLookupKeysRef.current.has(lookupKey)) return;
    cachedEmbeddedSubtitleLookupKeysRef.current.add(lookupKey);
    void loadCachedEmbeddedSubtitlesForVideo(currentVideo, currentMediaRootId);
  }, [
    cachedEmbeddedSubtitleLookupKeysRef,
    canUseEmbeddedSubtitles,
    currentMediaRootId,
    currentVideo,
    currentVideoSubtitles,
    loadCachedEmbeddedSubtitlesForVideo,
  ]);

  return {
    loadEmbeddedSubtitleForVideo,
    probeEmbeddedSubtitleTracksForVideo,
  };
}
