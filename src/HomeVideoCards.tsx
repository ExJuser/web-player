import { Play } from "lucide-react";

import { RatingChip, TagChips } from "./MetadataChips";
import { useVideoThumbnail } from "./useVideoThumbnail";
import type { HomeVideoCard, VideoItem } from "./playerTypes";

type HomeCardThumbnailProps = {
  card: HomeVideoCard;
  fallbackIndex?: number;
  thumbnailUrlOverride?: string | null;
  onThumbnailError: (videoId: string) => void;
};

export function HomeCardThumbnail({ card, fallbackIndex, thumbnailUrlOverride, onThumbnailError }: HomeCardThumbnailProps) {
  const { url } = useVideoThumbnail(card.video.id);
  const thumbnailUrl = thumbnailUrlOverride ?? url;
  return (
    <span className={`home-card-thumbnail ${thumbnailUrl ? "has-image" : ""}`} aria-hidden="true">
      {thumbnailUrl ? (
        <img
          src={thumbnailUrl}
          alt=""
          draggable={false}
          onError={() => onThumbnailError(card.video.id)}
        />
      ) : (
        <span>{typeof fallbackIndex === "number" ? String(fallbackIndex + 1).padStart(2, "0") : <Play size={24} />}</span>
      )}
    </span>
  );
}

type HomeListCardProps = {
  card: HomeVideoCard;
  index: number;
  title: string;
  meta: string;
  onOpen: (video: VideoItem) => void;
  onThumbnailError: (videoId: string) => void;
};

export function HomeListCard({ card, index, title, meta, onOpen, onThumbnailError }: HomeListCardProps) {
  return (
    <button
      className="home-list-card"
      type="button"
      onClick={() => onOpen(card.video)}
      title={title}
    >
      <HomeCardThumbnail card={card} fallbackIndex={index} onThumbnailError={onThumbnailError} />
      <span className="home-list-copy">
        <strong>{card.video.name}</strong>
        <small>{meta}</small>
        <TagChips tags={card.tags ?? []} actorTags={card.actorTags} systemTags={card.systemTags} limit={10} compact />
        <RatingChip rating={card.rating} comment={card.ratingComment} />
      </span>
    </button>
  );
}
