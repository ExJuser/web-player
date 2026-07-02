import type { PlayerMediaRootStatus } from "./playerTypes";
import { formatPhotoRootStatus } from "./playerUiState";

type PhotoRootStatusCardProps = {
  statuses: PlayerMediaRootStatus[];
};

export function PhotoRootStatusCard({ statuses }: PhotoRootStatusCardProps) {
  const readyCount = statuses.filter((status) => status.status === "ready").length;

  if (!statuses.some((status) => status.status !== "ready")) {
    return null;
  }

  return (
    <section className="home-section photo-root-status">
      <div className="home-section-header">
        <h2>媒体库状态</h2>
        <span>{readyCount} / {statuses.length} 可用</span>
      </div>
      <div className="media-library-list">
        {statuses.map((status) => (
          <div className="media-library-row" key={status.id}>
            <strong>{status.label}</strong>
            <code>{formatPhotoRootStatus(status)}</code>
            {status.error ? <code>{status.error}</code> : null}
          </div>
        ))}
      </div>
    </section>
  );
}
