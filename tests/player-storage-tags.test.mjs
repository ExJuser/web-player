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
  assert.deepEqual(parsed.tagMergeDecisions, {});
});

test("player data stores parse valid tags and merge decisions", () => {
  const parsed = storage.parsePlayerDataStore(JSON.stringify({
    version: 5,
    items: {},
    favorites: [],
    videoTags: {
      "video-1": ["美腿", "剧情", "", 42],
      "video-2": "invalid",
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
  assert.deepEqual(parsed.tagMergeDecisions, {
    "a::b": { from: "腿玩年", to: "美腿", decision: "merge", updatedAt: 10 },
    "c::d": { from: "长镜头感", to: "长镜头", decision: "keep", updatedAt: 11 },
  });
});

test("default player data store contains tag containers", () => {
  const store = storage.createDefaultPlayerDataStore();

  assert.equal(store.version, 5);
  assert.deepEqual(store.videoTags, {});
  assert.deepEqual(store.tagMergeDecisions, {});
});
