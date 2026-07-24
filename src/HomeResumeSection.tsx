import { FolderOpen, Play, RotateCcw } from "lucide-react";

import { HomeCardThumbnail } from "./HomeVideoCards";
import { RatingChip, TagChips } from "./MetadataChips";
import type { HomeVideoCard, VideoItem } from "./playerTypes";

type HomeResumeSectionProps = {
  actionLabel: string;
  card: HomeVideoCard | null;
  homeMediaModeLabel: string;
  isScanning: boolean;
  title: string;
  videoCount: number;
  formatHomeMeta: (card: HomeVideoCard) => string;
  formatProgressLabel: (card: HomeVideoCard) => string;
  onAddMediaLibrary: () => void;
  onOpenVideo: (video: VideoItem, options?: { fromBeginning?: boolean }) => void;
  onThumbnailError: (videoId: string) => void;
};

export function HomeResumeSection({
  actionLabel,
  card,
  homeMediaModeLabel,
  isScanning,
  title,
  videoCount,
  formatHomeMeta,
  formatProgressLabel,
  onAddMediaLibrary,
  onOpenVideo,
  onThumbnailError,
}: HomeResumeSectionProps) {
  const hasMetadata = Boolean(
    card && (card.actorTags?.length || card.systemTags?.length || card.tags?.length || typeof card.rating === "number" || card.ratingComment?.trim()),
  );

  return (
    <section className={`home-resume-card ${card ? "" : "empty"} ${card?.video.thumbnailUrl ? "has-thumbnail" : ""}`}>
      {card ? (
        <>
          <HomeCardThumbnail card={card} onThumbnailError={onThumbnailError} />
          <div className="home-resume-copy">
            <span className="home-section-eyebrow">{title}</span>
            <h2>{card.video.name}</h2>
            <p>{card.seriesTitle}</p>
            <span>{card.mediaRootLabel}</span>
            <span>{card.video.relativePath}</span>
            <div className="home-progress" aria-label={formatProgressLabel(card)}>
              <span style={{ width: `${card.progressPercent}%` }} />
            </div>
            <small>{formatHomeMeta(card)}</small>
            {hasMetadata ? (
              <div className="home-resume-metadata">
                <TagChips tags={card.tags ?? []} actorTags={card.actorTags} systemTags={card.systemTags} limit={10} />
                <RatingChip rating={card.rating} comment={card.ratingComment} />
              </div>
            ) : null}
            <div className="home-resume-actions">
              <button className="primary-button" type="button" onClick={() => onOpenVideo(card.video)}>
                <Play size={18} />
                {actionLabel}
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => onOpenVideo(card.video, { fromBeginning: true })}
              >
                <RotateCcw size={17} />
                从头播放
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="home-empty-state">
          <FolderOpen size={42} />
          <h2>{videoCount ? `当前${homeMediaModeLabel}没有可播放视频` : "新增一个媒体库开始播放"}</h2>
          <p>
            {videoCount
              ? "切换到全部模式，或确认对应媒体库已完成扫描。"
              : "播放器会把你选择的目录加入全局媒体库，扫描视频、匹配字幕并保存观看进度。"}
          </p>
          {!videoCount ? (
            <button className="primary-button" type="button" onClick={onAddMediaLibrary} disabled={isScanning}>
              <FolderOpen size={18} />
              {isScanning ? "扫描中" : "新增媒体库"}
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}
