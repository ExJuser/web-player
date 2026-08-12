import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const { LibrarySearchIndex } = await importTsModule(new URL("../src/librarySearchIndex.ts", import.meta.url));

const records = [
  { id: "a", title: "孤独摇滚 第08集", path: "Anime/Bocchi/08.mkv", tags: ["中文字幕"], score: 9 },
  { id: "b", title: "其他动画", path: "Anime/Other.mkv", actors: ["喜多郁代"], score: 7 },
  { id: "c", title: "最终回", path: "Special/Final.mkv", tags: ["高清"], score: 8 },
];

test("trigram candidates preserve exact search behavior and record order", () => {
  const index = new LibrarySearchIndex();
  index.initialize(records);
  assert.deepEqual(index.search("孤独 08").videos.map((video) => video.id), ["a"]);
  assert.deepEqual(index.search("動畫").videos.map((video) => video.id), ["b"]);
  assert.deepEqual(index.search(">=8 -高清").videos.map((video) => video.id), ["a"]);
  assert.deepEqual(index.search("孤独|最终").videos.map((video) => video.id), ["a", "c"]);
});

test("search index supports scope and incremental patches", () => {
  const index = new LibrarySearchIndex();
  index.initialize(records);
  index.setScope(["b", "c"]);
  assert.deepEqual(index.search("动画").videos.map((video) => video.id), ["b"]);
  index.patch([{ ...records[1], title: "喜多的新作品" }], ["c"]);
  assert.deepEqual(index.search("喜多").videos.map((video) => video.id), ["b"]);
  assert.equal(index.size, 2);
});
