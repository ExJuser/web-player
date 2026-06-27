import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
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
    assert.equal(photoStore.progress.album1.imageIndex, 2);

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
      tagMergeDecisions: {},
      embeddedSubtitles: [],
      danmakuSelections: {},
      danmakuPreferences: {},
      preferences: { homeMediaMode: "all" },
      settings: { volume: 0.5, skipFolderAccessPrompt: false },
    });

    context.store.upsertProgress("global", "video1", { currentTime: 5, duration: 10, completed: false, updatedAt: 2000 });
    context.store.replaceVideoTags("global", "video1", ["New"]);
    context.store.setPreferenceValue("global", "homeMediaMode", "anime");
    context.store.setSettingValue("global", "theme", "light");

    const store = context.store.loadPlayerDataStore("global");
    assert.equal(store.items.video1.currentTime, 5);
    assert.deepEqual(store.videoTags.video1, ["New"]);
    assert.equal(store.preferences.homeMediaMode, "anime");
    assert.equal(store.settings.theme, "light");
    assert.equal(store.settings.volume, 0.5);
  } finally {
    context.store.close();
    await rm(context.root, { recursive: true, force: true });
  }
});
