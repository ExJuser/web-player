import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import {
  createGlobalVideoId,
  normalizeMediaRoots,
  resolveMediaPath,
  resolvePhotoPath,
  scanConfiguredPhotoAlbums,
  resolveVideoPath,
  scanConfiguredMediaRoots,
  updateMediaRootLocalPath,
} from "../server/mediaRoots.mjs";

async function withTempConfig(fn) {
  const directory = await mkdtemp(path.join(tmpdir(), "web-player-media-root-"));
  const configPath = path.join(directory, "app.json");
  try {
    await fn({ directory, configPath });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("browser media root keeps browser path and exposes absolute localPath", async () => {
  await withTempConfig(async ({ directory, configPath }) => {
    const localPath = path.join(directory, "Anime");
    await writeFile(configPath, JSON.stringify({
      media: {
        roots: [
          { id: "anime", label: "Anime", path: "Anime", source: "browser" },
        ],
      },
    }));

    await import("node:fs/promises").then(({ mkdir }) => mkdir(localPath));
    const result = await updateMediaRootLocalPath(configPath, { id: "anime", localPath });
    const roots = normalizeMediaRoots(result.config);

    assert.equal(result.mediaRoot.id, "anime");
    assert.equal(result.mediaRoot.path, "Anime");
    assert.equal(result.mediaRoot.source, "browser");
    assert.equal(result.mediaRoot.localPath, path.resolve(localPath));
    assert.equal(roots[0].basename, "Anime");
  });
});

test("localPath must be an existing absolute directory", async () => {
  await withTempConfig(async ({ configPath }) => {
    await writeFile(configPath, JSON.stringify({
      media: {
        roots: [
          { id: "anime", label: "Anime", path: "Anime", source: "browser" },
        ],
      },
    }));

    await assert.rejects(
      updateMediaRootLocalPath(configPath, { id: "anime", localPath: "Anime" }),
      /absolute path/i,
    );

    await assert.rejects(
      updateMediaRootLocalPath(configPath, { id: "anime", localPath: path.join(tmpdir(), "missing-web-player-dir") }),
      /directory/i,
    );
  });
});

test("browser media root resolves videos through localPath without escaping root", async () => {
  await withTempConfig(async ({ directory }) => {
    const localPath = path.join(directory, "Anime");
    const config = {
      media: {
        roots: [
          { id: "anime", label: "Anime", path: "Anime", source: "browser", localPath },
        ],
      },
    };

    assert.equal(
      resolveVideoPath(config, "anime", "Show/E01.mkv"),
      path.resolve(localPath, "Show/E01.mkv"),
    );

    assert.throws(() => resolveVideoPath(config, "anime", "../E01.mkv"), /Invalid relative path/);
  });
});

test("global video id includes media root id", () => {
  const first = createGlobalVideoId("anime", "Show/E01.mkv", 100, 123);
  const second = createGlobalVideoId("movies", "Show/E01.mkv", 100, 123);

  assert.notEqual(first, second);
  assert.match(first, /^anime\|Show\/E01\.mkv\|100\|123$/);
});

test("browser media root without localPath is reported as needsAccess", async () => {
  const result = await scanConfiguredMediaRoots({
    media: {
      roots: [
        { id: "anime", label: "Anime", path: "Anime", source: "browser" },
      ],
    },
  });

  assert.equal(result.videos.length, 0);
  assert.equal(result.metadata.mediaRoots[0].status, "needsAccess");
});

test("media path resolver supports subtitles but rejects escaping root", async () => {
  await withTempConfig(async ({ directory }) => {
    const config = {
      media: {
        roots: [
          { id: "anime", label: "Anime", path: directory },
        ],
      },
    };

    assert.equal(
      resolveMediaPath(config, "anime", "Show/E01.srt"),
      path.resolve(directory, "Show/E01.srt"),
    );

    assert.throws(() => resolveMediaPath(config, "anime", "../E01.srt"), /Invalid relative path/);
  });
});

test("photo album scan groups image folders and skips empty folders", async () => {
  await withTempConfig(async ({ directory }) => {
    const albumPath = path.join(directory, "Model", "Set 01");
    await mkdir(albumPath, { recursive: true });
    await mkdir(path.join(directory, "Empty"), { recursive: true });
    await writeFile(path.join(albumPath, "001.jpg"), "jpg");
    await writeFile(path.join(albumPath, "002.webp"), "webp");
    await writeFile(path.join(albumPath, "notes.txt"), "ignore");

    const result = await scanConfiguredPhotoAlbums({
      media: {
        roots: [
          { id: "photos", label: "Photos", path: directory },
        ],
      },
    });

    assert.equal(result.albums.length, 1);
    assert.equal(result.albums[0].id, "photos|Model/Set 01");
    assert.equal(result.albums[0].title, "Set 01");
    assert.equal(result.albums[0].imageCount, 2);
    assert.deepEqual(result.albums[0].images.map((image) => image.name), ["001.jpg", "002.webp"]);
  });
});

test("photo path resolver accepts images and rejects escaping or non-images", async () => {
  await withTempConfig(async ({ directory }) => {
    const config = {
      media: {
        roots: [
          { id: "photos", label: "Photos", path: directory },
        ],
      },
    };

    assert.equal(
      resolvePhotoPath(config, "photos", "Set/001.jpg"),
      path.resolve(directory, "Set/001.jpg"),
    );
    assert.throws(() => resolvePhotoPath(config, "photos", "../001.jpg"), /Invalid relative path/);
    assert.throws(() => resolvePhotoPath(config, "photos", "Set/movie.mkv"), /Unsupported photo file/);
  });
});

test("browser media root without localPath is reported as needsAccess for photo albums", async () => {
  const result = await scanConfiguredPhotoAlbums({
    media: {
      roots: [
        { id: "photos", label: "Photos", path: "Photos", source: "browser" },
      ],
    },
  });

  assert.equal(result.albums.length, 0);
  assert.equal(result.metadata.mediaRoots[0].status, "needsAccess");
});
