import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const cache = await importTsModule(new URL("../src/photoObjectUrlCache.ts", import.meta.url));

test("prunes the least recently used photo object urls", () => {
  const originalRevoke = URL.revokeObjectURL;
  const revoked = [];
  URL.revokeObjectURL = (url) => {
    revoked.push(url);
  };

  try {
    const urls = {};
    const accessTimes = {};
    const metadata = {};
    const decodedImageIds = new Set();
    for (let index = 0; index < cache.photoObjectUrlCacheLimit + 2; index += 1) {
      const id = `image-${index}`;
      urls[id] = `blob:${id}`;
      accessTimes[id] = index;
      metadata[id] = { bytes: 1, createdAt: index, decoded: true, lastAccessedAt: index };
      decodedImageIds.add(id);
    }

    const protectedId = `image-${cache.photoObjectUrlCacheLimit + 1}`;
    const result = cache.prunePhotoObjectUrlCache(urls, accessTimes, metadata, new Set([protectedId]), decodedImageIds);

    assert.equal(Object.keys(result).length, cache.photoObjectUrlCacheLimit);
    assert.deepEqual(revoked, ["blob:image-0", "blob:image-1"]);
    assert.equal(result["image-0"], undefined);
    assert.equal(result[protectedId], `blob:${protectedId}`);
    assert.equal(accessTimes["image-0"], undefined);
    assert.equal(metadata["image-0"], undefined);
    assert.equal(decodedImageIds.has("image-0"), false);
  } finally {
    URL.revokeObjectURL = originalRevoke;
  }
});

test("returns the original cache when it is under the limit", () => {
  const urls = { a: "blob:a" };
  const metadata = { a: { bytes: 1, createdAt: 1, decoded: false, lastAccessedAt: 1 } };
  const result = cache.prunePhotoObjectUrlCache(urls, { a: 1 }, metadata, new Set());

  assert.equal(result, urls);
});

test("prunes photo object urls when their total bytes exceed the limit", () => {
  const originalRevoke = URL.revokeObjectURL;
  URL.revokeObjectURL = () => undefined;
  try {
    const urls = { large: "blob:large" };
    const accessTimes = { large: 1 };
    const metadata = {
      large: {
        bytes: cache.photoObjectUrlCacheByteLimit + 1,
        createdAt: 1,
        decoded: true,
        lastAccessedAt: 1,
      },
    };
    const decodedImageIds = new Set(["large"]);

    const result = cache.prunePhotoObjectUrlCache(urls, accessTimes, metadata, new Set(), decodedImageIds);

    assert.deepEqual(result, {});
    assert.deepEqual(metadata, {});
    assert.equal(decodedImageIds.has("large"), false);
  } finally {
    URL.revokeObjectURL = originalRevoke;
  }
});
