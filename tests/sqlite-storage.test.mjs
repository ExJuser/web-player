import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { LocalDataSqliteStore } from "../server/sqliteStorage.mjs";

async function createTempStore() {
  const root = await mkdtemp(path.join(os.tmpdir(), "web-player-sqlite-"));
  const dataRoot = path.join(root, ".local-web-player-data");
  const librariesRoot = path.join(dataRoot, "libraries");
  const photoAlbumsRoot = path.join(dataRoot, "photo-albums");
  await mkdir(librariesRoot, { recursive: true });
  await mkdir(photoAlbumsRoot, { recursive: true });
  const store = new LocalDataSqliteStore({
    dataRoot,
    librariesRoot,
    photoAlbumsRoot,
    indexPath: path.join(dataRoot, "index.json"),
    globalDataPath: path.join(dataRoot, "global.json"),
  });
  return { root, dataRoot, librariesRoot, photoAlbumsRoot, store };
}

test("sqlite store imports legacy player and photo album json once", async () => {
  const context = await createTempStore();
  try {
    await writeFile(
      path.join(context.dataRoot, "global.json"),
      JSON.stringify({
        version: 5,
        items: {
          video1: { currentTime: 12, duration: 30, completed: false, updatedAt: 1000 },
        },
        favorites: ["video1"],
        videoTags: { video1: ["Tag A"] },
        videoStats: {},
        videoHighlights: {
          video1: [{ id: "mark-1", startTime: 12, endTime: 18, tag: "名场面", updatedAt: 1200 }],
        },
        tagMergeDecisions: {},
        embeddedSubtitles: [],
        danmakuSelections: {},
        danmakuPreferences: { enabled: true },
        preferences: { homeMediaMode: "anime" },
        settings: { volume: 0.4, skipFolderAccessPrompt: true },
        metadata: { id: "global", name: "全局媒体库", videoCount: 1, scannedFiles: 1, updatedAt: 1000, mediaRoots: [] },
      }),
      "utf8",
    );
    await writeFile(
      path.join(context.photoAlbumsRoot, "global.json"),
      JSON.stringify({
        version: 1,
        favorites: ["album1"],
        progress: { album1: { imageIndex: 2, completed: false, updatedAt: 2000 } },
        coverImageByAlbumId: { album1: "image-2" },
        preferences: { sortMode: "name", favoritesOnly: true },
      }),
      "utf8",
    );

    await context.store.initialize();
    const playerStore = context.store.loadPlayerDataStore("global");
    const photoStore = context.store.loadPhotoAlbumStore();

    assert.equal(playerStore.items.video1.currentTime, 12);
    assert.deepEqual(playerStore.favorites, ["video1"]);
    assert.deepEqual(playerStore.videoTags.video1, ["Tag A"]);
    assert.deepEqual(playerStore.videoHighlights.video1, [{ id: "mark-1", startTime: 12, endTime: 18, tag: "名场面", updatedAt: 1200 }]);
    assert.equal(photoStore.progress.album1.imageIndex, 2);
    assert.equal(photoStore.coverImageByAlbumId.album1, "image-2");

    context.store.close();
    context.store = new LocalDataSqliteStore({
      dataRoot: context.dataRoot,
      librariesRoot: context.librariesRoot,
      photoAlbumsRoot: context.photoAlbumsRoot,
      indexPath: path.join(context.dataRoot, "index.json"),
      globalDataPath: path.join(context.dataRoot, "global.json"),
    });
    await writeFile(path.join(context.dataRoot, "global.json"), JSON.stringify({ version: 5, items: {} }), "utf8");
    await context.store.initialize();

    assert.equal(context.store.loadPlayerDataStore("global").items.video1.currentTime, 12);
  } finally {
    context.store.close();
    await rm(context.root, { recursive: true, force: true });
  }
});

test("sqlite incremental writes keep unrelated player data", async () => {
  const context = await createTempStore();
  try {
    await context.store.initialize();
    context.store.savePlayerDataStore("global", {
      version: 5,
      items: {
        video1: { currentTime: 1, duration: 10, completed: false, updatedAt: 1000 },
      },
      favorites: [],
      videoTags: { video1: ["Old"] },
      videoStats: {},
      videoHighlights: {},
      tagMergeDecisions: {},
      embeddedSubtitles: [],
      danmakuSelections: {},
      danmakuPreferences: {},
      preferences: { homeMediaMode: "all" },
      settings: { volume: 0.5, skipFolderAccessPrompt: false },
    });

    context.store.upsertProgress("global", "video1", { currentTime: 5, duration: 10, completed: false, updatedAt: 2000 });
    context.store.replaceVideoTags("global", "video1", ["New"]);
    context.store.replaceVideoHighlights("global", "video1", [{ id: "h1", startTime: 8, endTime: 15, tag: " 高能 ", updatedAt: 2200 }]);
    context.store.setPreferenceValue("global", "homeMediaMode", "anime");
    context.store.setSettingValue("global", "theme", "light");

    const store = context.store.loadPlayerDataStore("global");
    assert.equal(store.items.video1.currentTime, 5);
    assert.deepEqual(store.videoTags.video1, ["New"]);
    assert.deepEqual(store.videoHighlights.video1, [{ id: "h1", startTime: 8, endTime: 15, tag: "高能", updatedAt: 2200 }]);
    assert.equal(store.preferences.homeMediaMode, "anime");
    assert.equal(store.settings.theme, "light");
    assert.equal(store.settings.volume, 0.5);
  } finally {
    context.store.close();
    await rm(context.root, { recursive: true, force: true });
  }
});

test("sqlite initialization migrates high energy highlight tags into existing databases", async () => {
  const context = await createTempStore();
  try {
    await mkdir(context.dataRoot, { recursive: true });
    const db = new DatabaseSync(path.join(context.dataRoot, "web-player.sqlite"));
    db.exec(`
      CREATE TABLE meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      INSERT INTO meta (key, value, updated_at) VALUES ('legacy_json_imported_at', '1', 1);
      CREATE TABLE video_highlights (
        library_id TEXT NOT NULL,
        video_id TEXT NOT NULL,
        highlight_id TEXT NOT NULL,
        start_time REAL NOT NULL,
        end_time REAL NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (library_id, video_id, highlight_id)
      );
    `);
    db.close();

    await context.store.initialize();
    context.store.replaceVideoHighlights("global", "video1", [
      { id: "h1", startTime: 8, endTime: 15, tag: "名场面", updatedAt: 2200 },
    ]);

    assert.deepEqual(context.store.loadPlayerDataStore("global").videoHighlights.video1, [
      { id: "h1", startTime: 8, endTime: 15, tag: "名场面", updatedAt: 2200 },
    ]);
  } finally {
    context.store.close();
    await rm(context.root, { recursive: true, force: true });
  }
});

test("sqlite photo album cover preferences can be updated independently", async () => {
  const context = await createTempStore();
  try {
    await context.store.initialize();
    context.store.savePhotoAlbumStore({
      version: 1,
      favorites: ["album1"],
      progress: {},
      coverImageByAlbumId: { album1: "img-a" },
      preferences: { sortMode: "updated", favoritesOnly: false },
    });

    context.store.setPhotoAlbumCoverPreference("album1", "img-b");
    context.store.setPhotoAlbumCoverPreference("album2", "img-c");
    context.store.setPhotoAlbumCoverPreference("album2", "");

    const store = context.store.loadPhotoAlbumStore();
    assert.deepEqual(store.favorites, ["album1"]);
    assert.deepEqual(store.coverImageByAlbumId, { album1: "img-b" });
  } finally {
    context.store.close();
    await rm(context.root, { recursive: true, force: true });
  }
});

test("sqlite database status includes wal and shm sidecar files", async () => {
  const context = await createTempStore();
  try {
    await context.store.initialize();
    context.store.close();
    await writeFile(path.join(context.dataRoot, "web-player.sqlite-wal"), "wal", "utf8");
    await writeFile(path.join(context.dataRoot, "web-player.sqlite-shm"), "shm", "utf8");

    const status = await context.store.createDatabaseStatusItem();

    assert.equal(status.id, "sqlite-database");
    assert.equal(status.files, 3);
    assert.ok(status.bytes >= 6);
    assert.ok(status.updatedAt);
  } finally {
    context.store.close();
    await rm(context.root, { recursive: true, force: true });
  }
});

test("sqlite progress upsert ignores stale writes and preserves known duration", async () => {
  const context = await createTempStore();
  try {
    await context.store.initialize();

    context.store.upsertProgress("global", "video1", {
      currentTime: 80,
      duration: 120,
      completed: false,
      updatedAt: 3000,
    });
    context.store.upsertProgress("global", "video1", {
      currentTime: 5,
      duration: 10,
      completed: false,
      updatedAt: 2000,
    });

    let store = context.store.loadPlayerDataStore("global");
    assert.equal(store.items.video1.currentTime, 80);
    assert.equal(store.items.video1.duration, 120);
    assert.equal(store.items.video1.updatedAt, 3000);

    context.store.upsertProgress("global", "video1", {
      currentTime: 90,
      duration: 0,
      completed: false,
      updatedAt: 4000,
    });

    store = context.store.loadPlayerDataStore("global");
    assert.equal(store.items.video1.currentTime, 90);
    assert.equal(store.items.video1.duration, 120);
    assert.equal(store.items.video1.updatedAt, 4000);
  } finally {
    context.store.close();
    await rm(context.root, { recursive: true, force: true });
  }
});

test("sqlite media probe cache is keyed by file identity", async () => {
  const context = await createTempStore();
  try {
    await context.store.initialize();
    const result = {
      canRemux: false,
      metadata: { duration: 12, width: 1920, height: 1080 },
      playability: {
        status: "direct",
        reason: "视频可直接播放。",
        videoCodec: "h264",
        audioCodec: "aac",
      },
      probe: { format: { duration: 12 }, video: { codec: "h264" }, audio: { codec: "aac" } },
    };

    context.store.saveMediaProbeCache("root-a", "movie.mp4", { size: 100, lastModified: 200 }, result);

    assert.deepEqual(
      context.store.getMediaProbeCache("root-a", "movie.mp4", { size: 100, lastModified: 200 }),
      result,
    );
    assert.equal(context.store.getMediaProbeCache("root-a", "movie.mp4", { size: 101, lastModified: 200 }), null);
    assert.equal(context.store.getMediaProbeCache("root-a", "movie.mp4", { size: 100, lastModified: 201 }), null);
  } finally {
    context.store.close();
    await rm(context.root, { recursive: true, force: true });
  }
});
