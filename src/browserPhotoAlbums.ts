import type { FileSystemDirectoryHandle, PhotoAlbum } from "./playerTypes";
import { createGlobalVideoId, createPhotoAlbumFolderId, isPhotoFile } from "./playerLibraryUtils";

export type BrowserPhotoFile = {
  file: File;
  relativePath: string;
  parentDirectory: FileSystemDirectoryHandle;
};

export type BrowserPhotoAlbumScan = {
  rootId: string;
  rootLabel: string;
  albums: PhotoAlbum[];
  scannedFiles: number;
};

export function collectPhotoAlbumsFromBrowserFiles(
  rootLabel: string,
  rootId: string,
  photoFiles: BrowserPhotoFile[],
): BrowserPhotoAlbumScan {
  const albumImages = new Map<string, PhotoAlbum["images"]>();

  for (const photoFile of photoFiles) {
    const { file } = photoFile;
    const relativePath = photoFile.relativePath.replace(/\\/g, "/");
    const pathParts = relativePath.split("/").filter(Boolean);
    const scopedParts = pathParts[0] === rootLabel ? pathParts.slice(1) : pathParts;
    const name = scopedParts.at(-1) || file.name;
    if (!isPhotoFile(name)) continue;

    const albumPath = scopedParts.slice(0, -1).join("/");
    const imageRelativePath = scopedParts.join("/");
    const images = albumImages.get(albumPath) ?? [];
    images.push({
      id: createGlobalVideoId(rootId, imageRelativePath, file),
      name,
      relativePath: imageRelativePath,
      url: "",
      file,
      size: file.size,
      lastModified: file.lastModified,
      mediaRootId: rootId,
      index: 0,
      parentDirectory: photoFile.parentDirectory,
    });
    albumImages.set(albumPath, images);
  }

  const albums = Array.from(albumImages.entries()).map(([relativePath, images]) => {
    images.sort((a, b) => a.relativePath.localeCompare(b.relativePath, undefined, { numeric: true, sensitivity: "base" }));
    const indexedImages = images.map((image, index) => ({ ...image, index }));
    const totalSize = indexedImages.reduce((sum, image) => sum + image.size, 0);
    const updatedAt = indexedImages.reduce((latest, image) => Math.max(latest, image.lastModified), 0);
    return {
      id: createPhotoAlbumFolderId(rootId, relativePath),
      title: relativePath.split("/").filter(Boolean).at(-1) || rootLabel,
      relativePath,
      mediaRootId: rootId,
      mediaRootLabel: rootLabel,
      coverImageUrl: "",
      imageCount: indexedImages.length,
      totalSize,
      updatedAt,
      images: indexedImages,
    };
  });

  albums.sort((a, b) => b.updatedAt - a.updatedAt || a.relativePath.localeCompare(b.relativePath, undefined, { numeric: true, sensitivity: "base" }));

  return {
    rootId,
    rootLabel,
    albums,
    scannedFiles: photoFiles.length,
  };
}
