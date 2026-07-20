import { Settings2, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const closeOnPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || !menuRef.current?.contains(target)) setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  return (
    <div className="player-options-menu" ref={menuRef}>
      <button
        className={`icon-button ${isOpen ? "active" : ""}`}
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-label="更多播放设置"
        title="更多播放设置"
      >
        <Settings2 size={18} />
      </button>
      {isOpen ? (
        <div className="player-options-popover" role="dialog" aria-label="更多播放设置">
          <strong>播放设置</strong>
          <div className="player-options-grid">
            {hasCompatibleMedia ? (
              <div className="player-source-setting">
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
              </div>
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
          </div>
        </div>
      ) : null}
    </div>
  );
}
