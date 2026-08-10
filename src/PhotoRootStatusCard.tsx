import { ChevronDown, FolderPlus, HardDrive, KeyRound, RefreshCw, Trash2 } from "lucide-react";

import type { PhotoAlbumLibraryRoot, PlayerMediaRootStatus } from "./playerTypes";
import { formatPhotoRootStatus } from "./playerUiState";

type PhotoRootStatusCardProps = {
  isLoading: boolean;
  roots: PhotoAlbumLibraryRoot[];
  statuses: PlayerMediaRootStatus[];
  isOpen: boolean;
  onAdd: () => void;
  onRefresh: () => void;
  onRemove: (root: PhotoAlbumLibraryRoot) => void;
  onReauthorize: (root: PhotoAlbumLibraryRoot) => void;
  onToggle: () => void;
};

export function PhotoRootStatusCard({
  isLoading,
  roots,
  statuses,
  isOpen,
  onAdd,
  onRefresh,
  onRemove,
  onReauthorize,
  onToggle,
}: PhotoRootStatusCardProps) {
  const readyCount = statuses.reduce((count, status) => count + (status.status === "ready" ? 1 : 0), 0);
  const statusByRootId = new Map(statuses.map((status) => [status.id, status]));

  return (
    <section className={`photo-root-status photo-utility-panel${isOpen ? " is-open" : ""}`}>
      <button className="photo-utility-toggle" type="button" aria-expanded={isOpen} aria-controls="photo-root-panel" onClick={onToggle}>
        <span className="photo-utility-toggle-icon"><HardDrive size={16} /></span>
        <span className="photo-utility-toggle-copy"><strong>媒体库</strong><small>{isLoading ? "正在扫描" : `${readyCount} / ${roots.length} 可用`}</small></span>
        <span className={`photo-utility-health${readyCount === roots.length && roots.length ? " is-ready" : ""}`}>{roots.length ? (readyCount === roots.length ? "全部在线" : `${roots.length - readyCount} 项待处理`) : "未连接"}</span>
        <ChevronDown className="photo-utility-chevron" size={16} />
      </button>
      {isOpen ? (
        <div className="photo-utility-popover" id="photo-root-panel">
          <div className="photo-utility-popover-header">
            <div className="photo-root-popover-copy"><strong>看图媒体库</strong><span>管理目录授权与扫描状态</span></div>
            <div className="photo-root-actions">
              <button className="secondary-button" type="button" onClick={onAdd} disabled={isLoading}>
                <FolderPlus size={16} />
                新增媒体库
              </button>
              <button className="secondary-button" type="button" onClick={onRefresh} disabled={isLoading || !roots.length}>
                <RefreshCw className={isLoading ? "spin-icon" : undefined} size={16} />
                {isLoading ? "扫描中" : "刷新全部"}
              </button>
            </div>
          </div>
          {roots.length ? (
            <div className={`media-library-list custom-scrollbar${roots.length > 2 ? " media-library-list-scrollable" : ""}`}>
              {roots.map((root) => {
                const status = statusByRootId.get(root.id);
                return (
                  <div className="media-library-row" key={root.id}>
                    <div className="photo-root-row-copy">
                      <strong>{root.label}</strong>
                      <code>{root.basename}</code>
                      <code>{status ? formatPhotoRootStatus(status) : "尚未扫描"}</code>
                      {status?.error ? <code>{status.error}</code> : null}
                    </div>
                    <div className="photo-root-row-actions">
                      <button className="secondary-button" type="button" onClick={() => onReauthorize(root)} disabled={isLoading}>
                        <KeyRound size={15} />
                        重新授权
                      </button>
                      <button className="secondary-button" type="button" onClick={() => onRemove(root)} disabled={isLoading}>
                        <Trash2 size={15} />
                        移除
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty-list compact">尚未添加看图媒体库。新增一个本地文件夹后即可扫描图集。</div>
          )}
        </div>
      ) : null}
    </section>
  );
}
