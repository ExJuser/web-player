import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createThumbnailMemoryCache } from "../server/thumbnailMemoryCache.mjs";

test("thumbnail memory cache loads once and serves subsequent reads from memory", async () => {
  let readCount = 0;
  const cache = createThumbnailMemoryCache({
    readFileImpl: async () => {
      readCount += 1;
      return Buffer.from("thumbnail");
    },
  });

  const first = await cache.getOrLoad({ thumbnailId: "one", filePath: "one.blob" });
  const second = await cache.getOrLoad({ thumbnailId: "one", filePath: "one.blob" });

  assert.equal(first.cacheStatus, "MISS");
  assert.equal(second.cacheStatus, "HIT");
  assert.equal(second.buffer.toString(), "thumbnail");
  assert.equal(readCount, 1);
  assert.deepEqual(cache.stats(), { entries: 1, bytes: 9, hits: 1, misses: 1, coalesced: 0, diskReads: 1 });
});

test("thumbnail memory cache warms every persisted thumbnail before requests", async () => {
  const cacheRoot = await mkdtemp(path.join(tmpdir(), "web-player-thumbnail-memory-"));
  try {
    await Promise.all([
      writeFile(path.join(cacheRoot, "one.blob"), "one"),
      writeFile(path.join(cacheRoot, "two.blob"), "two"),
      writeFile(path.join(cacheRoot, "ignored.txt"), "ignored"),
    ]);

    const cache = createThumbnailMemoryCache();
    const result = await cache.warmDirectory({ cacheRoot, concurrency: 2 });

    assert.deepEqual(result, { loaded: 2, failed: 0, entries: 2, bytes: 6 });
    assert.equal((await cache.getOrLoad({ thumbnailId: "one", filePath: path.join(cacheRoot, "one.blob") })).cacheStatus, "HIT");
    assert.equal((await cache.getOrLoad({ thumbnailId: "two", filePath: path.join(cacheRoot, "two.blob") })).cacheStatus, "HIT");
  } finally {
    await rm(cacheRoot, { recursive: true, force: true });
  }
});

test("thumbnail memory cache warmup is bounded by the file limit", async () => {
  const cacheRoot = await mkdtemp(path.join(tmpdir(), "web-player-thumbnail-memory-"));
  try {
    await Promise.all([
      writeFile(path.join(cacheRoot, "one.blob"), "one"),
      writeFile(path.join(cacheRoot, "two.blob"), "two"),
      writeFile(path.join(cacheRoot, "three.blob"), "three"),
    ]);

    const cache = createThumbnailMemoryCache();
    const result = await cache.warmDirectory({ cacheRoot, concurrency: 2, maxFiles: 2 });

    assert.equal(result.loaded, 2);
    assert.equal(result.failed, 0);
    assert.equal(result.entries, 2);
    // 目录枚举顺序不保证，只校验结果集大小：恰好 2 份命中、1 份未预热（首次读取仍走磁盘）。
    const ids = ["one", "two", "three"];
    const statuses = await Promise.all(ids.map((id) =>
      cache.getOrLoad({ thumbnailId: id, filePath: path.join(cacheRoot, `${id}.blob`) }).then((entry) => entry.cacheStatus)));
    assert.equal(statuses.filter((status) => status === "HIT").length, 2);
    assert.equal(statuses.filter((status) => status === "MISS").length, 1);
  } finally {
    await rm(cacheRoot, { recursive: true, force: true });
  }
});

test("thumbnail memory cache coalesces concurrent disk reads and obeys byte limits", async () => {
  let resolveRead;
  let readCount = 0;
  const cache = createThumbnailMemoryCache({
    maxBytes: 4,
    readFileImpl: async () => {
      readCount += 1;
      return new Promise((resolve) => {
        resolveRead = resolve;
      });
    },
  });

  const first = cache.getOrLoad({ thumbnailId: "large", filePath: "large.blob" });
  const second = cache.getOrLoad({ thumbnailId: "large", filePath: "large.blob" });
  resolveRead(Buffer.from("large"));
  await Promise.all([first, second]);

  assert.equal(readCount, 1);
  assert.deepEqual(cache.stats(), { entries: 0, bytes: 0, hits: 0, misses: 1, coalesced: 1, diskReads: 1 });
});

test("thumbnail memory cache set, invalidate and clear keep entries coherent", async () => {
  const cache = createThumbnailMemoryCache();
  cache.set("one", Buffer.from("one"), "image/webp");
  cache.set("two", Buffer.from("two"));

  assert.equal((await cache.getOrLoad({ thumbnailId: "one", filePath: "unused" })).contentType, "image/webp");
  assert.equal(cache.invalidate("one"), true);
  assert.deepEqual(cache.stats(), { entries: 1, bytes: 3, hits: 1, misses: 0, coalesced: 0, diskReads: 0 });
  cache.clear();
  assert.deepEqual(cache.stats(), { entries: 0, bytes: 0, hits: 0, misses: 0, coalesced: 0, diskReads: 0 });
});
