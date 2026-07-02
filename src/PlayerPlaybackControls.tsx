import { Pause, Play, SkipForward, Volume2, VolumeX } from "lucide-react";

import { ControlSelect } from "./ControlSelect";

type PlayerPlaybackControlsProps = {
  canPlayNext: boolean;
  hasCurrentVideo: boolean;
  isMuted: boolean;
  isPlaying: boolean;
  playbackRate: number;
  playbackRateOptions: Array<{ value: number; label: string }>;
  volume: number;
  onChangePlaybackRate: (rate: number) => void;
  onChangeVolume: (volume: number) => void;
  onPlayNext: () => void;
  onToggleMute: () => void;
  onTogglePlay: () => void;
};

export function PlayerPlaybackControls({
  canPlayNext,
  hasCurrentVideo,
  isMuted,
  isPlaying,
  playbackRate,
  playbackRateOptions,
  volume,
  onChangePlaybackRate,
  onChangeVolume,
  onPlayNext,
  onToggleMute,
  onTogglePlay,
}: PlayerPlaybackControlsProps) {
  return (
    <>
      <button className="icon-button" type="button" onClick={onTogglePlay} disabled={!hasCurrentVideo} title="播放/暂停">
        {isPlaying ? <Pause size={20} /> : <Play size={20} />}
      </button>
      <button className="icon-button" type="button" onClick={onPlayNext} disabled={!canPlayNext} title="下一集">
        <SkipForward size={20} />
      </button>

      <label className="volume-control">
        <button
          aria-label={isMuted ? "取消静音" : "静音"}
          className="volume-toggle"
          type="button"
          onClick={onToggleMute}
          disabled={!hasCurrentVideo}
          title={isMuted ? "取消静音" : "静音"}
        >
          {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
        <input
          aria-label="音量"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(event) => onChangeVolume(Number(event.target.value))}
        />
      </label>

      <ControlSelect
        label="播放速度"
        ariaLabel="播放速度"
        value={playbackRate}
        options={playbackRateOptions}
        onChange={onChangePlaybackRate}
        className="rate-control"
      />
    </>
  );
}
