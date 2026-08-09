import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const deletionState = await importTsModule(new URL("../src/photoAlbumDeletionState.ts", import.meta.url));

function createImage(id, index, size, lastModified) {
  return {
    id,
    name: `${id}.jpg`,
    relativePath: `album/${id}.jpg`,
    url: `blob:${id}`,
    size,
    lastModified,
    mediaRootId: "photos",
    index,
  };
}

function createAlbum(images) {
  return {
    id: "album",
    title: "Album",
    relativePath: "album",
    mediaRootId: "photos",
    mediaRootLabel: "Photos",
    coverImageUrl: images[1]?.url ?? images[0]?.url ?? "",
    imageCount: images.length,
    totalSize: images.reduce((sum, image) => sum + image.size, 0),
    updatedAt: Math.max(0, ...images.map((image) => image.lastModified)),
    images,
  };
}

test("removes one photo and rebuilds the remaining album state", () => {
  const images = [createImage("first", 0, 10, 100), createImage("second", 1, 20, 200), createImage("third", 2, 30, 300)];
  const album = createAlbum(images);
  const progress = { album: { imageIndex: 2, updatedAt: 10, completed: true } };
  const coverPreferences = { album: "second" };
  const albumTags = { album: ["tag"] };
  const favoriteAlbumIds = new Set(["album"]);

  const result = deletionState.removePhotoFromAlbumState({
    album,
    albums: [album],
    albumTags,
    coverPreferences,
    favoriteAlbumIds,
    photo: images[1],
    photoIndex: 1,
    progress,
    updatedAt: 999,
  });

  assert.deepEqual(result.remainingImages.map((image) => [image.id, image.index]), [["first", 0], ["third", 1]]);
  assert.equal(result.nextAlbums[0].coverImageUrl, "blob:first");
  assert.equal(result.nextAlbums[0].imageCount, 2);
  assert.equal(result.nextAlbums[0].totalSize, 40);
  assert.equal(result.nextAlbums[0].updatedAt, 300);
  assert.deepEqual(result.nextProgress.album, { imageIndex: 1, updatedAt: 999, completed: true });
  assert.equal(result.nextCoverPreferences.album, "third");
  assert.deepEqual(result.nextAlbumTags, albumTags);
  assert.equal(result.nextFavorites, favoriteAlbumIds);
  assert.equal(result.nextSelectedAlbumId, "album");
  assert.deepEqual(progress, { album: { imageIndex: 2, updatedAt: 10, completed: true } });
  assert.deepEqual(coverPreferences, { album: "second" });
});

test("removes an empty album and its related metadata after the last photo", () => {
  const photo = createImage("only", 0, 10, 100);
  const album = createAlbum([photo]);
  const otherAlbum = { ...createAlbum([createImage("other", 0, 20, 200)]), id: "other" };
  const favoriteAlbumIds = new Set(["album", "other"]);

  const result = deletionState.removePhotoFromAlbumState({
    album,
    albums: [album, otherAlbum],
    albumTags: { album: ["remove"], other: ["keep"] },
    coverPreferences: { album: "only", other: "other" },
    favoriteAlbumIds,
    photo,
    photoIndex: 0,
    progress: {
      album: { imageIndex: 0, updatedAt: 1, completed: false },
      other: { imageIndex: 0, updatedAt: 2, completed: false },
    },
  });

  assert.deepEqual(result.nextAlbums.map((item) => item.id), ["other"]);
  assert.deepEqual(result.nextProgress, { other: { imageIndex: 0, updatedAt: 2, completed: false } });
  assert.deepEqual(result.nextCoverPreferences, { other: "other" });
  assert.deepEqual(result.nextAlbumTags, { other: ["keep"] });
  assert.deepEqual(result.nextFavorites, new Set(["other"]));
  assert.notEqual(result.nextFavorites, favoriteAlbumIds);
  assert.equal(result.nextPhotoIndex, 0);
  assert.equal(result.nextSelectedAlbumId, null);
});

test("removes a whole album state while preserving unrelated metadata", () => {
  const photo = createImage("only", 0, 10, 100);
  const album = createAlbum([photo]);
  const otherAlbum = { ...createAlbum([createImage("other", 0, 20, 200)]), id: "other" };
  const favoriteAlbumIds = new Set(["other"]);

  const result = deletionState.removePhotoAlbumState({
    albumId: "album",
    albums: [album, otherAlbum],
    albumTags: { album: ["remove"], other: ["keep"] },
    coverPreferences: { album: "only", other: "other" },
    favoriteAlbumIds,
    progress: {
      album: { imageIndex: 0, updatedAt: 1, completed: false },
      other: { imageIndex: 0, updatedAt: 2, completed: false },
    },
  });

  assert.deepEqual(result.nextAlbums.map((item) => item.id), ["other"]);
  assert.deepEqual(result.nextProgress, { other: { imageIndex: 0, updatedAt: 2, completed: false } });
  assert.deepEqual(result.nextCoverPreferences, { other: "other" });
  assert.deepEqual(result.nextAlbumTags, { other: ["keep"] });
  assert.equal(result.nextFavorites, favoriteAlbumIds);
});
