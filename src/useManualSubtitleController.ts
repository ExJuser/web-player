import { useCallback, type Dispatch, type SetStateAction } from "react";

import { revokeObjectUrl } from "./appResourceCleanup";
import { isSubtitleFile } from "./playerLibraryUtils";
import { createSubtitleUrl } from "./subtitleMedia";
import type { SubtitleItem, VideoItem } from "./playerTypes";

type UseManualSubtitleControllerOptions = {
  currentVideo: VideoItem | null;
  setMessage: (message: string) => void;
  setSubtitles: Dispatch<SetStateAction<SubtitleItem[]>>;
  updateSelectedSubtitleId: (nextSubtitleId: string) => void;
};

export function useManualSubtitleController({
  currentVideo,
  setMessage,
  setSubtitles,
  updateSelectedSubtitleId,
}: UseManualSubtitleControllerOptions) {
  const chooseSubtitleFile = useCallback(async () => {
    if (!currentVideo) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".srt,.vtt,text/vtt,application/x-subrip";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file || !isSubtitleFile(file.name)) return;
      try {
        const subtitle: SubtitleItem = {
          id: `manual:${currentVideo.id}:${file.name}|${file.size}|${file.lastModified}`,
          name: file.name,
          relativePath: file.name,
          file,
          url: "",
          isManual: true,
          source: "manual",
          videoId: currentVideo.id,
        };
        const subtitleWithUrl = {
          ...subtitle,
          url: await createSubtitleUrl(subtitle),
        };
        setSubtitles((previous) => {
          previous
            .filter((item) => item.isManual && item.id.startsWith(`manual:${currentVideo.id}:`))
            .forEach((item) => revokeObjectUrl(item.url));
          return [
            ...previous.filter((item) => !(item.isManual && item.id.startsWith(`manual:${currentVideo.id}:`))),
            subtitleWithUrl,
          ];
        });
        updateSelectedSubtitleId(subtitleWithUrl.id);
      } catch {
        setMessage("无法读取字幕文件，请确认字幕格式后重试。");
      }
    };
    input.click();
  }, [currentVideo, setMessage, setSubtitles, updateSelectedSubtitleId]);

  return { chooseSubtitleFile };
}
