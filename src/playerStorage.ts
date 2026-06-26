import type {
  FileSystemDirectoryHandle,
  PlaybackProgress,
  TagMergeDecisionStore,
  PlayerDataStore,
  PlayerGlobalMetadata,
  PlayerLibraryMetadata,
  PlayerPersistentSettings,
  PlayerPreferences,
  ProgressStore,
  PersistedEmbeddedSubtitle,
  ShortcutAction,
  ShortcutMap,
  VideoTagStore
} from "./playerTypes";
import {
  PROGRESS_FILE_NAME,
  RECENT_FOLDER_DB_NAME,
  RECENT_FOLDER_KEY,
  RECENT_FOLDER_STORE_NAME,
  thumbnailCacheVersion,
  defaultPlayerSettings,
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

export function parseVideoTags(source: unknown): VideoTagStore {
  if (!source || typeof source !== "object" || Array.isArray(source)) return {};

  const store: VideoTagStore = {};
  for (const [videoId, value] of Object.entries(source)) {
    if (!Array.isArray(value)) continue;
    const tags = value
      .filter((tag): tag is string => typeof tag === "string")
      .map((tag) => tag.trim())
      .filter(Boolean);
    if (tags.length) store[videoId] = tags;
  }
  return store;
}

export function parseTagMergeDecisions(source: unknown): TagMergeDecisionStore {
  if (!source || typeof source !== "object" || Array.isArray(source)) return {};

  const decisions: TagMergeDecisionStore = {};
  for (const [key, value] of Object.entries(source)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const decision = value as Partial<TagMergeDecisionStore[string]>;
    if (
      typeof decision.from === "string" &&
      typeof decision.to === "string" &&
      (decision.decision === "merge" || decision.decision === "keep") &&
      typeof decision.updatedAt === "number" &&
      Number.isFinite(decision.updatedAt)
    ) {
      decisions[key] = {
        from: decision.from,
        to: decision.to,
        decision: decision.decision,
        updatedAt: decision.updatedAt,
      };
    }
  }
  return decisions;
}

export function parsePersistedEmbeddedSubtitles(source: unknown): PersistedEmbeddedSubtitle[] {
  if (!Array.isArray(source)) return [];

  return source.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const subtitle = value as Partial<PersistedEmbeddedSubtitle>;
    const track = subtitle.embeddedTrack;
    if (
      typeof subtitle.id !== "string" ||
      typeof subtitle.name !== "string" ||
      typeof subtitle.relativePath !== "string" ||
      (subtitle.format !== "srt" && subtitle.format !== "vtt") ||
      typeof subtitle.videoId !== "string" ||
      !track ||
      typeof track !== "object" ||
      Array.isArray(track) ||
      !Number.isInteger(track.streamIndex) ||
      typeof track.codec !== "string" ||
      typeof track.extractable !== "boolean"
    ) {
      return [];
    }

    return [
      {
        id: subtitle.id,
        name: subtitle.name,
        relativePath: subtitle.relativePath,
        format: subtitle.format,
        videoId: subtitle.videoId,
        embeddedTrack: {
          streamIndex: track.streamIndex,
          codec: track.codec,
          language: typeof track.language === "string" ? track.language : undefined,
          title: typeof track.title === "string" ? track.title : undefined,
          extractable: track.extractable,
          reason: typeof track.reason === "string" ? track.reason : undefined,
        },
      },
    ];
  });
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

export function parsePlayerSettings(source: unknown): PlayerPersistentSettings {
  if (!source || typeof source !== "object" || Array.isArray(source)) return defaultPlayerSettings;
  const settings = source as Partial<PlayerPersistentSettings>;
  return {
    volume: typeof settings.volume === "number" && Number.isFinite(settings.volume)
      ? Math.min(1, Math.max(0, settings.volume))
      : defaultPlayerSettings.volume,
    skipFolderAccessPrompt:
      typeof settings.skipFolderAccessPrompt === "boolean"
        ? settings.skipFolderAccessPrompt
        : defaultPlayerSettings.skipFolderAccessPrompt,
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
  const parsed = JSON.parse(raw) as {
    version?: unknown;
    items?: unknown;
    progress?: unknown;
    favorites?: unknown;
    preferences?: unknown;
    settings?: unknown;
    videoTags?: unknown;
    tagMergeDecisions?: unknown;
    embeddedSubtitles?: unknown;
    metadata?: unknown;
  };
  const progressSource = parsed && typeof parsed === "object" && parsed.items ? parsed.items : parsed;
  const favorites =
    parsed && typeof parsed === "object" && Array.isArray(parsed.favorites)
      ? parsed.favorites.filter((id): id is string => typeof id === "string")
      : [];

  return {
    version: typeof parsed?.version === "number" ? parsed.version : undefined,
    progress: parseProgressItems(progressSource),
    favorites,
    videoTags: parseVideoTags(parsed?.videoTags),
    tagMergeDecisions: parseTagMergeDecisions(parsed?.tagMergeDecisions),
    embeddedSubtitles: parsePersistedEmbeddedSubtitles(parsed?.embeddedSubtitles),
    preferences: parsePlayerPreferences(parsed?.preferences),
    settings: parsePlayerSettings(parsed?.settings),
    metadata:
      parsed?.metadata && typeof parsed.metadata === "object" && !Array.isArray(parsed.metadata)
        ? (parsed.metadata as PlayerLibraryMetadata)
        : undefined,
  };
}

export function createDefaultPlayerDataStore(metadata?: PlayerDataStore["metadata"]): PlayerDataStore {
  return {
    version: 5,
    progress: {},
    favorites: [],
    videoTags: {},
    tagMergeDecisions: {},
    embeddedSubtitles: [],
    preferences: defaultPlayerPreferences,
    settings: defaultPlayerSettings,
    metadata,
  };
}

function createApiUrl(path: string) {
  return `/api/player-data/${path}`;
}

async function readApiError(response: Response) {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error || response.statusText;
  } catch {
    return response.statusText;
  }
}

export async function loadGlobalPlayerDataStore(metadata?: PlayerGlobalMetadata): Promise<PlayerDataStore> {
  const response = await fetch(createApiUrl("global"), {
    headers: { Accept: "application/json" },
  });
  if (response.status === 404) return createDefaultPlayerDataStore(metadata);
  if (!response.ok) throw new Error(await readApiError(response));
  const raw = JSON.stringify(await response.json());
  const parsed = parsePlayerDataStore(raw);
  return {
    ...parsed,
    metadata: parsed.metadata ?? metadata,
  };
}

export async function loadPlayerDataStore(libraryId: string, metadata?: PlayerLibraryMetadata): Promise<PlayerDataStore> {
  const response = await fetch(createApiUrl(`libraries/${encodeURIComponent(libraryId)}`), {
    headers: { Accept: "application/json" },
  });
  if (response.status === 404) return createDefaultPlayerDataStore(metadata);
  if (!response.ok) throw new Error(await readApiError(response));
  const raw = JSON.stringify(await response.json());
  const parsed = parsePlayerDataStore(raw);
  return {
    ...parsed,
    metadata: parsed.metadata ?? metadata,
  };
}

export async function loadLegacyPlayerDataStore(directory: FileSystemDirectoryHandle): Promise<PlayerDataStore | null> {
  try {
    const handle = await directory.getFileHandle(PROGRESS_FILE_NAME);
    const file = await handle.getFile();
    return parsePlayerDataStore(await file.text());
  } catch {
    return null;
  }
}

export async function deleteLegacyPlayerDataStore(directory: FileSystemDirectoryHandle) {
  if (!directory.removeEntry) throw new Error("The selected folder does not allow removing legacy progress data.");
  await directory.removeEntry(PROGRESS_FILE_NAME);
}

export async function saveGlobalPlayerDataStore(store: PlayerDataStore) {
  const response = await fetch(createApiUrl("global"), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      version: 5,
      items: store.progress,
      favorites: store.favorites,
      videoTags: parseVideoTags(store.videoTags),
      tagMergeDecisions: parseTagMergeDecisions(store.tagMergeDecisions),
      embeddedSubtitles: parsePersistedEmbeddedSubtitles(store.embeddedSubtitles),
      preferences: getPersistedPlayerPreferences(store.preferences),
      settings: parsePlayerSettings(store.settings),
      metadata: store.metadata,
    }),
  });
  if (!response.ok) throw new Error(await readApiError(response));
}

export async function savePlayerDataStore(libraryId: string, store: PlayerDataStore) {
  const response = await fetch(createApiUrl(`libraries/${encodeURIComponent(libraryId)}`), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      version: 5,
      items: store.progress,
      favorites: store.favorites,
      videoTags: parseVideoTags(store.videoTags),
      tagMergeDecisions: parseTagMergeDecisions(store.tagMergeDecisions),
      embeddedSubtitles: parsePersistedEmbeddedSubtitles(store.embeddedSubtitles),
      preferences: getPersistedPlayerPreferences(store.preferences),
      settings: parsePlayerSettings(store.settings),
      metadata: store.metadata,
    }),
  });
  if (!response.ok) throw new Error(await readApiError(response));
}

export function openRecentFolderDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(RECENT_FOLDER_DB_NAME, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(RECENT_FOLDER_STORE_NAME)) {
        request.result.createObjectStore(RECENT_FOLDER_STORE_NAME);
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

function createThumbnailId(libraryId: string, videoId: string) {
  let hash = 2166136261;
  const value = `${thumbnailCacheVersion}|${libraryId}|${videoId}`;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${libraryId}.${thumbnailCacheVersion}.${(hash >>> 0).toString(36)}`;
}

export async function readCachedThumbnail(libraryId: string | null, videoId: string) {
  if (!libraryId) return null;
  const response = await fetch(createApiUrl(`thumbnails/${encodeURIComponent(createThumbnailId(libraryId, videoId))}`));
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(await readApiError(response));
  return response.blob();
}

export async function writeCachedThumbnail(libraryId: string | null, videoId: string, thumbnail: Blob) {
  if (!libraryId) return;
  const response = await fetch(createApiUrl(`thumbnails/${encodeURIComponent(createThumbnailId(libraryId, videoId))}`), {
    method: "PUT",
    headers: { "Content-Type": thumbnail.type || "application/octet-stream" },
    body: thumbnail,
  });
  if (!response.ok) throw new Error(await readApiError(response));
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
