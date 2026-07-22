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
  assert.deepEqual(cache.stats(), { entries: 1, bytes: 9 });
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
  assert.deepEqual(cache.stats(), { entries: 0, bytes: 0 });
});

test("thumbnail memory cache set, invalidate and clear keep entries coherent", async () => {
  const cache = createThumbnailMemoryCache();
  cache.set("one", Buffer.from("one"), "image/webp");
  cache.set("two", Buffer.from("two"));

  assert.equal((await cache.getOrLoad({ thumbnailId: "one", filePath: "unused" })).contentType, "image/webp");
  assert.equal(cache.invalidate("one"), true);
  assert.deepEqual(cache.stats(), { entries: 1, bytes: 3 });
  cache.clear();
  assert.deepEqual(cache.stats(), { entries: 0, bytes: 0 });
});
