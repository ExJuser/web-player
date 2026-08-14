import type {
  FileSystemDirectoryHandle,
  FileSystemFileHandle,
  MediaScanBatch,
  SubtitleItem,
  VideoItem,
} from "./playerTypes";
import {
  createGlobalVideoId,
  createLegacyVideoId,
  findVideoArtworkName,
  findVideoPosterName,
  isSubtitleFile,
  isVideoFile,
  shouldFilterLocalVideoFile,
} from "./playerLibraryUtils";
import { shouldFlushMediaScan } from "./playerMediaUtils";
import { createMatchingNfoNameLookup, maxActorNfoBytes, parseActorNfoBytes } from "./actorNfoCore.mjs";

export { collectVideosFromFiles } from "./browserFileMedia";

// 文件级扫描并发上限：getFile() 是真实磁盘 I/O，串行会放大延迟到文件数倍。
const browserScanFileConcurrency = 8;

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

type BrowserMediaFileContext = {
  directory: FileSystemDirectoryHandle;
  segments: string[];
  rootId?: string | null;
  fileEntryNames: string[];
  fileEntriesByName: Map<string, FileSystemFileHandle>;
  findMatchingNfoName: ReturnType<typeof createMatchingNfoNameLookup>;
};

type BrowserMediaFileResult =
  | { kind: "ignored" }
  | { kind: "filteredVideo" }
  | { kind: "video"; video: VideoItem }
  | { kind: "subtitle"; subtitle: SubtitleItem };

async function readOptionalBrowserFile(entry: FileSystemFileHandle | undefined) {
  if (!entry) return undefined;
  try {
    return await entry.getFile();
  } catch {
    return undefined;
  }
}

async function createBrowserDirectoryVideo(
  entry: FileSystemFileHandle,
  file: File,
  context: BrowserMediaFileContext,
) {
  const relativePath = [...context.segments, entry.name].join("/");
  const video: VideoItem = {
    id: context.rootId ? createGlobalVideoId(context.rootId, relativePath, file) : createLegacyVideoId(relativePath, file),
    name: entry.name,
    relativePath,
    file,
    url: URL.createObjectURL(file),
    size: file.size,
    lastModified: file.lastModified,
    parentDirectory: context.directory,
    playbackSource: "browser",
  };

  const posterName = findVideoPosterName(entry.name, context.fileEntryNames);
  const posterFile = await readOptionalBrowserFile(posterName ? context.fileEntriesByName.get(posterName) : undefined);
  if (posterFile) video.posterFile = posterFile;
  const fanartName = findVideoArtworkName(entry.name, context.fileEntryNames, "fanart");
  const fanartFile = await readOptionalBrowserFile(fanartName ? context.fileEntriesByName.get(fanartName) : undefined);
  if (fanartFile) video.fanartFile = fanartFile;
  const thumbName = findVideoArtworkName(entry.name, context.fileEntryNames, "thumb");
  const thumbFile = await readOptionalBrowserFile(thumbName ? context.fileEntriesByName.get(thumbName) : undefined);
  if (thumbFile) video.thumbFile = thumbFile;

  const nfoName = context.findMatchingNfoName(entry.name);
  const nfoEntry = nfoName ? context.fileEntriesByName.get(nfoName) : undefined;
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
  return video;
}

async function readBrowserMediaFile(
  entry: FileSystemFileHandle,
  context: BrowserMediaFileContext,
): Promise<BrowserMediaFileResult> {
  if (isVideoFile(entry.name)) {
    const file = await entry.getFile();
    if (shouldFilterLocalVideoFile(entry.name, file.size)) return { kind: "filteredVideo" };
    return { kind: "video", video: await createBrowserDirectoryVideo(entry, file, context) };
  }
  if (!isSubtitleFile(entry.name)) return { kind: "ignored" };
  const file = await entry.getFile();
  const relativePath = [...context.segments, entry.name].join("/");
  return {
    kind: "subtitle",
    subtitle: {
      id: context.rootId ? createGlobalVideoId(context.rootId, relativePath, file) : createLegacyVideoId(relativePath, file),
      name: entry.name,
      relativePath,
      file,
      url: "",
      mediaRootId: context.rootId ?? undefined,
    },
  };
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
    const context = { directory: handle, segments, rootId, fileEntryNames, fileEntriesByName, findMatchingNfoName };

    // 先深度优先处理子目录（保持目录顺序与批次产出顺序）
    for (const entry of entries) {
      if (entry.kind === "directory") {
        yield* walk(entry, [...segments, entry.name]);
      }
    }

    // 文件级有界并发：File System Access API 的 getFile() 是真实异步磁盘 I/O，
    // 全串行会把延迟放大到文件数倍；固定 worker 数并行读取并按原顺序汇总。
    const results = new Array<BrowserMediaFileResult>(fileEntries.length);
    let nextFileIndex = 0;
    const workerCount = Math.min(browserScanFileConcurrency, fileEntries.length);
    const worker = async () => {
      while (nextFileIndex < fileEntries.length) {
        const index = nextFileIndex;
        nextFileIndex += 1;
        results[index] = await readBrowserMediaFile(fileEntries[index], context);
      }
    };
    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    for (const result of results) {
      if (result.kind === "filteredVideo") {
        scannedFiles += 1;
        filteredSmallVideos += 1;
      } else if (result.kind === "video") {
        scannedFiles += 1;
        pendingVideos.push(result.video);
      } else if (result.kind === "subtitle") {
        scannedFiles += 1;
        pendingSubtitles.push(result.subtitle);
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
