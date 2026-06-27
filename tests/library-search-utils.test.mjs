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

const createVideo = (overrides) => ({
  id: "root-special|actor/test.mp4|100|1",
  name: "test.mp4",
  relativePath: "模特小雨/test.mp4",
  mediaRootId: "root-special",
  size: 100,
  lastModified: 1,
  url: "/video/test.mp4",
  ...overrides,
});

const createSearchContext = (overrides = {}) => ({
  mediaRootLabelsById: { "root-special": "国产AV", "root-anime": "Anime" },
  progressByVideoId: {},
  favoriteVideoIds: new Set(),
  videoTags: {},
  ...overrides,
});

test("special mode returns only tagged videos instead of the whole actor folder", () => {
  const videos = [
    createVideo({ id: "root-special|模特小雨/a.mp4|100|1", name: "a.mp4", relativePath: "模特小雨/a.mp4" }),
    createVideo({ id: "root-special|模特小雨/b.mp4|100|2", name: "b.mp4", relativePath: "模特小雨/b.mp4", lastModified: 2 }),
  ];

  const results = librarySearchUtils.searchLibraryEntries("a", videos, {
    mode: "special",
    ...createSearchContext({
      videoTags: {
        [videos[0].id]: ["a"],
        [videos[1].id]: ["b"],
      },
    }),
  });

  assert.deepEqual(
    results.map((result) => ({ kind: result.kind, key: result.key, videoId: result.representativeVideo.id })),
    [{ kind: "video", key: videos[0].id, videoId: videos[0].id }],
  );
});

test("special mode combines media root folder and user tag as default searchable labels", () => {
  const videos = [
    createVideo({
      id: "root-special|模特小雨/test.mp4|100|1",
      name: "test.mp4",
      relativePath: "模特小雨/test.mp4",
    }),
    createVideo({
      id: "root-special|模特小雨/other.mp4|100|2",
      name: "other.mp4",
      relativePath: "模特小雨/other.mp4",
      lastModified: 2,
    }),
  ];

  const results = librarySearchUtils.searchLibraryEntries("国产 小雨 a", videos, {
    mode: "special",
    ...createSearchContext({
      videoTags: {
        [videos[0].id]: ["a", "b", "c"],
        [videos[1].id]: ["b", "c"],
      },
    }),
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].kind, "video");
  assert.equal(results[0].representativeVideo.id, videos[0].id);
});

test("special mode can search by tag filters without text query", () => {
  const videos = [
    createVideo({ id: "root-special|actor/a.mp4|100|1", name: "a.mp4", relativePath: "actor/a.mp4" }),
    createVideo({ id: "root-special|actor/b.mp4|100|2", name: "b.mp4", relativePath: "actor/b.mp4", lastModified: 2 }),
  ];

  const results = librarySearchUtils.searchLibraryEntries("", videos, {
    mode: "special",
    ...createSearchContext({
      tagFilters: ["剧情"],
      videoTags: {
        [videos[0].id]: ["剧情", "长镜头"],
        [videos[1].id]: ["动作"],
      },
    }),
  });

  assert.deepEqual(
    results.map((result) => ({ kind: result.kind, videoId: result.representativeVideo.id, reason: result.reason })),
    [{ kind: "video", videoId: videos[0].id, reason: "标签筛选" }],
  );
});

test("all and anime modes keep folder-level library search results", () => {
  const videos = [
    createVideo({ id: "root-anime|show/01.mp4|100|1", name: "01.mp4", relativePath: "show/01.mp4", mediaRootId: "root-anime" }),
    createVideo({ id: "root-anime|show/02.mp4|100|2", name: "02.mp4", relativePath: "show/02.mp4", mediaRootId: "root-anime", lastModified: 2 }),
  ];

  const results = librarySearchUtils.searchLibraryEntries("show", videos, {
    mode: "anime",
    ...createSearchContext({
      videoTags: {
        [videos[0].id]: ["a"],
        [videos[1].id]: ["b"],
      },
    }),
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].kind, "folder");
  assert.equal(results[0].key, "root-anime:show");
  assert.deepEqual(
    results[0].videos.map(({ video }) => video.id),
    [videos[0].id, videos[1].id],
  );
});

test("AI matches hydrate as videos in special mode and folders otherwise", () => {
  const videos = [
    createVideo({ id: "root-special|actor/one.mp4|100|1", name: "one.mp4", relativePath: "actor/one.mp4" }),
    createVideo({ id: "root-special|actor/two.mp4|100|2", name: "two.mp4", relativePath: "actor/two.mp4", lastModified: 2 }),
  ];
  const context = createSearchContext();

  const specialResults = librarySearchUtils.createAiLibrarySearchResults(["root-special|actor/one.mp4|100|1", "root-special|actor/two.mp4|100|2"], videos, {
    mode: "special",
    ...context,
  });
  const allResults = librarySearchUtils.createAiLibrarySearchResults(["root-special|actor/one.mp4|100|1", "root-special|actor/two.mp4|100|2"], videos, {
    mode: "all",
    ...context,
  });

  assert.deepEqual(specialResults.map((result) => result.kind), ["video", "video"]);
  assert.equal(allResults.length, 1);
  assert.equal(allResults[0].kind, "folder");
});
