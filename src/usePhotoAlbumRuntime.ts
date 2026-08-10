import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";

import { defaultPhotoAlbumPreferences, savePhotoAlbumStore } from "./photoAlbumStorage";
import type {
  FileSystemDirectoryHandle,
  PhotoAlbum,
  PhotoAlbumProgress,
  PhotoAlbumReadingMode,
  PhotoContinuousPageGap,
  PhotoReaderBackground,
  PhotoSingleFitMode,
  PhotoAlbumSortDirection,
  PhotoAlbumSortMode,
  PhotoAlbumStore,
} from "./playerTypes";

type PhotoAlbumViewFilterValue = "all" | "favorites";

type UsePhotoAlbumRuntimeOptions = {
  favoritePhotoAlbumIds: Set<string>;
  photoAlbumCoverPreferences: Record<string, string>;
  photoAlbumFilter: PhotoAlbumViewFilterValue;
  photoAlbumProgress: Record<string, PhotoAlbumProgress>;
  photoAlbums: PhotoAlbum[];
  photoAlbumReadingMode: PhotoAlbumReadingMode;
  photoContinuousPageGap: PhotoContinuousPageGap;
  photoSingleZoom: number;
  photoSingleFitMode: PhotoSingleFitMode;
  photoContinuousZoom: number;
  photoContinuousReaderBackground: PhotoReaderBackground;
  photoSingleReaderBackground: PhotoReaderBackground;
  photoAlbumSortDirection: PhotoAlbumSortDirection;
  photoAlbumSortMode: PhotoAlbumSortMode;
  photoAlbumTags: Record<string, string[]>;
  setFavoritePhotoAlbumIds: Dispatch<SetStateAction<Set<string>>>;
  setPhotoAlbumCoverPreferences: Dispatch<SetStateAction<Record<string, string>>>;
  setPhotoAlbumFilter: Dispatch<SetStateAction<PhotoAlbumViewFilterValue>>;
  setPhotoAlbumProgress: Dispatch<SetStateAction<Record<string, PhotoAlbumProgress>>>;
  setPhotoAlbumReadingMode: Dispatch<SetStateAction<PhotoAlbumReadingMode>>;
  setPhotoContinuousPageGap: Dispatch<SetStateAction<PhotoContinuousPageGap>>;
  setPhotoSingleZoom: Dispatch<SetStateAction<number>>;
  setPhotoSingleFitMode: Dispatch<SetStateAction<PhotoSingleFitMode>>;
  setPhotoContinuousZoom: Dispatch<SetStateAction<number>>;
  setPhotoContinuousReaderBackground: Dispatch<SetStateAction<PhotoReaderBackground>>;
  setPhotoSingleReaderBackground: Dispatch<SetStateAction<PhotoReaderBackground>>;
  setPhotoAlbumSortDirection: Dispatch<SetStateAction<PhotoAlbumSortDirection>>;
  setPhotoAlbumSortMode: Dispatch<SetStateAction<PhotoAlbumSortMode>>;
  setPhotoAlbumTags: Dispatch<SetStateAction<Record<string, string[]>>>;
};

export function usePhotoAlbumRuntime({
  favoritePhotoAlbumIds,
  photoAlbumCoverPreferences,
  photoAlbumFilter,
  photoAlbumProgress,
  photoAlbums,
  photoAlbumReadingMode,
  photoContinuousPageGap,
  photoSingleZoom,
  photoSingleFitMode,
  photoContinuousZoom,
  photoContinuousReaderBackground,
  photoSingleReaderBackground,
  photoAlbumSortDirection,
  photoAlbumSortMode,
  photoAlbumTags,
  setFavoritePhotoAlbumIds,
  setPhotoAlbumCoverPreferences,
  setPhotoAlbumFilter,
  setPhotoAlbumProgress,
  setPhotoAlbumReadingMode,
  setPhotoContinuousPageGap,
  setPhotoSingleZoom,
  setPhotoSingleFitMode,
  setPhotoContinuousZoom,
  setPhotoContinuousReaderBackground,
  setPhotoSingleReaderBackground,
  setPhotoAlbumSortDirection,
  setPhotoAlbumSortMode,
  setPhotoAlbumTags,
}: UsePhotoAlbumRuntimeOptions) {
  const photoAlbumsRef = useRef<PhotoAlbum[]>([]);
  const photoAlbumProgressRef = useRef<Record<string, PhotoAlbumProgress>>({});
  const photoAlbumCoverPreferencesRef = useRef<Record<string, string>>({});
  const photoAlbumTagsRef = useRef<Record<string, string[]>>({});
  const favoritePhotoAlbumIdsRef = useRef(new Set<string>());
  const photoAlbumPreferencesRef = useRef(defaultPhotoAlbumPreferences);
  const photoAlbumDirectoriesRef = useRef<Record<string, FileSystemDirectoryHandle>>({});

  photoAlbumsRef.current = photoAlbums;
  photoAlbumProgressRef.current = photoAlbumProgress;
  photoAlbumCoverPreferencesRef.current = photoAlbumCoverPreferences;
  photoAlbumTagsRef.current = photoAlbumTags;
  favoritePhotoAlbumIdsRef.current = favoritePhotoAlbumIds;
  photoAlbumPreferencesRef.current = {
    sortMode: photoAlbumSortMode,
    sortDirection: photoAlbumSortDirection,
    readingMode: photoAlbumReadingMode,
    singleReaderBackground: photoSingleReaderBackground,
    continuousReaderBackground: photoContinuousReaderBackground,
    continuousPageGap: photoContinuousPageGap,
    singleZoom: photoSingleZoom,
    singleFitMode: photoSingleFitMode,
    continuousZoom: photoContinuousZoom,
    favoritesOnly: photoAlbumFilter === "favorites",
    recentTags: photoAlbumPreferencesRef.current.recentTags,
    tagMergeDecisions: photoAlbumPreferencesRef.current.tagMergeDecisions,
  };

  const buildPhotoAlbumStore = useCallback(
    (overrides?: Partial<PhotoAlbumStore>): PhotoAlbumStore => ({
      version: 1,
      favorites: Array.from(favoritePhotoAlbumIdsRef.current),
      progress: photoAlbumProgressRef.current,
      coverImageByAlbumId: photoAlbumCoverPreferencesRef.current,
      albumTags: photoAlbumTagsRef.current,
      preferences: photoAlbumPreferencesRef.current,
      ...overrides,
    }),
    [],
  );

  const saveCurrentPhotoAlbumStore = useCallback(
    async (overrides?: Partial<PhotoAlbumStore>) => {
      await savePhotoAlbumStore(buildPhotoAlbumStore(overrides));
    },
    [buildPhotoAlbumStore],
  );

  const applyPhotoAlbumStore = useCallback((store: PhotoAlbumStore) => {
    const favoriteIds = new Set(store.favorites);
    favoritePhotoAlbumIdsRef.current = favoriteIds;
    photoAlbumProgressRef.current = store.progress;
    photoAlbumCoverPreferencesRef.current = store.coverImageByAlbumId;
    photoAlbumTagsRef.current = store.albumTags;
    photoAlbumPreferencesRef.current = store.preferences;
    setFavoritePhotoAlbumIds(favoriteIds);
    setPhotoAlbumProgress(store.progress);
    setPhotoAlbumCoverPreferences(store.coverImageByAlbumId);
    setPhotoAlbumTags(store.albumTags);
    setPhotoAlbumReadingMode(store.preferences.readingMode);
    setPhotoSingleReaderBackground(store.preferences.singleReaderBackground);
    setPhotoContinuousReaderBackground(store.preferences.continuousReaderBackground);
    setPhotoContinuousPageGap(store.preferences.continuousPageGap);
    setPhotoSingleZoom(store.preferences.singleZoom);
    setPhotoSingleFitMode(store.preferences.singleFitMode);
    setPhotoContinuousZoom(store.preferences.continuousZoom);
    setPhotoAlbumSortDirection(store.preferences.sortDirection);
    setPhotoAlbumSortMode(store.preferences.sortMode);
    setPhotoAlbumFilter(store.preferences.favoritesOnly ? "favorites" : "all");
  }, [
    setFavoritePhotoAlbumIds,
    setPhotoAlbumCoverPreferences,
    setPhotoAlbumFilter,
    setPhotoAlbumProgress,
    setPhotoAlbumReadingMode,
    setPhotoContinuousPageGap,
    setPhotoSingleZoom,
    setPhotoSingleFitMode,
    setPhotoContinuousZoom,
    setPhotoContinuousReaderBackground,
    setPhotoSingleReaderBackground,
    setPhotoAlbumSortDirection,
    setPhotoAlbumSortMode,
    setPhotoAlbumTags,
  ]);

  return {
    applyPhotoAlbumStore,
    buildPhotoAlbumStore,
    favoritePhotoAlbumIdsRef,
    photoAlbumCoverPreferencesRef,
    photoAlbumDirectoriesRef,
    photoAlbumPreferencesRef,
    photoAlbumProgressRef,
    photoAlbumsRef,
    photoAlbumTagsRef,
    saveCurrentPhotoAlbumStore,
  };
}
