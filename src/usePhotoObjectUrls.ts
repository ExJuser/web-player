import { useEffect } from "react";

import {
  photoViewerDecodeRadius,
  photoViewerWarmRadius,
} from "./appConfig";
import { getPhotoImageFileFromDirectory } from "./photoAlbumScan";
import { prunePhotoObjectUrlCache } from "./photoObjectUrlCache";
import type { ActiveView, FileSystemDirectoryHandle, PhotoAlbum, PhotoAlbumImage } from "./playerTypes";

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
      const warmStart = Math.max(currentPhotoIndex - photoViewerWarmRadius, 0);
      const warmEnd = Math.min(currentPhotoIndex + photoViewerWarmRadius, selectedPhotoAlbum.images.length - 1);
      rememberNeededImage(selectedPhotoAlbum.images[currentPhotoIndex]);
      for (let index = warmStart; index <= warmEnd; index += 1) {
        rememberNeededImage(selectedPhotoAlbum.images[index]);
      }
    }

    const nextUrls = { ...photoObjectUrlsRef.current };
    let didChange = false;
    const missingImages: PhotoAlbumImage[] = [];

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
    missingImages
      .sort((a, b) => Math.abs(a.index - currentPhotoIndex) - Math.abs(b.index - currentPhotoIndex))
      .forEach((image) => {
        if (!photoImageFilePromisesRef.current[image.id]) {
          photoImageFilePromisesRef.current[image.id] = getPhotoImageFileFromDirectory(directory, image.relativePath).catch(() => null);
        }
        void photoImageFilePromisesRef.current[image.id].then((file) => {
          delete photoImageFilePromisesRef.current[image.id];
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
        });
      });

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

    const decodeStart = Math.max(currentPhotoIndex - photoViewerDecodeRadius, 0);
    const decodeEnd = Math.min(currentPhotoIndex + photoViewerDecodeRadius, selectedPhotoAlbum.images.length - 1);
    for (let index = decodeStart; index <= decodeEnd; index += 1) {
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
