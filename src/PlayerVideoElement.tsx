import type { CSSProperties, Ref, SyntheticEvent } from "react";

import type { SubtitleItem, SubtitleStylePreferences } from "./playerTypes";

const subtitleFontFamilies: Record<SubtitleStylePreferences["fontFamily"], string> = {
  "sans-serif": 'Inter, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
  serif: 'Georgia, "Songti SC", SimSun, serif',
  monospace: '"Cascadia Mono", Consolas, "Microsoft YaHei", monospace',
};

type PlayerVideoElementProps = {
  currentVideoSourceAspectRatio: number;
  isVideoSideways: boolean;
  normalizedVideoRotation: number;
  selectedSubtitle: SubtitleItem | null;
  subtitleStyle: SubtitleStylePreferences;
  videoRef: Ref<HTMLVideoElement>;
  onClick: () => void;
  onDurationChange: (event: SyntheticEvent<HTMLVideoElement>) => void;
  onEnded: () => void;
  onPause: () => void;
  onPlay: () => void;
  onTimeUpdate: () => void;
};

export function PlayerVideoElement({
  currentVideoSourceAspectRatio,
  isVideoSideways,
  normalizedVideoRotation,
  selectedSubtitle,
  subtitleStyle,
  videoRef,
  onClick,
  onDurationChange,
  onEnded,
  onPause,
  onPlay,
  onTimeUpdate,
}: PlayerVideoElementProps) {
  return (
    <video
      ref={videoRef}
      className={`video-element ${normalizedVideoRotation ? "manual-rotated" : ""} ${isVideoSideways ? "sideways" : ""}`}
      style={
        {
          "--subtitle-font-size": `${subtitleStyle.fontSize}px`,
          "--subtitle-font-family": subtitleFontFamilies[subtitleStyle.fontFamily],
          "--subtitle-font-weight": subtitleStyle.fontWeight,
          ...(normalizedVideoRotation
            ? {
                "--landscape-source-aspect-ratio": currentVideoSourceAspectRatio,
                "--video-rotation": `${normalizedVideoRotation}deg`,
              }
            : {}),
        } as CSSProperties
      }
      onClick={onClick}
      onPlay={onPlay}
      onPause={onPause}
      onTimeUpdate={onTimeUpdate}
      onDurationChange={onDurationChange}
      onEnded={onEnded}
      playsInline
    >
      {selectedSubtitle ? (
        <track key={selectedSubtitle.id} src={selectedSubtitle.url} kind="subtitles" label={selectedSubtitle.name} default />
      ) : null}
    </video>
  );
}
