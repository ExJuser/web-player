import { FolderPlus, KeyRound, RefreshCw, Trash2 } from "lucide-react";

import type { PhotoAlbumLibraryRoot, PlayerMediaRootStatus } from "./playerTypes";
import { formatPhotoRootStatus } from "./playerUiState";

type PhotoRootStatusCardProps = {
  isLoading: boolean;
  roots: PhotoAlbumLibraryRoot[];
  statuses: PlayerMediaRootStatus[];
  onAdd: () => void;
  onRefresh: () => void;
  onRemove: (root: PhotoAlbumLibraryRoot) => void;
  onReauthorize: (root: PhotoAlbumLibraryRoot) => void;
};

export function PhotoRootStatusCard({
  isLoading,
  roots,
  statuses,
  onAdd,
  onRefresh,
  onRemove,
  onReauthorize,
}: PhotoRootStatusCardProps) {
  const readyCount = statuses.reduce((count, status) => count + (status.status === "ready" ? 1 : 0), 0);
  const statusByRootId = new Map(statuses.map((status) => [status.id, status]));

  return (
    <section className="home-section photo-root-status">
      <div className="home-section-header">
        <div>
          <h2>看图媒体库</h2>
          <span>{readyCount} / {roots.length} 可用</span>
        </div>
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
        <div className={`media-library-list${roots.length > 2 ? " media-library-list-scrollable" : ""}`}>
          {roots.map((root) => {
            const status = statusByRootId.get(root.id);
            return (
              <div className="media-library-row" key={root.id}>
                <strong>{root.label}</strong>
                <code>{root.basename}</code>
                <code>{status ? formatPhotoRootStatus(status) : "尚未扫描"}</code>
                {status?.error ? <code>{status.error}</code> : null}
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
        <div className="empty-list compact">尚未添加看图媒体库。</div>
      )}
    </section>
  );
}
