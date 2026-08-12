import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const search = await importTsModule(new URL("../src/playerPlaylistSearch.ts", import.meta.url));

test("normalizes case, full-width text, path separators, whitespace, and traditional Chinese", () => {
  assert.equal(search.normalizePlaylistSearchText("  ＡＮＩＭＥ\\動畫   Final  "), "anime/动画 final");
});

test("parses quoted phrases, recovers unmatched quotes, and removes duplicate tokens", () => {
  assert.deepEqual(
    search.parsePlaylistSearchQuery('  "最终 回"  喜多 喜多 "動畫').map((token) => token.normalized),
    ["最终 回", "喜多", "动画"],
  );
  assert.deepEqual(search.parsePlaylistSearchQuery('"-3D" >11').map((token) => token.normalized), ["-3d", ">11"]);
});

test("matches all query tokens across different metadata fields while preserving playlist order", () => {
  const videos = [{ id: "first" }, { id: "second" }, { id: "third" }];
  const documents = search.createPlaylistSearchDocuments([
    { id: "first", title: "孤独摇滚 08", path: "Anime/Bocchi/08.mkv", actors: ["青山吉能"] },
    { id: "second", title: "孤独摇滚 01", path: "Anime/Bocchi/01.mkv", actors: ["喜多郁代"] },
    { id: "third", title: "其他作品", path: "Anime/Other.mkv", tags: ["喜多"] },
  ]);

  const result = search.searchPlaylistVideos(videos, documents, "孤独 喜多");

  assert.deepEqual(result.videos, [videos[1]]);
  assert.deepEqual(result.matchesByVideoId.get("second").reasons, [
    { field: "actor", label: "演员", value: "喜多郁代" },
  ]);
});

test("matches actor aliases, comments, highlight descriptions, library names, and traditional Chinese queries", () => {
  const videos = [{ id: "video" }];
  const documents = search.createPlaylistSearchDocuments([
    {
      id: "video",
      title: "动画短片",
      path: "Short/clip.mp4",
      actorAliases: ["Aoyama Yoshino"],
      comment: "最终回镜头很好",
      highlightDescriptions: ["天台上的吉他独奏"],
      library: "特别收藏",
    },
  ]);

  assert.deepEqual(search.searchPlaylistVideos(videos, documents, "動畫").videos, videos);
  assert.equal(search.searchPlaylistVideos(videos, documents, '"最终回" yoshino 特别').videos.length, 1);
  assert.deepEqual(search.searchPlaylistVideos(videos, documents, "吉他独奏").matchesByVideoId.get("video").reasons, [
    { field: "highlight", label: "高能片段", value: "天台上的吉他独奏" },
  ]);
});

test("supports pipe-separated alternatives while keeping space-separated terms required", () => {
  const videos = [{ id: "first" }, { id: "second" }, { id: "third" }];
  const documents = search.createPlaylistSearchDocuments([
    { id: "first", title: "孤独摇滚", path: "Anime/Bocchi.mkv", tags: ["喜剧"] },
    { id: "second", title: "轻音少女", path: "Anime/K-On.mkv", tags: ["喜剧"] },
    { id: "third", title: "轻音少女", path: "Anime/K-On.mkv", tags: ["音乐"] },
  ]);

  assert.deepEqual(search.searchPlaylistVideos(videos, documents, "孤独|轻音 喜剧").videos, [videos[0], videos[1]]);
  assert.deepEqual(search.searchPlaylistVideos(videos, documents, "孤独 | 轻音 喜剧").videos, [videos[0], videos[1]]);
});

test("returns non-title reasons but suppresses redundant path reasons for title matches", () => {
  const videos = [{ id: "video" }];
  const documents = search.createPlaylistSearchDocuments([
    { id: "video", title: "Final Episode", path: "Show/Final Episode.mkv", tags: ["Final"] },
  ]);

  const titleResult = search.searchPlaylistVideos(videos, documents, "Final");
  const pathResult = search.searchPlaylistVideos(videos, documents, "Show");

  assert.deepEqual(titleResult.matchesByVideoId.get("video").reasons, []);
  assert.deepEqual(pathResult.matchesByVideoId.get("video").reasons, [
    { field: "path", label: "路径", value: "Show/Final Episode.mkv" },
  ]);
});

test("returns the original list and no match metadata for an empty query", () => {
  const videos = [{ id: "video" }];
  const result = search.searchPlaylistVideos(videos, new Map(), "  ");

  assert.equal(result.videos, videos);
  assert.equal(result.matchesByVideoId.size, 0);
});

test("excludes exact normalized tags with the minus syntax", () => {
  const videos = [{ id: "3d" }, { id: "3dcg" }, { id: "plain" }];
  const documents = search.createPlaylistSearchDocuments([
    { id: "3d", title: "Movie", path: "3d.mkv", tags: ["３Ｄ"] },
    { id: "3dcg", title: "Movie", path: "3dcg.mkv", tags: ["3DCG"] },
    { id: "plain", title: "Movie", path: "plain.mkv", tags: ["科幻"] },
  ]);

  assert.deepEqual(search.searchPlaylistVideos(videos, documents, "-3D").videos, [videos[1], videos[2]]);
  assert.deepEqual(search.searchPlaylistVideos(videos, documents, "Movie -科幻").videos, [videos[0], videos[1]]);
});

test("filters user scores with comparison syntax and excludes unrated videos", () => {
  const videos = [{ id: "high" }, { id: "edge" }, { id: "low" }, { id: "unrated" }];
  const documents = search.createPlaylistSearchDocuments([
    { id: "high", title: "High", path: "high.mkv", score: 9 },
    { id: "edge", title: "Edge", path: "edge.mkv", score: 8 },
    { id: "low", title: "Low", path: "low.mkv", score: 6.5 },
    { id: "unrated", title: "Unrated", path: "unrated.mkv" },
  ]);

  assert.deepEqual(search.searchPlaylistVideos(videos, documents, ">8").videos, [videos[0]]);
  assert.deepEqual(search.searchPlaylistVideos(videos, documents, ">=8").videos, [videos[0], videos[1]]);
  assert.deepEqual(search.searchPlaylistVideos(videos, documents, ">=7 <9").videos, [videos[1]]);
});
