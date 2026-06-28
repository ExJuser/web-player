import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const browserFileMedia = await importTsModule(new URL("../src/browserFileMedia.ts", import.meta.url));

function createFile(name, options = {}) {
  return {
    name,
    size: options.size ?? 80 * 1024 * 1024,
    lastModified: options.lastModified ?? 100,
    webkitRelativePath: options.webkitRelativePath,
  };
}

test("collectVideosFromFiles classifies videos and subtitles from dropped files", () => {
  const createdUrls = [];
  const media = browserFileMedia.collectVideosFromFiles(
    [
      createFile("Episode 02.mkv", { webkitRelativePath: "Show\\Episode 02.mkv", lastModified: 2 }),
      createFile("Episode 01.mp4", { webkitRelativePath: "Show/Episode 01.mp4", lastModified: 1 }),
      createFile("Episode 01.srt", { webkitRelativePath: "Show/Episode 01.srt", size: 1024, lastModified: 3 }),
      createFile("notes.txt", { size: 512 }),
    ],
    {
      createObjectUrl: (file) => {
        createdUrls.push(file.name);
        return `blob:${file.name}`;
      },
    },
  );

  assert.equal(media.scannedFiles, 3);
  assert.equal(media.filteredSmallVideos, 0);
  assert.deepEqual(
    media.videos.map((video) => ({
      id: video.id,
      name: video.name,
      relativePath: video.relativePath,
      url: video.url,
      playbackSource: video.playbackSource,
    })),
    [
      {
        id: "Show/Episode 01.mp4|83886080|1",
        name: "Episode 01.mp4",
        relativePath: "Show/Episode 01.mp4",
        url: "blob:Episode 01.mp4",
        playbackSource: "browser",
      },
      {
        id: "Show/Episode 02.mkv|83886080|2",
        name: "Episode 02.mkv",
        relativePath: "Show/Episode 02.mkv",
        url: "blob:Episode 02.mkv",
        playbackSource: "browser",
      },
    ],
  );
  assert.deepEqual(media.subtitles.map((subtitle) => ({
    id: subtitle.id,
    name: subtitle.name,
    relativePath: subtitle.relativePath,
    url: subtitle.url,
  })), [
    {
      id: "Show/Episode 01.srt|1024|3",
      name: "Episode 01.srt",
      relativePath: "Show/Episode 01.srt",
      url: "",
    },
  ]);
  assert.deepEqual(createdUrls, ["Episode 02.mkv", "Episode 01.mp4"]);
});

test("collectVideosFromFiles counts filtered small and ignored videos without creating object urls", () => {
  const createdUrls = [];
  const media = browserFileMedia.collectVideosFromFiles(
    [
      createFile("tiny.mp4", { size: 1024 }),
      createFile("trailer.mkv", { size: 90 * 1024 * 1024 }),
      createFile("theme_video.mp4", { size: 90 * 1024 * 1024 }),
      createFile("full.mp4", { size: 90 * 1024 * 1024 }),
    ],
    {
      createObjectUrl: (file) => {
        createdUrls.push(file.name);
        return `blob:${file.name}`;
      },
    },
  );

  assert.equal(media.scannedFiles, 4);
  assert.equal(media.filteredSmallVideos, 3);
  assert.deepEqual(media.videos.map((video) => video.name), ["full.mp4"]);
  assert.deepEqual(createdUrls, ["full.mp4"]);
});
