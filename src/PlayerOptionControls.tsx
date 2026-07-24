import { Settings2, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ControlSelect } from "./ControlSelect";
import type { PlaybackMode, SubtitleStylePreferences } from "./playerTypes";

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
  subtitleStyle: SubtitleStylePreferences;
  onChangeHoldPlaybackRate: (rate: number) => void;
  onChangePlaybackMode: (mode: PlaybackMode) => void;
  onChangeSeekStep: (step: number) => void;
  onChangeSourceChoice: (choice: PlaybackSourceChoice) => void;
  onDeleteCompatibleMedia: () => void;
  onChangeSubtitleStyle: (style: SubtitleStylePreferences) => void;
};

const sourceOptions: Array<{ value: PlaybackSourceChoice; label: string }> = [
  { value: "compatible", label: "修复版" },
  { value: "original", label: "原版" },
];

const subtitleFontSizeOptions = [12, 14, 16, 18, 22, 26, 32].map((fontSize) => ({
  value: fontSize,
  label: `${fontSize}px`,
}));
const subtitleFontFamilyOptions: Array<{ value: SubtitleStylePreferences["fontFamily"]; label: string }> = [
  { value: "sans-serif", label: "无衬线" },
  { value: "serif", label: "衬线" },
  { value: "monospace", label: "等宽" },
];
const subtitleFontWeightOptions: Array<{ value: SubtitleStylePreferences["fontWeight"]; label: string }> = [
  { value: 400, label: "常规" },
  { value: 600, label: "半粗" },
  { value: 700, label: "粗体" },
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
  subtitleStyle,
  onChangeHoldPlaybackRate,
  onChangePlaybackMode,
  onChangeSeekStep,
  onChangeSourceChoice,
  onDeleteCompatibleMedia,
  onChangeSubtitleStyle,
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

            <span className="player-options-section-title">字幕样式</span>
            <ControlSelect
              label="字号"
              ariaLabel="字幕字号"
              value={subtitleStyle.fontSize}
              options={subtitleFontSizeOptions}
              onChange={(fontSize) => onChangeSubtitleStyle({ ...subtitleStyle, fontSize })}
            />
            <ControlSelect
              label="字体"
              ariaLabel="字幕字体"
              value={subtitleStyle.fontFamily}
              options={subtitleFontFamilyOptions}
              onChange={(fontFamily) => onChangeSubtitleStyle({ ...subtitleStyle, fontFamily })}
            />
            <ControlSelect
              label="粗细"
              ariaLabel="字幕字体粗细"
              value={subtitleStyle.fontWeight}
              options={subtitleFontWeightOptions}
              onChange={(fontWeight) => onChangeSubtitleStyle({ ...subtitleStyle, fontWeight })}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
