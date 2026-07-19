import assert from "node:assert/strict";
import test from "node:test";

import { BoundedLruCache } from "../server/boundedLruCache.mjs";

test("bounded lru cache updates recency and evicts the oldest entry", () => {
  const cache = new BoundedLruCache({ maxEntries: 2, maxBytes: 10 });
  cache.set("a", 1, 3);
  cache.set("b", 2, 3);
  assert.equal(cache.get("a"), 1);

  cache.set("c", 3, 3);

  assert.equal(cache.get("b"), undefined);
  assert.equal(cache.get("a"), 1);
  assert.deepEqual(cache.stats(), { entries: 2, bytes: 6 });
});

test("bounded lru cache rejects entries larger than its byte budget", () => {
  const cache = new BoundedLruCache({ maxEntries: 2, maxBytes: 4 });
  assert.equal(cache.set("large", {}, 5), false);
  assert.deepEqual(cache.stats(), { entries: 0, bytes: 0 });
});
