import { HardDrive, LoaderCircle } from "lucide-react";

import type { CacheStatus } from "./cacheStatusUtils";

type HomeCacheStatusCardProps = {
  cacheStatus: CacheStatus | null;
  isLoading: boolean;
  formatFileSize: (bytes: number) => string;
  onOpen: () => void;
};

export function HomeCacheStatusCard({
  cacheStatus,
  isLoading,
  formatFileSize,
  onOpen,
}: HomeCacheStatusCardProps) {
  return (
    <section className="home-section home-cache-status-card" aria-busy={isLoading}>
      <div className="home-section-header">
        <h2>本地缓存</h2>
        <span>{cacheStatus ? `${cacheStatus.items.length} 个项目` : "尚未统计"}</span>
      </div>
      <button className="home-cache-status-button" type="button" onClick={onOpen}>
        <span className="home-cache-status-icon" aria-hidden="true">
          {isLoading ? <LoaderCircle className="spin-icon" size={20} /> : <HardDrive size={20} />}
        </span>
        <span className="home-cache-status-copy">
          <strong>{cacheStatus ? formatFileSize(cacheStatus.totalBytes) : isLoading ? "正在计算..." : "查看占用空间"}</strong>
          <small>
            {cacheStatus
              ? `磁盘 ${formatFileSize(cacheStatus.diskBytes)} · 内存 ${formatFileSize(cacheStatus.memoryBytes)}`
              : "查看可清缓存与持久化数据"}
          </small>
        </span>
      </button>
    </section>
  );
}
