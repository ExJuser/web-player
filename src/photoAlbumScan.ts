import type {
  CachedPhotoAlbumScan,
  FileSystemDirectoryHandle,
  FileSystemFileHandle,
  PhotoAlbum,
  PhotoAlbumLibraryRoot,
  PlayerMediaRootStatus,
} from "./playerTypes";
import { photoAlbumScanCacheVersion } from "./photoAlbumStorage";
import {
  createGlobalVideoId,
  createPhotoAlbumFolderId,
  hashString,
  isPhotoFile,
  sanitizeLibraryName,
} from "./playerLibraryUtils";

export type BrowserPhotoFile = {
  file: File;
  relativePath: string;
  parentDirectory: FileSystemDirectoryHandle;
};

export function collectPhotoAlbumsFromBrowserFiles(rootLabel: string, rootId: string, photoFiles: BrowserPhotoFile[]) {
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
      folderModifiedAt: updatedAt,
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

export async function collectPhotoAlbumsFromDirectory(
  directory: FileSystemDirectoryHandle,
  options?: { rootId?: string; rootLabel?: string },
) {
  const photoFiles: BrowserPhotoFile[] = [];
  // 图片文件读取并发上限：getFile() 是真实磁盘 I/O，串行会放大延迟到文件数倍。
  const photoScanConcurrency = 8;

  async function walk(handle: FileSystemDirectoryHandle, segments: string[]) {
    const entries: Array<FileSystemDirectoryHandle | FileSystemFileHandle> = [];
    for await (const entry of handle.values()) entries.push(entry);

    // 先深度优先处理子目录（保持目录顺序）
    for (const entry of entries) {
      if (entry.kind === "directory") {
        await walk(entry, [...segments, entry.name]);
      }
    }

    // 图片文件级有界并发读取，结果按原顺序收集
    const photoEntries = entries.filter((entry): entry is FileSystemFileHandle => entry.kind === "file" && isPhotoFile(entry.name));
    const collected = new Array<BrowserPhotoFile | null>(photoEntries.length);
    let nextIndex = 0;
    const worker = async () => {
      while (nextIndex < photoEntries.length) {
        const index = nextIndex;
        nextIndex += 1;
        const entry = photoEntries[index];
        const file = await entry.getFile();
        collected[index] = {
          file,
          relativePath: [...segments, entry.name].join("/"),
          parentDirectory: handle,
        };
      }
    };
    await Promise.all(Array.from({ length: Math.min(photoScanConcurrency, photoEntries.length) }, () => worker()));
    for (const item of collected) {
      if (item) photoFiles.push(item);
    }
  }

  await walk(directory, []);

  const rootLabel = options?.rootLabel?.trim() || directory.name || "看图";
  const rootId = options?.rootId || `browser-photo:${sanitizeLibraryName(rootLabel)}-${hashString(rootLabel)}`;

  return collectPhotoAlbumsFromBrowserFiles(rootLabel, rootId, photoFiles);
}

export function createPhotoAlbumLibraryRoot(directory: FileSystemDirectoryHandle, label: string): PhotoAlbumLibraryRoot {
  const uniquePart = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return {
    id: `browser-photo:${sanitizeLibraryName(directory.name || label)}-${hashString(uniquePart)}`,
    label: label.trim(),
    basename: directory.name,
    directory,
    createdAt: Date.now(),
  };
}

export function createCachedPhotoAlbumLibraryScan(albums: PhotoAlbum[]): CachedPhotoAlbumScan {
  return {
    version: photoAlbumScanCacheVersion,
    rootId: "browser-photo-libraries",
    rootName: "看图媒体库",
    albums,
    scannedFiles: albums.reduce((sum, album) => sum + album.imageCount, 0),
    updatedAt: Date.now(),
  };
}

export function createPhotoAlbumLibraryRootStatus(
  root: PhotoAlbumLibraryRoot,
  albums: PhotoAlbum[],
  status: PlayerMediaRootStatus["status"],
  error?: string,
): PlayerMediaRootStatus {
  const rootAlbums = albums.filter((album) => album.mediaRootId === root.id);
  return {
    id: root.id,
    label: root.label,
    source: "browser",
    status,
    videoCount: rootAlbums.length,
    scannedFiles: rootAlbums.reduce((sum, album) => sum + album.imageCount, 0),
    updatedAt: Date.now(),
    error,
  };
}

export async function resolvePhotoParentDirectory(rootDirectory: FileSystemDirectoryHandle, relativePath: string) {
  const parts = relativePath.replace(/\\/g, "/").split("/").filter(Boolean);
  const directoryParts = parts.slice(0, -1);
  let directory = rootDirectory;

  for (const part of directoryParts) {
    directory = await directory.getDirectoryHandle(part);
  }

  return directory;
}

export async function resolvePhotoAlbumDirectory(rootDirectory: FileSystemDirectoryHandle, relativePath: string) {
  const directoryParts = relativePath.replace(/\\/g, "/").split("/").filter(Boolean);
  let directory = rootDirectory;

  for (const part of directoryParts) {
    directory = await directory.getDirectoryHandle(part);
  }

  return directory;
}

export async function photoFileExists(parentDirectory: FileSystemDirectoryHandle, name: string) {
  try {
    await parentDirectory.getFileHandle(name);
    return true;
  } catch {
    return false;
  }
}

export function createCachedPhotoAlbumScan(scan: Awaited<ReturnType<typeof collectPhotoAlbumsFromDirectory>>): CachedPhotoAlbumScan {
  return {
    version: photoAlbumScanCacheVersion,
    rootId: scan.rootId,
    rootName: scan.rootLabel,
    albums: scan.albums,
    scannedFiles: scan.scannedFiles,
    updatedAt: Date.now(),
  };
}

export function createPhotoAlbumRootStatusFromCache(
  cache: CachedPhotoAlbumScan,
  status: PlayerMediaRootStatus["status"] = "ready",
  error?: string,
): PlayerMediaRootStatus {
  return {
    id: cache.rootId,
    label: cache.rootName,
    source: "browser",
    status,
    videoCount: cache.albums.length,
    scannedFiles: cache.scannedFiles,
    updatedAt: cache.updatedAt,
    error,
  };
}

export async function getPhotoImageFileFromDirectory(directory: FileSystemDirectoryHandle, relativePath: string) {
  const parts = relativePath.replace(/\\/g, "/").split("/").filter(Boolean);
  const fileName = parts.pop();
  if (!fileName || !isPhotoFile(fileName)) return null;

  let currentDirectory = directory;
  for (const part of parts) {
    currentDirectory = await currentDirectory.getDirectoryHandle(part);
  }

  const fileHandle = await currentDirectory.getFileHandle(fileName);
  return fileHandle.getFile();
}
