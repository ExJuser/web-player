export type MediaPathVideo = {
  relativePath: string;
  mediaRootId?: string;
};

export function baseNameWithoutExtension(name: string) {
  const fileName = name.split(/[\\/]/).pop() || name;
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex >= 0 ? fileName.slice(0, dotIndex) : fileName;
}

export function directoryPartsOf(path: string) {
  return path.replace(/\\/g, "/").split("/").filter(Boolean).slice(0, -1);
}

export function fallbackMediaRootLabelForVideo(video: MediaPathVideo) {
  return video.mediaRootId ?? directoryPartsOf(video.relativePath)[0] ?? "临时媒体";
}
