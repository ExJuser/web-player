import type {
  FileSystemDirectoryHandle,
  FileSystemFileHandle,
  MediaCollection,
  MediaScanBatch,
  SubtitleItem,
  VideoItem,
} from "./playerTypes";
import {
  createGlobalVideoId,
  createLegacyVideoId,
  isSubtitleFile,
  isVideoFile,
  shouldFilterLocalVideoFile,
} from "./playerLibraryUtils";
import {
  createEmptyMediaCollection,
  shouldFlushMediaScan,
  sortMediaCollection,
} from "./playerMediaUtils";
import { createMatchingNfoNameLookup, maxActorNfoBytes, parseActorNfoBytes } from "./actorNfoCore.mjs";

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

export async function* collectVideos(
  directory: FileSystemDirectoryHandle,
  rootId?: string | null,
): AsyncGenerator<MediaScanBatch> {
  let pendingVideos: VideoItem[] = [];
  let pendingSubtitles: SubtitleItem[] = [];
  let scannedFiles = 0;
  let filteredSmallVideos = 0;
  let lastFlushAt = Date.now();

  function createBatch() {
    const batch = {
      videos: pendingVideos,
      subtitles: pendingSubtitles,
      scannedFiles,
      filteredSmallVideos,
    };
    pendingVideos = [];
    pendingSubtitles = [];
    lastFlushAt = Date.now();
    return batch;
  }

  async function* walk(handle: FileSystemDirectoryHandle, segments: string[]): AsyncGenerator<MediaScanBatch> {
    const entries: Array<FileSystemDirectoryHandle | FileSystemFileHandle> = [];
    for await (const entry of handle.values()) entries.push(entry);
    const fileEntries = entries.filter((entry): entry is FileSystemFileHandle => entry.kind === "file");
    const fileEntryNames = fileEntries.map((entry) => entry.name);
    const fileEntriesByName = new Map(fileEntries.map((entry) => [entry.name, entry]));
    const findMatchingNfoName = createMatchingNfoNameLookup(fileEntryNames);

    for (const entry of entries) {
      if (entry.kind === "directory") {
        yield* walk(entry, [...segments, entry.name]);
      } else if (isVideoFile(entry.name)) {
        scannedFiles += 1;
        const file = await entry.getFile();
        if (shouldFilterLocalVideoFile(entry.name, file.size)) {
          filteredSmallVideos += 1;
        } else {
          const relativePath = [...segments, entry.name].join("/");
          const video: VideoItem = {
            id: rootId ? createGlobalVideoId(rootId, relativePath, file) : createLegacyVideoId(relativePath, file),
            name: entry.name,
            relativePath,
            file,
            url: URL.createObjectURL(file),
            size: file.size,
            lastModified: file.lastModified,
            parentDirectory: handle,
            playbackSource: "browser",
          };
          const nfoName = findMatchingNfoName(entry.name);
          const nfoEntry = nfoName ? fileEntriesByName.get(nfoName) : undefined;
          if (nfoEntry) {
            try {
              const nfoFile = await nfoEntry.getFile();
              video.actorHints = nfoFile.size > maxActorNfoBytes
                ? { fileName: nfoName ?? nfoEntry.name, names: [], status: "tooLarge" }
                : parseActorNfoBytes(await nfoFile.arrayBuffer(), nfoName ?? nfoEntry.name);
            } catch {
              video.actorHints = { fileName: nfoName ?? nfoEntry.name, names: [], status: "invalid" };
            }
          }
          pendingVideos.push(video);
        }
      } else if (isSubtitleFile(entry.name)) {
        scannedFiles += 1;
        const file = await entry.getFile();
        const relativePath = [...segments, entry.name].join("/");
        pendingSubtitles.push({
          id: rootId ? createGlobalVideoId(rootId, relativePath, file) : createLegacyVideoId(relativePath, file),
          name: entry.name,
          relativePath,
          file,
          url: "",
          mediaRootId: rootId ?? undefined,
        });
      }

      if (shouldFlushMediaScan(lastFlushAt, pendingVideos, pendingSubtitles)) {
        yield createBatch();
      }
    }
  }

  yield* walk(directory, []);
  if (pendingVideos.length || pendingSubtitles.length || scannedFiles || filteredSmallVideos) {
    yield createBatch();
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
