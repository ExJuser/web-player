import type { CSSProperties, Ref, SyntheticEvent } from "react";

import type { SubtitleItem } from "./playerTypes";

type PlayerVideoElementProps = {
  currentVideoSourceAspectRatio: number;
  isVideoSideways: boolean;
  normalizedVideoRotation: number;
  selectedSubtitle: SubtitleItem | null;
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
        normalizedVideoRotation
          ? ({
              "--landscape-source-aspect-ratio": currentVideoSourceAspectRatio,
              "--video-rotation": `${normalizedVideoRotation}deg`,
            } as CSSProperties)
          : undefined
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
