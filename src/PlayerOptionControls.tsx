import { Trash2 } from "lucide-react";

import { ControlSelect } from "./ControlSelect";
import type { PlaybackMode } from "./playerTypes";

type PlaybackSourceChoice = "compatible" | "original";

type PlayerOptionControlsProps = {
  hasCompatibleMedia: boolean;
  hasCurrentVideo: boolean;
  holdPlaybackRate: number;
  holdRateOptions: Array<{ value: number; label: string }>;
  isDeletingCompatibleMedia: boolean;
  playbackMode: PlaybackMode;
  playbackModeOptions: Array<{ value: PlaybackMode; label: string }>;
  seekStep: number;
  seekStepOptions: Array<{ value: number; label: string }>;
  showPlaybackMode: boolean;
  sourceChoice: PlaybackSourceChoice;
  onChangeHoldPlaybackRate: (rate: number) => void;
  onChangePlaybackMode: (mode: PlaybackMode) => void;
  onChangeSeekStep: (step: number) => void;
  onChangeSourceChoice: (choice: PlaybackSourceChoice) => void;
  onDeleteCompatibleMedia: () => void;
};

const sourceOptions: Array<{ value: PlaybackSourceChoice; label: string }> = [
  { value: "compatible", label: "修复版" },
  { value: "original", label: "原版" },
];

export function PlayerOptionControls({
  hasCompatibleMedia,
  hasCurrentVideo,
  holdPlaybackRate,
  holdRateOptions,
  isDeletingCompatibleMedia,
  playbackMode,
  playbackModeOptions,
  seekStep,
  seekStepOptions,
  showPlaybackMode,
  sourceChoice,
  onChangeHoldPlaybackRate,
  onChangePlaybackMode,
  onChangeSeekStep,
  onChangeSourceChoice,
  onDeleteCompatibleMedia,
}: PlayerOptionControlsProps) {
  return (
    <>
      {hasCompatibleMedia ? (
        <>
          <ControlSelect
            label="片源"
            ariaLabel="播放源"
            value={sourceChoice}
            options={sourceOptions}
            onChange={onChangeSourceChoice}
            className="source-control"
            disabled={!hasCurrentVideo}
          />
          <button
            className="icon-button"
            type="button"
            onClick={onDeleteCompatibleMedia}
            disabled={!hasCurrentVideo || isDeletingCompatibleMedia}
            title="删除修复版"
            aria-label="删除修复版"
          >
            <Trash2 size={18} />
          </button>
        </>
      ) : null}

      {showPlaybackMode ? (
        <ControlSelect
          label="播放模式"
          ariaLabel="播放模式"
          value={playbackMode}
          options={playbackModeOptions}
          onChange={onChangePlaybackMode}
        />
      ) : null}

      <ControlSelect
        label="快进/快退"
        ariaLabel="快进/快退时间"
        value={seekStep}
        options={seekStepOptions}
        onChange={onChangeSeekStep}
      />

      <ControlSelect
        label="长按右方向"
        ariaLabel="长按右方向键倍速"
        value={holdPlaybackRate}
        options={holdRateOptions}
        onChange={onChangeHoldPlaybackRate}
      />
    </>
  );
}
