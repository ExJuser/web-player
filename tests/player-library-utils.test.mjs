import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const libraryUtils = await importTsModule(new URL("../src/playerLibraryUtils.ts", import.meta.url));

test("classifies supported media files and ignored local videos", () => {
  assert.equal(libraryUtils.isVideoFile("Movie.MKV"), true);
  assert.equal(libraryUtils.isVideoFile("Movie.txt"), false);
  assert.equal(libraryUtils.isSubtitleFile("Episode.VTT"), true);
  assert.equal(libraryUtils.isPhotoFile("cover.WEBP"), true);
  assert.equal(libraryUtils.isPhotoFile("cover.svg"), false);

  assert.equal(libraryUtils.isIgnoredVideoFile("theme_video.mp4"), true);
  assert.equal(libraryUtils.isIgnoredVideoFile("Trailer.MKV"), true);
  assert.equal(libraryUtils.isIgnoredVideoFile("episode01.mp4"), false);
  assert.equal(libraryUtils.shouldFilterLocalVideoFile("episode01.mp4", 10), true);
  assert.equal(libraryUtils.shouldFilterLocalVideoFile("episode01.mp4", 60 * 1024 * 1024), false);
});

test("normalizes object URLs and base paths", () => {
  assert.equal(libraryUtils.isObjectUrl("blob:http://local/id"), true);
  assert.equal(libraryUtils.isObjectUrl("/api/media"), false);
  assert.equal(libraryUtils.basePathOf("Show/E01.SRT"), "show/e01");
  assert.equal(libraryUtils.basePathOf("Show/E01"), "show/e01");
});

test("creates stable media ids", () => {
  const file = { size: 1024, lastModified: 1700000000000 };

  assert.equal(libraryUtils.createLegacyVideoId("Show/E01.mkv", file), "Show/E01.mkv|1024|1700000000000");
  assert.equal(libraryUtils.createGlobalVideoId("root-1", "Show/E01.mkv", file), "root-1|Show/E01.mkv|1024|1700000000000");
  assert.equal(libraryUtils.createPhotoAlbumFolderId("photo-root", "Album A"), "photo-root|Album A");
});

test("hashes strings and sanitizes library names", () => {
  assert.equal(libraryUtils.hashString("Anime"), libraryUtils.hashString("Anime"));
  assert.notEqual(libraryUtils.hashString("Anime"), libraryUtils.hashString("anime"));
  assert.equal(libraryUtils.sanitizeLibraryName(" My Anime Library! "), "My-Anime-Library");
  assert.equal(libraryUtils.sanitizeLibraryName("中文片库"), "library");
  assert.equal(libraryUtils.sanitizeLibraryName("a".repeat(80)), "a".repeat(48));
});
