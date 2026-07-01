import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const browserMediaScan = await importTsModule(new URL("../src/browserMediaScan.ts", import.meta.url));

const createFile = (overrides = {}) => ({
  name: overrides.name ?? "movie.mp4",
  size: overrides.size ?? 60 * 1024 * 1024,
  lastModified: overrides.lastModified ?? 1,
  webkitRelativePath: overrides.webkitRelativePath,
  ...overrides,
});

test("collects dropped browser videos and subtitles", () => {
  const originalCreateObjectUrl = URL.createObjectURL;
  URL.createObjectURL = (file) => `blob:${file.name}`;

  try {
    const media = browserMediaScan.collectVideosFromFiles([
      createFile({ name: "episode.mp4", webkitRelativePath: "Show/episode.mp4" }),
      createFile({ name: "episode.srt", size: 200, webkitRelativePath: "Show/episode.srt" }),
      createFile({ name: "tiny.mp4", size: 1024, webkitRelativePath: "Show/tiny.mp4" }),
      createFile({ name: "cover.jpg", size: 1024, webkitRelativePath: "Show/cover.jpg" }),
    ]);

    assert.equal(media.scannedFiles, 3);
    assert.equal(media.filteredSmallVideos, 1);
    assert.deepEqual(media.videos.map((video) => video.relativePath), ["Show/episode.mp4"]);
    assert.deepEqual(media.subtitles.map((subtitle) => subtitle.relativePath), ["Show/episode.srt"]);
    assert.equal(media.videos[0].url, "blob:episode.mp4");
  } finally {
    URL.createObjectURL = originalCreateObjectUrl;
  }
});

test("resolves browser video parent directories", async () => {
  const leaf = { name: "Season 1" };
  const root = {
    name: "Root",
    async getDirectoryHandle(name) {
      assert.equal(name, "Season 1");
      return leaf;
    },
  };

  const parent = await browserMediaScan.resolveBrowserVideoParentDirectory(root, "Season 1/Episode 01.mp4");

  assert.equal(parent, leaf);
});
