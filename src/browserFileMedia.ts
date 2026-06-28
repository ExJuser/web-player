import type { MediaCollection } from "./playerTypes";
import { createLegacyVideoId, isSubtitleFile, isVideoFile, shouldFilterLocalVideoFile } from "./playerLibraryUtils";
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

  for (const file of Array.from(files) as BrowserFileLike[]) {
    const browserRelativePath = file.webkitRelativePath;
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
        url: createObjectUrl(file),
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
