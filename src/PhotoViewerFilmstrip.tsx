import type { PhotoAlbumImage } from "./playerTypes";

type PhotoViewerFilmstripProps = {
  currentIndex: number;
  currentPhotoName: string;
  imageCount: number;
  thumbnails: PhotoAlbumImage[];
  getImageUrl: (image: PhotoAlbumImage) => string;
  onSelectImage: (image: PhotoAlbumImage) => void;
};

export function PhotoViewerFilmstrip({
  currentIndex,
  currentPhotoName,
  imageCount,
  thumbnails,
  getImageUrl,
  onSelectImage,
}: PhotoViewerFilmstripProps) {
  return (
    <footer className="photo-filmstrip">
      <div className="photo-page-indicator">
        <strong>{Math.min(currentIndex + 1, imageCount)} / {imageCount}</strong>
        <span>{currentPhotoName}</span>
      </div>
      <div className="photo-thumbnails" aria-label="图片缩略图">
        {thumbnails.map((image) => {
          const thumbnailUrl = getImageUrl(image);
          return (
            <button
              className={image.index === currentIndex ? "active" : ""}
              key={image.id}
              type="button"
              onClick={() => onSelectImage(image)}
              title={image.name}
            >
              {thumbnailUrl ? <img src={thumbnailUrl} alt="" decoding="async" loading="lazy" draggable={false} /> : null}
            </button>
          );
        })}
      </div>
    </footer>
  );
}
