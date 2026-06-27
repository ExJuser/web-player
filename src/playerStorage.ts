import type {
  FileSystemDirectoryHandle,
  DanmakuPreferences,
  DanmakuSelectionStore,
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
  VideoStatsStore,
  VideoTagStore
} from "./playerTypes";
import {
  PROGRESS_FILE_NAME,
  RECENT_FOLDER_DB_NAME,
  RECENT_FOLDER_KEY,
  RECENT_FOLDER_STORE_NAME,
  PHOTO_ALBUM_FOLDER_KEY,
  thumbnailCacheVersion,
  defaultDanmakuPreferences,
  defaultPlayerSettings,
  defaultPlayerPreferences,
  defaultShortcuts
} from "./playerConstants";

const LEGACY_THUMBNAIL_STORE_NAME = "thumbnails";

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

export function parseVideoStats(source: unknown): VideoStatsStore {
  if (!source || typeof source !== "object" || Array.isArray(source)) return {};

  const store: VideoStatsStore = {};
  for (const [key, value] of Object.entries(source)) {
    if (!key || !value || typeof value !== "object" || Array.isArray(value)) continue;
    const stats = value as Partial<VideoStatsStore[string]>;
    if (
      Number.isFinite(stats.totalPlayedSeconds) &&
      Number.isFinite(stats.playCount) &&
      Number.isFinite(stats.durationSeconds) &&
      Number.isFinite(stats.emissionCount) &&
      Number.isFinite(stats.updatedAt)
    ) {
      const totalPlayedSeconds = stats.totalPlayedSeconds;
      const playCount = stats.playCount;
      const durationSeconds = stats.durationSeconds;
      const emissionCount = stats.emissionCount;
      const updatedAt = stats.updatedAt;
      if (
        typeof totalPlayedSeconds !== "number" ||
        typeof playCount !== "number" ||
        typeof durationSeconds !== "number" ||
        typeof emissionCount !== "number" ||
        typeof updatedAt !== "number"
      ) {
        continue;
      }
      store[key] = {
        totalPlayedSeconds: Math.max(0, totalPlayedSeconds),
        playCount: Math.max(0, Math.floor(playCount)),
        durationSeconds: Math.max(0, durationSeconds),
        emissionCount: Math.max(0, Math.floor(emissionCount)),
        ...(Number.isFinite(stats.lastEmissionAt) && stats.lastEmissionAt && stats.lastEmissionAt > 0
          ? { lastEmissionAt: stats.lastEmissionAt }
          : {}),
        updatedAt,
      };
    }
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

export function parseDanmakuSelectionStore(source: unknown): DanmakuSelectionStore {
  if (!source || typeof source !== "object" || Array.isArray(source)) return {};

  const store: DanmakuSelectionStore = {};
  for (const [videoId, value] of Object.entries(source)) {
    if (!videoId || !value || typeof value !== "object" || Array.isArray(value)) continue;
    const selection = value as Partial<DanmakuSelectionStore[string]>;
    if (
      typeof selection.sourceId === "string" &&
      selection.sourceId &&
      typeof selection.sourceName === "string" &&
      (selection.provider === "bilibili" || selection.provider === "aniGamer" || selection.provider === "manual") &&
      typeof selection.updatedAt === "number" &&
      Number.isFinite(selection.updatedAt)
    ) {
      store[videoId] = {
        sourceId: selection.sourceId,
        sourceName: selection.sourceName,
        provider: selection.provider,
        updatedAt: selection.updatedAt,
      };
    }
  }
  return store;
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

export function parseDanmakuPreferences(source: unknown): DanmakuPreferences {
  if (!source || typeof source !== "object" || Array.isArray(source)) return defaultDanmakuPreferences;
  const preferences = source as Partial<DanmakuPreferences>;
  return {
    enabled: typeof preferences.enabled === "boolean" ? preferences.enabled : defaultDanmakuPreferences.enabled,
    opacity: boundedNumber(preferences.opacity, defaultDanmakuPreferences.opacity, 0.2, 1),
    speed: boundedNumber(preferences.speed, defaultDanmakuPreferences.speed, 4, 14),
    density: boundedNumber(preferences.density, defaultDanmakuPreferences.density, 0.2, 1),
    displayArea: boundedNumber(preferences.displayArea, defaultDanmakuPreferences.displayArea, 0.25, 1),
    fontSize: boundedNumber(preferences.fontSize, defaultDanmakuPreferences.fontSize, 14, 36),
    showSimplified:
      typeof preferences.showSimplified === "boolean"
        ? preferences.showSimplified
        : defaultDanmakuPreferences.showSimplified,
  };
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
      preferences.playlistSortMode === "size" ||
      preferences.playlistSortMode === "playedDuration" ||
      preferences.playlistSortMode === "playIntensity" ||
      preferences.playlistSortMode === "playCount" ||
      preferences.playlistSortMode === "emissionCount"
        ? preferences.playlistSortMode
        : defaultPlayerPreferences.playlistSortMode,
    isPlaylistSortReversed:
      typeof preferences.isPlaylistSortReversed === "boolean"
        ? preferences.isPlaylistSortReversed
        : defaultPlayerPreferences.isPlaylistSortReversed,
    shortcuts: parseShortcuts(preferences.shortcuts),
    homeMediaMode:
      preferences.homeMediaMode === "anime" || preferences.homeMediaMode === "special"
        ? preferences.homeMediaMode
        : defaultPlayerPreferences.homeMediaMode,
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
    theme: settings.theme === "light" || settings.theme === "dark" ? settings.theme : undefined,
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
    videoStats?: unknown;
    tagMergeDecisions?: unknown;
    embeddedSubtitles?: unknown;
    danmakuSelections?: unknown;
    danmakuPreferences?: unknown;
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
    videoStats: parseVideoStats(parsed?.videoStats),
    tagMergeDecisions: parseTagMergeDecisions(parsed?.tagMergeDecisions),
    embeddedSubtitles: parsePersistedEmbeddedSubtitles(parsed?.embeddedSubtitles),
    danmakuSelections: parseDanmakuSelectionStore(parsed?.danmakuSelections),
    danmakuPreferences: parseDanmakuPreferences(parsed?.danmakuPreferences),
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
    videoStats: {},
    tagMergeDecisions: {},
    embeddedSubtitles: [],
    danmakuSelections: {},
    danmakuPreferences: defaultDanmakuPreferences,
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
      videoStats: parseVideoStats(store.videoStats),
      tagMergeDecisions: parseTagMergeDecisions(store.tagMergeDecisions),
      embeddedSubtitles: parsePersistedEmbeddedSubtitles(store.embeddedSubtitles),
      danmakuSelections: parseDanmakuSelectionStore(store.danmakuSelections),
      danmakuPreferences: parseDanmakuPreferences(store.danmakuPreferences),
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
      videoStats: parseVideoStats(store.videoStats),
      tagMergeDecisions: parseTagMergeDecisions(store.tagMergeDecisions),
      embeddedSubtitles: parsePersistedEmbeddedSubtitles(store.embeddedSubtitles),
      danmakuSelections: parseDanmakuSelectionStore(store.danmakuSelections),
      danmakuPreferences: parseDanmakuPreferences(store.danmakuPreferences),
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

function createLegacyVideoIdCandidate(videoId: string) {
  const parts = videoId.split("|");
  if (parts.length < 4) return null;
  return parts.slice(1).join("|");
}

export async function readCachedThumbnail(libraryId: string | null, videoId: string) {
  if (!libraryId) return null;
  const thumbnailIds = [createThumbnailId(libraryId, videoId)];
  const legacyVideoId = libraryId === "global" ? createLegacyVideoIdCandidate(videoId) : null;
  if (legacyVideoId) {
    thumbnailIds.push(createThumbnailId(libraryId, legacyVideoId));
  }

  for (const thumbnailId of thumbnailIds) {
    const response = await fetch(createApiUrl(`thumbnails/${encodeURIComponent(thumbnailId)}`));
    if (response.status === 404) continue;
    if (!response.ok) throw new Error(await readApiError(response));
    return response.blob();
  }

  return null;
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

export async function savePlayerProgress(videoId: string, progress: PlaybackProgress) {
  const response = await fetch(createApiUrl(`progress/${encodeURIComponent(videoId)}`), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(progress),
  });
  if (!response.ok) throw new Error(await readApiError(response));
}

export async function deletePlayerProgress(videoId: string) {
  const response = await fetch(createApiUrl(`progress/${encodeURIComponent(videoId)}`), {
    method: "DELETE",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(await readApiError(response));
}

export async function savePlayerFavorite(videoId: string, isFavorite: boolean) {
  const response = await fetch(createApiUrl(`favorites/${encodeURIComponent(videoId)}`), {
    method: isFavorite ? "PUT" : "DELETE",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(await readApiError(response));
}

export async function savePlayerVideoTags(videoId: string, tags: string[]) {
  const response = await fetch(createApiUrl(`tags/${encodeURIComponent(videoId)}`), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ tags }),
  });
  if (!response.ok) throw new Error(await readApiError(response));
}

export async function saveTagMergeDecisions(decisions: TagMergeDecisionStore) {
  const response = await fetch(createApiUrl("tag-merge-decisions"), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(decisions),
  });
  if (!response.ok) throw new Error(await readApiError(response));
}

export async function savePlayerVideoStats(videoId: string, stats: VideoStatsStore[string]) {
  const response = await fetch(createApiUrl(`stats/${encodeURIComponent(videoId)}`), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(stats),
  });
  if (!response.ok) throw new Error(await readApiError(response));
}

export async function savePlayerPreference<K extends keyof PlayerPreferences>(key: K, value: PlayerPreferences[K]) {
  const response = await fetch(createApiUrl(`preferences/${encodeURIComponent(key)}`), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ value }),
  });
  if (!response.ok) throw new Error(await readApiError(response));
}

export async function savePlayerSetting<K extends keyof PlayerPersistentSettings>(key: K, value: PlayerPersistentSettings[K]) {
  const response = await fetch(createApiUrl(`settings/${encodeURIComponent(key)}`), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ value }),
  });
  if (!response.ok) throw new Error(await readApiError(response));
}

export async function saveDanmakuSelection(videoId: string, selection: DanmakuSelectionStore[string] | null) {
  const response = await fetch(createApiUrl(`danmaku-selection/${encodeURIComponent(videoId)}`), {
    method: selection ? "PUT" : "DELETE",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    ...(selection ? { body: JSON.stringify(selection) } : {}),
  });
  if (!response.ok) throw new Error(await readApiError(response));
}

export async function saveDanmakuPreferences(preferences: DanmakuPreferences) {
  const response = await fetch(createApiUrl("danmaku-preferences"), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(preferences),
  });
  if (!response.ok) throw new Error(await readApiError(response));
}

async function readLegacyIndexedDbThumbnails() {
  if (!("indexedDB" in window)) return [];
  const database = await openRecentFolderDatabase();
  if (!database.objectStoreNames.contains(LEGACY_THUMBNAIL_STORE_NAME)) {
    database.close();
    return [];
  }

  return new Promise<Array<{ key: string; blob: Blob }>>((resolve, reject) => {
    const transaction = database.transaction(LEGACY_THUMBNAIL_STORE_NAME, "readonly");
    const store = transaction.objectStore(LEGACY_THUMBNAIL_STORE_NAME);
    const keysRequest = store.getAllKeys();
    const valuesRequest = store.getAll();
    let keys: IDBValidKey[] = [];
    let values: unknown[] = [];

    keysRequest.onsuccess = () => {
      keys = keysRequest.result;
    };
    valuesRequest.onsuccess = () => {
      values = valuesRequest.result;
    };
    transaction.oncomplete = () => {
      database.close();
      resolve(
        keys.flatMap((key, index) => {
          const value = values[index];
          return typeof key === "string" && value instanceof Blob ? [{ key, blob: value }] : [];
        }),
      );
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
  });
}

async function clearLegacyIndexedDbThumbnails() {
  const database = await openRecentFolderDatabase();
  if (!database.objectStoreNames.contains(LEGACY_THUMBNAIL_STORE_NAME)) {
    database.close();
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(LEGACY_THUMBNAIL_STORE_NAME, "readwrite");
    transaction.objectStore(LEGACY_THUMBNAIL_STORE_NAME).clear();
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
  });
}

export async function migrateLegacyCachedThumbnailsToLocalData() {
  const entries = await readLegacyIndexedDbThumbnails();
  if (!entries.length) return 0;

  for (const { key, blob } of entries) {
    const response = await fetch(createApiUrl(`thumbnails/${encodeURIComponent(createThumbnailId("global", key))}`), {
      method: "PUT",
      headers: { "Content-Type": blob.type || "application/octet-stream" },
      body: blob,
    });
    if (!response.ok) throw new Error(await readApiError(response));
  }

  await clearLegacyIndexedDbThumbnails();
  return entries.length;
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

export async function readPhotoAlbumFolderHandle() {
  if (!("indexedDB" in window)) return null;
  return (await runObjectStoreRequest<FileSystemDirectoryHandle | undefined>(
    RECENT_FOLDER_STORE_NAME,
    "readonly",
    (store) => store.get(PHOTO_ALBUM_FOLDER_KEY),
  )) ?? null;
}

export async function writePhotoAlbumFolderHandle(directory: FileSystemDirectoryHandle) {
  if (!("indexedDB" in window)) return;
  await runObjectStoreRequest<IDBValidKey>(RECENT_FOLDER_STORE_NAME, "readwrite", (store) =>
    store.put(directory, PHOTO_ALBUM_FOLDER_KEY),
  );
}

export async function clearPhotoAlbumFolderHandle() {
  if (!("indexedDB" in window)) return;
  await runObjectStoreRequest<undefined>(RECENT_FOLDER_STORE_NAME, "readwrite", (store) =>
    store.delete(PHOTO_ALBUM_FOLDER_KEY),
  );
}

export async function hasDirectoryWritePermission(directory: FileSystemDirectoryHandle) {
  const descriptor = { mode: "readwrite" as const };
  const currentPermission = await directory.queryPermission?.(descriptor);
  return currentPermission === undefined || currentPermission === "granted";
}
