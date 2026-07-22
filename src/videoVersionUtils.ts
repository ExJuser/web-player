export type VideoVersionKind = "edit" | "restored";

type VersionedVideo = {
  id: string;
  name: string;
  relativePath: string;
  mediaRootId?: string;
};

export type VideoVersionGroup<Video extends VersionedVideo = VersionedVideo> = {
  id: string;
  baseName: string;
  originals: Video[];
  edits: Video[];
  restored: Video[];
  videos: Video[];
};

export type VideoVersionPlaylistMeta = {
  groupIndex: number;
  groupSize: number;
  role: "original" | VideoVersionKind;
};

function splitFileName(fileName: string) {
  const extensionIndex = fileName.lastIndexOf(".");
  return extensionIndex > 0
    ? { stem: fileName.slice(0, extensionIndex), extension: fileName.slice(extensionIndex).toLowerCase() }
    : { stem: fileName, extension: "" };
}

function getParentPath(relativePath: string) {
  const normalized = relativePath.replace(/\\/g, "/");
  const separatorIndex = normalized.lastIndexOf("/");
  return separatorIndex >= 0 ? normalized.slice(0, separatorIndex) : "";
}

export function parseVideoVersion(fileName: string): { baseName: string; kind: VideoVersionKind } | null {
  const { stem } = splitFileName(fileName);
  const restoredMatch = stem.match(/^(.*?)\.restored(?:-\d+)?$/i);
  if (restoredMatch?.[1]) {
    const restorationSource = restoredMatch[1].replace(/\.highlights$/i, "");
    const sourceEditMatch = restorationSource.match(/^(.*?)-edit(?:-\d+)?$/i);
    return { baseName: sourceEditMatch?.[1] || restorationSource, kind: "restored" };
  }

  const editMatch = stem.match(/^(.*?)-edit(?:-\d+)?$/i);
  if (editMatch?.[1]) return { baseName: editMatch[1], kind: "edit" };
  return null;
}

function createGroupKey(video: VersionedVideo, baseName: string) {
  return [video.mediaRootId ?? "", getParentPath(video.relativePath), baseName]
    .map((part) => part.toLocaleLowerCase())
    .join("\u0000");
}

export function createVideoVersionGroups<Video extends VersionedVideo>(videos: Video[]): VideoVersionGroup<Video>[] {
  const groupsByKey = new Map<string, VideoVersionGroup<Video>>();

  videos.forEach((video) => {
    const version = parseVideoVersion(video.name);
    if (!version) return;
    const key = createGroupKey(video, version.baseName);
    const group = groupsByKey.get(key) ?? {
      id: key,
      baseName: version.baseName,
      originals: [],
      edits: [],
      restored: [],
      videos: [],
    };
    group[version.kind === "edit" ? "edits" : "restored"].push(video);
    groupsByKey.set(key, group);
  });

  videos.forEach((video) => {
    if (parseVideoVersion(video.name)) return;
    const { stem } = splitFileName(video.name);
    groupsByKey.get(createGroupKey(video, stem))?.originals.push(video);
  });

  return Array.from(groupsByKey.values())
    .map((group) => ({ ...group, videos: [...group.originals, ...group.edits, ...group.restored] }))
    .sort((a, b) => a.baseName.localeCompare(b.baseName, undefined, { numeric: true, sensitivity: "base" }));
}

export function createVideoVersionPlaylistMetaByVideoId<Video extends VersionedVideo>(groups: VideoVersionGroup<Video>[]) {
  const metaById = new Map<string, VideoVersionPlaylistMeta>();
  groups.forEach((group, groupIndex) => {
    const add = (videos: Video[], role: VideoVersionPlaylistMeta["role"]) => {
      videos.forEach((video) => metaById.set(video.id, { groupIndex: groupIndex + 1, groupSize: group.videos.length, role }));
    };
    add(group.originals, "original");
    add(group.edits, "edit");
    add(group.restored, "restored");
  });
  return metaById;
}
