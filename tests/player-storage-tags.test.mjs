import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const storage = await importTsModule(new URL("../src/playerStorage.ts", import.meta.url));

test("old player data stores load with empty video tags and merge decisions", () => {
  const parsed = storage.parsePlayerDataStore(JSON.stringify({
    version: 4,
    items: {},
    favorites: [],
  }));

  assert.deepEqual(parsed.videoTags, {});
  assert.deepEqual(parsed.videoStats, {});
  assert.deepEqual(parsed.tagMergeDecisions, {});
});

test("player data stores parse valid tags, stats, and merge decisions", () => {
  const parsed = storage.parsePlayerDataStore(JSON.stringify({
    version: 5,
    items: {},
    favorites: [],
    videoTags: {
      "video-1": ["美腿", "剧情", "", 42],
      "video-2": "invalid",
    },
    videoStats: {
      "movie.mp4|1024|1700000000000": {
        totalPlayedSeconds: 120.5,
        playCount: 3,
        durationSeconds: 600,
        emissionCount: 2,
        lastEmissionAt: 1710000000000,
        updatedAt: 1720000000000,
      },
      "invalid.mp4|1|2": {
        totalPlayedSeconds: "120",
        playCount: 1,
        durationSeconds: 600,
        emissionCount: 0,
        updatedAt: 1720000000000,
      },
    },
    tagMergeDecisions: {
      "a::b": { from: "腿玩年", to: "美腿", decision: "merge", updatedAt: 10 },
      "c::d": { from: "长镜头感", to: "长镜头", decision: "keep", updatedAt: 11 },
      bad: { from: "x", to: "y", decision: "maybe", updatedAt: 12 },
    },
  }));

  assert.deepEqual(parsed.videoTags, {
    "video-1": ["美腿", "剧情"],
  });
  assert.deepEqual(parsed.videoStats, {
    "movie.mp4|1024|1700000000000": {
      totalPlayedSeconds: 120.5,
      playCount: 3,
      durationSeconds: 600,
      emissionCount: 2,
      lastEmissionAt: 1710000000000,
      updatedAt: 1720000000000,
    },
  });
  assert.deepEqual(parsed.tagMergeDecisions, {
    "a::b": { from: "腿玩年", to: "美腿", decision: "merge", updatedAt: 10 },
    "c::d": { from: "长镜头感", to: "长镜头", decision: "keep", updatedAt: 11 },
  });
});

test("player preferences remember the home media mode", () => {
  const parsed = storage.parsePlayerDataStore(JSON.stringify({
    version: 5,
    items: {},
    favorites: [],
    preferences: {
      homeMediaMode: "anime",
    },
  }));

  assert.equal(parsed.preferences.homeMediaMode, "anime");

  const oldStore = storage.parsePlayerDataStore(JSON.stringify({
    version: 4,
    items: {},
    favorites: [],
  }));
  assert.equal(oldStore.preferences.homeMediaMode, "all");
});

test("default player data store contains tag containers", () => {
  const store = storage.createDefaultPlayerDataStore();

  assert.equal(store.version, 5);
  assert.deepEqual(store.videoTags, {});
  assert.deepEqual(store.videoStats, {});
  assert.deepEqual(store.tagMergeDecisions, {});
  assert.equal(store.preferences.homeMediaMode, "all");
});
