import { ChevronDown, HardDrive, RefreshCw } from "lucide-react";

import type { LocalMediaRoot } from "./mediaRootScanCache";
import type { HomeMediaMode, PlayerMediaRootStatus } from "./playerTypes";
import { formatMediaRootStatus, getMediaRootLocalPathAction } from "./playerUiState";

type HomeMediaLibraryCardProps = {
  homeMediaMode: HomeMediaMode;
  homeMediaModeLabel: string;
  isOpen: boolean;
  isScanning: boolean;
  mediaRootCount: number;
  mediaRoots: LocalMediaRoot[];
  mediaRootStatuses: PlayerMediaRootStatus[];
  onConfigureLocalPath: (root: LocalMediaRoot) => void;
  onRefresh: () => void;
  onToggle: () => void;
};

export function HomeMediaLibraryCard({
  homeMediaMode,
  homeMediaModeLabel,
  isOpen,
  isScanning,
  mediaRootCount,
  mediaRoots,
  mediaRootStatuses,
  onConfigureLocalPath,
  onRefresh,
  onToggle,
}: HomeMediaLibraryCardProps) {
  let readyRootCount = 0;
  const statusByRootId = new Map<string, PlayerMediaRootStatus>();
  mediaRootStatuses.forEach((status) => {
    statusByRootId.set(status.id, status);
    if (status.status === "ready") readyRootCount += 1;
  });

  return (
    <section className="home-section media-library-card" aria-busy={isScanning}>
      <button
        className="media-library-toggle"
        type="button"
        aria-expanded={isOpen}
        aria-controls="home-media-library-panel"
        onClick={onToggle}
      >
        <span>{homeMediaMode === "all" ? "全局媒体库" : `${homeMediaModeLabel}媒体库`}</span>
        <span>{`${readyRootCount} / ${mediaRoots.length} 可用`}</span>
        <ChevronDown className="media-library-toggle-chevron" size={16} aria-hidden="true" />
      </button>
      <button
        className="secondary-button media-library-refresh-button"
        type="button"
        onClick={onRefresh}
        disabled={isScanning || !mediaRootCount}
        title={!mediaRootCount ? "还没有可扫描的媒体库" : "重新扫描全部媒体库"}
      >
        <RefreshCw size={16} className={isScanning ? "spin-icon" : undefined} />
        {isScanning ? "扫描中" : "刷新全部媒体库"}
      </button>
      {isOpen ? (
        <div id="home-media-library-panel" className="media-library-panel">
          {mediaRoots.length ? (
            <div className={`media-library-list${mediaRoots.length > 2 ? " media-library-list-scrollable" : ""}`}>
              {mediaRoots.map((root) => {
                const action = getMediaRootLocalPathAction(root);
                const status = statusByRootId.get(root.id);
                return (
                  <div className="media-library-row" key={root.id}>
                    <strong>{root.label}</strong>
                    <code>{formatMediaRootStatus(status)}</code>
                    <code>{root.source === "browser" ? `浏览器：${root.path}` : root.path}</code>
                    {root.source === "browser" ? (
                      <code>{root.localPath ? `本机：${root.localPath}` : "本机：未配置"}</code>
                    ) : null}
                    {action.visible ? (
                      <button
                        className="secondary-button media-library-path-button"
                        type="button"
                        disabled={action.disabled}
                        onClick={() => onConfigureLocalPath(root)}
                      >
                        <HardDrive size={16} />
                        {action.label}
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty-list compact">当前模式没有匹配的媒体库。</div>
          )}
        </div>
      ) : null}
    </section>
  );
}
