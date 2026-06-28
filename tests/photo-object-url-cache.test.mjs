import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const cache = await importTsModule(new URL("../src/photoObjectUrlCache.ts", import.meta.url));

test("photo object url cache returns the existing map when within the limit", () => {
  const urls = { a: "blob:a", b: "blob:b" };
  const accessTimes = { a: 10, b: 20 };
  const revoked = [];

  const result = cache.prunePhotoObjectUrlCache({
    urls,
    accessTimes,
    protectedIds: new Set(),
    decodedImageIds: new Set(["a", "b"]),
    limit: 2,
    revokeObjectUrl: (url) => revoked.push(url),
  });

  assert.equal(result, urls);
  assert.deepEqual(accessTimes, { a: 10, b: 20 });
  assert.deepEqual(revoked, []);
});

test("photo object url cache evicts least recently accessed unprotected urls", () => {
  const urls = {
    stale: "blob:stale",
    keep: "blob:keep",
    recent: "blob:recent",
    protected: "blob:protected",
  };
  const accessTimes = {
    stale: 1,
    keep: 2,
    recent: 4,
    protected: 0,
  };
  const decodedImageIds = new Set(["stale", "keep", "recent", "protected"]);
  const revoked = [];

  const result = cache.prunePhotoObjectUrlCache({
    urls,
    accessTimes,
    protectedIds: new Set(["protected"]),
    decodedImageIds,
    limit: 2,
    revokeObjectUrl: (url) => revoked.push(url),
  });

  assert.notEqual(result, urls);
  assert.deepEqual(result, {
    recent: "blob:recent",
    protected: "blob:protected",
  });
  assert.deepEqual(accessTimes, {
    recent: 4,
    protected: 0,
  });
  assert.deepEqual([...decodedImageIds].sort(), ["protected", "recent"]);
  assert.deepEqual(revoked, ["blob:stale", "blob:keep"]);
});

test("photo object url cache keeps protected urls even when the limit cannot be reached", () => {
  const urls = {
    first: "blob:first",
    second: "blob:second",
  };
  const accessTimes = {
    first: 1,
    second: 2,
  };
  const decodedImageIds = new Set(["first", "second"]);
  const revoked = [];

  const result = cache.prunePhotoObjectUrlCache({
    urls,
    accessTimes,
    protectedIds: new Set(["first", "second"]),
    decodedImageIds,
    limit: 1,
    revokeObjectUrl: (url) => revoked.push(url),
  });

  assert.deepEqual(result, urls);
  assert.deepEqual(accessTimes, { first: 1, second: 2 });
  assert.deepEqual([...decodedImageIds].sort(), ["first", "second"]);
  assert.deepEqual(revoked, []);
});
