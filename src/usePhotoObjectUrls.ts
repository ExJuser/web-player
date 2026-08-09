import { useEffect, useRef, useState } from "react";

import {
  photoViewerDecodeRadius,
  photoViewerWarmRadius,
} from "./appConfig";
import { getPhotoImageFileFromDirectory } from "./photoAlbumScan";
import { prunePhotoObjectUrlCache, type PhotoObjectUrlCacheMetadata } from "./photoObjectUrlCache";
import type { ActiveView, FileSystemDirectoryHandle, PhotoAlbum, PhotoAlbumImage } from "./playerTypes";

const photoViewerIdleWarmRadius = 2;
const photoViewerDirectionalWarmBehind = 1;
const photoViewerFileLoadConcurrency = 2;
const photoViewerFastNavigationThresholdMs = 300;
const photoViewerFastWarmExtra = 2;

function getPhotoViewerWarmIndexes(currentIndex: number, imageCount: number, direction: -1 | 0 | 1, isFastNavigation: boolean) {
  const directionalWarmRadius = photoViewerWarmRadius + (isFastNavigation ? photoViewerFastWarmExtra : 0);
  const offsets = direction === 0
    ? Array.from({ length: photoViewerIdleWarmRadius }, (_, index) => index + 1).flatMap((offset) => [-offset, offset])
    : [
        ...Array.from({ length: directionalWarmRadius }, (_, index) => (index + 1) * direction),
        ...Array.from({ length: photoViewerDirectionalWarmBehind }, (_, index) => -(index + 1) * direction),
      ];
  return [0, ...offsets]
    .map((offset) => currentIndex + offset)
    .filter((index) => index >= 0 && index < imageCount);
}

function getPhotoViewerDecodeIndexes(currentIndex: number, imageCount: number, direction: -1 | 0 | 1, isFastNavigation: boolean) {
  const offsets = direction === 0
    ? Array.from({ length: photoViewerDecodeRadius }, (_, index) => index + 1).flatMap((offset) => [-offset, offset])
    : isFastNavigation
      ? [direction]
      : [direction, direction * 2, -direction];
  return [0, ...offsets]
    .map((offset) => currentIndex + offset)
    .filter((index) => index >= 0 && index < imageCount);
}

type MutableRef<T> = {
  current: T;
};

type UsePhotoObjectUrlsParams = {
  activeView: ActiveView;
  currentPhotoIndex: number;
  decodedPhotoImageIdsRef: MutableRef<Set<string>>;
  pagedPhotoAlbums: PhotoAlbum[];
  photoAlbumCoverPreferences: Record<string, string>;
  photoAlbumDirectoryRef: MutableRef<FileSystemDirectoryHandle | null>;
  photoImageFilePromisesRef: MutableRef<Record<string, Promise<File | null>>>;
  photoObjectUrlAccessRef: MutableRef<Record<string, number>>;
  photoObjectUrlMetadataRef: MutableRef<PhotoObjectUrlCacheMetadata>;
  photoObjectUrls: Record<string, string>;
  photoObjectUrlsRef: MutableRef<Record<string, string>>;
  selectedPhotoAlbum: PhotoAlbum | null;
  setPhotoObjectUrls: (urls: Record<string, string>) => void;
  viewerScrollDirectionRef: MutableRef<-1 | 0 | 1>;
};

export function usePhotoObjectUrls({
  activeView,
  currentPhotoIndex,
  decodedPhotoImageIdsRef,
  pagedPhotoAlbums,
  photoAlbumCoverPreferences,
  photoAlbumDirectoryRef,
  photoImageFilePromisesRef,
  photoObjectUrlAccessRef,
  photoObjectUrlMetadataRef,
  photoObjectUrls,
  photoObjectUrlsRef,
  selectedPhotoAlbum,
  setPhotoObjectUrls,
  viewerScrollDirectionRef,
}: UsePhotoObjectUrlsParams) {
  const viewerPositionRef = useRef<{
    albumId: string;
    averageStepMs: number;
    direction: -1 | 0 | 1;
    index: number;
    timestamp: number;
  } | null>(null);
  const viewerObjectUrlIdsRef = useRef<{ albumId: string; imageIds: Set<string> } | null>(null);
  const loadRunIdRef = useRef(0);
  const [isPageVisible, setIsPageVisible] = useState(() => document.visibilityState !== "hidden");

  useEffect(() => {
    const handleVisibilityChange = () => setIsPageVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  useEffect(() => {
    const runId = ++loadRunIdRef.current;
    const neededImages = new Map<string, PhotoAlbumImage>();
    const directory = photoAlbumDirectoryRef.current;
    const rememberNeededImage = (image?: PhotoAlbumImage | null) => {
      if (image && !image.url && (image.file || directory)) neededImages.set(image.id, image);
    };

    if (activeView === "photos") {
      if (isPageVisible) {
        pagedPhotoAlbums.forEach((album) => {
          rememberNeededImage(album.images.find((image) => image.id === photoAlbumCoverPreferences[album.id]) ?? album.images[0]);
        });
      }
    } else if (activeView === "photoViewer" && selectedPhotoAlbum) {
      const previousPosition = viewerPositionRef.current;
      const indexDelta = previousPosition?.albumId === selectedPhotoAlbum.id
        ? currentPhotoIndex - previousPosition.index
        : 0;
      const now = performance.now();
      const stepMs = previousPosition?.albumId === selectedPhotoAlbum.id && indexDelta
        ? (now - previousPosition.timestamp) / Math.abs(indexDelta)
        : 0;
      const averageStepMs = stepMs
        ? previousPosition?.averageStepMs
          ? previousPosition.averageStepMs * 0.65 + stepMs * 0.35
          : stepMs
        : previousPosition?.averageStepMs ?? 0;
      const indexDirection: -1 | 0 | 1 = indexDelta > 0 ? 1 : indexDelta < 0 ? -1 : 0;
      const direction: -1 | 0 | 1 = viewerScrollDirectionRef.current
        || indexDirection
        || (previousPosition?.albumId === selectedPhotoAlbum.id ? previousPosition.direction : 0);
      const isFastNavigation = averageStepMs > 0 && averageStepMs < photoViewerFastNavigationThresholdMs;
      viewerPositionRef.current = {
        albumId: selectedPhotoAlbum.id,
        averageStepMs,
        direction,
        index: currentPhotoIndex,
        timestamp: indexDelta || previousPosition?.albumId !== selectedPhotoAlbum.id
          ? now
          : previousPosition.timestamp,
      };
      const warmIndexes = isPageVisible
        ? getPhotoViewerWarmIndexes(currentPhotoIndex, selectedPhotoAlbum.images.length, direction, isFastNavigation)
        : [currentPhotoIndex];
      for (const index of warmIndexes) {
        rememberNeededImage(selectedPhotoAlbum.images[index]);
      }
    } else {
      viewerPositionRef.current = null;
    }

    const nextUrls = { ...photoObjectUrlsRef.current };
    let didChange = false;
    const missingImages: PhotoAlbumImage[] = [];
    const previousViewerUrls = viewerObjectUrlIdsRef.current;
    const isSameViewerAlbum = activeView === "photoViewer"
      && selectedPhotoAlbum?.id === previousViewerUrls?.albumId;
    if (previousViewerUrls && !isSameViewerAlbum) {
      previousViewerUrls.imageIds.forEach((id) => {
        if (!nextUrls[id] || neededImages.has(id)) return;
        URL.revokeObjectURL(nextUrls[id]);
        delete nextUrls[id];
        delete photoObjectUrlAccessRef.current[id];
        delete photoObjectUrlMetadataRef.current[id];
        decodedPhotoImageIdsRef.current.delete(id);
        didChange = true;
      });
    }
    if (activeView === "photoViewer" && selectedPhotoAlbum) {
      const imageIds = isSameViewerAlbum && previousViewerUrls
        ? previousViewerUrls.imageIds
        : new Set<string>();
      neededImages.forEach((_, id) => imageIds.add(id));
      viewerObjectUrlIdsRef.current = { albumId: selectedPhotoAlbum.id, imageIds };
    } else {
      viewerObjectUrlIdsRef.current = null;
    }

    neededImages.forEach((image, id) => {
      if (nextUrls[id]) {
        const now = Date.now();
        photoObjectUrlAccessRef.current[id] = now;
        const previousMetadata = photoObjectUrlMetadataRef.current[id];
        photoObjectUrlMetadataRef.current[id] = previousMetadata
          ? { ...previousMetadata, lastAccessedAt: now }
          : { bytes: image.file?.size ?? image.size, createdAt: now, decoded: false, lastAccessedAt: now };
        return;
      }
      if (image.file) {
        nextUrls[id] = URL.createObjectURL(image.file);
        const now = Date.now();
        photoObjectUrlAccessRef.current[id] = now;
        photoObjectUrlMetadataRef.current[id] = { bytes: image.file.size, createdAt: now, decoded: false, lastAccessedAt: now };
        didChange = true;
      } else if (directory) {
        missingImages.push(image);
      }
    });

    const prunedUrls = prunePhotoObjectUrlCache(
      nextUrls,
      photoObjectUrlAccessRef.current,
      photoObjectUrlMetadataRef.current,
      new Set(neededImages.keys()),
      decodedPhotoImageIdsRef.current,
    );
    if (prunedUrls !== nextUrls) didChange = true;

    if (didChange) {
      photoObjectUrlsRef.current = prunedUrls;
      setPhotoObjectUrls(prunedUrls);
    }

    if (!directory || !missingImages.length) return;

    let isCancelled = false;
    const isStaleRun = () => isCancelled || loadRunIdRef.current !== runId;
    const loadMissingImage = async (image: PhotoAlbumImage) => {
      let filePromise = photoImageFilePromisesRef.current[image.id];
      if (!filePromise) {
        filePromise = getPhotoImageFileFromDirectory(directory, image.relativePath).catch(() => null);
        photoImageFilePromisesRef.current[image.id] = filePromise;
      }
      const file = await filePromise;
      if (photoImageFilePromisesRef.current[image.id] === filePromise) {
        delete photoImageFilePromisesRef.current[image.id];
      }
      if (isStaleRun() || !file || photoObjectUrlsRef.current[image.id]) return;
      const url = URL.createObjectURL(file);
      if (isStaleRun()) {
        URL.revokeObjectURL(url);
        return;
      }
      const now = Date.now();
      photoObjectUrlAccessRef.current[image.id] = now;
      photoObjectUrlMetadataRef.current[image.id] = { bytes: file.size, createdAt: now, decoded: false, lastAccessedAt: now };
      const cachedUrls = prunePhotoObjectUrlCache(
        {
          ...photoObjectUrlsRef.current,
          [image.id]: url,
        },
        photoObjectUrlAccessRef.current,
        photoObjectUrlMetadataRef.current,
        new Set(neededImages.keys()),
        decodedPhotoImageIdsRef.current,
      );
      photoObjectUrlsRef.current = cachedUrls;
      setPhotoObjectUrls(cachedUrls);
    };
    const loadQueue = async () => {
      let nextIndex = 0;
      const worker = async () => {
        while (!isStaleRun() && nextIndex < missingImages.length) {
          const image = missingImages[nextIndex];
          nextIndex += 1;
          await loadMissingImage(image);
        }
      };
      await Promise.all(Array.from(
        { length: Math.min(photoViewerFileLoadConcurrency, missingImages.length) },
        () => worker(),
      ));
    };
    void loadQueue();

    return () => {
      isCancelled = true;
    };
  }, [
    activeView,
    currentPhotoIndex,
    decodedPhotoImageIdsRef,
    pagedPhotoAlbums,
    photoAlbumCoverPreferences,
    photoAlbumDirectoryRef,
    photoImageFilePromisesRef,
    photoObjectUrlAccessRef,
    photoObjectUrlMetadataRef,
    photoObjectUrlsRef,
    isPageVisible,
    selectedPhotoAlbum,
    setPhotoObjectUrls,
    viewerScrollDirectionRef,
  ]);

  useEffect(() => {
    if (activeView !== "photoViewer" || !selectedPhotoAlbum || !isPageVisible) return;

    const position = viewerPositionRef.current?.albumId === selectedPhotoAlbum.id
      ? viewerPositionRef.current
      : null;
    const direction = position?.direction ?? 0;
    const isFastNavigation = Boolean(position?.averageStepMs && position.averageStepMs < photoViewerFastNavigationThresholdMs);
    for (const index of getPhotoViewerDecodeIndexes(currentPhotoIndex, selectedPhotoAlbum.images.length, direction, isFastNavigation)) {
      const image = selectedPhotoAlbum.images[index];
      const url = image?.url || photoObjectUrls[image?.id ?? ""];
      if (!image || !url || decodedPhotoImageIdsRef.current.has(image.id)) continue;

      const preloadImage = new Image();
      preloadImage.decoding = "async";
      preloadImage.src = url;
      if (preloadImage.decode) {
        void preloadImage.decode()
          .then(() => {
            decodedPhotoImageIdsRef.current.add(image.id);
            const metadata = photoObjectUrlMetadataRef.current[image.id];
            if (metadata) metadata.decoded = true;
          })
          .catch(() => undefined);
      } else {
        preloadImage.onload = () => {
          decodedPhotoImageIdsRef.current.add(image.id);
          const metadata = photoObjectUrlMetadataRef.current[image.id];
          if (metadata) metadata.decoded = true;
        };
      }
    }
  }, [activeView, currentPhotoIndex, decodedPhotoImageIdsRef, isPageVisible, photoObjectUrlMetadataRef, photoObjectUrls, selectedPhotoAlbum]);

  useEffect(() => {
    return () => {
      Object.values(photoObjectUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
      photoObjectUrlsRef.current = {};
      photoObjectUrlAccessRef.current = {};
      photoObjectUrlMetadataRef.current = {};
      decodedPhotoImageIdsRef.current.clear();
    };
  }, [decodedPhotoImageIdsRef, photoObjectUrlAccessRef, photoObjectUrlMetadataRef, photoObjectUrlsRef]);
}
