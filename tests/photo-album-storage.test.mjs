import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const storage = await importTsModule(new URL("../src/photoAlbumStorage.ts", import.meta.url));

test("missing photo album store fields fall back to defaults", () => {
  const parsed = storage.parsePhotoAlbumStore(JSON.stringify({ version: 1 }));

  assert.deepEqual(parsed.favorites, []);
  assert.deepEqual(parsed.progress, {});
  assert.deepEqual(parsed.preferences, {
    sortMode: "updated",
    favoritesOnly: false,
  });
});

test("photo album store keeps valid favorites, progress, and preferences", () => {
  const parsed = storage.parsePhotoAlbumStore(JSON.stringify({
    version: 1,
    favorites: ["root|A", "root|A", "", 42, "root|B"],
    progress: {
      "root|A": { imageIndex: 3, updatedAt: 10, completed: false },
      "root|B": { imageIndex: -1, updatedAt: 11, completed: true },
      "root|C": { imageIndex: 0, updatedAt: 12, completed: true },
      "root|D": { imageIndex: 1, updatedAt: "bad", completed: true },
    },
    preferences: {
      sortMode: "count",
      favoritesOnly: true,
    },
  }));

  assert.deepEqual(parsed.favorites, ["root|A", "root|B"]);
  assert.deepEqual(parsed.progress, {
    "root|A": { imageIndex: 3, updatedAt: 10, completed: false },
    "root|C": { imageIndex: 0, updatedAt: 12, completed: true },
  });
  assert.deepEqual(parsed.preferences, {
    sortMode: "count",
    favoritesOnly: true,
  });
});

test("invalid photo album scan cache is ignored", () => {
  assert.equal(storage.parseCachedPhotoAlbumScan(JSON.stringify({ version: 0 })), null);
  assert.equal(storage.parseCachedPhotoAlbumScan(JSON.stringify({
    version: storage.photoAlbumScanCacheVersion,
    rootId: "photos",
    rootName: "Photos",
    albums: "bad",
  })), null);
});

test("photo album scan cache keeps valid albums and drops invalid images", () => {
  const parsed = storage.parseCachedPhotoAlbumScan(JSON.stringify({
    version: storage.photoAlbumScanCacheVersion,
    rootId: "photos",
    rootName: "Photos",
    scannedFiles: 3,
    updatedAt: 100,
    albums: [
      {
        id: "photos|Set",
        title: "Set",
        relativePath: "Set",
        mediaRootId: "photos",
        mediaRootLabel: "Photos",
        coverImageUrl: "blob:old",
        totalSize: 300,
        updatedAt: 90,
        images: [
          {
            id: "img-1",
            name: "001.jpg",
            relativePath: "Set\\001.jpg",
            url: "blob:old",
            size: 100,
            lastModified: 80,
            mediaRootId: "photos",
            index: 9,
          },
          {
            id: "",
            name: "bad.jpg",
            relativePath: "Set/bad.jpg",
            mediaRootId: "photos",
          },
        ],
      },
      {
        id: "photos|Empty",
        title: "Empty",
        relativePath: "Empty",
        mediaRootId: "photos",
        mediaRootLabel: "Photos",
        images: [],
      },
    ],
  }));

  assert.equal(parsed.rootId, "photos");
  assert.equal(parsed.rootName, "Photos");
  assert.equal(parsed.scannedFiles, 3);
  assert.equal(parsed.albums.length, 1);
  assert.equal(parsed.albums[0].imageCount, 1);
  assert.equal(parsed.albums[0].images[0].relativePath, "Set/001.jpg");
});
