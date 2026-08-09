import { useEffect, useRef } from "react";

import {
  photoViewerDecodeRadius,
  photoViewerWarmRadius,
} from "./appConfig";
import { getPhotoImageFileFromDirectory } from "./photoAlbumScan";
import { prunePhotoObjectUrlCache } from "./photoObjectUrlCache";
import type { ActiveView, FileSystemDirectoryHandle, PhotoAlbum, PhotoAlbumImage } from "./playerTypes";

const photoViewerIdleWarmRadius = 2;
const photoViewerDirectionalWarmBehind = 1;
const photoViewerFileLoadConcurrency = 2;

function getPhotoViewerWarmIndexes(currentIndex: number, imageCount: number, direction: -1 | 0 | 1) {
  const offsets = direction === 0
    ? Array.from({ length: photoViewerIdleWarmRadius }, (_, index) => index + 1).flatMap((offset) => [-offset, offset])
    : [
        ...Array.from({ length: photoViewerWarmRadius }, (_, index) => (index + 1) * direction),
        ...Array.from({ length: photoViewerDirectionalWarmBehind }, (_, index) => -(index + 1) * direction),
      ];
  return [0, ...offsets]
    .map((offset) => currentIndex + offset)
    .filter((index) => index >= 0 && index < imageCount);
}

function getPhotoViewerDecodeIndexes(currentIndex: number, imageCount: number, direction: -1 | 0 | 1) {
  const offsets = direction === 0
    ? Array.from({ length: photoViewerDecodeRadius }, (_, index) => index + 1).flatMap((offset) => [-offset, offset])
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
  photoObjectUrls: Record<string, string>;
  photoObjectUrlsRef: MutableRef<Record<string, string>>;
  selectedPhotoAlbum: PhotoAlbum | null;
  setPhotoObjectUrls: (urls: Record<string, string>) => void;
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
  photoObjectUrls,
  photoObjectUrlsRef,
  selectedPhotoAlbum,
  setPhotoObjectUrls,
}: UsePhotoObjectUrlsParams) {
  const viewerPositionRef = useRef<{ albumId: string; index: number; direction: -1 | 0 | 1 } | null>(null);
  const viewerObjectUrlIdsRef = useRef<{ albumId: string; imageIds: Set<string> } | null>(null);

  useEffect(() => {
    const neededImages = new Map<string, PhotoAlbumImage>();
    const directory = photoAlbumDirectoryRef.current;
    const rememberNeededImage = (image?: PhotoAlbumImage | null) => {
      if (image && !image.url && (image.file || directory)) neededImages.set(image.id, image);
    };

    if (activeView === "photos") {
      pagedPhotoAlbums.forEach((album) => {
        rememberNeededImage(album.images.find((image) => image.id === photoAlbumCoverPreferences[album.id]) ?? album.images[0]);
      });
    } else if (activeView === "photoViewer" && selectedPhotoAlbum) {
      const previousPosition = viewerPositionRef.current;
      const indexDelta = previousPosition?.albumId === selectedPhotoAlbum.id
        ? currentPhotoIndex - previousPosition.index
        : 0;
      const direction = indexDelta === 1
        ? 1
        : indexDelta === -1
          ? -1
          : indexDelta === 0 && previousPosition?.albumId === selectedPhotoAlbum.id
            ? previousPosition.direction
            : 0;
      viewerPositionRef.current = { albumId: selectedPhotoAlbum.id, index: currentPhotoIndex, direction };
      for (const index of getPhotoViewerWarmIndexes(currentPhotoIndex, selectedPhotoAlbum.images.length, direction)) {
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
        photoObjectUrlAccessRef.current[id] = Date.now();
        return;
      }
      if (image.file) {
        nextUrls[id] = URL.createObjectURL(image.file);
        photoObjectUrlAccessRef.current[id] = Date.now();
        didChange = true;
      } else if (directory) {
        missingImages.push(image);
      }
    });

    const prunedUrls = prunePhotoObjectUrlCache(
      nextUrls,
      photoObjectUrlAccessRef.current,
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
      if (isCancelled || !file || photoObjectUrlsRef.current[image.id]) return;
      const url = URL.createObjectURL(file);
      if (isCancelled) {
        URL.revokeObjectURL(url);
        return;
      }
      photoObjectUrlAccessRef.current[image.id] = Date.now();
      const cachedUrls = prunePhotoObjectUrlCache(
        {
          ...photoObjectUrlsRef.current,
          [image.id]: url,
        },
        photoObjectUrlAccessRef.current,
        new Set(neededImages.keys()),
        decodedPhotoImageIdsRef.current,
      );
      photoObjectUrlsRef.current = cachedUrls;
      setPhotoObjectUrls(cachedUrls);
    };
    const loadQueue = async () => {
      let nextIndex = 0;
      const worker = async () => {
        while (!isCancelled && nextIndex < missingImages.length) {
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
    photoObjectUrlsRef,
    selectedPhotoAlbum,
    setPhotoObjectUrls,
  ]);

  useEffect(() => {
    if (activeView !== "photoViewer" || !selectedPhotoAlbum) return;

    const direction = viewerPositionRef.current?.albumId === selectedPhotoAlbum.id
      ? viewerPositionRef.current.direction
      : 0;
    for (const index of getPhotoViewerDecodeIndexes(currentPhotoIndex, selectedPhotoAlbum.images.length, direction)) {
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
          })
          .catch(() => undefined);
      } else {
        preloadImage.onload = () => {
          decodedPhotoImageIdsRef.current.add(image.id);
        };
      }
    }
  }, [activeView, currentPhotoIndex, decodedPhotoImageIdsRef, photoObjectUrls, selectedPhotoAlbum]);

  useEffect(() => {
    return () => {
      Object.values(photoObjectUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
      photoObjectUrlsRef.current = {};
      photoObjectUrlAccessRef.current = {};
      decodedPhotoImageIdsRef.current.clear();
    };
  }, [decodedPhotoImageIdsRef, photoObjectUrlAccessRef, photoObjectUrlsRef]);
}
