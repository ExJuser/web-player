import type { CachedPhotoAlbumScan, PhotoAlbum, PhotoAlbumImage, PhotoAlbumPreferences, PhotoAlbumProgress, PhotoAlbumStore } from "./playerTypes";

const photoAlbumScanCacheStorageKey = "local-web-player:photo-album-scan-cache";
export const photoAlbumScanCacheVersion = 1;

export const defaultPhotoAlbumPreferences: PhotoAlbumPreferences = {
  sortMode: "updated",
  favoritesOnly: false,
};

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
      preferences.sortMode === "name" || preferences.sortMode === "count"
        ? preferences.sortMode
        : defaultPhotoAlbumPreferences.sortMode,
    favoritesOnly:
      typeof preferences.favoritesOnly === "boolean"
        ? preferences.favoritesOnly
        : defaultPhotoAlbumPreferences.favoritesOnly,
  };
}

export function parsePhotoAlbumStore(raw: string): PhotoAlbumStore {
  const parsed = JSON.parse(raw) as {
    version?: unknown;
    favorites?: unknown;
    progress?: unknown;
    preferences?: unknown;
  };
  return {
    version: typeof parsed?.version === "number" ? parsed.version : undefined,
    favorites: Array.isArray(parsed?.favorites)
      ? Array.from(new Set(parsed.favorites.filter((id): id is string => typeof id === "string" && Boolean(id.trim()))))
      : [],
    progress: parsePhotoAlbumProgress(parsed?.progress),
    preferences: parsePhotoAlbumPreferences(parsed?.preferences),
  };
}

export function createDefaultPhotoAlbumStore(): PhotoAlbumStore {
  return {
    version: 1,
    favorites: [],
    progress: {},
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

  return {
    id: album.id,
    title: album.title,
    relativePath: album.relativePath.replace(/\\/g, "/"),
    mediaRootId: album.mediaRootId,
    mediaRootLabel: album.mediaRootLabel,
    coverImageUrl: typeof album.coverImageUrl === "string" ? album.coverImageUrl : "",
    imageCount: images.length,
    totalSize: parseFiniteNumber(album.totalSize, images.reduce((sum, image) => sum + image.size, 0)),
    updatedAt: parseFiniteNumber(album.updatedAt, images.reduce((latest, image) => Math.max(latest, image.lastModified), 0)),
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

function serializeCachedPhotoAlbumScan(scan: CachedPhotoAlbumScan): CachedPhotoAlbumScan {
  return {
    version: photoAlbumScanCacheVersion,
    rootId: scan.rootId,
    rootName: scan.rootName,
    albums: scan.albums.map((album) => ({
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
    })),
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
      preferences: parsePhotoAlbumPreferences(store.preferences),
    }),
  });
  if (!response.ok) throw new Error(await readApiError(response));
}

export async function loadCachedPhotoAlbumScan(): Promise<CachedPhotoAlbumScan | null> {
  if (!("localStorage" in window)) return null;
  const raw = window.localStorage.getItem(photoAlbumScanCacheStorageKey);
  if (!raw) return null;
  try {
    return parseCachedPhotoAlbumScan(raw);
  } catch {
    return null;
  }
}

export async function saveCachedPhotoAlbumScan(scan: CachedPhotoAlbumScan) {
  if (!("localStorage" in window)) return;
  window.localStorage.setItem(photoAlbumScanCacheStorageKey, JSON.stringify(serializeCachedPhotoAlbumScan(scan)));
}

export async function clearCachedPhotoAlbumScan() {
  if (!("localStorage" in window)) return;
  window.localStorage.removeItem(photoAlbumScanCacheStorageKey);
}
