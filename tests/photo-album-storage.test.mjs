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
