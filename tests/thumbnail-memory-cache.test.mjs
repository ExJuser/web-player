import assert from "node:assert/strict";
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
