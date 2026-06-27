import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const librarySearchUtils = await importTsModule(new URL("../src/librarySearchUtils.ts", import.meta.url));

const createResults = (count) => Array.from({ length: count }, (_, index) => ({ key: `result-${index}` }));

test("keeps all library search results when no limit is provided", () => {
  const results = createResults(30);

  assert.deepEqual(
    librarySearchUtils.applyLibrarySearchResultLimit(results).map((result) => result.key),
    results.map((result) => result.key),
  );
});

test("limits library search results only when an explicit limit is provided", () => {
  const results = createResults(30);

  assert.deepEqual(
    librarySearchUtils.applyLibrarySearchResultLimit(results, 3).map((result) => result.key),
    ["result-0", "result-1", "result-2"],
  );
});

test("derives the visible library search result window for incremental rendering", () => {
  const results = createResults(30);
  const state = librarySearchUtils.getVisibleLibrarySearchResults(results, 24);

  assert.equal(state.visibleResults.length, 24);
  assert.equal(state.hasMoreResults, true);
  assert.equal(state.visibleResults.at(-1).key, "result-23");
});

test("reports no remaining library search results when all results are visible", () => {
  const results = createResults(12);
  const state = librarySearchUtils.getVisibleLibrarySearchResults(results, 24);

  assert.equal(state.visibleResults.length, 12);
  assert.equal(state.hasMoreResults, false);
});
