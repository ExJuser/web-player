import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const { createPlaylistThumbnailStore } = await importTsModule(new URL("../src/playlistThumbnailStore.ts", import.meta.url));

test("playlist thumbnail store notifies only changed video subscribers", () => {
  const store = createPlaylistThumbnailStore();
  let firstNotifications = 0;
  let secondNotifications = 0;
  const unsubscribeFirst = store.subscribe("first", () => { firstNotifications += 1; });
  const unsubscribeSecond = store.subscribe("second", () => { secondNotifications += 1; });

  store.setMany([{ videoId: "first", status: "ready", url: "/first.jpg" }]);
  store.setMany([{ videoId: "first", status: "ready", url: "/first.jpg" }]);

  assert.deepEqual(store.get("first"), { status: "ready", url: "/first.jpg" });
  assert.equal(firstNotifications, 1);
  assert.equal(secondNotifications, 0);
  unsubscribeFirst();
  unsubscribeSecond();
});

test("playlist thumbnail store clears failed and stale entries", () => {
  const store = createPlaylistThumbnailStore();
  store.setMany([{ videoId: "first", status: "ready", url: "/first.jpg" }]);
  store.setFailed("first");
  assert.deepEqual(store.get("first"), { status: "failed", url: undefined });

  store.clear();
  assert.equal(store.get("first"), undefined);
});
