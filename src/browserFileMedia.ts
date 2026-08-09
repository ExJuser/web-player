import type { MediaCollection } from "./playerTypes";
import {
  createLegacyVideoId,
  findVideoArtworkName,
  findVideoPosterName,
  isSubtitleFile,
  isVideoFile,
  shouldFilterLocalVideoFile,
} from "./playerLibraryUtils";
import { createEmptyMediaCollection, sortMediaCollection } from "./playerMediaUtils";

type BrowserFileLike = File & {
  webkitRelativePath?: string;
};

export type CollectVideosFromFilesOptions = {
  createObjectUrl?: (file: File) => string;
};

export function collectVideosFromFiles(
  files: FileList | File[],
  options: CollectVideosFromFilesOptions = {},
): MediaCollection {
  const createObjectUrl = options.createObjectUrl ?? ((file: File) => URL.createObjectURL(file));
  const collection = createEmptyMediaCollection();
  const browserFiles = Array.from(files) as BrowserFileLike[];
  const filesByRelativePath = new Map<string, File>();
  const fileNamesByDirectoryPath = new Map<string, string[]>();

  for (const file of browserFiles) {
    const relativePath = (file.webkitRelativePath || file.name).replace(/\\/g, "/");
    const separatorIndex = relativePath.lastIndexOf("/");
    const directoryPath = separatorIndex >= 0 ? relativePath.slice(0, separatorIndex + 1) : "";
    filesByRelativePath.set(relativePath.toLowerCase(), file);
    const directoryFileNames = fileNamesByDirectoryPath.get(directoryPath.toLowerCase()) ?? [];
    directoryFileNames.push(relativePath.slice(separatorIndex + 1));
    fileNamesByDirectoryPath.set(directoryPath.toLowerCase(), directoryFileNames);
  }

  for (const file of browserFiles) {
    const relativePath = (file.webkitRelativePath || file.name).replace(/\\/g, "/");
    const name = relativePath.split("/").pop() || file.name;

    if (isVideoFile(name)) {
      collection.scannedFiles += 1;
      if (shouldFilterLocalVideoFile(name, file.size)) {
        collection.filteredSmallVideos += 1;
        continue;
      }
      const directoryPath = relativePath.includes("/") ? relativePath.slice(0, relativePath.lastIndexOf("/") + 1) : "";
      const directoryFileNames = fileNamesByDirectoryPath.get(directoryPath.toLowerCase()) ?? [];
      const posterName = findVideoPosterName(name, directoryFileNames);
      const fanartName = findVideoArtworkName(name, directoryFileNames, "fanart");
      const thumbName = findVideoArtworkName(name, directoryFileNames, "thumb");
      const posterFile = posterName ? filesByRelativePath.get(`${directoryPath}${posterName}`.toLowerCase()) : undefined;
      const fanartFile = fanartName ? filesByRelativePath.get(`${directoryPath}${fanartName}`.toLowerCase()) : undefined;
      const thumbFile = thumbName ? filesByRelativePath.get(`${directoryPath}${thumbName}`.toLowerCase()) : undefined;
      collection.videos.push({
        id: createLegacyVideoId(relativePath, file),
        name,
        relativePath,
        file,
        url: createObjectUrl(file),
        size: file.size,
        lastModified: file.lastModified,
        playbackSource: "browser",
        posterFile,
        fanartFile,
        thumbFile,
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
