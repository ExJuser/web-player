import type { PhotoAlbum, PhotoAlbumImage, PhotoAlbumProgress } from "./playerTypes";

type RemovePhotoFromAlbumStateParams = {
  album: PhotoAlbum;
  albums: PhotoAlbum[];
  albumTags: Record<string, string[]>;
  coverPreferences: Record<string, string>;
  favoriteAlbumIds: Set<string>;
  photo: PhotoAlbumImage;
  photoIndex: number;
  progress: Record<string, PhotoAlbumProgress>;
  updatedAt?: number;
};

type RemovePhotoAlbumStateParams = {
  albumId: string;
  albums: PhotoAlbum[];
  albumTags: Record<string, string[]>;
  coverPreferences: Record<string, string>;
  favoriteAlbumIds: Set<string>;
  progress: Record<string, PhotoAlbumProgress>;
};

function withoutAlbumKey<T>(values: Record<string, T>, albumId: string) {
  const nextValues = { ...values };
  delete nextValues[albumId];
  return nextValues;
}

export function removePhotoAlbumState({
  albumId,
  albums,
  albumTags,
  coverPreferences,
  favoriteAlbumIds,
  progress,
}: RemovePhotoAlbumStateParams) {
  const nextFavorites = favoriteAlbumIds.has(albumId)
    ? new Set([...favoriteAlbumIds].filter((favoriteAlbumId) => favoriteAlbumId !== albumId))
    : favoriteAlbumIds;
  return {
    nextAlbums: albums.filter((item) => item.id !== albumId),
    nextAlbumTags: withoutAlbumKey(albumTags, albumId),
    nextCoverPreferences: withoutAlbumKey(coverPreferences, albumId),
    nextFavorites,
    nextProgress: withoutAlbumKey(progress, albumId),
  };
}

export function removePhotoFromAlbumState({
  album,
  albums,
  albumTags,
  coverPreferences,
  favoriteAlbumIds,
  photo,
  photoIndex,
  progress,
  updatedAt = Date.now(),
}: RemovePhotoFromAlbumStateParams) {
  const remainingImages = album.images
    .filter((image) => image.id !== photo.id)
    .map((image, index) => ({ ...image, index }));
  const nextPhotoIndex = Math.min(Math.max(photoIndex, 0), Math.max(remainingImages.length - 1, 0));

  if (!remainingImages.length) {
    return {
      ...removePhotoAlbumState({
        albumId: album.id,
        albums,
        albumTags,
        coverPreferences,
        favoriteAlbumIds,
        progress,
      }),
      nextPhotoIndex,
      nextSelectedAlbumId: null,
      remainingImages,
    };
  }

  const nextAlbum: PhotoAlbum = {
    ...album,
    coverImageUrl: album.coverImageUrl === photo.url ? remainingImages[0]?.url || "" : album.coverImageUrl,
    imageCount: remainingImages.length,
    totalSize: remainingImages.reduce((sum, image) => sum + image.size, 0),
    updatedAt: remainingImages.reduce((latest, image) => Math.max(latest, image.lastModified), 0),
    images: remainingImages,
  };
  const nextCoverPreferences = { ...coverPreferences };
  if (nextCoverPreferences[album.id] === photo.id) {
    const nextCoverImage = remainingImages[nextPhotoIndex] ?? remainingImages[0];
    if (nextCoverImage) nextCoverPreferences[album.id] = nextCoverImage.id;
  }
  return {
    nextAlbums: albums.map((item) => (item.id === album.id ? nextAlbum : item)),
    nextAlbumTags: { ...albumTags },
    nextCoverPreferences,
    nextFavorites: favoriteAlbumIds,
    nextPhotoIndex,
    nextProgress: {
      ...progress,
      [album.id]: {
        imageIndex: nextPhotoIndex,
        updatedAt,
        completed: Boolean(progress[album.id]?.completed && nextPhotoIndex === remainingImages.length - 1),
      },
    },
    nextSelectedAlbumId: album.id,
    remainingImages,
  };
}
