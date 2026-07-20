import { Folder, Play } from "lucide-react";

import { RatingChip, TagChips } from "./MetadataChips";
import { directoryPartsOf } from "./mediaPathUtils";
import type { LibrarySearchEntry } from "./librarySearchUtils";
import type { HomeVideoCard, PlaybackProgress, VideoItem, VideoRatingStore, VideoTagStore } from "./playerTypes";

type LibrarySearchResultItemProps = {
  result: LibrarySearchEntry<VideoItem, PlaybackProgress>;
  videoTags: VideoTagStore;
  videoRatings: VideoRatingStore;
  createCard: (video: VideoItem) => HomeVideoCard;
  formatProgressLabel: (card: HomeVideoCard) => string;
  isResumableProgress: (progress: PlaybackProgress | undefined) => boolean;
  onOpen: (result: LibrarySearchEntry<VideoItem, PlaybackProgress>) => void;
};

export function LibrarySearchResultItem({
  result,
  videoTags,
  videoRatings,
  createCard,
  formatProgressLabel,
  isResumableProgress,
  onOpen,
}: LibrarySearchResultItemProps) {
  if (result.kind === "video") {
    const video = result.representativeVideo;
    const card = createCard(video);
    const directoryLabel = directoryPartsOf(video.relativePath).join(" / ");
    const progressLabel = formatProgressLabel(card);
    return (
      <button
        className="library-folder-result"
        type="button"
        onClick={() => onOpen(result)}
        title={video.relativePath || video.name}
      >
        <span className="library-folder-icon" aria-hidden="true">
          <Play size={20} />
        </span>
        <span className="library-folder-copy">
          <strong>{video.name}</strong>
          <small>
            {progressLabel} · {result.reason}
          </small>
          {directoryLabel || result.mediaRootLabel ? (
            <small>{[result.mediaRootLabel, directoryLabel].filter(Boolean).join(" · ")}</small>
          ) : null}
          <TagChips tags={videoTags[video.id] ?? []} actorTags={card.actorTags} limit={3} compact />
          <RatingChip rating={videoRatings[video.id]} />
        </span>
      </button>
    );
  }

  const unfinishedCount = result.videos.filter(({ progress }) => !progress?.completed).length;
  const resumableCount = result.videos.filter(({ progress }) => isResumableProgress(progress)).length;
  const statusLabel = resumableCount
    ? `${resumableCount} 个可继续`
    : unfinishedCount
      ? `${unfinishedCount} 个未看完`
      : "已看完";

  return (
    <button
      className="library-folder-result"
      type="button"
      onClick={() => onOpen(result)}
      title={result.path || result.title}
    >
      <span className="library-folder-icon" aria-hidden="true">
        <Folder size={20} />
      </span>
      <span className="library-folder-copy">
        <strong>{result.title}</strong>
        <small>
          {result.videos.length} 集 · {statusLabel} · {result.reason}
        </small>
        {result.path || result.mediaRootLabel ? (
          <small>{[result.mediaRootLabel, result.path].filter(Boolean).join(" · ")}</small>
        ) : null}
        <RatingChip rating={videoRatings[result.representativeVideo.id]} />
      </span>
    </button>
  );
}
