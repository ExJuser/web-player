import type {
  FileSystemDirectoryHandle,
  PlaybackProgress,
  PlayerDataStore,
  PlayerPreferences,
  ProgressStore,
  ShortcutAction,
  ShortcutMap
} from "./playerTypes";
import {
  PROGRESS_FILE_NAME,
  RECENT_FOLDER_DB_NAME,
  RECENT_FOLDER_KEY,
  RECENT_FOLDER_STORE_NAME,
  THUMBNAIL_STORE_NAME,
  defaultPlayerPreferences,
  defaultShortcuts
} from "./playerConstants";

export function createProgress(currentTime: number, duration: number, completed = false): PlaybackProgress | null {
  if (!Number.isFinite(currentTime) || !Number.isFinite(duration)) return null;
  return {
    currentTime,
    duration,
    updatedAt: Date.now(),
    completed,
  };
}

export function parseProgressItems(source: unknown): ProgressStore {
  if (!source || typeof source !== "object" || Array.isArray(source)) return {};

  const store: ProgressStore = {};
  for (const [key, value] of Object.entries(source)) {
    if (!value || typeof value !== "object") continue;
    const progress = value as PlaybackProgress;
    if (
      Number.isFinite(progress.currentTime) &&
      Number.isFinite(progress.duration) &&
      Number.isFinite(progress.updatedAt) &&
      typeof progress.completed === "boolean"
    ) {
      store[key] = progress;
    }
  }
  return store;
}

export function parseShortcuts(source: unknown): ShortcutMap {
  if (!source || typeof source !== "object" || Array.isArray(source)) return defaultShortcuts;
  const shortcuts = source as Partial<ShortcutMap>;
  return Object.fromEntries(
    (Object.keys(defaultShortcuts) as ShortcutAction[]).map((action) => [
      action,
      typeof shortcuts[action] === "string" && shortcuts[action] ? shortcuts[action] : defaultShortcuts[action],
    ]),
  ) as ShortcutMap;
}

export function parsePlayerPreferences(source: unknown): PlayerPreferences {
  if (!source || typeof source !== "object" || Array.isArray(source)) return defaultPlayerPreferences;
  const preferences = source as Partial<PlayerPreferences>;
  return {
    playlistSortMode:
      preferences.playlistSortMode === "path" ||
      preferences.playlistSortMode === "modified" ||
      preferences.playlistSortMode === "size"
        ? preferences.playlistSortMode
        : defaultPlayerPreferences.playlistSortMode,
    isPlaylistSortReversed:
      typeof preferences.isPlaylistSortReversed === "boolean"
        ? preferences.isPlaylistSortReversed
        : defaultPlayerPreferences.isPlaylistSortReversed,
    shortcuts: parseShortcuts(preferences.shortcuts),
    isSeriesMode: defaultPlayerPreferences.isSeriesMode,
    selectedSeriesKey: defaultPlayerPreferences.selectedSeriesKey,
    isCinemaMode:
      typeof preferences.isCinemaMode === "boolean"
        ? preferences.isCinemaMode
        : defaultPlayerPreferences.isCinemaMode,
  };
}

export function getPersistedPlayerPreferences(preferences: PlayerPreferences): PlayerPreferences {
  return {
    ...preferences,
    isSeriesMode: defaultPlayerPreferences.isSeriesMode,
    selectedSeriesKey: defaultPlayerPreferences.selectedSeriesKey,
  };
}

export function parsePlayerDataStore(raw: string): PlayerDataStore {
  const parsed = JSON.parse(raw) as { items?: unknown; favorites?: unknown; preferences?: unknown };
  const progressSource = parsed && typeof parsed === "object" && parsed.items ? parsed.items : parsed;
  const favorites =
    parsed && typeof parsed === "object" && Array.isArray(parsed.favorites)
      ? parsed.favorites.filter((id): id is string => typeof id === "string")
      : [];

  return {
    progress: parseProgressItems(progressSource),
    favorites,
    preferences: parsePlayerPreferences(parsed?.preferences),
  };
}

export async function loadPlayerDataStore(directory: FileSystemDirectoryHandle): Promise<PlayerDataStore> {
  try {
    const handle = await directory.getFileHandle(PROGRESS_FILE_NAME);
    const file = await handle.getFile();
    return parsePlayerDataStore(await file.text());
  } catch {
    return { progress: {}, favorites: [], preferences: defaultPlayerPreferences };
  }
}

export async function savePlayerDataStore(directory: FileSystemDirectoryHandle, store: PlayerDataStore) {
  const handle = await directory.getFileHandle(PROGRESS_FILE_NAME, { create: true });
  if (!handle.createWritable) throw new Error("The selected folder does not allow file writes.");
  const writable = await handle.createWritable();
  await writable.write(
    JSON.stringify(
      {
        version: 3,
        items: store.progress,
        favorites: store.favorites,
        preferences: getPersistedPlayerPreferences(store.preferences),
      },
      null,
      2,
    ),
  );
  await writable.close();
}

export function openRecentFolderDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(RECENT_FOLDER_DB_NAME, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(RECENT_FOLDER_STORE_NAME)) {
        request.result.createObjectStore(RECENT_FOLDER_STORE_NAME);
      }
      if (!request.result.objectStoreNames.contains(THUMBNAIL_STORE_NAME)) {
        request.result.createObjectStore(THUMBNAIL_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function runObjectStoreRequest<T>(
  storeName: string,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const database = await openRecentFolderDatabase();
  return new Promise<T>((resolve, reject) => {
    let result: T;
    const transaction = database.transaction(storeName, mode);
    const request = operation(transaction.objectStore(storeName));

    request.onsuccess = () => {
      result = request.result;
    };
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => {
      database.close();
      resolve(result);
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
  });
}

export async function readCachedThumbnail(videoId: string) {
  if (!("indexedDB" in window)) return null;
  return (await runObjectStoreRequest<Blob | undefined>(THUMBNAIL_STORE_NAME, "readonly", (store) =>
    store.get(videoId),
  )) ?? null;
}

export async function writeCachedThumbnail(videoId: string, thumbnail: Blob) {
  if (!("indexedDB" in window)) return;
  await runObjectStoreRequest<IDBValidKey>(THUMBNAIL_STORE_NAME, "readwrite", (store) => store.put(thumbnail, videoId));
}

export async function readRecentFolderHandle() {
  if (!("indexedDB" in window)) return null;
  return (await runObjectStoreRequest<FileSystemDirectoryHandle | undefined>(
    RECENT_FOLDER_STORE_NAME,
    "readonly",
    (store) => store.get(RECENT_FOLDER_KEY),
  )) ?? null;
}

export async function writeRecentFolderHandle(directory: FileSystemDirectoryHandle) {
  if (!("indexedDB" in window)) return;
  await runObjectStoreRequest<IDBValidKey>(RECENT_FOLDER_STORE_NAME, "readwrite", (store) =>
    store.put(directory, RECENT_FOLDER_KEY),
  );
}

export async function clearRecentFolderHandle() {
  if (!("indexedDB" in window)) return;
  await runObjectStoreRequest<undefined>(RECENT_FOLDER_STORE_NAME, "readwrite", (store) =>
    store.delete(RECENT_FOLDER_KEY),
  );
}

export async function ensureDirectoryPermission(directory: FileSystemDirectoryHandle) {
  const descriptor = { mode: "readwrite" as const };
  const currentPermission = await directory.queryPermission?.(descriptor);
  if (currentPermission === "granted") return true;
  const nextPermission = await directory.requestPermission?.(descriptor);
  return nextPermission !== "denied";
}
