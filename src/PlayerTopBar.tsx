import { FolderOpen, HardDrive, Images, Moon, RefreshCw, Sun } from "lucide-react";
import { forwardRef } from "react";

import type { ActiveView } from "./playerTypes";

type VideoMetadataRow = readonly [string, string];

type PlayerTopBarProps = {
  activeView: ActiveView;
  canCreateCompatibleMedia: boolean;
  compatibleMediaActionLabel: string;
  compatibleMediaActionVisible: boolean;
  compatibleMediaMessage: string;
  compatibleMediaVideoId: string | null;
  currentVideoId: string | null;
  isHomeViewVisible: boolean;
  isNonPlayerViewVisible: boolean;
  isPhotoAlbumViewVisible: boolean;
  isPrivacyMode: boolean;
  isScanning: boolean;
  mediaProbeVideoId: string | null;
  metadataRows: readonly VideoMetadataRow[];
  summaryFallbackText: string;
  theme: "dark" | "light";
  videoCount: number;
  playabilityMessage: string;
  onAddMediaLibrary: () => void;
  onOpenCacheStatus: () => void;
  onOpenCompatibleMediaConfirm: () => void;
  onShowHome: () => void;
  onShowPhotoAlbums: () => void;
  onToggleTheme: () => void;
};

export const PlayerTopBar = forwardRef<HTMLElement, PlayerTopBarProps>(function PlayerTopBar(
  {
    activeView,
    canCreateCompatibleMedia,
    compatibleMediaActionLabel,
    compatibleMediaActionVisible,
    compatibleMediaMessage,
    compatibleMediaVideoId,
    currentVideoId,
    isHomeViewVisible,
    isNonPlayerViewVisible,
    isPhotoAlbumViewVisible,
    isPrivacyMode,
    isScanning,
    mediaProbeVideoId,
    metadataRows,
    summaryFallbackText,
    theme,
    videoCount,
    playabilityMessage,
    onAddMediaLibrary,
    onOpenCacheStatus,
    onOpenCompatibleMediaConfirm,
    onShowHome,
    onShowPhotoAlbums,
    onToggleTheme,
  },
  ref
) {
  const shouldShowMetadata = Boolean(currentVideoId) && !isPrivacyMode && !isNonPlayerViewVisible;
  const shouldShowCompatibleMediaStatus = Boolean(
    currentVideoId && (compatibleMediaActionVisible || mediaProbeVideoId === currentVideoId)
  );
  const isCreatingCompatibleMedia = Boolean(currentVideoId && compatibleMediaVideoId === currentVideoId);
  const themeToggleLabel = theme === "dark" ? "切换到白天模式" : "切换到黑夜模式";

  return (
    <header className="top-bar" ref={ref}>
      <div className="video-summary">
        {shouldShowMetadata ? (
          <>
            <dl className="current-video-meta">
              {metadataRows.map(([label, value]) => (
                <div key={label} className={label === "文件名" ? "current-video-file-chip" : undefined}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            {shouldShowCompatibleMediaStatus ? (
              <div className="compatible-media-status">
                <span>{mediaProbeVideoId === currentVideoId ? "正在探测媒体兼容性..." : playabilityMessage}</span>
                {canCreateCompatibleMedia ? (
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={onOpenCompatibleMediaConfirm}
                    disabled={isCreatingCompatibleMedia}
                  >
                    <RefreshCw size={15} className={isCreatingCompatibleMedia ? "spin-icon" : undefined} />
                    {isCreatingCompatibleMedia ? "生成中" : compatibleMediaActionLabel}
                  </button>
                ) : null}
                {compatibleMediaMessage ? <small>{compatibleMediaMessage}</small> : null}
              </div>
            ) : null}
          </>
        ) : isHomeViewVisible ? null : (
          <p className="current-video-title">{summaryFallbackText}</p>
        )}
      </div>
      <div className="top-actions">
        {!isPrivacyMode && !isPhotoAlbumViewVisible ? (
          <button
            className="secondary-button top-cache-status-button"
            type="button"
            onClick={onOpenCacheStatus}
            title="查看本地缓存"
          >
            <HardDrive size={17} />
            本地缓存
          </button>
        ) : null}
        {!isPrivacyMode && !isPhotoAlbumViewVisible ? (
          <button
            className="primary-button top-add-library-button"
            type="button"
            onClick={onAddMediaLibrary}
            disabled={isScanning}
          >
            <FolderOpen size={18} />
            {isScanning ? "扫描中" : "新增媒体库"}
          </button>
        ) : null}
        {!isPrivacyMode && videoCount && !isHomeViewVisible ? (
          <button className="secondary-button top-home-button" type="button" onClick={onShowHome}>
            首页
          </button>
        ) : null}
        {!isPrivacyMode && activeView !== "photos" && activeView !== "photoViewer" ? (
          <button className="secondary-button top-home-button" type="button" onClick={onShowPhotoAlbums}>
            <Images size={17} />
            看图
          </button>
        ) : null}
        <button
          className="icon-button theme-toggle"
          type="button"
          onClick={onToggleTheme}
          title={themeToggleLabel}
          aria-label={themeToggleLabel}
        >
          {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
        </button>
      </div>
    </header>
  );
});
