import type { CachedPhotoAlbumScan, PhotoAlbum, PhotoAlbumImage, PhotoAlbumPreferences, PhotoAlbumProgress, PhotoAlbumSortDirection, PhotoAlbumSortMode, PhotoAlbumStore } from "./playerTypes";
import { collator } from "./playerConstants";
import { getTagSearchScore, normalizeTagKey, parseTagInput } from "./tagUtils";
export const photoAlbumScanCacheVersion = 1;

export const photoAlbumSortOptions: Array<{ value: PhotoAlbumSortMode; label: string }> = [
  { value: "updated", label: "最近更新" },
  { value: "folderModified", label: "文件夹修改时间" },
  { value: "name", label: "名称" },
  { value: "count", label: "图片数" },
];

export const photoAlbumSortDirectionOptions: Array<{ value: PhotoAlbumSortDirection; label: string }> = [
  { value: "asc", label: "正序" },
  { value: "desc", label: "倒序" },
];

export const defaultPhotoAlbumPreferences: PhotoAlbumPreferences = {
  sortMode: "updated",
  sortDirection: "desc",
  favoritesOnly: false,
  recentTags: [],
  tagMergeDecisions: {},
};

const continuousPhotoReaderTagKeys = new Set(["本子", "漫画"].map(normalizeTagKey));

export function shouldUseContinuousPhotoReader(tags: string[]) {
  return tags.some((tag) => continuousPhotoReaderTagKeys.has(normalizeTagKey(tag)));
}

export function formatPhotoAlbumProgress(album: PhotoAlbum, progressStore: Record<string, PhotoAlbumProgress>) {
  const progress = progressStore[album.id];
  if (progress?.completed) return "已读完";
  if (!progress) return "未开始";
  return `看到 ${Math.min(progress.imageIndex + 1, album.imageCount)} / ${album.imageCount}`;
}

export function getVisiblePhotoAlbums(input: {
  albums: PhotoAlbum[];
  favoriteAlbumIds: ReadonlySet<string>;
  filter: "all" | "favorites";
  searchQuery: string;
  sortDirection: PhotoAlbumSortDirection;
  sortMode: PhotoAlbumSortMode;
  albumTags: Record<string, string[] | undefined>;
}) {
  const source =
    input.filter === "favorites"
      ? input.albums.filter((album) => input.favoriteAlbumIds.has(album.id))
      : input.albums;
  const queryTokens = parseTagInput(input.searchQuery);
  const filteredSource = queryTokens.length
    ? source.filter((album) => {
        const tags = input.albumTags[album.id] ?? [];
        const searchableText = normalizeTagKey([
          album.title,
          album.relativePath,
          album.mediaRootLabel,
          album.images[0]?.name ?? "",
        ].join(" "));
        return queryTokens.every((token) => {
          const tokenKey = normalizeTagKey(token);
          return Boolean(tokenKey && (searchableText.includes(tokenKey) || getTagSearchScore(token, tags) > 0));
        });
      })
    : source;

  return [...filteredSource].sort((a, b) => {
    let comparison: number;
    if (input.sortMode === "name") {
      comparison = collator.compare(a.title || a.relativePath, b.title || b.relativePath);
    } else if (input.sortMode === "count") {
      comparison = a.imageCount - b.imageCount || collator.compare(a.title, b.title);
    } else if (input.sortMode === "folderModified") {
      comparison = (a.folderModifiedAt ?? a.updatedAt) - (b.folderModifiedAt ?? b.updatedAt) || collator.compare(a.title, b.title);
    } else {
      comparison = a.updatedAt - b.updatedAt || collator.compare(a.title, b.title);
    }
    return input.sortDirection === "asc" ? comparison : -comparison;
  });
}

export function getPagedPhotoAlbums(albums: PhotoAlbum[], page: number, pageSize: number) {
  const start = (page - 1) * pageSize;
  return albums.slice(start, start + pageSize);
}

export function getPhotoAlbumPageBounds(totalCount: number, page: number, pageSize: number) {
  return {
    pageCount: Math.max(1, Math.ceil(totalCount / pageSize)),
    start: totalCount ? (page - 1) * pageSize + 1 : 0,
    end: Math.min(page * pageSize, totalCount),
  };
}

export function createPhotoAlbumStats(
  albums: PhotoAlbum[],
  favoriteAlbumIds: ReadonlySet<string>,
  progress: Record<string, PhotoAlbumProgress | undefined>,
) {
  const completed = albums.filter((album) => progress[album.id]?.completed).length;
  return {
    total: albums.length,
    images: albums.reduce((sum, album) => sum + album.imageCount, 0),
    favorites: favoriteAlbumIds.size,
    completed,
  };
}

export function getVisiblePhotoThumbnails(album: PhotoAlbum | null | undefined, currentIndex: number, windowSize: number) {
  if (!album) return [];
  const halfWindow = Math.floor(windowSize / 2);
  const maxStart = Math.max(album.images.length - windowSize, 0);
  const start = Math.min(Math.max(currentIndex - halfWindow, 0), maxStart);
  return album.images.slice(start, start + windowSize);
}

export function parsePhotoAlbumCoverPreferences(source: unknown): Record<string, string> {
  if (!source || typeof source !== "object" || Array.isArray(source)) return {};

  const store: Record<string, string> = {};
  for (const [albumId, imageId] of Object.entries(source)) {
    if (albumId.trim() && typeof imageId === "string" && imageId.trim()) {
      store[albumId] = imageId;
    }
  }
  return store;
}

export function parsePhotoAlbumTags(source: unknown): Record<string, string[]> {
  if (!source || typeof source !== "object" || Array.isArray(source)) return {};

  const store: Record<string, string[]> = {};
  for (const [albumId, value] of Object.entries(source)) {
    if (!albumId.trim() || !Array.isArray(value)) continue;
    const seenKeys = new Set<string>();
    const tags: string[] = [];
    value.forEach((tag) => {
      if (typeof tag !== "string") return;
      const label = tag.trim().slice(0, 40);
      const key = normalizeTagKey(label);
      if (!key || seenKeys.has(key)) return;
      seenKeys.add(key);
      tags.push(label);
    });
    if (tags.length) store[albumId] = tags;
  }
  return store;
}

export function parsePhotoAlbumProgress(source: unknown): Record<string, PhotoAlbumProgress> {
  if (!source || typeof source !== "object" || Array.isArray(source)) return {};

  const progress: Record<string, PhotoAlbumProgress> = {};
  for (const [albumId, value] of Object.entries(source)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const item = value as Partial<PhotoAlbumProgress>;
    const imageIndex = item.imageIndex;
    const updatedAt = item.updatedAt;
    if (
      Number.isInteger(imageIndex) &&
      typeof imageIndex === "number" &&
      imageIndex >= 0 &&
      typeof updatedAt === "number" &&
      Number.isFinite(updatedAt) &&
      typeof item.completed === "boolean"
    ) {
      progress[albumId] = {
        imageIndex,
        updatedAt,
        completed: item.completed,
      };
    }
  }
  return progress;
}

export function parsePhotoAlbumPreferences(source: unknown): PhotoAlbumPreferences {
  if (!source || typeof source !== "object" || Array.isArray(source)) return defaultPhotoAlbumPreferences;
  const preferences = source as Partial<PhotoAlbumPreferences>;
  return {
    sortMode:
      preferences.sortMode === "name" || preferences.sortMode === "count" || preferences.sortMode === "folderModified"
        ? preferences.sortMode
        : defaultPhotoAlbumPreferences.sortMode,
    sortDirection:
      preferences.sortDirection === "asc" || preferences.sortDirection === "desc"
        ? preferences.sortDirection
        : defaultPhotoAlbumPreferences.sortDirection,
    favoritesOnly:
      typeof preferences.favoritesOnly === "boolean"
        ? preferences.favoritesOnly
        : defaultPhotoAlbumPreferences.favoritesOnly,
    recentTags: Array.isArray(preferences.recentTags)
      ? preferences.recentTags.flatMap((entry) => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
          const candidate = entry as { label?: unknown; usedAt?: unknown };
          if (typeof candidate.label !== "string" || typeof candidate.usedAt !== "number") return [];
          const label = candidate.label.trim().slice(0, 40);
          const key = normalizeTagKey(label);
          return key ? [{ key, label, usedAt: candidate.usedAt }] : [];
        }).slice(0, 20)
      : [],
    tagMergeDecisions: preferences.tagMergeDecisions && typeof preferences.tagMergeDecisions === "object" && !Array.isArray(preferences.tagMergeDecisions)
      ? preferences.tagMergeDecisions
      : {},
  };
}

export function parsePhotoAlbumStore(raw: string): PhotoAlbumStore {
  const parsed = JSON.parse(raw) as {
    version?: unknown;
    favorites?: unknown;
    progress?: unknown;
    coverImageByAlbumId?: unknown;
    albumTags?: unknown;
    preferences?: unknown;
  };
  return {
    version: typeof parsed?.version === "number" ? parsed.version : undefined,
    favorites: Array.isArray(parsed?.favorites)
      ? Array.from(new Set(parsed.favorites.filter((id): id is string => typeof id === "string" && Boolean(id.trim()))))
      : [],
    progress: parsePhotoAlbumProgress(parsed?.progress),
    coverImageByAlbumId: parsePhotoAlbumCoverPreferences(parsed?.coverImageByAlbumId),
    albumTags: parsePhotoAlbumTags(parsed?.albumTags),
    preferences: parsePhotoAlbumPreferences(parsed?.preferences),
  };
}

export function createDefaultPhotoAlbumStore(): PhotoAlbumStore {
  return {
    version: 1,
    favorites: [],
    progress: {},
    coverImageByAlbumId: {},
    albumTags: {},
    preferences: defaultPhotoAlbumPreferences,
  };
}

function parseFiniteNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function parseCachedPhotoAlbumImage(source: unknown, index: number): PhotoAlbumImage | null {
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  const image = source as Partial<PhotoAlbumImage>;
  if (
    typeof image.id !== "string" ||
    !image.id.trim() ||
    typeof image.name !== "string" ||
    !image.name.trim() ||
    typeof image.relativePath !== "string" ||
    !image.relativePath.trim() ||
    typeof image.mediaRootId !== "string" ||
    !image.mediaRootId.trim()
  ) {
    return null;
  }

  return {
    id: image.id,
    name: image.name,
    relativePath: image.relativePath.replace(/\\/g, "/"),
    url: typeof image.url === "string" ? image.url : "",
    size: parseFiniteNumber(image.size),
    lastModified: parseFiniteNumber(image.lastModified),
    mediaRootId: image.mediaRootId,
    index,
  };
}

function parseCachedPhotoAlbum(source: unknown): PhotoAlbum | null {
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  const album = source as Partial<PhotoAlbum>;
  if (
    typeof album.id !== "string" ||
    !album.id.trim() ||
    typeof album.title !== "string" ||
    !album.title.trim() ||
    typeof album.relativePath !== "string" ||
    typeof album.mediaRootId !== "string" ||
    !album.mediaRootId.trim() ||
    typeof album.mediaRootLabel !== "string" ||
    !album.mediaRootLabel.trim() ||
    !Array.isArray(album.images)
  ) {
    return null;
  }

  const images = album.images
    .map((image, index) => parseCachedPhotoAlbumImage(image, index))
    .filter((image): image is PhotoAlbumImage => Boolean(image));
  if (!images.length) return null;
  const updatedAt = parseFiniteNumber(album.updatedAt, images.reduce((latest, image) => Math.max(latest, image.lastModified), 0));

  return {
    id: album.id,
    title: album.title,
    relativePath: album.relativePath.replace(/\\/g, "/"),
    mediaRootId: album.mediaRootId,
    mediaRootLabel: album.mediaRootLabel,
    coverImageUrl: typeof album.coverImageUrl === "string" ? album.coverImageUrl : "",
    imageCount: Math.max(parseFiniteNumber(album.imageCount, images.length), images.length),
    totalSize: parseFiniteNumber(album.totalSize, images.reduce((sum, image) => sum + image.size, 0)),
    updatedAt,
    folderModifiedAt: parseFiniteNumber(album.folderModifiedAt, updatedAt),
    images,
  };
}

export function parseCachedPhotoAlbumScan(raw: string): CachedPhotoAlbumScan | null {
  const parsed = JSON.parse(raw) as Partial<CachedPhotoAlbumScan>;
  if (
    parsed?.version !== photoAlbumScanCacheVersion ||
    typeof parsed.rootId !== "string" ||
    !parsed.rootId.trim() ||
    typeof parsed.rootName !== "string" ||
    !parsed.rootName.trim() ||
    !Array.isArray(parsed.albums)
  ) {
    return null;
  }

  const albums = parsed.albums
    .map((album) => parseCachedPhotoAlbum(album))
    .filter((album): album is PhotoAlbum => Boolean(album));

  return {
    version: photoAlbumScanCacheVersion,
    rootId: parsed.rootId,
    rootName: parsed.rootName,
    albums,
    scannedFiles: parseFiniteNumber(parsed.scannedFiles),
    updatedAt: parseFiniteNumber(parsed.updatedAt),
  };
}

function serializeCachedPhotoAlbum(album: PhotoAlbum): PhotoAlbum {
  return {
    ...album,
    coverImageUrl: album.coverImageUrl && !album.coverImageUrl.startsWith("blob:") ? album.coverImageUrl : "",
    images: album.images.map((image) => ({
      id: image.id,
      name: image.name,
      relativePath: image.relativePath,
      url: image.url && !image.url.startsWith("blob:") ? image.url : "",
      size: image.size,
      lastModified: image.lastModified,
      mediaRootId: image.mediaRootId,
      index: image.index,
    })),
  };
}

function serializeCachedPhotoAlbumScan(scan: CachedPhotoAlbumScan): CachedPhotoAlbumScan {
  return {
    version: photoAlbumScanCacheVersion,
    rootId: scan.rootId,
    rootName: scan.rootName,
    albums: scan.albums.map(serializeCachedPhotoAlbum),
    scannedFiles: scan.scannedFiles,
    updatedAt: scan.updatedAt,
  };
}

async function readApiError(response: Response) {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error || response.statusText;
  } catch {
    return response.statusText;
  }
}

export async function loadPhotoAlbumStore(): Promise<PhotoAlbumStore> {
  const response = await fetch("/api/photo-albums/global", {
    headers: { Accept: "application/json" },
  });
  if (response.status === 404) return createDefaultPhotoAlbumStore();
  if (!response.ok) throw new Error(await readApiError(response));
  return parsePhotoAlbumStore(JSON.stringify(await response.json()));
}

export async function savePhotoAlbumStore(store: PhotoAlbumStore) {
  const response = await fetch("/api/photo-albums/global", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      version: 1,
      favorites: Array.from(new Set(store.favorites.filter(Boolean))),
      progress: parsePhotoAlbumProgress(store.progress),
      coverImageByAlbumId: parsePhotoAlbumCoverPreferences(store.coverImageByAlbumId),
      albumTags: parsePhotoAlbumTags(store.albumTags),
      preferences: parsePhotoAlbumPreferences(store.preferences),
    }),
  });
  if (!response.ok) throw new Error(await readApiError(response));
}

export async function savePhotoAlbumTags(albumId: string, tags: string[]) {
  const response = await fetch(`/api/photo-albums/tags/${encodeURIComponent(albumId)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ tags }),
  });
  if (!response.ok) throw new Error(await readApiError(response));
}

export async function loadCachedPhotoAlbumScan(options?: { includeImages?: boolean }): Promise<CachedPhotoAlbumScan | null> {
  try {
    const response = await fetch(`/api/photo-albums/scan-cache${options?.includeImages ? "?includeImages=true" : ""}`, {
      headers: { Accept: "application/json" },
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(await readApiError(response));
    return parseCachedPhotoAlbumScan(JSON.stringify(await response.json()));
  } catch {
    return null;
  }
}

export async function loadCachedPhotoAlbumImages(albumId: string): Promise<PhotoAlbumImage[]> {
  const response = await fetch(`/api/photo-albums/scan-cache/albums/${encodeURIComponent(albumId)}/images`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(await readApiError(response));
  const payload = await response.json();
  if (!Array.isArray(payload)) throw new Error("Invalid photo album image cache response.");
  return payload
    .map((image, index) => parseCachedPhotoAlbumImage(image, index))
    .filter((image): image is PhotoAlbumImage => Boolean(image));
}

export async function replaceCachedPhotoAlbumScanAlbum(
  albumId: string,
  album: PhotoAlbum | null,
  scannedFilesDelta: number,
) {
  const response = await fetch(`/api/photo-albums/scan-cache/albums/${encodeURIComponent(albumId)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ album: album ? serializeCachedPhotoAlbum(album) : null, scannedFilesDelta, updatedAt: Date.now() }),
  });
  if (!response.ok) throw new Error(await readApiError(response));
}

export async function saveCachedPhotoAlbumScan(scan: CachedPhotoAlbumScan) {
  const response = await fetch("/api/photo-albums/scan-cache", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(serializeCachedPhotoAlbumScan(scan)),
  });
  if (!response.ok) throw new Error(await readApiError(response));
}

export async function clearCachedPhotoAlbumScan() {
  const response = await fetch("/api/photo-albums/scan-cache", {
    method: "DELETE",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(await readApiError(response));
}

export async function savePhotoAlbumProgress(albumId: string, progress: PhotoAlbumProgress) {
  const response = await fetch(`/api/photo-albums/progress/${encodeURIComponent(albumId)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(progress),
  });
  if (!response.ok) throw new Error(await readApiError(response));
}

export async function savePhotoAlbumFavorite(albumId: string, isFavorite: boolean) {
  const response = await fetch(`/api/photo-albums/favorites/${encodeURIComponent(albumId)}`, {
    method: isFavorite ? "PUT" : "DELETE",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(await readApiError(response));
}

export async function savePhotoAlbumPreferences(preferences: PhotoAlbumPreferences) {
  const response = await fetch("/api/photo-albums/preferences", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(preferences),
  });
  if (!response.ok) throw new Error(await readApiError(response));
}

export async function savePhotoAlbumCoverPreference(albumId: string, imageId: string | null) {
  const response = await fetch(`/api/photo-albums/cover/${encodeURIComponent(albumId)}`, {
    method: imageId ? "PUT" : "DELETE",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    ...(imageId ? { body: JSON.stringify({ imageId }) } : {}),
  });
  if (!response.ok) throw new Error(await readApiError(response));
}
