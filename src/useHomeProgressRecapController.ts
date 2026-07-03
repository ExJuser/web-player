import { useCallback, useEffect, type Dispatch, type SetStateAction } from "react";

import { readAiTextStream } from "./aiStreamClient";
import type { LocalConfig } from "./mediaRootScanCache";
import type { EmbeddedSubtitleTrack, PlaybackProgress, SubtitleItem, VideoItem } from "./playerTypes";
import { isResumableProgress } from "./playerMediaUtils";
import {
  createViewedSubtitleText,
  parseSubtitleCues,
} from "./subtitleUtils";
import { readSubtitleText } from "./subtitleMedia";

type HomeRecapCard = {
  video: VideoItem;
  progress?: PlaybackProgress;
};

type UseHomeProgressRecapControllerOptions = {
  homeRecapCard: HomeRecapCard | null;
  homeRecapMediaRootId: string | null;
  homeRecapSubtitle: SubtitleItem | null;
  homeRecapVideoId: string;
  loadEmbeddedSubtitleForVideo: (
    video: VideoItem,
    rootId: string,
    track: EmbeddedSubtitleTrack,
    options?: { select?: boolean },
  ) => Promise<SubtitleItem | null>;
  localConfig: LocalConfig | null;
  probeEmbeddedSubtitleTracksForVideo: (video: VideoItem, rootId: string) => Promise<EmbeddedSubtitleTrack[]>;
  setHomeProgressRecap: Dispatch<SetStateAction<string>>;
  setHomeProgressRecapMessage: Dispatch<SetStateAction<string>>;
  setHomeProgressRecapVideoId: Dispatch<SetStateAction<string>>;
  setIsHomeProgressRecapLoading: Dispatch<SetStateAction<boolean>>;
  shouldShowHomeRecap: boolean;
};

export function useHomeProgressRecapController({
  homeRecapCard,
  homeRecapMediaRootId,
  homeRecapSubtitle,
  homeRecapVideoId,
  loadEmbeddedSubtitleForVideo,
  localConfig,
  probeEmbeddedSubtitleTracksForVideo,
  setHomeProgressRecap,
  setHomeProgressRecapMessage,
  setHomeProgressRecapVideoId,
  setIsHomeProgressRecapLoading,
  shouldShowHomeRecap,
}: UseHomeProgressRecapControllerOptions) {
  useEffect(() => {
    setHomeProgressRecap("");
    setHomeProgressRecapMessage("");
    setHomeProgressRecapVideoId(homeRecapVideoId);
  }, [homeRecapVideoId, setHomeProgressRecap, setHomeProgressRecapMessage, setHomeProgressRecapVideoId]);

  const loadHomeProgressRecap = useCallback(async () => {
    if (!shouldShowHomeRecap || !homeRecapCard) return;
    if (!localConfig?.ai.configured) {
      setHomeProgressRecapMessage("未配置 DEEPSEEK_API_KEY。");
      return;
    }
    const progress = homeRecapCard.progress;
    if (!progress || !isResumableProgress(progress)) {
      setHomeProgressRecapMessage("当前没有可回顾的观看进度。");
      return;
    }

    setIsHomeProgressRecapLoading(true);
    setHomeProgressRecap("");
    setHomeProgressRecapMessage("正在生成无剧透回顾...");
    setHomeProgressRecapVideoId(homeRecapCard.video.id);
    try {
      let recapSubtitle = homeRecapSubtitle;
      if (!recapSubtitle) {
        if (!homeRecapMediaRootId || !localConfig?.ffmpeg.ffmpeg || !localConfig.ffmpeg.ffprobe) {
          throw new Error("当前视频没有可用于回顾的字幕。");
        }
        setHomeProgressRecapMessage("正在提取内封字幕...");
        const tracks = await probeEmbeddedSubtitleTracksForVideo(homeRecapCard.video, homeRecapMediaRootId);
        const textTrack = tracks.find((track) => track.extractable);
        if (!textTrack) throw new Error("当前视频没有可提取的文本内封字幕。");
        recapSubtitle = await loadEmbeddedSubtitleForVideo(homeRecapCard.video, homeRecapMediaRootId, textTrack);
        if (!recapSubtitle) throw new Error("当前视频没有可用于回顾的字幕。");
        setHomeProgressRecapMessage("正在生成无剧透回顾...");
      }
      const subtitleText = await readSubtitleText(recapSubtitle);
      const cues = parseSubtitleCues(subtitleText);
      if (!cues.length) throw new Error("当前字幕没有可回顾的文本片段。");
      const viewedText = createViewedSubtitleText(cues, progress.currentTime);
      if (!viewedText) throw new Error("当前进度前还没有可回顾的字幕内容。");
      await readAiTextStream(
        "/api/ai/subtitles/recap",
        {
          videoName: homeRecapCard.video.name,
          subtitleId: recapSubtitle.id,
          currentTime: progress.currentTime,
          viewedText,
        },
        {
          onMessage: setHomeProgressRecapMessage,
          onResult: setHomeProgressRecap,
          onDelta: (text) => setHomeProgressRecap((previous) => previous + text),
        },
      );
      setHomeProgressRecapMessage("");
    } catch (error) {
      setHomeProgressRecapMessage(error instanceof Error ? error.message : "生成无剧透回顾失败。");
    } finally {
      setIsHomeProgressRecapLoading(false);
    }
  }, [
    homeRecapCard,
    homeRecapMediaRootId,
    homeRecapSubtitle,
    loadEmbeddedSubtitleForVideo,
    localConfig,
    probeEmbeddedSubtitleTracksForVideo,
    setHomeProgressRecap,
    setHomeProgressRecapMessage,
    setHomeProgressRecapVideoId,
    setIsHomeProgressRecapLoading,
    shouldShowHomeRecap,
  ]);

  return { loadHomeProgressRecap };
}
