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

test("sqlite store applies the tuned WAL connection settings", async () => {
  const context = await createTempStore();
  try {
    await context.store.initialize();
    assert.equal(context.store.db.prepare("PRAGMA journal_mode").get().journal_mode, "wal");
    assert.equal(context.store.db.prepare("PRAGMA synchronous").get().synchronous, 1);
    assert.equal(context.store.db.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
    assert.equal(context.store.db.prepare("PRAGMA busy_timeout").get().timeout, 5000);
    assert.equal(context.store.db.prepare("PRAGMA temp_store").get().temp_store, 2);
    assert.equal(context.store.db.prepare("PRAGMA cache_size").get().cache_size, -32768);
    assert.equal(context.store.db.prepare("PRAGMA mmap_size").get().mmap_size, 134217728);
  } finally {
    context.store.close();
    await rm(context.root, { recursive: true, force: true });
  }
});

test("sqlite store preserves actor aliases, actor tags, and an empty manual actor override", async () => {
  const context = await createTempStore();
  try {
    await context.store.initialize();
    context.store.savePlayerDataStore("global", {
      actorProfiles: {
        actor1: { id: "actor1", name: "新名字", aliases: [{ key: "旧名字", label: "旧名字" }, { key: "新名字", label: "新名字" }], updatedAt: 10 },
      },
      actorTagDefinitions: { "新名字": { key: "新名字", label: "新名字", updatedAt: 11 } },
      videoActorOverrides: { video1: { actorIds: [], updatedAt: 12 } },
    });
    const stored = context.store.loadPlayerDataStore("global");
    assert.equal(stored.actorProfiles.actor1.name, "新名字");
    assert.equal(stored.actorProfiles.actor1.aliases.length, 2);
    assert.equal(stored.actorTagDefinitions["新名字"].label, "新名字");
    assert.deepEqual(stored.videoActorOverrides.video1.actorIds, []);
    context.store.close();
  } finally {
    await rm(context.root, { recursive: true, force: true });
  }
});

test("sqlite player data patch updates selected fields without clearing deferred data", async () => {
  const context = await createTempStore();
  try {
    await context.store.initialize();
    context.store.savePlayerDataStore("global", {
      items: { video1: { currentTime: 1, duration: 10, completed: false, updatedAt: 1 } },
      videoTags: { video1: ["old"] },
      embeddedSubtitles: [{ id: "subtitle1", videoId: "video1", name: "字幕", relativePath: "video.mkv", format: "vtt" }],
      duplicateDetections: { anime: { mode: "anime", pairs: [], updatedAt: 1 } },
    });

    context.store.patchPlayerDataStore("global", {
      progress: { video1: { currentTime: 5, duration: 10, completed: false, updatedAt: 2 } },
      videoTags: { video1: ["new"] },
    });

    const stored = context.store.loadPlayerDataStore("global");
    assert.equal(stored.items.video1.currentTime, 5);
    assert.deepEqual(stored.videoTags.video1, ["new"]);
    assert.equal(stored.embeddedSubtitles[0].id, "subtitle1");
    assert.deepEqual(stored.duplicateDetections.anime.pairs, []);
  } finally {
    context.store.close();
    await rm(context.root, { recursive: true, force: true });
  }
});

test("sqlite progress preserves playback history across incremental writes", async () => {
  const context = await createTempStore();
  try {
    await context.store.initialize();
    const history = { duration: 100, buckets: Array(200).fill(0), updatedAt: 10 };
    history.buckets[20] = 0.5;
    context.store.upsertProgress("global", "video1", {
      currentTime: 11,
      duration: 100,
      completed: false,
      history,
      updatedAt: 10,
    });
    assert.deepEqual(context.store.loadPlayerDataStore("global").items.video1.history, history);

    context.store.upsertProgress("global", "video1", {
      currentTime: 12,
      duration: 100,
      completed: false,
      updatedAt: 20,
    });
    assert.deepEqual(context.store.loadPlayerDataStore("global").items.video1.history, history);
  } finally {
    context.store.close();
    await rm(context.root, { recursive: true, force: true });
  }
});

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
        videoRatings: { video1: 8.5 },
        videoTags: { video1: ["Tag A"] },
        videoStats: {},
        watchActivity: {
          "2026-06-29::video1": {
            date: "2026-06-29",
            videoId: "video1",
            watchedSeconds: 90,
            playCount: 1,
            completedCount: 0,
            emissionCount: 0,
            updatedAt: 3000,
          },
        },
        videoHighlights: {
          video1: [{ id: "mark-1", startTime: 12, endTime: 18, tag: "名场面", updatedAt: 1200 }],
        },
        videoEditSegments: {
          video1: [{ id: "edit-1", startTime: 5, endTime: 20, updatedAt: 1250 }],
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
        albumTags: { album1: ["剧情", "AI-字幕"] },
        preferences: { sortMode: "name", favoritesOnly: true },
      }),
      "utf8",
    );

    await context.store.initialize();
    const playerStore = context.store.loadPlayerDataStore("global");
    const photoStore = context.store.loadPhotoAlbumStore();

    assert.equal(playerStore.items.video1.currentTime, 12);
    assert.deepEqual(playerStore.favorites, ["video1"]);
    assert.deepEqual(playerStore.videoRatings, { video1: 8.5 });
    assert.deepEqual(playerStore.videoTags.video1, ["Tag A"]);
    assert.equal(playerStore.watchActivity["2026-06-29::video1"].watchedSeconds, 90);
    assert.deepEqual(playerStore.videoHighlights.video1, [{ id: "mark-1", startTime: 12, endTime: 18, tag: "名场面", updatedAt: 1200 }]);
    assert.deepEqual(playerStore.videoEditSegments.video1, [{ id: "edit-1", startTime: 5, endTime: 20, updatedAt: 1250 }]);
    assert.equal(photoStore.progress.album1.imageIndex, 2);
    assert.equal(photoStore.coverImageByAlbumId.album1, "image-2");
    assert.deepEqual(photoStore.albumTags.album1, ["剧情", "AI-字幕"]);

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
      videoRatings: { video1: 4 },
      videoTags: { video1: ["Old"] },
      videoStats: {},
      watchActivity: {},
      videoHighlights: {},
      tagMergeDecisions: {},
      embeddedSubtitles: [],
      danmakuSelections: {},
      danmakuPreferences: {},
      preferences: { homeMediaMode: "anime" },
      settings: { volume: 0.5, skipFolderAccessPrompt: false },
    });

    context.store.upsertProgress("global", "video1", { currentTime: 5, duration: 10, completed: false, updatedAt: 2000 });
    context.store.setVideoRating("global", "video1", 9);
    context.store.replaceVideoTags("global", "video1", ["New"]);
    context.store.replaceVideoHighlights("global", "video1", [{ id: "h1", startTime: 8, endTime: 15, tag: " 高能 ", updatedAt: 2200 }]);
    context.store.replaceVideoEditSegments("global", "video1", [
      { id: "edit-2", startTime: 30, endTime: 40, updatedAt: 2400 },
      { id: "edit-1", startTime: 5, endTime: 20, updatedAt: 2350 },
      { id: "bad", startTime: 20, endTime: 10, updatedAt: 2450 },
    ]);
    context.store.upsertWatchActivity("global", {
      date: "2026-06-29",
      videoId: "video1",
      watchedSeconds: 44,
      playCount: 2,
      completedCount: 1,
      emissionCount: 0,
      updatedAt: 2300,
    });
    context.store.setPreferenceValue("global", "homeMediaMode", "anime");
    context.store.setSettingValue("global", "theme", "light");

    const store = context.store.loadPlayerDataStore("global");
    assert.equal(store.items.video1.currentTime, 5);
    assert.deepEqual(store.videoRatings, { video1: 9 });
    assert.deepEqual(store.videoTags.video1, ["New"]);
    assert.deepEqual(store.videoHighlights.video1, [{ id: "h1", startTime: 8, endTime: 15, tag: "高能", updatedAt: 2200 }]);
    assert.deepEqual(store.videoEditSegments.video1, [
      { id: "edit-1", startTime: 5, endTime: 20, updatedAt: 2350 },
      { id: "edit-2", startTime: 30, endTime: 40, updatedAt: 2400 },
    ]);
    assert.deepEqual(store.watchActivity["2026-06-29::video1"], {
      date: "2026-06-29",
      videoId: "video1",
      watchedSeconds: 44,
      playCount: 2,
      completedCount: 1,
      emissionCount: 0,
      updatedAt: 2300,
    });
    assert.equal(store.preferences.homeMediaMode, "anime");
    assert.equal(store.settings.theme, "light");
    assert.equal(store.settings.volume, 0.5);
  } finally {
    context.store.close();
    await rm(context.root, { recursive: true, force: true });
  }
});

test("sqlite montage metadata migration copies descriptive data without playback data", async () => {
  const context = await createTempStore();
  try {
    await context.store.initialize();
    context.store.savePlayerDataStore("global", {
      items: { source: { currentTime: 12, duration: 60, completed: false, updatedAt: 1 } },
      favorites: ["source"],
      videoRatings: { source: 9 },
      videoComments: { source: "原片评论" },
      videoTags: { source: ["剧情", "收藏级"] },
      actorProfiles: { actor1: { id: "actor1", name: "演员一", aliases: [], updatedAt: 1 } },
      videoActorOverrides: { source: { actorIds: ["actor1"], updatedAt: 1 } },
      videoStats: { source: { totalPlayedSeconds: 30, playCount: 2, durationSeconds: 60, emissionCount: 1, updatedAt: 1 } },
      watchActivity: { "2026-07-22::source": { date: "2026-07-22", videoId: "source", watchedSeconds: 30, playCount: 2, completedCount: 0, emissionCount: 1, updatedAt: 1 } },
      videoEditSegments: { source: [{ id: "e1", startTime: 5, endTime: 20, updatedAt: 1 }] },
    });

    context.store.copyVideoMetadata("global", "source", "target", {
      actorIds: ["actor1"],
      highlights: [{ id: "edit-h1-1", startTime: 2, endTime: 5, tag: "高能", updatedAt: 2 }],
    });

    const stored = context.store.loadPlayerDataStore("global");
    assert.equal(stored.favorites.includes("target"), true);
    assert.deepEqual(stored.videoTags.target, ["剧情", "收藏级"]);
    assert.equal(stored.videoRatings.target, 9);
    assert.equal(stored.videoComments.target, "原片评论");
    assert.deepEqual(stored.videoActorOverrides.target.actorIds, ["actor1"]);
    assert.deepEqual(stored.videoHighlights.target, [{ id: "edit-h1-1", startTime: 2, endTime: 5, tag: "高能", updatedAt: 2 }]);
    assert.equal(stored.items.target, undefined);
    assert.equal(stored.videoStats.target, undefined);
    assert.equal(Object.values(stored.watchActivity).some((item) => item.videoId === "target"), false);
    assert.equal(stored.videoEditSegments.target, undefined);
  } finally {
    context.store.close();
    await rm(context.root, { recursive: true, force: true });
  }
});

test("sqlite player data stores preserve duplicate detections", async () => {
  const context = await createTempStore();
  try {
    await context.store.initialize();
    context.store.savePlayerDataStore("global", {
      version: 5,
      items: {},
      favorites: [],
      videoTags: {},
      videoStats: {},
      videoHighlights: {},
      tagMergeDecisions: {},
      embeddedSubtitles: [],
      danmakuSelections: {},
      danmakuPreferences: {},
      preferences: { homeMediaMode: "special" },
      settings: {},
      duplicateDetections: {
        special: {
          mode: "special",
          updatedAt: 100,
          message: "检测完成",
          pairs: [{
            key: "a\u0000b",
            aId: "a",
            bId: "b",
            score: 120,
            severity: "duplicate",
            reasons: ["内容指纹一致"],
          }],
        },
      },
    });

    context.store.close();
    context.store = new LocalDataSqliteStore({
      dataRoot: context.dataRoot,
      librariesRoot: context.librariesRoot,
      photoAlbumsRoot: context.photoAlbumsRoot,
      indexPath: path.join(context.dataRoot, "index.json"),
      globalDataPath: path.join(context.dataRoot, "global.json"),
    });
    await context.store.initialize();

    const store = context.store.loadPlayerDataStore("global");
    assert.deepEqual(store.duplicateDetections.special, {
      mode: "special",
      updatedAt: 100,
      message: "检测完成",
      pairs: [{
        key: "a\u0000b",
        aId: "a",
        bId: "b",
        score: 120,
        severity: "duplicate",
        reasons: ["内容指纹一致"],
      }],
    });
  } finally {
    context.store.close();
    await rm(context.root, { recursive: true, force: true });
  }
});

test("sqlite imports legacy duplicate detection json", async () => {
  const context = await createTempStore();
  try {
    await writeFile(
      path.join(context.dataRoot, "global.json"),
      JSON.stringify({
        version: 5,
        items: {},
        favorites: [],
        duplicateDetection: {
          scopeKey: "special\nvideo-a",
          updatedAt: 100,
          pairs: [{
            key: "a\u0000b",
            aId: "a",
            bId: "b",
            score: 120,
            severity: "duplicate",
            reasons: ["内容指纹一致"],
          }],
        },
      }),
      "utf8",
    );

    await context.store.initialize();
    const store = context.store.loadPlayerDataStore("global");

    assert.equal(store.duplicateDetections.special.mode, "special");
    assert.equal(store.duplicateDetections.special.pairs[0].key, "a\u0000b");
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
      albumTags: {},
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

test("sqlite photo album tags can be updated independently", async () => {
  const context = await createTempStore();
  try {
    await context.store.initialize();
    context.store.savePhotoAlbumStore({
      version: 1,
      favorites: [],
      progress: {},
      coverImageByAlbumId: {},
      albumTags: { album1: ["旧标签"] },
      preferences: { sortMode: "updated", favoritesOnly: false },
    });

    context.store.replacePhotoAlbumTags("album1", ["剧情", "剧情 ", "AI-字幕", "ＡＩ字幕"]);

    const store = context.store.loadPhotoAlbumStore();
    assert.deepEqual(store.albumTags, { album1: ["剧情", "AI-字幕"] });
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

test("sqlite photo album scan cache loads summaries and album images separately", async () => {
  const context = await createTempStore();
  try {
    await context.store.initialize();
    const images = [0, 1, 2].map((index) => ({
      id: `image-${index}`,
      name: `${index}.jpg`,
      relativePath: `album/${index}.jpg`,
      url: `/media/album/${index}.jpg`,
      size: 100 + index,
      lastModified: 200 + index,
      mediaRootId: "photos",
      index,
    }));
    context.store.savePhotoAlbumScanCache({
      rootId: "root",
      rootName: "Photos",
      scannedFiles: images.length,
      updatedAt: 300,
      albums: [{
        id: "album",
        title: "Album",
        relativePath: "album",
        mediaRootId: "photos",
        mediaRootLabel: "Photos",
        coverImageUrl: images[0].url,
        imageCount: images.length,
        totalSize: images.reduce((sum, image) => sum + image.size, 0),
        updatedAt: 202,
        folderModifiedAt: 150,
        images,
      }],
    });

    const summary = context.store.loadLatestPhotoAlbumScanCache({ includeImages: false });
    assert.equal(summary.albums[0].imageCount, 3);
    assert.equal(summary.albums[0].folderModifiedAt, 150);
    assert.deepEqual(summary.albums[0].images, [images[0]]);
    assert.deepEqual(context.store.loadPhotoAlbumScanCacheImages("album"), images);
    assert.equal(context.store.loadPhotoAlbumScanCacheImages("missing"), null);

    assert.equal(context.store.replacePhotoAlbumScanCacheAlbum({
      albumId: "album",
      album: { ...summary.albums[0], imageCount: 2, images: images.slice(1) },
      scannedFilesDelta: -1,
      updatedAt: 400,
    }), true);
    assert.deepEqual(context.store.loadPhotoAlbumScanCacheImages("album"), images.slice(1));
    assert.equal(context.store.loadLatestPhotoAlbumScanCache({ includeImages: false }).scannedFiles, 2);

    assert.equal(context.store.replacePhotoAlbumScanCacheAlbum({
      albumId: "album",
      album: null,
      scannedFilesDelta: -2,
      updatedAt: 500,
    }), true);
    const empty = context.store.loadLatestPhotoAlbumScanCache({ includeImages: false });
    assert.equal(empty.scannedFiles, 0);
    assert.deepEqual(empty.albums, []);
  } finally {
    context.store.close();
    await rm(context.root, { recursive: true, force: true });
  }
});

test("sqlite initialization migrates the legacy photo album scan json", async () => {
  const context = await createTempStore();
  const legacyImage = {
    id: "legacy-image",
    name: "legacy.jpg",
    relativePath: "legacy/legacy.jpg",
    url: "/media/legacy.jpg",
    size: 123,
    lastModified: 456,
    mediaRootId: "photos",
    index: 0,
  };
  const legacyDb = new DatabaseSync(path.join(context.dataRoot, "web-player.sqlite"));
  legacyDb.exec("CREATE TABLE photo_album_scan_caches (root_id TEXT PRIMARY KEY, root_name TEXT NOT NULL, albums_json TEXT NOT NULL, scanned_files INTEGER NOT NULL, updated_at INTEGER NOT NULL)");
  legacyDb.prepare("INSERT INTO photo_album_scan_caches VALUES (?, ?, ?, ?, ?)").run("legacy-root", "Legacy", JSON.stringify([{
    id: "legacy-album",
    title: "Legacy album",
    relativePath: "legacy",
    mediaRootId: "photos",
    mediaRootLabel: "Photos",
    coverImageUrl: legacyImage.url,
    imageCount: 1,
    totalSize: 123,
    updatedAt: 456,
    images: [legacyImage],
  }]), 1, 500);
  legacyDb.close();

  try {
    await context.store.initialize();
    assert.equal(context.store.hasTable("photo_album_scan_caches"), false);
    assert.equal(context.store.getMeta("schema_version"), "6");
    assert.deepEqual(context.store.loadPhotoAlbumScanCacheImages("legacy-album"), [legacyImage]);
  } finally {
    context.store.close();
    await rm(context.root, { recursive: true, force: true });
  }
});

test("sqlite media root scan cache stores the latest global scan", async () => {
  const context = await createTempStore();
  try {
    await context.store.initialize();
    const cache = {
      version: 1,
      videos: [
        {
          id: "anime|Show/01.mkv|100|200",
          name: "01.mkv",
          relativePath: "Show/01.mkv",
          url: "/api/media/anime/Show/01.mkv",
          size: 100,
          lastModified: 200,
          mediaRootId: "anime",
          playbackSource: "server",
        },
      ],
      subtitles: [],
      scannedFiles: 1,
      filteredSmallVideos: 0,
      metadata: {
        id: "global",
        name: "全局媒体库",
        videoCount: 1,
        scannedFiles: 1,
        updatedAt: 1234,
        mediaRoots: [
          { id: "anime", label: "Anime", source: "local", status: "ready", videoCount: 1, scannedFiles: 1, updatedAt: 1234 },
        ],
      },
      updatedAt: 1234,
    };

    context.store.saveMediaRootScanCache(cache);

    assert.deepEqual(context.store.loadMediaRootScanCache(), cache);
  } finally {
    context.store.close();
    await rm(context.root, { recursive: true, force: true });
  }
});

test("sqlite full save preserves favorite and tag created_at ordering", async () => {
  const context = await createTempStore();
  try {
    await context.store.initialize();
    // 用 per-key 写入制造不同的 created_at：video-b 最早收藏，标签A 先于 标签B
    context.store.setFavorite("global", "video-b", true);
    await new Promise((resolve) => setTimeout(resolve, 2));
    context.store.setFavorite("global", "video-a", true);
    await new Promise((resolve) => setTimeout(resolve, 2));
    context.store.setFavorite("global", "video-c", true);
    context.store.replaceVideoTags("global", "video-a", ["标签A"]);
    await new Promise((resolve) => setTimeout(resolve, 2));
    context.store.replaceVideoTags("global", "video-a", ["标签A", "标签B"]);

    // 全量保存不得把收藏/标签的 created_at 重置为同一时刻
    context.store.savePlayerDataStore("global", {
      favorites: ["video-b", "video-a", "video-c"],
      videoTags: { "video-a": ["标签A", "标签B"] },
    });

    const stored = context.store.loadPlayerDataStore("global");
    assert.deepEqual(stored.favorites, ["video-b", "video-a", "video-c"]);
    assert.deepEqual(stored.videoTags["video-a"], ["标签A", "标签B"]);
  } finally {
    context.store.close();
    await rm(context.root, { recursive: true, force: true });
  }
});

test("sqlite patch only rewrites the patched field tables and preserves favorites order", async () => {
  const context = await createTempStore();
  try {
    await context.store.initialize();
    context.store.savePlayerDataStore("global", {
      items: { "video-1": { currentTime: 1, duration: 10, completed: false, updatedAt: 1 } },
      favorites: [],
      videoTags: { "video-1": ["旧标签"] },
      embeddedSubtitles: [{ id: "sub1", videoId: "video-1", name: "字幕", relativePath: "a.mkv", format: "vtt" }],
    });
    // 先收藏 video-2，稍后收藏 video-1 → 顺序应保持 video-2 在前
    context.store.setFavorite("global", "video-2", true);
    await new Promise((resolve) => setTimeout(resolve, 2));
    context.store.setFavorite("global", "video-1", true);

    context.store.patchPlayerDataStore("global", { favorites: ["video-2", "video-1"] });
    const stored = context.store.loadPlayerDataStore("global");
    assert.deepEqual(stored.favorites, ["video-2", "video-1"]);
    // 未 patch 的字段原样保留
    assert.equal(stored.items["video-1"].currentTime, 1);
    assert.deepEqual(stored.videoTags["video-1"], ["旧标签"]);
    assert.equal(stored.embeddedSubtitles[0].id, "sub1");
    // 空 patch 是 no-op，不抛错
    context.store.patchPlayerDataStore("global", {});
  } finally {
    context.store.close();
    await rm(context.root, { recursive: true, force: true });
  }
});
