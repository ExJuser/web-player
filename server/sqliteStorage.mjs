import { mkdir, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const schemaVersion = 1;
const playerStoreVersion = 5;
const photoAlbumStoreVersion = 1;

function now() {
  return Date.now();
}

function stringifyJson(value) {
  return JSON.stringify(value ?? null);
}

function parseJson(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function normalizeTagKey(value) {
  return String(value ?? "")
    .trim()
    .normalize("NFKC")
    .toLocaleLowerCase();
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function allRows(statement, ...params) {
  return statement.all(...params);
}

export class LocalDataSqliteStore {
  constructor({ dataRoot, librariesRoot, photoAlbumsRoot, indexPath, globalDataPath }) {
    this.dataRoot = dataRoot;
    this.librariesRoot = librariesRoot;
    this.photoAlbumsRoot = photoAlbumsRoot;
    this.indexPath = indexPath;
    this.globalDataPath = globalDataPath;
    this.databasePath = path.join(dataRoot, "web-player.sqlite");
    this.db = null;
  }

  async initialize() {
    await mkdir(this.dataRoot, { recursive: true });
    this.db = new DatabaseSync(this.databasePath);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;
    `);
    this.createSchema();
    await this.importLegacyJsonOnce();
  }

  close() {
    this.db?.close();
    this.db = null;
  }

  createSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS media_roots (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        source TEXT,
        path TEXT,
        local_path TEXT,
        basename TEXT,
        status TEXT,
        video_count INTEGER NOT NULL DEFAULT 0,
        scanned_files INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS library_metadata (
        library_id TEXT PRIMARY KEY,
        metadata_json TEXT,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS video_progress (
        library_id TEXT NOT NULL,
        video_id TEXT NOT NULL,
        "current_time" REAL NOT NULL,
        duration REAL NOT NULL,
        completed INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (library_id, video_id)
      );

      CREATE TABLE IF NOT EXISTS video_favorites (
        library_id TEXT NOT NULL,
        video_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (library_id, video_id)
      );

      CREATE TABLE IF NOT EXISTS video_tags (
        library_id TEXT NOT NULL,
        video_id TEXT NOT NULL,
        tag_key TEXT NOT NULL,
        tag_label TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (library_id, video_id, tag_key)
      );

      CREATE TABLE IF NOT EXISTS video_stats (
        library_id TEXT NOT NULL,
        video_id TEXT NOT NULL,
        total_played_seconds REAL NOT NULL,
        play_count INTEGER NOT NULL,
        duration_seconds REAL NOT NULL,
        emission_count INTEGER NOT NULL,
        last_emission_at INTEGER,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (library_id, video_id)
      );

      CREATE TABLE IF NOT EXISTS tag_merge_decisions (
        library_id TEXT NOT NULL,
        decision_key TEXT NOT NULL,
        from_label TEXT NOT NULL,
        to_label TEXT NOT NULL,
        decision TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (library_id, decision_key)
      );

      CREATE TABLE IF NOT EXISTS embedded_subtitles (
        library_id TEXT NOT NULL,
        subtitle_id TEXT NOT NULL,
        video_id TEXT NOT NULL,
        name TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        format TEXT NOT NULL,
        track_json TEXT NOT NULL,
        PRIMARY KEY (library_id, subtitle_id)
      );

      CREATE TABLE IF NOT EXISTS danmaku_selections (
        library_id TEXT NOT NULL,
        video_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        source_name TEXT NOT NULL,
        provider TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (library_id, video_id)
      );

      CREATE TABLE IF NOT EXISTS danmaku_preferences (
        library_id TEXT PRIMARY KEY,
        preferences_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS player_preferences (
        library_id TEXT PRIMARY KEY,
        preferences_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS player_settings (
        library_id TEXT PRIMARY KEY,
        settings_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS photo_album_favorites (
        album_id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS photo_album_progress (
        album_id TEXT PRIMARY KEY,
        image_index INTEGER NOT NULL,
        completed INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS photo_album_preferences (
        scope TEXT PRIMARY KEY,
        preferences_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS photo_album_scan_caches (
        root_id TEXT PRIMARY KEY,
        root_name TEXT NOT NULL,
        albums_json TEXT NOT NULL,
        scanned_files INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS cache_entries (
        kind TEXT NOT NULL,
        cache_id TEXT NOT NULL,
        path TEXT NOT NULL,
        content_type TEXT,
        bytes INTEGER,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (kind, cache_id)
      );
    `);
    this.setMeta("schema_version", String(schemaVersion));
  }

  transaction(callback) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = callback();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  getMeta(key) {
    return this.db.prepare("SELECT value FROM meta WHERE key = ?").get(key)?.value ?? null;
  }

  setMeta(key, value) {
    this.db
      .prepare("INSERT INTO meta (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
      .run(key, value, now());
  }

  async importLegacyJsonOnce() {
    if (this.getMeta("legacy_json_imported_at")) return;

    const globalStore = await readJsonFile(this.globalDataPath, null);
    const photoAlbumStore = await readJsonFile(path.join(this.photoAlbumsRoot, "global.json"), null);
    const indexStore = await readJsonFile(this.indexPath, null);
    const libraries = [];

    try {
      const entries = await readdir(this.librariesRoot, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
        const libraryId = entry.name.slice(0, -".json".length);
        const payload = await readJsonFile(path.join(this.librariesRoot, entry.name), null);
        if (payload) libraries.push({ libraryId, payload });
      }
    } catch {
      // A missing libraries directory is valid for a new install.
    }

    this.transaction(() => {
      if (globalStore) this.savePlayerDataStoreSync("global", globalStore);
      for (const { libraryId, payload } of libraries) {
        this.savePlayerDataStoreSync(libraryId, payload);
      }
      if (photoAlbumStore) this.savePhotoAlbumStoreSync(photoAlbumStore);
      if (indexStore) this.setMeta("legacy_index_json", stringifyJson(indexStore));
      this.setMeta("legacy_json_imported_at", String(now()));
    });
  }

  saveMetadataSync(libraryId, metadata) {
    const updatedAt = Number(metadata?.updatedAt) || now();
    this.db
      .prepare("INSERT INTO library_metadata (library_id, metadata_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(library_id) DO UPDATE SET metadata_json = excluded.metadata_json, updated_at = excluded.updated_at")
      .run(libraryId, metadata ? stringifyJson(metadata) : null, updatedAt);

    if (libraryId === "global" && Array.isArray(metadata?.mediaRoots)) {
      const statement = this.db.prepare(`
        INSERT INTO media_roots (id, label, source, path, local_path, basename, status, video_count, scanned_files, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          label = excluded.label,
          source = COALESCE(excluded.source, media_roots.source),
          status = excluded.status,
          video_count = excluded.video_count,
          scanned_files = excluded.scanned_files,
          updated_at = excluded.updated_at
      `);
      for (const root of metadata.mediaRoots) {
        if (!root?.id || !root?.label) continue;
        statement.run(
          root.id,
          root.label,
          root.source ?? null,
          root.path ?? null,
          root.localPath ?? null,
          root.basename ?? null,
          root.status ?? "ready",
          Number(root.videoCount) || 0,
          Number(root.scannedFiles) || 0,
          Number(root.updatedAt) || updatedAt,
        );
      }
    }
  }

  savePlayerDataStore(libraryId, payload) {
    return this.transaction(() => this.savePlayerDataStoreSync(libraryId, payload));
  }

  savePlayerDataStoreSync(libraryId, payload) {
    const store = asObject(payload);
    const timestamp = now();

    this.saveMetadataSync(libraryId, store.metadata);

    for (const table of [
      "video_progress",
      "video_favorites",
      "video_tags",
      "video_stats",
      "tag_merge_decisions",
      "embedded_subtitles",
      "danmaku_selections",
    ]) {
      this.db.prepare(`DELETE FROM ${table} WHERE library_id = ?`).run(libraryId);
    }

    const progressInsert = this.db.prepare(`
      INSERT INTO video_progress (library_id, video_id, "current_time", duration, completed, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const [videoId, item] of Object.entries(asObject(store.items ?? store.progress))) {
      if (!item || typeof item !== "object") continue;
      const currentTime = Number(item.currentTime);
      const duration = Number(item.duration);
      const updatedAt = Number(item.updatedAt);
      if (!Number.isFinite(currentTime) || !Number.isFinite(duration) || !Number.isFinite(updatedAt)) continue;
      progressInsert.run(libraryId, videoId, currentTime, duration, item.completed ? 1 : 0, updatedAt);
    }

    const favoriteInsert = this.db.prepare("INSERT INTO video_favorites (library_id, video_id, created_at) VALUES (?, ?, ?)");
    for (const videoId of Array.isArray(store.favorites) ? store.favorites : []) {
      if (typeof videoId === "string" && videoId) favoriteInsert.run(libraryId, videoId, timestamp);
    }

    const tagInsert = this.db.prepare("INSERT INTO video_tags (library_id, video_id, tag_key, tag_label, created_at) VALUES (?, ?, ?, ?, ?)");
    for (const [videoId, tags] of Object.entries(asObject(store.videoTags))) {
      if (!Array.isArray(tags)) continue;
      for (const tag of tags) {
        if (typeof tag !== "string") continue;
        const label = tag.trim();
        const key = normalizeTagKey(label);
        if (label && key) tagInsert.run(libraryId, videoId, key, label, timestamp);
      }
    }

    const statsInsert = this.db.prepare(`
      INSERT INTO video_stats (library_id, video_id, total_played_seconds, play_count, duration_seconds, emission_count, last_emission_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const [videoId, stats] of Object.entries(asObject(store.videoStats))) {
      if (!stats || typeof stats !== "object") continue;
      statsInsert.run(
        libraryId,
        videoId,
        Math.max(0, Number(stats.totalPlayedSeconds) || 0),
        Math.max(0, Math.floor(Number(stats.playCount) || 0)),
        Math.max(0, Number(stats.durationSeconds) || 0),
        Math.max(0, Math.floor(Number(stats.emissionCount) || 0)),
        Number.isFinite(Number(stats.lastEmissionAt)) ? Number(stats.lastEmissionAt) : null,
        Number.isFinite(Number(stats.updatedAt)) ? Number(stats.updatedAt) : timestamp,
      );
    }

    const decisionInsert = this.db.prepare(`
      INSERT INTO tag_merge_decisions (library_id, decision_key, from_label, to_label, decision, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const [key, decision] of Object.entries(asObject(store.tagMergeDecisions))) {
      if (!decision || typeof decision !== "object") continue;
      if (decision.decision !== "merge" && decision.decision !== "keep") continue;
      decisionInsert.run(
        libraryId,
        key,
        String(decision.from ?? ""),
        String(decision.to ?? ""),
        decision.decision,
        Number.isFinite(Number(decision.updatedAt)) ? Number(decision.updatedAt) : timestamp,
      );
    }

    const subtitleInsert = this.db.prepare(`
      INSERT INTO embedded_subtitles (library_id, subtitle_id, video_id, name, relative_path, format, track_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const subtitle of Array.isArray(store.embeddedSubtitles) ? store.embeddedSubtitles : []) {
      if (!subtitle?.id || !subtitle?.videoId) continue;
      subtitleInsert.run(
        libraryId,
        subtitle.id,
        subtitle.videoId,
        String(subtitle.name ?? ""),
        String(subtitle.relativePath ?? ""),
        String(subtitle.format ?? ""),
        stringifyJson(subtitle.embeddedTrack ?? null),
      );
    }

    const selectionInsert = this.db.prepare(`
      INSERT INTO danmaku_selections (library_id, video_id, source_id, source_name, provider, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const [videoId, selection] of Object.entries(asObject(store.danmakuSelections))) {
      if (!selection || typeof selection !== "object" || !selection.sourceId) continue;
      selectionInsert.run(
        libraryId,
        videoId,
        String(selection.sourceId),
        String(selection.sourceName ?? ""),
        String(selection.provider ?? ""),
        Number.isFinite(Number(selection.updatedAt)) ? Number(selection.updatedAt) : timestamp,
      );
    }

    this.db
      .prepare("INSERT INTO danmaku_preferences (library_id, preferences_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(library_id) DO UPDATE SET preferences_json = excluded.preferences_json, updated_at = excluded.updated_at")
      .run(libraryId, stringifyJson(store.danmakuPreferences ?? {}), timestamp);
    this.db
      .prepare("INSERT INTO player_preferences (library_id, preferences_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(library_id) DO UPDATE SET preferences_json = excluded.preferences_json, updated_at = excluded.updated_at")
      .run(libraryId, stringifyJson(store.preferences ?? {}), timestamp);
    this.db
      .prepare("INSERT INTO player_settings (library_id, settings_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(library_id) DO UPDATE SET settings_json = excluded.settings_json, updated_at = excluded.updated_at")
      .run(libraryId, stringifyJson(store.settings ?? {}), timestamp);
  }

  loadPlayerDataStore(libraryId) {
    const metadataRow = this.db.prepare("SELECT metadata_json FROM library_metadata WHERE library_id = ?").get(libraryId);
    const hasData = Boolean(metadataRow)
      || Boolean(this.db.prepare("SELECT 1 FROM video_progress WHERE library_id = ? LIMIT 1").get(libraryId))
      || Boolean(this.db.prepare("SELECT 1 FROM player_preferences WHERE library_id = ? LIMIT 1").get(libraryId));
    if (!hasData) return null;

    const progress = {};
    for (const row of allRows(this.db.prepare('SELECT video_id, "current_time", duration, completed, updated_at FROM video_progress WHERE library_id = ?'), libraryId)) {
      progress[row.video_id] = {
      currentTime: row.current_time,
        duration: row.duration,
        completed: Boolean(row.completed),
        updatedAt: row.updated_at,
      };
    }

    const favorites = allRows(this.db.prepare("SELECT video_id FROM video_favorites WHERE library_id = ? ORDER BY created_at, video_id"), libraryId).map((row) => row.video_id);

    const videoTags = {};
    for (const row of allRows(this.db.prepare("SELECT video_id, tag_label FROM video_tags WHERE library_id = ? ORDER BY created_at, tag_label"), libraryId)) {
      videoTags[row.video_id] ??= [];
      videoTags[row.video_id].push(row.tag_label);
    }

    const videoStats = {};
    for (const row of allRows(this.db.prepare("SELECT * FROM video_stats WHERE library_id = ?"), libraryId)) {
      videoStats[row.video_id] = {
        totalPlayedSeconds: row.total_played_seconds,
        playCount: row.play_count,
        durationSeconds: row.duration_seconds,
        emissionCount: row.emission_count,
        ...(row.last_emission_at ? { lastEmissionAt: row.last_emission_at } : {}),
        updatedAt: row.updated_at,
      };
    }

    const tagMergeDecisions = {};
    for (const row of allRows(this.db.prepare("SELECT * FROM tag_merge_decisions WHERE library_id = ?"), libraryId)) {
      tagMergeDecisions[row.decision_key] = {
        from: row.from_label,
        to: row.to_label,
        decision: row.decision,
        updatedAt: row.updated_at,
      };
    }

    const embeddedSubtitles = allRows(this.db.prepare("SELECT * FROM embedded_subtitles WHERE library_id = ?"), libraryId).map((row) => ({
      id: row.subtitle_id,
      videoId: row.video_id,
      name: row.name,
      relativePath: row.relative_path,
      format: row.format,
      embeddedTrack: parseJson(row.track_json, null),
    }));

    const danmakuSelections = {};
    for (const row of allRows(this.db.prepare("SELECT * FROM danmaku_selections WHERE library_id = ?"), libraryId)) {
      danmakuSelections[row.video_id] = {
        sourceId: row.source_id,
        sourceName: row.source_name,
        provider: row.provider,
        updatedAt: row.updated_at,
      };
    }

    return {
      version: playerStoreVersion,
      items: progress,
      favorites,
      videoTags,
      videoStats,
      tagMergeDecisions,
      embeddedSubtitles,
      danmakuSelections,
      danmakuPreferences: parseJson(this.db.prepare("SELECT preferences_json FROM danmaku_preferences WHERE library_id = ?").get(libraryId)?.preferences_json, {}),
      preferences: parseJson(this.db.prepare("SELECT preferences_json FROM player_preferences WHERE library_id = ?").get(libraryId)?.preferences_json, {}),
      settings: parseJson(this.db.prepare("SELECT settings_json FROM player_settings WHERE library_id = ?").get(libraryId)?.settings_json, {}),
      metadata: parseJson(metadataRow?.metadata_json, undefined),
    };
  }

  updateIndex(libraryId, metadata) {
    return this.transaction(() => this.saveMetadataSync(libraryId, metadata));
  }

  upsertProgress(libraryId, videoId, progress) {
    return this.transaction(() => {
      if (!progress) {
        this.db.prepare("DELETE FROM video_progress WHERE library_id = ? AND video_id = ?").run(libraryId, videoId);
        return;
      }
      this.db
        .prepare('INSERT INTO video_progress (library_id, video_id, "current_time", duration, completed, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(library_id, video_id) DO UPDATE SET "current_time" = excluded."current_time", duration = excluded.duration, completed = excluded.completed, updated_at = excluded.updated_at')
        .run(libraryId, videoId, Number(progress.currentTime) || 0, Number(progress.duration) || 0, progress.completed ? 1 : 0, Number(progress.updatedAt) || now());
    });
  }

  replaceProgressStore(libraryId, progressStore) {
    return this.transaction(() => {
      this.db.prepare("DELETE FROM video_progress WHERE library_id = ?").run(libraryId);
      for (const [videoId, progress] of Object.entries(asObject(progressStore))) {
        this.upsertProgressSync(libraryId, videoId, progress);
      }
    });
  }

  upsertProgressSync(libraryId, videoId, progress) {
    this.db
      .prepare('INSERT INTO video_progress (library_id, video_id, "current_time", duration, completed, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(library_id, video_id) DO UPDATE SET "current_time" = excluded."current_time", duration = excluded.duration, completed = excluded.completed, updated_at = excluded.updated_at')
      .run(libraryId, videoId, Number(progress.currentTime) || 0, Number(progress.duration) || 0, progress.completed ? 1 : 0, Number(progress.updatedAt) || now());
  }

  replaceFavorites(libraryId, favorites) {
    return this.transaction(() => {
      this.db.prepare("DELETE FROM video_favorites WHERE library_id = ?").run(libraryId);
      const insert = this.db.prepare("INSERT INTO video_favorites (library_id, video_id, created_at) VALUES (?, ?, ?)");
      for (const videoId of Array.isArray(favorites) ? favorites : []) {
        if (typeof videoId === "string" && videoId) insert.run(libraryId, videoId, now());
      }
    });
  }

  setFavorite(libraryId, videoId, isFavorite) {
    return this.transaction(() => {
      if (isFavorite) {
        this.db
          .prepare("INSERT INTO video_favorites (library_id, video_id, created_at) VALUES (?, ?, ?) ON CONFLICT(library_id, video_id) DO NOTHING")
          .run(libraryId, videoId, now());
        return;
      }
      this.db.prepare("DELETE FROM video_favorites WHERE library_id = ? AND video_id = ?").run(libraryId, videoId);
    });
  }

  replaceVideoTags(libraryId, videoId, tags) {
    return this.transaction(() => {
      this.db.prepare("DELETE FROM video_tags WHERE library_id = ? AND video_id = ?").run(libraryId, videoId);
      const insert = this.db.prepare("INSERT INTO video_tags (library_id, video_id, tag_key, tag_label, created_at) VALUES (?, ?, ?, ?, ?)");
      for (const tag of Array.isArray(tags) ? tags : []) {
        const label = String(tag ?? "").trim();
        const key = normalizeTagKey(label);
        if (label && key) insert.run(libraryId, videoId, key, label, now());
      }
    });
  }

  replaceAllVideoTags(libraryId, videoTags) {
    return this.transaction(() => {
      this.db.prepare("DELETE FROM video_tags WHERE library_id = ?").run(libraryId);
      for (const [videoId, tags] of Object.entries(asObject(videoTags))) {
        const insert = this.db.prepare("INSERT INTO video_tags (library_id, video_id, tag_key, tag_label, created_at) VALUES (?, ?, ?, ?, ?)");
        for (const tag of Array.isArray(tags) ? tags : []) {
          const label = String(tag ?? "").trim();
          const key = normalizeTagKey(label);
          if (label && key) insert.run(libraryId, videoId, key, label, now());
        }
      }
    });
  }

  upsertVideoStats(libraryId, videoId, stats) {
    return this.transaction(() => {
      this.db
        .prepare("INSERT INTO video_stats (library_id, video_id, total_played_seconds, play_count, duration_seconds, emission_count, last_emission_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(library_id, video_id) DO UPDATE SET total_played_seconds = excluded.total_played_seconds, play_count = excluded.play_count, duration_seconds = excluded.duration_seconds, emission_count = excluded.emission_count, last_emission_at = excluded.last_emission_at, updated_at = excluded.updated_at")
        .run(
          libraryId,
          videoId,
          Math.max(0, Number(stats?.totalPlayedSeconds) || 0),
          Math.max(0, Math.floor(Number(stats?.playCount) || 0)),
          Math.max(0, Number(stats?.durationSeconds) || 0),
          Math.max(0, Math.floor(Number(stats?.emissionCount) || 0)),
          Number.isFinite(Number(stats?.lastEmissionAt)) ? Number(stats.lastEmissionAt) : null,
          Number.isFinite(Number(stats?.updatedAt)) ? Number(stats.updatedAt) : now(),
        );
    });
  }

  replaceTagMergeDecisions(libraryId, decisions) {
    return this.transaction(() => {
      this.db.prepare("DELETE FROM tag_merge_decisions WHERE library_id = ?").run(libraryId);
      const insert = this.db.prepare("INSERT INTO tag_merge_decisions (library_id, decision_key, from_label, to_label, decision, updated_at) VALUES (?, ?, ?, ?, ?, ?)");
      for (const [key, decision] of Object.entries(asObject(decisions))) {
        if (decision?.decision !== "merge" && decision?.decision !== "keep") continue;
        insert.run(libraryId, key, String(decision.from ?? ""), String(decision.to ?? ""), decision.decision, Number(decision.updatedAt) || now());
      }
    });
  }

  replaceJsonSetting(table, column, libraryId, value) {
    return this.transaction(() => {
      this.db
        .prepare(`INSERT INTO ${table} (library_id, ${column}, updated_at) VALUES (?, ?, ?) ON CONFLICT(library_id) DO UPDATE SET ${column} = excluded.${column}, updated_at = excluded.updated_at`)
        .run(libraryId, stringifyJson(value), now());
    });
  }

  replacePreferences(libraryId, preferences) {
    return this.replaceJsonSetting("player_preferences", "preferences_json", libraryId, preferences);
  }

  replaceSettings(libraryId, settings) {
    return this.replaceJsonSetting("player_settings", "settings_json", libraryId, settings);
  }

  setPreferenceValue(libraryId, key, value) {
    return this.transaction(() => {
      const current = parseJson(this.db.prepare("SELECT preferences_json FROM player_preferences WHERE library_id = ?").get(libraryId)?.preferences_json, {});
      this.db
        .prepare("INSERT INTO player_preferences (library_id, preferences_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(library_id) DO UPDATE SET preferences_json = excluded.preferences_json, updated_at = excluded.updated_at")
        .run(libraryId, stringifyJson({ ...asObject(current), [key]: value }), now());
    });
  }

  setSettingValue(libraryId, key, value) {
    return this.transaction(() => {
      const current = parseJson(this.db.prepare("SELECT settings_json FROM player_settings WHERE library_id = ?").get(libraryId)?.settings_json, {});
      this.db
        .prepare("INSERT INTO player_settings (library_id, settings_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(library_id) DO UPDATE SET settings_json = excluded.settings_json, updated_at = excluded.updated_at")
        .run(libraryId, stringifyJson({ ...asObject(current), [key]: value }), now());
    });
  }

  replaceDanmakuPreferences(libraryId, preferences) {
    return this.replaceJsonSetting("danmaku_preferences", "preferences_json", libraryId, preferences);
  }

  upsertDanmakuSelection(libraryId, videoId, selection) {
    return this.transaction(() => {
      if (!selection) {
        this.db.prepare("DELETE FROM danmaku_selections WHERE library_id = ? AND video_id = ?").run(libraryId, videoId);
        return;
      }
      this.db
        .prepare("INSERT INTO danmaku_selections (library_id, video_id, source_id, source_name, provider, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(library_id, video_id) DO UPDATE SET source_id = excluded.source_id, source_name = excluded.source_name, provider = excluded.provider, updated_at = excluded.updated_at")
        .run(libraryId, videoId, selection.sourceId, selection.sourceName ?? "", selection.provider ?? "", Number(selection.updatedAt) || now());
    });
  }

  savePhotoAlbumStore(payload) {
    return this.transaction(() => this.savePhotoAlbumStoreSync(payload));
  }

  savePhotoAlbumStoreSync(payload) {
    const store = asObject(payload);
    this.db.prepare("DELETE FROM photo_album_favorites").run();
    this.db.prepare("DELETE FROM photo_album_progress").run();
    const favoriteInsert = this.db.prepare("INSERT INTO photo_album_favorites (album_id, created_at) VALUES (?, ?)");
    for (const albumId of Array.isArray(store.favorites) ? store.favorites : []) {
      if (typeof albumId === "string" && albumId) favoriteInsert.run(albumId, now());
    }
    const progressInsert = this.db.prepare("INSERT INTO photo_album_progress (album_id, image_index, completed, updated_at) VALUES (?, ?, ?, ?)");
    for (const [albumId, progress] of Object.entries(asObject(store.progress))) {
      progressInsert.run(albumId, Math.max(0, Math.floor(Number(progress?.imageIndex) || 0)), progress?.completed ? 1 : 0, Number(progress?.updatedAt) || now());
    }
    this.db
      .prepare("INSERT INTO photo_album_preferences (scope, preferences_json, updated_at) VALUES ('global', ?, ?) ON CONFLICT(scope) DO UPDATE SET preferences_json = excluded.preferences_json, updated_at = excluded.updated_at")
      .run(stringifyJson(store.preferences ?? {}), now());
  }

  loadPhotoAlbumStore() {
    const hasData = Boolean(this.db.prepare("SELECT 1 FROM photo_album_preferences WHERE scope = 'global' LIMIT 1").get())
      || Boolean(this.db.prepare("SELECT 1 FROM photo_album_favorites LIMIT 1").get())
      || Boolean(this.db.prepare("SELECT 1 FROM photo_album_progress LIMIT 1").get());
    if (!hasData) return null;
    const favorites = allRows(this.db.prepare("SELECT album_id FROM photo_album_favorites ORDER BY created_at, album_id")).map((row) => row.album_id);
    const progress = {};
    for (const row of allRows(this.db.prepare("SELECT * FROM photo_album_progress"))) {
      progress[row.album_id] = {
        imageIndex: row.image_index,
        completed: Boolean(row.completed),
        updatedAt: row.updated_at,
      };
    }
    return {
      version: photoAlbumStoreVersion,
      favorites,
      progress,
      preferences: parseJson(this.db.prepare("SELECT preferences_json FROM photo_album_preferences WHERE scope = 'global'").get()?.preferences_json, {}),
    };
  }

  replacePhotoAlbumProgress(albumId, progress) {
    return this.transaction(() => {
      this.db
        .prepare("INSERT INTO photo_album_progress (album_id, image_index, completed, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(album_id) DO UPDATE SET image_index = excluded.image_index, completed = excluded.completed, updated_at = excluded.updated_at")
        .run(albumId, Math.max(0, Math.floor(Number(progress?.imageIndex) || 0)), progress?.completed ? 1 : 0, Number(progress?.updatedAt) || now());
    });
  }

  replacePhotoAlbumFavorites(favorites) {
    return this.transaction(() => {
      this.db.prepare("DELETE FROM photo_album_favorites").run();
      const insert = this.db.prepare("INSERT INTO photo_album_favorites (album_id, created_at) VALUES (?, ?)");
      for (const albumId of Array.isArray(favorites) ? favorites : []) {
        if (typeof albumId === "string" && albumId) insert.run(albumId, now());
      }
    });
  }

  setPhotoAlbumFavorite(albumId, isFavorite) {
    return this.transaction(() => {
      if (isFavorite) {
        this.db
          .prepare("INSERT INTO photo_album_favorites (album_id, created_at) VALUES (?, ?) ON CONFLICT(album_id) DO NOTHING")
          .run(albumId, now());
        return;
      }
      this.db.prepare("DELETE FROM photo_album_favorites WHERE album_id = ?").run(albumId);
    });
  }

  replacePhotoAlbumPreferences(preferences) {
    return this.transaction(() => {
      this.db
        .prepare("INSERT INTO photo_album_preferences (scope, preferences_json, updated_at) VALUES ('global', ?, ?) ON CONFLICT(scope) DO UPDATE SET preferences_json = excluded.preferences_json, updated_at = excluded.updated_at")
        .run(stringifyJson(preferences), now());
    });
  }

  savePhotoAlbumScanCache(cache) {
    return this.transaction(() => {
      this.db
        .prepare("INSERT INTO photo_album_scan_caches (root_id, root_name, albums_json, scanned_files, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(root_id) DO UPDATE SET root_name = excluded.root_name, albums_json = excluded.albums_json, scanned_files = excluded.scanned_files, updated_at = excluded.updated_at")
        .run(cache.rootId, cache.rootName, stringifyJson(cache.albums ?? []), Number(cache.scannedFiles) || 0, Number(cache.updatedAt) || now());
    });
  }

  loadLatestPhotoAlbumScanCache() {
    const row = this.db.prepare("SELECT * FROM photo_album_scan_caches ORDER BY updated_at DESC LIMIT 1").get();
    if (!row) return null;
    return {
      version: 1,
      rootId: row.root_id,
      rootName: row.root_name,
      albums: parseJson(row.albums_json, []),
      scannedFiles: row.scanned_files,
      updatedAt: row.updated_at,
    };
  }

  clearPhotoAlbumScanCache() {
    return this.transaction(() => {
      this.db.prepare("DELETE FROM photo_album_scan_caches").run();
    });
  }

  recordCacheEntry(kind, cacheId, filePath, contentType = null, bytes = null) {
    return this.transaction(() => {
      this.db
        .prepare("INSERT INTO cache_entries (kind, cache_id, path, content_type, bytes, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(kind, cache_id) DO UPDATE SET path = excluded.path, content_type = excluded.content_type, bytes = excluded.bytes, updated_at = excluded.updated_at")
        .run(kind, cacheId, filePath, contentType, bytes, now());
    });
  }

  clearCacheEntriesByKinds(kinds) {
    return this.transaction(() => {
      const statement = this.db.prepare("DELETE FROM cache_entries WHERE kind = ?");
      for (const kind of kinds) statement.run(kind);
    });
  }

  async createDatabaseStatusItem() {
    try {
      const entryStat = await stat(this.databasePath);
      return {
        id: "sqlite-database",
        label: "SQLite 数据库",
        path: this.databasePath,
        bytes: entryStat.size,
        files: 1,
        updatedAt: entryStat.mtimeMs,
      };
    } catch {
      return null;
    }
  }
}
