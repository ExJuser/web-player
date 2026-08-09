import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";

import { defaultPhotoAlbumPreferences, savePhotoAlbumStore } from "./photoAlbumStorage";
import type {
  FileSystemDirectoryHandle,
  PhotoAlbum,
  PhotoAlbumProgress,
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
  photoAlbumSortDirection: PhotoAlbumSortDirection;
  photoAlbumSortMode: PhotoAlbumSortMode;
  photoAlbumTags: Record<string, string[]>;
  setFavoritePhotoAlbumIds: Dispatch<SetStateAction<Set<string>>>;
  setPhotoAlbumCoverPreferences: Dispatch<SetStateAction<Record<string, string>>>;
  setPhotoAlbumFilter: Dispatch<SetStateAction<PhotoAlbumViewFilterValue>>;
  setPhotoAlbumProgress: Dispatch<SetStateAction<Record<string, PhotoAlbumProgress>>>;
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
  photoAlbumSortDirection,
  photoAlbumSortMode,
  photoAlbumTags,
  setFavoritePhotoAlbumIds,
  setPhotoAlbumCoverPreferences,
  setPhotoAlbumFilter,
  setPhotoAlbumProgress,
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
  const photoAlbumDirectoryRef = useRef<FileSystemDirectoryHandle | null>(null);

  photoAlbumsRef.current = photoAlbums;
  photoAlbumProgressRef.current = photoAlbumProgress;
  photoAlbumCoverPreferencesRef.current = photoAlbumCoverPreferences;
  photoAlbumTagsRef.current = photoAlbumTags;
  favoritePhotoAlbumIdsRef.current = favoritePhotoAlbumIds;
  photoAlbumPreferencesRef.current = {
    sortMode: photoAlbumSortMode,
    sortDirection: photoAlbumSortDirection,
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
    setPhotoAlbumSortDirection(store.preferences.sortDirection);
    setPhotoAlbumSortMode(store.preferences.sortMode);
    setPhotoAlbumFilter(store.preferences.favoritesOnly ? "favorites" : "all");
  }, [
    setFavoritePhotoAlbumIds,
    setPhotoAlbumCoverPreferences,
    setPhotoAlbumFilter,
    setPhotoAlbumProgress,
    setPhotoAlbumSortDirection,
    setPhotoAlbumSortMode,
    setPhotoAlbumTags,
  ]);

  return {
    applyPhotoAlbumStore,
    buildPhotoAlbumStore,
    favoritePhotoAlbumIdsRef,
    photoAlbumCoverPreferencesRef,
    photoAlbumDirectoryRef,
    photoAlbumPreferencesRef,
    photoAlbumProgressRef,
    photoAlbumsRef,
    photoAlbumTagsRef,
    saveCurrentPhotoAlbumStore,
  };
}
