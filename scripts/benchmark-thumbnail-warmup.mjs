// 缩略图内存缓存启动预热基准：全盘预热（旧行为，阻塞 dev server 启动）
// vs 按缓存容量封顶预热（新行为，后台执行）。
// 用法：node scripts/benchmark-thumbnail-warmup.mjs
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createThumbnailMemoryCache } from "../server/thumbnailMemoryCache.mjs";

const FILE_COUNT = 5000;
const FILE_BYTES = 8 * 1024;
const THUMBNAIL_BYTES = FILE_COUNT * FILE_BYTES;

async function createCacheDirectory() {
  const root = await mkdtemp(path.join(os.tmpdir(), "web-player-thumb-warmup-"));
  const cacheRoot = path.join(root, "thumbnails");
  await mkdir(cacheRoot, { recursive: true });
  const sample = Buffer.alloc(FILE_BYTES, 0xab);
  const writes = [];
  for (let index = 0; index < FILE_COUNT; index += 1) {
    writes.push(writeFile(path.join(cacheRoot, `video-${index}.${index % 7}.blob`), sample));
  }
  await Promise.all(writes);
  return { root, cacheRoot };
}

async function timeWarmup(label, cacheRoot, options) {
  const cache = createThumbnailMemoryCache();
  const startedAt = performance.now();
  const result = await cache.warmDirectory({ cacheRoot, ...options });
  const elapsedMs = performance.now() - startedAt;
  console.log(`${label}: ${elapsedMs.toFixed(0)}ms（读入 ${result.loaded} 份，缓存保留 ${result.entries} 份，${(result.bytes / 1024 / 1024).toFixed(1)}MB）`);
  return elapsedMs;
}

async function main() {
  const { root, cacheRoot } = await createCacheDirectory();
  try {
    console.log(`模拟缩略图缓存目录: ${FILE_COUNT} 份 × ${FILE_BYTES}B = ${(THUMBNAIL_BYTES / 1024 / 1024).toFixed(0)}MB`);
    console.log("-".repeat(64));
    const fullMs = await timeWarmup("全盘预热（旧：阻塞启动）   ", cacheRoot, { concurrency: 16, maxFiles: Number.POSITIVE_INFINITY });
    const boundedMs = await timeWarmup("容量封顶预热（新：后台执行）", cacheRoot, { concurrency: 16, maxFiles: 4096 });
    console.log("-".repeat(64));
    console.log(`预热时间减少: ${((1 - boundedMs / fullMs) * 100).toFixed(0)}%（封顶后不再读取缓存容不下、注定被 LRU 淘汰的文件）`);
    console.log(`阻塞时长减少: 旧实现 dev server 启动需等待 ${fullMs.toFixed(0)}ms；新实现为后台任务，启动不等待（0ms 阻塞）`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
