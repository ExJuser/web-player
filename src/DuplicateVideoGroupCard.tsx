import type { VideoItem } from "./playerTypes";
import type { DuplicateVideoGroup } from "./playerMediaUtils";

type DuplicateVideoGroupCardProps = {
  group: DuplicateVideoGroup;
  formatFileSize: (size: number) => string;
  formatTime: (seconds: number) => string;
  onOpenVideo: (video: VideoItem) => void;
};

export function DuplicateVideoGroupCard({ group, formatFileSize, formatTime, onOpenVideo }: DuplicateVideoGroupCardProps) {
  return (
    <div className="duplicate-video-group">
      <div className="duplicate-video-group-header">
        <strong>{group.severity === "duplicate" ? "高度重复" : "疑似重复"}</strong>
        <span>{group.videos.length} 个 · {group.reasons.join("、")}</span>
      </div>
      <div className="duplicate-video-list">
        {group.videos.map((video) => (
          <button key={video.id} type="button" onClick={() => onOpenVideo(video)} title={video.relativePath || video.name}>
            <span>{video.name}</span>
            <small>
              {formatFileSize(video.size)} · {video.duration ? formatTime(video.duration) : "未知时长"} ·{" "}
              {video.width && video.height ? `${video.width}x${video.height}` : "未知分辨率"}
            </small>
          </button>
        ))}
      </div>
    </div>
  );
}
