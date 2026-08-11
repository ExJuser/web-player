import { useEffect, useState } from "react";
import { FolderOpen, Play, RotateCcw } from "lucide-react";

import { revokeObjectUrl } from "./appResourceCleanup";
import { HomeCardThumbnail } from "./HomeVideoCards";
import { RatingChip, TagChips } from "./MetadataChips";
import { formatRelativeTime, formatTime } from "./playerFormatUtils";
import type { HomeVideoCard, VideoItem } from "./playerTypes";
import { generateResumeVideoThumbnail } from "./videoThumbnail";

type HomeResumeSectionProps = {
  actionLabel: string;
  card: HomeVideoCard | null;
  homeMediaModeLabel: string;
  isScanning: boolean;
  libraryId: string | null;
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
  libraryId,
  title,
  videoCount,
  formatHomeMeta,
  formatProgressLabel,
  onAddMediaLibrary,
  onOpenVideo,
  onThumbnailError,
}: HomeResumeSectionProps) {
  const [resumeThumbnailUrl, setResumeThumbnailUrl] = useState<string | null>(null);
  const hasMetadata = Boolean(
    card && (card.actorTags?.length || card.systemTags?.length || card.tags?.length || typeof card.rating === "number" || card.ratingComment?.trim()),
  );
  const currentTime = card?.progress?.currentTime ?? 0;
  const duration = card ? card.progress?.duration || card.video.duration || 0 : 0;
  const remainingTime = Math.max(0, duration - currentTime);
  const progressPercent = Math.min(100, Math.max(0, card?.progressPercent ?? 0));
  const progressMarkerPercent = Math.min(99.25, Math.max(0.75, progressPercent));
  const lastWatchedLabel = card?.progress?.updatedAt
    ? `${formatRelativeTime(card.progress.updatedAt)}观看`
    : "准备播放";
  const progressHeadline = card?.progress?.completed
    ? "这部影片已经看完"
    : currentTime > 0
      ? `上次停在 ${formatTime(currentTime)}`
      : "从片头开始";
  const seriesTitle = card?.seriesTitle?.trim();
  const videoName = card?.video.name ?? "";
  const extensionIndex = videoName.lastIndexOf(".");
  const displayTitle = extensionIndex > 0 ? videoName.slice(0, extensionIndex) : videoName;
  const resumeVideo = card?.video;

  useEffect(() => {
    setResumeThumbnailUrl(null);
    if (!resumeVideo || currentTime <= 0) return undefined;

    let isCancelled = false;
    let generatedUrl: string | null = null;
    const abortController = new AbortController();
    void generateResumeVideoThumbnail(libraryId, resumeVideo, currentTime, abortController.signal)
      .then((url) => {
        generatedUrl = url;
        if (isCancelled) {
          revokeObjectUrl(url);
          return;
        }
        setResumeThumbnailUrl(url);
      })
      .catch(() => undefined);

    return () => {
      isCancelled = true;
      abortController.abort();
      revokeObjectUrl(generatedUrl);
    };
  }, [currentTime, libraryId, resumeVideo]);

  const displayedCard = card && resumeThumbnailUrl
    ? { ...card, video: { ...card.video, thumbnailUrl: resumeThumbnailUrl } }
    : card;
  const handleDisplayedThumbnailError = (videoId: string) => {
    if (resumeThumbnailUrl) {
      revokeObjectUrl(resumeThumbnailUrl);
      setResumeThumbnailUrl(null);
      return;
    }
    onThumbnailError(videoId);
  };

  return (
    <section className={`home-resume-card ${card ? "" : "empty"} ${card?.video.thumbnailUrl ? "has-thumbnail" : ""}`}>
      {card ? (
        <>
          <button
            className="home-resume-visual"
            type="button"
            aria-label={`${actionLabel}：${card.video.name}`}
            onClick={() => onOpenVideo(card.video)}
          >
            <HomeCardThumbnail card={displayedCard ?? card} onThumbnailError={handleDisplayedThumbnailError} />
            <span className="home-resume-frame-timecode" aria-hidden="true">
              <span>{resumeThumbnailUrl ? "断点" : "预览"}</span>
              {resumeThumbnailUrl ? <strong>{formatTime(currentTime)}</strong> : null}
            </span>
            <span className="home-resume-frame-play" aria-hidden="true">
              <Play size={22} fill="currentColor" />
            </span>
          </button>
          <div className="home-resume-copy">
            <div className="home-resume-status">
              <span className="home-section-eyebrow">{title}</span>
              <span>{lastWatchedLabel}</span>
            </div>
            <div className="home-resume-identity">
              <h2>{displayTitle}</h2>
            </div>
            {card.mediaRootLabel || seriesTitle ? (
              <div className="home-resume-context">
                {card.mediaRootLabel ? <span className="home-resume-source">{card.mediaRootLabel}</span> : null}
                {seriesTitle ? (
                  <span className="home-resume-folder">
                    <FolderOpen size={14} />
                    <span>文件夹 · {seriesTitle}</span>
                  </span>
                ) : null}
              </div>
            ) : null}
            {hasMetadata ? (
              <div className="home-resume-metadata">
                <TagChips tags={card.tags ?? []} actorTags={card.actorTags} systemTags={card.systemTags} limit={10} />
                <RatingChip rating={card.rating} comment={card.ratingComment} />
              </div>
            ) : null}
            <div className="home-resume-timeline" aria-label={`${formatProgressLabel(card)}；${formatHomeMeta(card)}`}>
              <div className="home-resume-timeline-heading">
                <strong>{progressHeadline}</strong>
                {remainingTime > 0 ? <span>还剩 {formatTime(remainingTime)}</span> : null}
              </div>
              <div className="home-resume-timeline-track" aria-hidden="true">
                <span className="home-resume-timeline-fill" style={{ width: `${progressPercent}%` }} />
                <span className="home-resume-timeline-marker" style={{ left: `${progressMarkerPercent}%` }} />
              </div>
              <div className="home-resume-timeline-time" aria-hidden="true">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>
            <div className="home-resume-actions">
              <button className="primary-button" type="button" onClick={() => onOpenVideo(card.video)}>
                <Play size={18} fill="currentColor" />
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
              ? "请切换媒体模式，或确认对应媒体库已完成扫描。"
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
