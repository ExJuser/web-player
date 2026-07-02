import { HomeCardThumbnail } from "./HomeVideoCards";
import type { HomeVideoCard, VideoItem } from "./playerTypes";

type HomeNextEpisodeSectionProps = {
  card: HomeVideoCard;
  onOpenVideo: (video: VideoItem) => void;
  onThumbnailError: (videoId: string) => void;
};

export function HomeNextEpisodeSection({ card, onOpenVideo, onThumbnailError }: HomeNextEpisodeSectionProps) {
  return (
    <section className="home-section">
      <div className="home-section-header">
        <h2>下一集</h2>
        <span>{card.seriesTitle}</span>
      </div>
      <div className="home-next-card">
        <HomeCardThumbnail card={card} onThumbnailError={onThumbnailError} />
        <div>
          <strong>{card.video.name}</strong>
          <small>{card.mediaRootLabel} · {card.video.relativePath}</small>
        </div>
        <button className="secondary-button" type="button" onClick={() => onOpenVideo(card.video)}>
          播放
        </button>
      </div>
    </section>
  );
}
