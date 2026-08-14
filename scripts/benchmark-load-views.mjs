// 启动数据加载基准：全量 vs startup vs deferred 视图的 SQL 查询次数。
// 用法：node scripts/benchmark-load-views.mjs
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { LocalDataSqliteStore } from "../server/sqliteStorage.mjs";

const PROGRESS_COUNT = 8000;

async function createTempStore() {
  const root = await mkdtemp(path.join(os.tmpdir(), "web-player-load-"));
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

function countQueries(store, fn) {
  const originalPrepare = store.db.prepare.bind(store.db);
  let count = 0;
  store.db.prepare = (sql) => {
    count += 1;
    return originalPrepare(sql);
  };
  try {
    fn();
  } finally {
    store.db.prepare = originalPrepare;
  }
  return count;
}

async function main() {
  const { root, store } = await createTempStore();
  try {
    await store.initialize();
    const progress = {};
    const favorites = [];
    const videoTags = {};
    const videoHighlights = {};
    for (let index = 0; index < PROGRESS_COUNT; index += 1) {
      progress[`video-${index}`] = { currentTime: index, duration: 3600, completed: false, updatedAt: 1 };
      videoTags[`video-${index}`] = ["标签A", "标签B"];
      if (index < 2000) favorites.push(`video-${index}`);
      if (index < 500) videoHighlights[`video-${index}`] = [{ id: `h${index}`, startTime: 1, endTime: 2, updatedAt: 1 }];
    }
    store.savePlayerDataStore("global", {
      version: 6,
      progress,
      favorites,
      videoTags,
      videoHighlights,
      embeddedSubtitles: [],
    });

    console.log(`数据规模: progress=${PROGRESS_COUNT} favorites=2000 tags≈16000 highlights=500`);
    console.log("-".repeat(60));
    const fullQueries = countQueries(store, () => store.loadPlayerDataStore("global"));
    const startupQueries = countQueries(store, () => store.loadPlayerDataStore("global", "startup"));
    const deferredQueries = countQueries(store, () => store.loadPlayerDataStore("global", "deferred"));
    console.log(`全量加载（旧实现每次视图请求的代价）: ${fullQueries} 条 SQL`);
    console.log(`startup 视图（新）                 : ${startupQueries} 条 SQL`);
    console.log(`deferred 视图（新）                : ${deferredQueries} 条 SQL`);
    console.log("-".repeat(60));
    console.log(`deferred 查询减少: ${((1 - deferredQueries / fullQueries) * 100).toFixed(0)}%`);
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
