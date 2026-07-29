import { useCallback, type Dispatch, type SetStateAction } from "react";

import { readAiTextStream } from "./aiStreamClient";
import type { AiSubtitleTab } from "./AiSubtitleDialog";
import type { LocalConfig } from "./mediaRootScanCache";
import {
  createViewedSubtitleText,
  parseSubtitleCues,
  selectRelevantSubtitleChunks,
} from "./subtitleUtils";
import { readSubtitleText } from "./subtitleMedia";
import type { SubtitleItem, VideoItem } from "./playerTypes";

type UseAiSubtitleControllerOptions = {
  currentVideo: VideoItem | null;
  getCurrentTime: () => number;
  localConfig: LocalConfig | null;
  selectedSubtitle: SubtitleItem | null;
  setAiMessage: Dispatch<SetStateAction<string>>;
  setAiTab: Dispatch<SetStateAction<AiSubtitleTab>>;
  setIsAiLoading: Dispatch<SetStateAction<boolean>>;
  setIsAiPanelOpen: Dispatch<SetStateAction<boolean>>;
  setSubtitleAnswer: Dispatch<SetStateAction<string>>;
  setSubtitleRecap: Dispatch<SetStateAction<string>>;
  setSubtitleSummary: Dispatch<SetStateAction<string>>;
  subtitleQuestion: string;
};

export function useAiSubtitleController({
  currentVideo,
  getCurrentTime,
  localConfig,
  selectedSubtitle,
  setAiMessage,
  setAiTab,
  setIsAiLoading,
  setIsAiPanelOpen,
  setSubtitleAnswer,
  setSubtitleRecap,
  setSubtitleSummary,
  subtitleQuestion,
}: UseAiSubtitleControllerOptions) {
  const loadSubtitleSummary = useCallback(async () => {
    if (!selectedSubtitle || !currentVideo) return;
    if (!localConfig?.ai.configured) {
      setAiMessage("未配置 DEEPSEEK_API_KEY。");
      return;
    }
    setAiTab("summary");
    setIsAiPanelOpen(true);
    setIsAiLoading(true);
    setAiMessage("正在生成字幕总结...");
    setSubtitleSummary("");
    try {
      const subtitleText = await readSubtitleText(selectedSubtitle);
      if (!subtitleText) throw new Error("当前字幕没有可分析的文本。");
      await readAiTextStream(
        "/api/ai/subtitles/summarize",
        {
          videoName: currentVideo.name,
          subtitleId: selectedSubtitle.id,
          subtitleText,
        },
        {
          onMessage: setAiMessage,
          onResult: setSubtitleSummary,
          onDelta: (text) => setSubtitleSummary((previous) => previous + text),
        },
      );
      setAiMessage("");
    } catch (error) {
      setAiMessage(error instanceof Error ? error.message : "生成字幕总结失败。");
    } finally {
      setIsAiLoading(false);
    }
  }, [
    currentVideo,
    localConfig,
    selectedSubtitle,
    setAiMessage,
    setAiTab,
    setIsAiLoading,
    setIsAiPanelOpen,
    setSubtitleSummary,
  ]);

  const askSubtitleQuestion = useCallback(async () => {
    if (!selectedSubtitle || !currentVideo) return;
    if (!localConfig?.ai.configured) {
      setAiMessage("未配置 DEEPSEEK_API_KEY。");
      return;
    }
    const question = subtitleQuestion.trim();
    if (!question) {
      setAiMessage("请输入问题。");
      return;
    }
    setAiTab("qa");
    setIsAiPanelOpen(true);
    setIsAiLoading(true);
    setAiMessage("正在根据字幕片段回答...");
    setSubtitleAnswer("");
    try {
      const currentTime = getCurrentTime();
      const subtitleText = await readSubtitleText(selectedSubtitle);
      const cues = parseSubtitleCues(subtitleText);
      if (!cues.length) throw new Error("当前字幕没有可检索的文本片段。");
      await readAiTextStream(
        "/api/ai/subtitles/ask",
        {
          videoName: currentVideo.name,
          question,
          chunks: selectRelevantSubtitleChunks(question, cues, currentTime),
        },
        {
          onMessage: setAiMessage,
          onResult: setSubtitleAnswer,
          onDelta: (text) => setSubtitleAnswer((previous) => previous + text),
        },
      );
      setAiMessage("");
    } catch (error) {
      setAiMessage(error instanceof Error ? error.message : "字幕问答失败。");
    } finally {
      setIsAiLoading(false);
    }
  }, [
    currentVideo,
    getCurrentTime,
    localConfig,
    selectedSubtitle,
    setAiMessage,
    setAiTab,
    setIsAiLoading,
    setIsAiPanelOpen,
    setSubtitleAnswer,
    subtitleQuestion,
  ]);

  const loadProgressRecap = useCallback(async () => {
    if (!selectedSubtitle || !currentVideo) return;
    if (!localConfig?.ai.configured) {
      setAiMessage("未配置 DEEPSEEK_API_KEY。");
      return;
    }
    setAiTab("recap");
    setIsAiPanelOpen(true);
    setIsAiLoading(true);
    setAiMessage("正在生成进度回顾...");
    setSubtitleRecap("");
    try {
      const currentTime = getCurrentTime();
      const subtitleText = await readSubtitleText(selectedSubtitle);
      const cues = parseSubtitleCues(subtitleText);
      if (!cues.length) throw new Error("当前字幕没有可回顾的文本片段。");
      const viewedText = createViewedSubtitleText(cues, currentTime);
      if (!viewedText) throw new Error("当前时间前还没有可回顾的字幕内容。");
      await readAiTextStream(
        "/api/ai/subtitles/recap",
        {
          videoName: currentVideo.name,
          subtitleId: selectedSubtitle.id,
          currentTime,
          viewedText,
        },
        {
          onMessage: setAiMessage,
          onResult: setSubtitleRecap,
          onDelta: (text) => setSubtitleRecap((previous) => previous + text),
        },
      );
      setAiMessage("");
    } catch (error) {
      setAiMessage(error instanceof Error ? error.message : "生成进度回顾失败。");
    } finally {
      setIsAiLoading(false);
    }
  }, [
    currentVideo,
    getCurrentTime,
    localConfig,
    selectedSubtitle,
    setAiMessage,
    setAiTab,
    setIsAiLoading,
    setIsAiPanelOpen,
    setSubtitleRecap,
  ]);

  return {
    askSubtitleQuestion,
    loadProgressRecap,
    loadSubtitleSummary,
  };
}
