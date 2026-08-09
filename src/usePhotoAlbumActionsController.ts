import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import type { PhotoAlbumViewFilter } from "./PhotoAlbumToolbar";
import {
  savePhotoAlbumCoverPreference,
  savePhotoAlbumFavorite,
  savePhotoAlbumPreferences,
  savePhotoAlbumProgress,
} from "./photoAlbumStorage";
import type {
  PhotoAlbum,
  PhotoAlbumImage,
  PhotoAlbumPreferences,
  PhotoAlbumProgress,
  PhotoAlbumSortDirection,
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
  onOpenPhotoAlbumRoute: (album: PhotoAlbum, imageIndex: number) => void;
  onShowPhotoAlbumListRoute: () => void;
  resolvePhotoAlbum?: (album: PhotoAlbum) => Promise<PhotoAlbum>;
  setCurrentPhotoIndex: Dispatch<SetStateAction<number>>;
  setFavoritePhotoAlbumIds: Dispatch<SetStateAction<Set<string>>>;
  setPhotoAlbumCoverPreferences: Dispatch<SetStateAction<Record<string, string>>>;
  setPhotoAlbumFilter: Dispatch<SetStateAction<PhotoAlbumViewFilter>>;
  setPhotoAlbumMessage: Dispatch<SetStateAction<string>>;
  setPhotoAlbumPage: Dispatch<SetStateAction<number>>;
  setPhotoAlbumProgress: Dispatch<SetStateAction<Record<string, PhotoAlbumProgress>>>;
  setPhotoAlbumSortDirection: Dispatch<SetStateAction<PhotoAlbumSortDirection>>;
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
  onOpenPhotoAlbumRoute,
  onShowPhotoAlbumListRoute,
  resolvePhotoAlbum,
  setCurrentPhotoIndex,
  setFavoritePhotoAlbumIds,
  setPhotoAlbumCoverPreferences,
  setPhotoAlbumFilter,
  setPhotoAlbumMessage,
  setPhotoAlbumPage,
  setPhotoAlbumProgress,
  setPhotoAlbumSortDirection,
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
    (album: PhotoAlbum, options?: { fromBeginning?: boolean; imageId?: string; imageIndex?: number; updateRoute?: boolean }) => {
      const applyOpen = (resolvedAlbum: PhotoAlbum) => {
        const storedIndex = photoAlbumProgressRef.current[resolvedAlbum.id]?.imageIndex ?? 0;
        const requestedImageIndex = options?.imageId
          ? resolvedAlbum.images.findIndex((image) => image.id === options.imageId)
          : -1;
        const requestedIndex = requestedImageIndex >= 0
          ? requestedImageIndex
          : options?.imageIndex ?? (options?.fromBeginning ? 0 : storedIndex);
        const nextIndex = Math.min(Math.max(requestedIndex, 0), Math.max(resolvedAlbum.images.length - 1, 0));
        setSelectedPhotoAlbumId(resolvedAlbum.id);
        setCurrentPhotoIndex(nextIndex);
        if (options?.updateRoute !== false) onOpenPhotoAlbumRoute(resolvedAlbum, nextIndex);
        persistPhotoAlbumProgress(resolvedAlbum, nextIndex, false);
      };
      if (!resolvePhotoAlbum || album.images.length >= album.imageCount) {
        applyOpen(album);
        return;
      }
      void resolvePhotoAlbum(album).then(applyOpen).catch(() => {
        setPhotoAlbumMessage(`《${album.title}》图片加载失败，请刷新后重试。`);
      });
    },
    [onOpenPhotoAlbumRoute, persistPhotoAlbumProgress, photoAlbumProgressRef, resolvePhotoAlbum, setCurrentPhotoIndex, setPhotoAlbumMessage, setSelectedPhotoAlbumId],
  );

  const openRandomPhotoAlbum = useCallback(() => {
    if (!visiblePhotoAlbums.length) return;
    const randomAlbum = visiblePhotoAlbums[Math.floor(Math.random() * visiblePhotoAlbums.length)];
    openPhotoAlbum(randomAlbum);
  }, [openPhotoAlbum, visiblePhotoAlbums]);

  const showPhotoAlbumList = useCallback(() => {
    onShowPhotoAlbumListRoute();
  }, [onShowPhotoAlbumListRoute]);

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

  const updatePhotoAlbumSortDirection = useCallback(
    (nextSortDirection: PhotoAlbumSortDirection) => {
      const nextPreferences = {
        ...photoAlbumPreferencesRef.current,
        sortDirection: nextSortDirection,
      };
      photoAlbumPreferencesRef.current = nextPreferences;
      setPhotoAlbumSortDirection(nextSortDirection);
      setPhotoAlbumPage(1);
      void savePhotoAlbumPreferences(nextPreferences).catch(() => {
        setPhotoAlbumMessage("看图偏好保存失败。");
      });
    },
    [photoAlbumPreferencesRef, setPhotoAlbumMessage, setPhotoAlbumPage, setPhotoAlbumSortDirection],
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
    updatePhotoAlbumSortDirection,
    updatePhotoAlbumSortMode,
  };
}
