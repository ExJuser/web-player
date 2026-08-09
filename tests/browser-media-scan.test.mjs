import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const browserMediaScan = await importTsModule(new URL("../src/browserMediaScan.ts", import.meta.url));
const browserFileMedia = await importTsModule(new URL("../src/browserFileMedia.ts", import.meta.url));

const createFile = (overrides = {}) => ({
  name: overrides.name ?? "movie.mp4",
  size: overrides.size ?? 60 * 1024 * 1024,
  lastModified: overrides.lastModified ?? 1,
  webkitRelativePath: overrides.webkitRelativePath,
  ...overrides,
});

const createFileEntry = (name, fileOverrides = {}) => ({
  kind: "file",
  name,
  async getFile() {
    return createFile({ name, ...fileOverrides });
  },
});

const createDirectoryEntry = (name, entries) => ({
  kind: "directory",
  name,
  async *values() {
    yield* entries;
  },
});

test("collects dropped browser videos and subtitles", () => {
  const originalCreateObjectUrl = URL.createObjectURL;
  URL.createObjectURL = (file) => `blob:${file.name}`;

  try {
    const media = browserMediaScan.collectVideosFromFiles([
      createFile({ name: "episode.mp4", webkitRelativePath: "Show/episode.mp4" }),
      createFile({ name: "episode.srt", size: 200, webkitRelativePath: "Show/episode.srt" }),
      createFile({ name: "tiny.mp4", size: 1024, webkitRelativePath: "Show/tiny.mp4" }),
      createFile({ name: "episode-poster.jpg", size: 1024, webkitRelativePath: "Show/episode-poster.jpg" }),
      createFile({ name: "episode-fanart.webp", size: 1024, webkitRelativePath: "Show/episode-fanart.webp" }),
      createFile({ name: "episode-thumb.png", size: 1024, webkitRelativePath: "Show/episode-thumb.png" }),
      createFile({ name: "cover.jpg", size: 1024, webkitRelativePath: "Show/cover.jpg" }),
    ]);

    assert.equal(media.scannedFiles, 3);
    assert.equal(media.filteredSmallVideos, 1);
    assert.deepEqual(media.videos.map((video) => video.relativePath), ["Show/episode.mp4"]);
    assert.deepEqual(media.subtitles.map((subtitle) => subtitle.relativePath), ["Show/episode.srt"]);
    assert.equal(media.videos[0].url, "blob:episode.mp4");
    assert.equal(media.videos[0].posterFile?.name, "episode-poster.jpg");
    assert.equal(media.videos[0].fanartFile?.name, "episode-fanart.webp");
    assert.equal(media.videos[0].thumbFile?.name, "episode-thumb.png");
  } finally {
    URL.createObjectURL = originalCreateObjectUrl;
  }
});

test("browser media scan re-export matches the canonical dropped-file collector", () => {
  const files = [
    createFile({ name: "episode.mp4", webkitRelativePath: "Show/episode.mp4" }),
    createFile({ name: "episode.srt", size: 200, webkitRelativePath: "Show/episode.srt" }),
    createFile({ name: "episode-poster.jpg", size: 1024, webkitRelativePath: "Show/episode-poster.jpg" }),
  ];
  const options = { createObjectUrl: (file) => `blob:${file.name}` };

  assert.deepEqual(
    browserMediaScan.collectVideosFromFiles(files, options),
    browserFileMedia.collectVideosFromFiles(files, options),
  );
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

test("collects videos from browser directories in batches", async () => {
  const originalCreateObjectUrl = URL.createObjectURL;
  URL.createObjectURL = (file) => `blob:${file.name}`;

  try {
    const directory = createDirectoryEntry("Root", [
      createDirectoryEntry("Season 1", [
        createFileEntry("Episode 01.mp4", { size: 100 * 1024 * 1024, lastModified: 10 }),
        createFileEntry("episode 01-POSTER.webp", { size: 1024, lastModified: 9 }),
        createFileEntry("episode 01-FANART.jpg", { size: 1024, lastModified: 9 }),
        createFileEntry("episode 01-THUMB.png", { size: 1024, lastModified: 9 }),
        createFileEntry("Episode 01.srt", { size: 200, lastModified: 11 }),
        createFileEntry("tiny.mp4", { size: 1024, lastModified: 12 }),
      ]),
      createFileEntry("cover.jpg", { size: 1024 }),
    ]);
    const batches = [];

    for await (const batch of browserMediaScan.collectVideos(directory, "root-a")) {
      batches.push(batch);
    }

    assert.equal(batches.length, 1);
    assert.equal(batches[0].scannedFiles, 3);
    assert.equal(batches[0].filteredSmallVideos, 1);
    assert.deepEqual(batches[0].videos.map((video) => video.relativePath), ["Season 1/Episode 01.mp4"]);
    assert.deepEqual(batches[0].subtitles.map((subtitle) => subtitle.relativePath), ["Season 1/Episode 01.srt"]);
    assert.equal(batches[0].videos[0].id, "root-a|Season 1/Episode 01.mp4|104857600|10");
    assert.equal(batches[0].videos[0].url, "blob:Episode 01.mp4");
    assert.equal(batches[0].videos[0].posterFile?.name, "episode 01-POSTER.webp");
    assert.equal(batches[0].videos[0].fanartFile?.name, "episode 01-FANART.jpg");
    assert.equal(batches[0].videos[0].thumbFile?.name, "episode 01-THUMB.png");
    assert.equal(batches[0].subtitles[0].mediaRootId, "root-a");
  } finally {
    URL.createObjectURL = originalCreateObjectUrl;
  }
});

test("collects actors only from a same-basename browser nfo", async () => {
  const originalCreateObjectUrl = URL.createObjectURL;
  URL.createObjectURL = (file) => `blob:${file.name}`;
  try {
    const nfoText = "<movie><actor><name>Actor A</name><type>Actor</type></actor><actor><name>Actor B</name></actor></movie>";
    const directory = createDirectoryEntry("Root", [
      createFileEntry("Movie.mp4", { size: 100 * 1024 * 1024, lastModified: 10 }),
      createFileEntry("movie.NFO", { size: nfoText.length, arrayBuffer: async () => new TextEncoder().encode(nfoText).buffer }),
      createFileEntry("other.nfo", { size: 10, arrayBuffer: async () => new ArrayBuffer(0) }),
    ]);
    const batches = [];
    for await (const batch of browserMediaScan.collectVideos(directory, "root-a")) batches.push(batch);
    assert.deepEqual(batches[0].videos[0].actorHints, { fileName: "movie.NFO", names: ["Actor A", "Actor B"], status: "parsed" });
  } finally {
    URL.createObjectURL = originalCreateObjectUrl;
  }
});

test("ignores unreadable artwork and marks an unreadable matching nfo invalid", async () => {
  const originalCreateObjectUrl = URL.createObjectURL;
  URL.createObjectURL = (file) => `blob:${file.name}`;
  const createUnreadableEntry = (name) => ({
    kind: "file",
    name,
    async getFile() {
      throw new Error("unreadable");
    },
  });

  try {
    const directory = createDirectoryEntry("Root", [
      createFileEntry("Movie.mp4", { size: 100 * 1024 * 1024, lastModified: 10 }),
      createUnreadableEntry("movie-poster.jpg"),
      createUnreadableEntry("movie.nfo"),
    ]);
    const batches = [];

    for await (const batch of browserMediaScan.collectVideos(directory, "root-a")) batches.push(batch);

    assert.equal(batches[0].videos[0].posterFile, undefined);
    assert.deepEqual(batches[0].videos[0].actorHints, {
      fileName: "movie.nfo",
      names: [],
      status: "invalid",
    });
  } finally {
    URL.createObjectURL = originalCreateObjectUrl;
  }
});
