import { Clock3, Film, FolderClock, HardDrive, Heart } from "lucide-react";

type LibraryStats = {
  completed: number;
  favorites: number;
  knownDurationVideos: number;
  latestAddedAt: number | null;
  recentlyAdded: number;
  total: number;
  totalBytes: number;
  totalDurationSeconds: number;
  unfinished: number;
  unstarted: number;
};

type HomeLibraryStatsCardProps = {
  homeMediaModeLabel: string;
  stats: LibraryStats;
  formatDuration: (seconds: number) => string;
  formatFileSize: (bytes: number) => string;
  formatModifiedTime: (time: number) => string;
};

export function HomeLibraryStatsCard({
  homeMediaModeLabel,
  stats,
  formatDuration,
  formatFileSize,
  formatModifiedTime,
}: HomeLibraryStatsCardProps) {
  const total = Math.max(stats.total, 1);
  const segments = [
    { key: "unstarted", label: "未开始", value: stats.unstarted },
    { key: "unfinished", label: "观看中", value: stats.unfinished },
    { key: "completed", label: "已完成", value: stats.completed },
  ] as const;

  return (
    <section className="home-section home-library-stats-card">
      <div className="home-section-header">
        <h2>影片库</h2>
        <span>{homeMediaModeLabel}</span>
      </div>

      <div className="home-library-stats-total">
        <span className="home-library-stats-mark" aria-hidden="true"><Film size={21} /></span>
        <div>
          <strong>{stats.total.toLocaleString()}</strong>
          <span>部影片</span>
        </div>
        <small>{stats.total ? `${stats.completed} 部已完成` : "当前模式暂无影片"}</small>
      </div>

      <div className="home-library-composition" aria-label="观看状态构成">
        <div className="home-library-composition-track" aria-hidden="true">
          {segments.map((segment) => (
            <i
              className={segment.key}
              key={segment.key}
              style={{ width: `${stats.total ? (segment.value / total) * 100 : segment.key === "unstarted" ? 100 : 0}%` }}
            />
          ))}
        </div>
        <div className="home-library-composition-legend">
          {segments.map((segment) => (
            <span key={segment.key}><i className={segment.key} aria-hidden="true" />{segment.label}<strong>{segment.value}</strong></span>
          ))}
        </div>
      </div>

      <dl className="home-library-stats-grid">
        <div><dt><HardDrive size={13} />库容量</dt><dd>{formatFileSize(stats.totalBytes)}</dd></div>
        <div><dt><Clock3 size={13} />影片时长</dt><dd>{formatDuration(stats.totalDurationSeconds)}</dd><small>{stats.knownDurationVideos} 部已知</small></div>
        <div><dt><Heart size={13} />收藏</dt><dd>{stats.favorites}</dd></div>
        <div><dt><FolderClock size={13} />近 7 天新增</dt><dd>{stats.recentlyAdded}</dd></div>
      </dl>

      <p className="home-library-stats-updated">
        {stats.latestAddedAt ? `最近入库 ${formatModifiedTime(stats.latestAddedAt)}` : "暂无入库时间"}
      </p>
    </section>
  );
}
