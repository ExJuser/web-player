import { EyeOff, Keyboard, Maximize, PictureInPicture2, RotateCw, Zap } from "lucide-react";

type PlayerViewControlsProps = {
  hasCurrentVideo: boolean;
  isCinemaMode: boolean;
  isPrivacyMode: boolean;
  normalizedVideoRotation: number;
  startFromHighEnergy: boolean;
  onRotateVideo: () => void;
  onToggleCinemaMode: () => void;
  onToggleFullscreen: () => void;
  onTogglePictureInPicture: () => void;
  onTogglePrivacyMode: () => void;
  onToggleShortcutDialog: () => void;
  onToggleStartFromHighEnergy: () => void;
};

export function PlayerViewControls({
  hasCurrentVideo,
  isCinemaMode,
  isPrivacyMode,
  normalizedVideoRotation,
  startFromHighEnergy,
  onRotateVideo,
  onToggleCinemaMode,
  onToggleFullscreen,
  onTogglePictureInPicture,
  onTogglePrivacyMode,
  onToggleShortcutDialog,
  onToggleStartFromHighEnergy,
}: PlayerViewControlsProps) {
  return (
    <>
      <label className={`control-toggle ${startFromHighEnergy ? "active" : ""}`} title="播放视频默认从高能片段开始">
        <input
          type="checkbox"
          checked={startFromHighEnergy}
          onChange={onToggleStartFromHighEnergy}
          aria-label="播放视频默认从高能时刻开始"
        />
        <Zap size={16} aria-hidden="true" />
        <span>高能开播</span>
      </label>

      <button className="icon-button" type="button" onClick={onTogglePictureInPicture} disabled={!hasCurrentVideo} title="画中画">
        <PictureInPicture2 size={20} />
      </button>
      <button
        className={`icon-button ${normalizedVideoRotation ? "active" : ""}`}
        type="button"
        onClick={onRotateVideo}
        disabled={!hasCurrentVideo}
        title={`旋转视频${normalizedVideoRotation ? ` (${normalizedVideoRotation}deg)` : ""}`}
        aria-label={`旋转视频${normalizedVideoRotation ? `, 当前 ${normalizedVideoRotation} 度` : ""}`}
        aria-pressed={normalizedVideoRotation !== 0}
      >
        <RotateCw size={20} />
      </button>
      <button className="icon-button" type="button" onClick={onToggleShortcutDialog} title="快捷键帮助">
        <Keyboard size={20} />
      </button>
      <button
        className={`icon-button privacy-toggle ${isPrivacyMode ? "active" : ""}`}
        type="button"
        onClick={onTogglePrivacyMode}
        title="隐私模式 / 快速清屏 (P)"
        aria-pressed={isPrivacyMode}
      >
        <EyeOff size={20} />
      </button>
      <button
        className={`icon-button cinema-toggle ${isCinemaMode ? "active" : ""}`}
        type="button"
        onClick={onToggleCinemaMode}
        disabled={!hasCurrentVideo}
        title="影院模式"
        aria-pressed={isCinemaMode}
      >
        T
      </button>
      <button className="icon-button" type="button" onClick={onToggleFullscreen} disabled={!hasCurrentVideo} title="全屏">
        <Maximize size={20} />
      </button>
    </>
  );
}
