import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const cacheStatusUtils = await importTsModule(new URL("../src/cacheStatusUtils.ts", import.meta.url));

const createItem = (id, overrides = {}) => ({
  id,
  label: id,
  path: id,
  bytes: 10,
  files: 1,
  updatedAt: null,
  ...overrides,
});

test("filters clearable cache status items", () => {
  const items = [createItem("a"), createItem("b", { clearable: false }), createItem("c", { clearable: true })];

  assert.deepEqual(cacheStatusUtils.getClearableCacheStatusItems(items).map((item) => item.id), ["a", "c"]);
  assert.deepEqual(Array.from(cacheStatusUtils.getAvailableCacheItemIds(items)), ["a", "c"]);
});

test("derives selected cache status items", () => {
  const items = [createItem("a"), createItem("b")];

  assert.deepEqual(
    cacheStatusUtils.getSelectedCacheStatusItems(items, new Set(["b", "missing"])).map((item) => item.id),
    ["b"],
  );
});

test("paginates cache status items with bounded pages", () => {
  const items = Array.from({ length: 23 }, (_, index) => createItem(`item-${index}`));

  assert.deepEqual(cacheStatusUtils.getCacheStatusPageState(items, 3), {
    pageCount: 3,
    visiblePage: 3,
    items: items.slice(20, 23),
    start: 21,
    end: 23,
  });
  assert.equal(cacheStatusUtils.getCacheStatusPageState(items, 99).visiblePage, 3);
  assert.equal(cacheStatusUtils.getCacheStatusPageState([], 1).start, 0);
});

test("toggles cache item selection", () => {
  assert.deepEqual(Array.from(cacheStatusUtils.toggleCacheItemSelection(new Set(["a"]), "b", true)).sort(), ["a", "b"]);
  assert.deepEqual(Array.from(cacheStatusUtils.toggleCacheItemSelection(new Set(["a", "b"]), "a", false)), ["b"]);
});

test("toggles all clearable cache items", () => {
  const items = [createItem("a"), createItem("b")];

  assert.deepEqual(Array.from(cacheStatusUtils.toggleAllCacheItemSelection(new Set(["a"]), items)), ["a", "b"]);
  assert.deepEqual(Array.from(cacheStatusUtils.toggleAllCacheItemSelection(new Set(["a", "b"]), items)), []);
  const previous = new Set(["a"]);
  assert.equal(cacheStatusUtils.toggleAllCacheItemSelection(previous, []), previous);
});
