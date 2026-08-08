import { Minimize2 } from "lucide-react";

import { PhotoContinuousReader } from "./PhotoContinuousReader";
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
  isContinuousReading: boolean;
  isImmersive: boolean;
  thumbnails: PhotoAlbumImage[];
  getImageUrl: (image: PhotoAlbumImage) => string;
  onBack: () => void;
  onDeleteCurrentPhoto: () => void;
  onEditTags: (album: PhotoAlbum) => void;
  onImmersiveChange: (isImmersive: boolean) => void;
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
  isContinuousReading,
  isImmersive,
  thumbnails,
  getImageUrl,
  onBack,
  onDeleteCurrentPhoto,
  onEditTags,
  onImmersiveChange,
  onMarkCompleted,
  onMove,
  onResetProgress,
  onSelectImage,
  onSetCover,
  onToggleFavorite,
}: PhotoViewerSectionProps) {
  return (
    <section className={`photo-viewer ${isImmersive ? "immersive" : ""}`} aria-label={`阅读 ${album.title}`}>
      {!isImmersive ? (
        <PhotoViewerHeader
          album={album}
          currentPhoto={currentPhoto}
          isCoverCurrent={isCoverCurrent}
          isFavorite={isFavorite}
          onBack={onBack}
          onDeleteCurrentPhoto={onDeleteCurrentPhoto}
          onEditTags={onEditTags}
          onEnterImmersive={() => onImmersiveChange(true)}
          onMarkCompleted={onMarkCompleted}
          onResetProgress={onResetProgress}
          onSetCover={onSetCover}
          onToggleFavorite={onToggleFavorite}
        />
      ) : null}
      {isContinuousReading ? (
        <PhotoContinuousReader
          album={album}
          currentIndex={currentIndex}
          getImageUrl={getImageUrl}
          onCurrentImageChange={onSelectImage}
        />
      ) : (
        <PhotoViewerStage
          currentIndex={currentIndex}
          currentPhoto={currentPhoto}
          currentPhotoUrl={currentPhotoUrl}
          imageCount={album.images.length}
          onMove={onMove}
        />
      )}
      {isImmersive ? (
        <button
          className="photo-immersive-exit"
          type="button"
          onClick={() => onImmersiveChange(false)}
          title="退出沉浸阅读（Esc）"
          aria-label="退出沉浸阅读"
        >
          <Minimize2 size={18} />
        </button>
      ) : !isContinuousReading ? (
        <PhotoViewerFilmstrip
          currentIndex={currentIndex}
          currentPhotoName={currentPhoto?.name ?? album.title}
          getImageUrl={getImageUrl}
          imageCount={album.imageCount}
          thumbnails={thumbnails}
          onSelectImage={onSelectImage}
        />
      ) : null}
    </section>
  );
}
