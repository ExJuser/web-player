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
  assert.deepEqual(parsed.videoHighlights, {});
  assert.deepEqual(parsed.danmakuSelections, {});
  assert.equal(parsed.danmakuPreferences.enabled, true);
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

test("player data stores parse danmaku selections and bounded preferences", () => {
  const parsed = storage.parsePlayerDataStore(JSON.stringify({
    version: 5,
    items: {},
    favorites: [],
    danmakuSelections: {
      "video-1": {
        sourceId: "bilibili:abc",
        sourceName: "第一集弹幕",
        provider: "bilibili",
        updatedAt: 123,
      },
      "video-2": {
        sourceId: "bad",
        sourceName: "bad",
        provider: "unknown",
        updatedAt: 123,
      },
    },
    danmakuPreferences: {
      enabled: false,
      opacity: 2,
      speed: 1,
      density: 0.05,
      displayArea: 2,
      fontSize: 100,
      showSimplified: false,
    },
  }));

  assert.deepEqual(parsed.danmakuSelections, {
    "video-1": {
      sourceId: "bilibili:abc",
      sourceName: "第一集弹幕",
      provider: "bilibili",
      updatedAt: 123,
    },
  });
  assert.equal(parsed.danmakuPreferences.enabled, false);
  assert.equal(parsed.danmakuPreferences.opacity, 1);
  assert.equal(parsed.danmakuPreferences.speed, 16);
  assert.equal(parsed.danmakuPreferences.density, 0.2);
  assert.equal(parsed.danmakuPreferences.displayArea, 1);
  assert.equal(parsed.danmakuPreferences.fontSize, 36);
  assert.equal(parsed.danmakuPreferences.showSimplified, false);
});

test("danmaku preferences allow slower speed settings", () => {
  const parsed = storage.parseDanmakuPreferences({ speed: 99 });
  assert.equal(parsed.speed, 32);
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

test("player preferences remember stat playlist sort modes", () => {
  for (const playlistSortMode of ["playedDuration", "playIntensity", "playCount", "emissionCount"]) {
    const parsed = storage.parsePlayerDataStore(JSON.stringify({
      version: 5,
      items: {},
      favorites: [],
      preferences: {
        playlistSortMode,
      },
    }));

    assert.equal(parsed.preferences.playlistSortMode, playlistSortMode);
  }
});

test("player settings remember bounded volume", () => {
  const parsed = storage.parsePlayerDataStore(JSON.stringify({
    version: 5,
    items: {},
    favorites: [],
    settings: {
      volume: 1.5,
      skipFolderAccessPrompt: true,
    },
  }));

  assert.equal(parsed.settings.volume, 1);
  assert.equal(parsed.settings.skipFolderAccessPrompt, true);

  const oldStore = storage.parsePlayerDataStore(JSON.stringify({
    version: 4,
    items: {},
    favorites: [],
  }));
  assert.equal(oldStore.settings.volume, 0.85);
});

test("default player data store contains tag containers", () => {
  const store = storage.createDefaultPlayerDataStore();

  assert.equal(store.version, 5);
  assert.deepEqual(store.videoTags, {});
  assert.deepEqual(store.videoStats, {});
  assert.deepEqual(store.tagMergeDecisions, {});
  assert.deepEqual(store.videoHighlights, {});
  assert.deepEqual(store.danmakuSelections, {});
  assert.equal(store.danmakuPreferences.showSimplified, true);
  assert.equal(store.preferences.homeMediaMode, "all");
  assert.equal(store.duplicateDetection, null);
  assert.deepEqual(store.duplicateDetections, {});
});

test("player data stores migrate legacy duplicate detection into its media mode", () => {
  const parsed = storage.parsePlayerDataStore(JSON.stringify({
    version: 5,
    items: {},
    duplicateDetection: {
      scopeKey: "special\nvideo-a",
      updatedAt: 100,
      message: "检测完成",
      pairs: [
        {
          key: "a\u0000b",
          aId: "a",
          bId: "b",
          score: 145.4,
          severity: "duplicate",
          reasons: ["内容指纹一致", "内容指纹一致", ""],
        },
        {
          key: "bad",
          aId: "a",
          bId: "c",
          score: 10,
          severity: "unknown",
        },
      ],
    },
  }));

  assert.deepEqual(parsed.duplicateDetection, {
    mode: "special",
    scopeKey: "special\nvideo-a",
    updatedAt: 100,
    message: "检测完成",
    pairs: [{
      key: "a\u0000b",
      aId: "a",
      bId: "b",
      score: 145,
      severity: "duplicate",
      reasons: ["内容指纹一致"],
    }],
  });
  assert.deepEqual(parsed.duplicateDetections, {
    special: parsed.duplicateDetection,
  });
});

test("player data stores persist duplicate detection results per media mode", () => {
  const parsed = storage.parsePlayerDataStore(JSON.stringify({
    version: 5,
    items: {},
    duplicateDetections: {
      special: {
        mode: "special",
        updatedAt: 100,
        pairs: [{
          key: "a\u0000b",
          aId: "a",
          bId: "b",
          score: 145,
          severity: "duplicate",
          reasons: ["内容指纹一致"],
        }],
      },
      anime: {
        mode: "anime",
        updatedAt: 200,
        pairs: [{
          key: "c\u0000d",
          aId: "c",
          bId: "d",
          score: 90,
          severity: "suspicious",
          reasons: ["名称规范化一致"],
        }],
      },
      all: {
        mode: "special",
        pairs: [{
          key: "x\u0000y",
          aId: "x",
          bId: "y",
          score: 120,
          severity: "duplicate",
          reasons: ["内容指纹一致"],
        }],
      },
    },
  }));

  assert.equal(parsed.duplicateDetections.special.mode, "special");
  assert.equal(parsed.duplicateDetections.anime.mode, "anime");
  assert.equal(parsed.duplicateDetections.all, undefined);
});

test("player data stores parse valid high energy highlight segments", () => {
  const parsed = storage.parsePlayerDataStore(JSON.stringify({
    version: 5,
    items: {},
    favorites: [],
    videoHighlights: {
      video1: [
        { id: "h1", startTime: 10, endTime: 25, tag: " 名场面 ", updatedAt: 100 },
        { id: "bad-time", startTime: 30, endTime: 20, updatedAt: 101 },
        { id: "", startTime: 1, endTime: 2, updatedAt: 102 },
      ],
    },
  }));

  assert.deepEqual(parsed.videoHighlights, {
    video1: [{ id: "h1", startTime: 10, endTime: 25, tag: "名场面", updatedAt: 100 }],
  });
});
