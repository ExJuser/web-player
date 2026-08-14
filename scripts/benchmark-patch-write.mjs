// 数据写路径微基准：全量保存（旧 patch 的代价） vs 字段级 PATCH（新实现）。
// 用法：node scripts/benchmark-patch-write.mjs
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { LocalDataSqliteStore } from "../server/sqliteStorage.mjs";

const PROGRESS_COUNT = 8000;
const FAVORITE_COUNT = 2000;
const TAG_COUNT = 3000;
const RATING_COUNT = 500;

async function createTempStore() {
  const root = await mkdtemp(path.join(os.tmpdir(), "web-player-bench-"));
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
  return { root, store };
}

function buildStore() {
  const progress = {};
  const favorites = [];
  const videoTags = {};
  const videoRatings = {};
  const watchActivity = {};
  for (let index = 0; index < PROGRESS_COUNT; index += 1) {
    progress[`video-${index}`] = {
      currentTime: index % 3600,
      duration: 3600,
      completed: false,
      updatedAt: 1000 + index,
    };
  }
  for (let index = 0; index < FAVORITE_COUNT; index += 1) {
    favorites.push(`video-${index}`);
  }
  for (let index = 0; index < TAG_COUNT; index += 1) {
    videoTags[`video-${index}`] = [`标签A`, `标签B-${index % 20}`, "中文"];
  }
  for (let index = 0; index < RATING_COUNT; index += 1) {
    videoRatings[`video-${index}`] = (index % 10) + 1;
  }
  for (let index = 0; index < 1000; index += 1) {
    const date = `2026-06-${String((index % 28) + 1).padStart(2, "0")}`;
    watchActivity[`${date}::video-${index}`] = {
      date,
      videoId: `video-${index}`,
      watchedSeconds: index * 10,
      playCount: 1,
      completedCount: 0,
      emissionCount: 0,
      updatedAt: 1000 + index,
    };
  }
  return {
    version: 6,
    progress,
    favorites,
    videoTags,
    videoRatings,
    watchActivity,
    actorProfiles: {},
    actorTagDefinitions: {},
    videoActorOverrides: {},
    videoComments: {},
    videoStats: {},
    videoHighlights: {},
    videoEditSegments: {},
    tagMergeDecisions: {},
    embeddedSubtitles: [],
    danmakuSelections: {},
    danmakuPreferences: { enabled: true },
    preferences: { homeMediaMode: "anime" },
    settings: { volume: 0.85, skipFolderAccessPrompt: false },
    duplicateDetections: {},
  };
}

function measure(label, fn) {
  const startedAt = performance.now();
  fn();
  const elapsedMs = performance.now() - startedAt;
  console.log(`${label.padEnd(58)} ${elapsedMs.toFixed(1)} ms`);
  return elapsedMs;
}

async function main() {
  const { root, store } = await createTempStore();
  try {
    await store.initialize();
    const fullStore = buildStore();

    console.log(`数据规模: progress=${PROGRESS_COUNT} favorites=${FAVORITE_COUNT} tags≈${TAG_COUNT * 3} ratings=${RATING_COUNT} watchActivity=1000`);
    console.log("-".repeat(70));

    // 初次全量写入（建库）
    measure("初次 savePlayerDataStore（建库）", () => store.savePlayerDataStore("global", fullStore));

    // 修复前旧 patch 的代价 = loadPlayerDataStore + savePlayerDataStore（全量读改写）
    const loadMs = measure("loadPlayerDataStore（旧 patch 的全量读）", () => store.loadPlayerDataStore("global"));
    const fullSaveMs = measure("savePlayerDataStore（旧 patch 的全量写）", () => store.savePlayerDataStore("global", fullStore));

    // 修复后：字段级 PATCH（只重写传入字段对应的表）
    const patchFavoritesMs = measure("patchPlayerDataStore({ favorites })（新：只写收藏表）", () => {
      store.patchPlayerDataStore("global", { favorites: fullStore.favorites });
    });
    const patchActorMs = measure("patchPlayerDataStore({ actorProfiles })（新：只写演员表）", () => {
      store.patchPlayerDataStore("global", { actorProfiles: { a1: { id: "a1", name: "演员甲", aliases: [], updatedAt: 1 } } });
    });

    console.log("-".repeat(70));
    console.log(`旧 patch 近似代价: ${(loadMs + fullSaveMs).toFixed(1)} ms（读改写全库）`);
    console.log(`新 patch 单字段代价: ${patchFavoritesMs.toFixed(1)} ms（收藏表）`);
    console.log(`提速（favorites 字段）: ${((loadMs + fullSaveMs) / Math.max(patchFavoritesMs, 0.01)).toFixed(1)}x`);

    // 校验 created_at 保留：给收藏制造不同时间戳，再全量保存，确认顺序不变
    store.patchPlayerDataStore("global", { favorites: [fullStore.favorites[0]] });
    const stored1 = store.loadPlayerDataStore("global");
    const firstCreatedAt = stored1.favorites;
    store.patchPlayerDataStore("global", { favorites: [fullStore.favorites[0], fullStore.favorites[1]] });
    const stored2 = store.loadPlayerDataStore("global");
    console.log(`created_at 保留校验: ${stored2.favorites.join(",") === stored1.favorites.concat(fullStore.favorites[1]).join(",") ? "通过" : "失败"}`);
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
