import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { deleteConfiguredPhotoAlbum } from "../server/mediaRoots.mjs";

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function withPhotoRoot(run) {
  const root = await mkdtemp(path.join(tmpdir(), "web-player-photo-delete-"));
  const config = {
    media: {
      roots: [{ id: "photos", label: "Photos", path: root, source: "local" }],
    },
  };
  try {
    await run({ root, config });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("deleteConfiguredPhotoAlbum removes photos and an empty album directory", async () => {
  await withPhotoRoot(async ({ root, config }) => {
    const album = path.join(root, "Set");
    await mkdir(album);
    await writeFile(path.join(album, "001.jpg"), "photo");
    await writeFile(path.join(album, "002.PNG"), "photo");

    const result = await deleteConfiguredPhotoAlbum(config, "photos", "Set");

    assert.deepEqual(result, { deletedImages: 2, directoryRemoved: true });
    assert.equal(await pathExists(album), false);
  });
});

test("deleteConfiguredPhotoAlbum retains a directory containing other files", async () => {
  await withPhotoRoot(async ({ root, config }) => {
    const album = path.join(root, "Set");
    await mkdir(album);
    await writeFile(path.join(album, "001.jpg"), "photo");
    await writeFile(path.join(album, "notes.txt"), "keep");

    const result = await deleteConfiguredPhotoAlbum(config, "photos", "Set");

    assert.deepEqual(result, {
      deletedImages: 1,
      directoryRemoved: false,
      directoryRetainedReason: "not-empty",
    });
    assert.equal(await pathExists(path.join(album, "001.jpg")), false);
    assert.equal(await pathExists(path.join(album, "notes.txt")), true);
  });
});

test("deleteConfiguredPhotoAlbum retains a directory containing a child directory", async () => {
  await withPhotoRoot(async ({ root, config }) => {
    const album = path.join(root, "Set");
    await mkdir(path.join(album, "extras"), { recursive: true });
    await writeFile(path.join(album, "001.jpg"), "photo");

    const result = await deleteConfiguredPhotoAlbum(config, "photos", "Set");

    assert.deepEqual(result, {
      deletedImages: 1,
      directoryRemoved: false,
      directoryRetainedReason: "not-empty",
    });
    assert.equal(await pathExists(path.join(album, "extras")), true);
  });
});

test("deleteConfiguredPhotoAlbum never removes the configured root directory", async () => {
  await withPhotoRoot(async ({ root, config }) => {
    await writeFile(path.join(root, "001.webp"), "photo");

    const result = await deleteConfiguredPhotoAlbum(config, "photos", "");

    assert.deepEqual(result, {
      deletedImages: 1,
      directoryRemoved: false,
      directoryRetainedReason: "root-directory",
    });
    assert.equal(await pathExists(root), true);
  });
});

test("deleteConfiguredPhotoAlbum rejects paths outside the configured root", async () => {
  await withPhotoRoot(async ({ config }) => {
    await assert.rejects(
      deleteConfiguredPhotoAlbum(config, "photos", "../outside"),
      /Invalid relative path/,
    );
  });
});

test("deleteConfiguredPhotoAlbum rejects browser roots without a local path", async () => {
  await assert.rejects(
    deleteConfiguredPhotoAlbum({
      media: {
        roots: [{ id: "browser", label: "Browser", path: "browser", source: "browser" }],
      },
    }, "browser", "Set"),
    /configured local absolute path/,
  );
});
