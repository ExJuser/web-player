import type { PhotoAlbumPreferences, PhotoAlbumProgress, PhotoAlbumStore } from "./playerTypes";

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
