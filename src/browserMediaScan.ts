import type {
  FileSystemDirectoryHandle,
  MediaCollection,
} from "./playerTypes";
import {
  createLegacyVideoId,
  isSubtitleFile,
  isVideoFile,
  shouldFilterLocalVideoFile,
} from "./playerLibraryUtils";
import {
  createEmptyMediaCollection,
  sortMediaCollection,
} from "./playerMediaUtils";

export async function ensureDirectoryReadPermission(directory: FileSystemDirectoryHandle) {
  const descriptor = { mode: "read" as const };
  const currentPermission = await directory.queryPermission?.(descriptor);
  if (currentPermission === "granted") return true;
  const nextPermission = await directory.requestPermission?.(descriptor);
  return nextPermission !== "denied";
}

export async function hasDirectoryReadPermission(directory: FileSystemDirectoryHandle) {
  const descriptor = { mode: "read" as const };
  const currentPermission = await directory.queryPermission?.(descriptor);
  return currentPermission === undefined || currentPermission === "granted";
}

export async function resolveBrowserVideoParentDirectory(rootDirectory: FileSystemDirectoryHandle, relativePath: string) {
  const parts = relativePath.replace(/\\/g, "/").split("/").filter(Boolean);
  let directory = rootDirectory;
  for (const part of parts.slice(0, -1)) {
    directory = await directory.getDirectoryHandle(part);
  }
  return directory;
}

export async function browserVideoFileExists(parentDirectory: FileSystemDirectoryHandle, fileName: string) {
  try {
    await parentDirectory.getFileHandle(fileName);
    return true;
  } catch {
    return false;
  }
}

export function collectVideosFromFiles(files: FileList | File[]): MediaCollection {
  const collection = createEmptyMediaCollection();

  for (const file of Array.from(files)) {
    const browserRelativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
    const relativePath = (browserRelativePath || file.name).replace(/\\/g, "/");
    const name = relativePath.split("/").pop() || file.name;

    if (isVideoFile(name)) {
      collection.scannedFiles += 1;
      if (shouldFilterLocalVideoFile(name, file.size)) {
        collection.filteredSmallVideos += 1;
        continue;
      }
      collection.videos.push({
        id: createLegacyVideoId(relativePath, file),
        name,
        relativePath,
        file,
        url: URL.createObjectURL(file),
        size: file.size,
        lastModified: file.lastModified,
        playbackSource: "browser",
      });
    } else if (isSubtitleFile(name)) {
      collection.scannedFiles += 1;
      collection.subtitles.push({
        id: createLegacyVideoId(relativePath, file),
        name,
        relativePath,
        file,
        url: "",
      });
    }
  }

  return sortMediaCollection(collection);
}
