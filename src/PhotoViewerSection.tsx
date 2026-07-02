import { PhotoViewerFilmstrip } from "./PhotoViewerFilmstrip";
import { PhotoViewerHeader } from "./PhotoViewerHeader";
import { PhotoViewerStage } from "./PhotoViewerStage";
import type { PhotoAlbum, PhotoAlbumImage } from "./playerTypes";

type PhotoViewerSectionProps = {
  album: PhotoAlbum;
  currentIndex: number;
  currentPhoto: PhotoAlbumImage | null;
  currentPhotoUrl: string;
  isCoverCurrent: boolean;
  isFavorite: boolean;
  thumbnails: PhotoAlbumImage[];
  getImageUrl: (image: PhotoAlbumImage) => string;
  onBack: () => void;
  onDeleteCurrentPhoto: () => void;
  onEditTags: (album: PhotoAlbum) => void;
  onMarkCompleted: () => void;
  onMove: (delta: number) => void;
  onResetProgress: () => void;
  onSelectImage: (image: PhotoAlbumImage) => void;
  onSetCover: (album: PhotoAlbum, image: PhotoAlbumImage) => void;
  onToggleFavorite: (album: PhotoAlbum) => void;
};

export function PhotoViewerSection({
  album,
  currentIndex,
  currentPhoto,
  currentPhotoUrl,
  isCoverCurrent,
  isFavorite,
  thumbnails,
  getImageUrl,
  onBack,
  onDeleteCurrentPhoto,
  onEditTags,
  onMarkCompleted,
  onMove,
  onResetProgress,
  onSelectImage,
  onSetCover,
  onToggleFavorite,
}: PhotoViewerSectionProps) {
  return (
    <section className="photo-viewer" aria-label={`阅读 ${album.title}`}>
      <PhotoViewerHeader
        album={album}
        currentPhoto={currentPhoto}
        isCoverCurrent={isCoverCurrent}
        isFavorite={isFavorite}
        onBack={onBack}
        onDeleteCurrentPhoto={onDeleteCurrentPhoto}
        onEditTags={onEditTags}
        onMarkCompleted={onMarkCompleted}
        onResetProgress={onResetProgress}
        onSetCover={onSetCover}
        onToggleFavorite={onToggleFavorite}
      />
      <PhotoViewerStage
        currentIndex={currentIndex}
        currentPhoto={currentPhoto}
        currentPhotoUrl={currentPhotoUrl}
        imageCount={album.images.length}
        onMove={onMove}
      />
      <PhotoViewerFilmstrip
        currentIndex={currentIndex}
        currentPhotoName={currentPhoto?.name ?? album.title}
        getImageUrl={getImageUrl}
        imageCount={album.imageCount}
        thumbnails={thumbnails}
        onSelectImage={onSelectImage}
      />
    </section>
  );
}
