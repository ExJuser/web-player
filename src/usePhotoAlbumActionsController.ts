import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import type { PhotoAlbumViewFilter } from "./PhotoAlbumToolbar";
import {
  savePhotoAlbumCoverPreference,
  savePhotoAlbumFavorite,
  savePhotoAlbumPreferences,
  savePhotoAlbumProgress,
} from "./photoAlbumStorage";
import type {
  ActiveView,
  PhotoAlbum,
  PhotoAlbumImage,
  PhotoAlbumPreferences,
  PhotoAlbumProgress,
  PhotoAlbumSortMode,
  PhotoAlbumStore,
} from "./playerTypes";

type UsePhotoAlbumActionsControllerOptions = {
  currentPhotoIndex: number;
  favoritePhotoAlbumIdsRef: MutableRefObject<Set<string>>;
  photoAlbumCoverPreferencesRef: MutableRefObject<Record<string, string>>;
  photoAlbumPreferencesRef: MutableRefObject<PhotoAlbumPreferences>;
  photoAlbumProgressRef: MutableRefObject<Record<string, PhotoAlbumProgress>>;
  saveCurrentPhotoAlbumStore: (overrides?: Partial<PhotoAlbumStore>) => Promise<void>;
  selectedPhotoAlbum: PhotoAlbum | null;
  setActiveView: Dispatch<SetStateAction<ActiveView>>;
  setCurrentPhotoIndex: Dispatch<SetStateAction<number>>;
  setFavoritePhotoAlbumIds: Dispatch<SetStateAction<Set<string>>>;
  setPhotoAlbumCoverPreferences: Dispatch<SetStateAction<Record<string, string>>>;
  setPhotoAlbumFilter: Dispatch<SetStateAction<PhotoAlbumViewFilter>>;
  setPhotoAlbumMessage: Dispatch<SetStateAction<string>>;
  setPhotoAlbumPage: Dispatch<SetStateAction<number>>;
  setPhotoAlbumProgress: Dispatch<SetStateAction<Record<string, PhotoAlbumProgress>>>;
  setPhotoAlbumSortMode: Dispatch<SetStateAction<PhotoAlbumSortMode>>;
  setSelectedPhotoAlbumId: Dispatch<SetStateAction<string | null>>;
  visiblePhotoAlbums: PhotoAlbum[];
};

export function usePhotoAlbumActionsController({
  currentPhotoIndex,
  favoritePhotoAlbumIdsRef,
  photoAlbumCoverPreferencesRef,
  photoAlbumPreferencesRef,
  photoAlbumProgressRef,
  saveCurrentPhotoAlbumStore,
  selectedPhotoAlbum,
  setActiveView,
  setCurrentPhotoIndex,
  setFavoritePhotoAlbumIds,
  setPhotoAlbumCoverPreferences,
  setPhotoAlbumFilter,
  setPhotoAlbumMessage,
  setPhotoAlbumPage,
  setPhotoAlbumProgress,
  setPhotoAlbumSortMode,
  setSelectedPhotoAlbumId,
  visiblePhotoAlbums,
}: UsePhotoAlbumActionsControllerOptions) {
  const persistPhotoAlbumProgress = useCallback(
    (album: PhotoAlbum, imageIndex: number, completed = false) => {
      const safeIndex = Math.min(Math.max(imageIndex, 0), Math.max(album.images.length - 1, 0));
      const nextProgress = {
        ...photoAlbumProgressRef.current,
        [album.id]: {
          imageIndex: safeIndex,
          updatedAt: Date.now(),
          completed,
        },
      };
      photoAlbumProgressRef.current = nextProgress;
      setPhotoAlbumProgress(nextProgress);
      void savePhotoAlbumProgress(album.id, nextProgress[album.id]).catch(() => {
        setPhotoAlbumMessage("看图进度保存失败。");
      });
    },
    [photoAlbumProgressRef, setPhotoAlbumMessage, setPhotoAlbumProgress],
  );

  const openPhotoAlbum = useCallback(
    (album: PhotoAlbum, options?: { fromBeginning?: boolean }) => {
      const storedIndex = photoAlbumProgressRef.current[album.id]?.imageIndex ?? 0;
      const nextIndex = options?.fromBeginning ? 0 : Math.min(storedIndex, Math.max(album.images.length - 1, 0));
      setSelectedPhotoAlbumId(album.id);
      setCurrentPhotoIndex(nextIndex);
      setActiveView("photoViewer");
      persistPhotoAlbumProgress(album, nextIndex, false);
    },
    [persistPhotoAlbumProgress, photoAlbumProgressRef, setActiveView, setCurrentPhotoIndex, setSelectedPhotoAlbumId],
  );

  const openRandomPhotoAlbum = useCallback(() => {
    if (!visiblePhotoAlbums.length) return;
    const randomAlbum = visiblePhotoAlbums[Math.floor(Math.random() * visiblePhotoAlbums.length)];
    openPhotoAlbum(randomAlbum);
  }, [openPhotoAlbum, visiblePhotoAlbums]);

  const showPhotoAlbumList = useCallback(() => {
    setActiveView("photos");
  }, [setActiveView]);

  const movePhoto = useCallback(
    (delta: number) => {
      if (!selectedPhotoAlbum) return;
      const maxIndex = Math.max(selectedPhotoAlbum.images.length - 1, 0);
      const nextIndex = Math.min(Math.max(currentPhotoIndex + delta, 0), maxIndex);
      if (nextIndex === currentPhotoIndex) return;
      setCurrentPhotoIndex(nextIndex);
      persistPhotoAlbumProgress(selectedPhotoAlbum, nextIndex, nextIndex === maxIndex);
    },
    [currentPhotoIndex, persistPhotoAlbumProgress, selectedPhotoAlbum, setCurrentPhotoIndex],
  );

  const togglePhotoAlbumFavorite = useCallback(
    (album: PhotoAlbum) => {
      const nextFavorites = new Set(favoritePhotoAlbumIdsRef.current);
      if (nextFavorites.has(album.id)) {
        nextFavorites.delete(album.id);
        setPhotoAlbumMessage(`已取消收藏《${album.title}》`);
      } else {
        nextFavorites.add(album.id);
        setPhotoAlbumMessage(`已收藏《${album.title}》`);
      }
      favoritePhotoAlbumIdsRef.current = nextFavorites;
      setFavoritePhotoAlbumIds(nextFavorites);
      void savePhotoAlbumFavorite(album.id, nextFavorites.has(album.id)).catch(() => {
        setPhotoAlbumMessage("看图收藏保存失败。");
      });
    },
    [favoritePhotoAlbumIdsRef, setFavoritePhotoAlbumIds, setPhotoAlbumMessage],
  );

  const setPhotoAlbumCover = useCallback((album: PhotoAlbum, image: PhotoAlbumImage) => {
    const nextPreferences = {
      ...photoAlbumCoverPreferencesRef.current,
      [album.id]: image.id,
    };
    photoAlbumCoverPreferencesRef.current = nextPreferences;
    setPhotoAlbumCoverPreferences(nextPreferences);
    setPhotoAlbumMessage(`已将《${image.name}》设为《${album.title}》封面`);
    void savePhotoAlbumCoverPreference(album.id, image.id).catch(() => {
      setPhotoAlbumMessage("看图封面偏好保存失败。");
    });
  }, [photoAlbumCoverPreferencesRef, setPhotoAlbumCoverPreferences, setPhotoAlbumMessage]);

  const markSelectedPhotoAlbumCompleted = useCallback(() => {
    if (!selectedPhotoAlbum) return;
    const lastIndex = Math.max(selectedPhotoAlbum.images.length - 1, 0);
    setCurrentPhotoIndex(lastIndex);
    persistPhotoAlbumProgress(selectedPhotoAlbum, lastIndex, true);
    setPhotoAlbumMessage(`已标记《${selectedPhotoAlbum.title}》为已读完`);
  }, [persistPhotoAlbumProgress, selectedPhotoAlbum, setCurrentPhotoIndex, setPhotoAlbumMessage]);

  const resetSelectedPhotoAlbumProgress = useCallback(() => {
    if (!selectedPhotoAlbum) return;
    const nextProgress = { ...photoAlbumProgressRef.current };
    delete nextProgress[selectedPhotoAlbum.id];
    photoAlbumProgressRef.current = nextProgress;
    setPhotoAlbumProgress(nextProgress);
    setCurrentPhotoIndex(0);
    void saveCurrentPhotoAlbumStore({ progress: nextProgress }).catch(() => {
      setPhotoAlbumMessage("看图进度保存失败。");
    });
    setPhotoAlbumMessage(`已清除《${selectedPhotoAlbum.title}》的阅读进度`);
  }, [
    photoAlbumProgressRef,
    saveCurrentPhotoAlbumStore,
    selectedPhotoAlbum,
    setCurrentPhotoIndex,
    setPhotoAlbumMessage,
    setPhotoAlbumProgress,
  ]);

  const updatePhotoAlbumSortMode = useCallback(
    (nextSortMode: PhotoAlbumSortMode) => {
      const nextPreferences = {
        ...photoAlbumPreferencesRef.current,
        sortMode: nextSortMode,
      };
      photoAlbumPreferencesRef.current = nextPreferences;
      setPhotoAlbumSortMode(nextSortMode);
      setPhotoAlbumPage(1);
      void savePhotoAlbumPreferences(nextPreferences).catch(() => {
        setPhotoAlbumMessage("看图偏好保存失败。");
      });
    },
    [photoAlbumPreferencesRef, setPhotoAlbumMessage, setPhotoAlbumPage, setPhotoAlbumSortMode],
  );

  const updatePhotoAlbumFilter = useCallback(
    (nextFilter: PhotoAlbumViewFilter) => {
      const nextPreferences = {
        ...photoAlbumPreferencesRef.current,
        favoritesOnly: nextFilter === "favorites",
      };
      photoAlbumPreferencesRef.current = nextPreferences;
      setPhotoAlbumFilter(nextFilter);
      setPhotoAlbumPage(1);
      void savePhotoAlbumPreferences(nextPreferences).catch(() => {
        setPhotoAlbumMessage("看图偏好保存失败。");
      });
    },
    [photoAlbumPreferencesRef, setPhotoAlbumFilter, setPhotoAlbumMessage, setPhotoAlbumPage],
  );

  return {
    markSelectedPhotoAlbumCompleted,
    movePhoto,
    openPhotoAlbum,
    openRandomPhotoAlbum,
    persistPhotoAlbumProgress,
    resetSelectedPhotoAlbumProgress,
    setPhotoAlbumCover,
    showPhotoAlbumList,
    togglePhotoAlbumFavorite,
    updatePhotoAlbumFilter,
    updatePhotoAlbumSortMode,
  };
}
