import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const storage = await importTsModule(new URL("../src/playerStorage.ts", import.meta.url));

test("detects global player metadata", () => {
  assert.equal(storage.isPlayerGlobalMetadata({ mediaRoots: [] }), true);
  assert.equal(storage.isPlayerGlobalMetadata({ id: "library", name: "Library" }), false);
  assert.equal(storage.isPlayerGlobalMetadata(null), false);
});

test("old player data stores load with empty video tags and merge decisions", () => {
  const parsed = storage.parsePlayerDataStore(JSON.stringify({
    version: 4,
    items: {},
    favorites: [],
  }));

  assert.deepEqual(parsed.videoTags, {});
  assert.deepEqual(parsed.videoRatings, {});
  assert.deepEqual(parsed.videoStats, {});
  assert.deepEqual(parsed.watchActivity, {});
  assert.deepEqual(parsed.tagMergeDecisions, {});
  assert.deepEqual(parsed.videoHighlights, {});
  assert.deepEqual(parsed.videoEditSegments, {});
  assert.deepEqual(parsed.danmakuSelections, {});
  assert.equal(parsed.danmakuPreferences.enabled, true);
});

test("player preferences parse playlist page size with defaults", () => {
  assert.equal(storage.parsePlayerPreferences({}).playlistPageSize, 50);
  assert.equal(storage.parsePlayerPreferences({ playlistPageSize: 30 }).playlistPageSize, 30);
  assert.equal(storage.parsePlayerPreferences({ playlistPageSize: 100 }).playlistPageSize, 100);
  assert.equal(storage.parsePlayerPreferences({ playlistPageSize: 40 }).playlistPageSize, 50);
  assert.equal(storage.parsePlayerPreferences({ playlistPageSize: "50" }).playlistPageSize, 50);
});

test("player preferences remember whether playback starts from high energy highlights", () => {
  assert.equal(storage.parsePlayerPreferences({}).startFromHighEnergy, false);
  assert.equal(storage.parsePlayerPreferences({ startFromHighEnergy: true }).startFromHighEnergy, true);
  assert.equal(storage.parsePlayerPreferences({ startFromHighEnergy: "true" }).startFromHighEnergy, false);
});

test("player preferences clean, deduplicate, sort, and bound recent video tags", () => {
  const source = Array.from({ length: 24 }, (_, index) => ({
    key: index === 22 ? "重复 标签" : `tag-${index}`,
    label: index === 22 ? "重复标签" : `标签${index}`,
    usedAt: 100 + index,
  }));
  source.push({ key: "重复标签", label: "旧重复标签", usedAt: 50 });
  source.push({ key: "", label: "", usedAt: 999 });
  source.push({ key: "invalid", label: "无效时间", usedAt: "unknown" });

  const recentVideoTags = storage.parsePlayerPreferences({ recentVideoTags: source }).recentVideoTags;

  assert.equal(recentVideoTags.length, 20);
  assert.equal(recentVideoTags[0].label, "标签23");
  assert.equal(recentVideoTags.filter((entry) => entry.key === "重复标签").length, 1);
  assert.deepEqual(storage.parsePlayerPreferences({}).recentVideoTags, []);
  assert.deepEqual(
    storage.getPersistedPlayerPreferences(storage.parsePlayerPreferences({ recentVideoTags })).recentVideoTags,
    recentVideoTags,
  );
});

test("player preferences parse playback controls with defaults", () => {
  const defaults = storage.parsePlayerPreferences({});
  assert.equal(defaults.playbackMode, "sequential");
  assert.equal(defaults.seekStep, 15);
  assert.equal(defaults.holdPlaybackRate, 4);

  const parsed = storage.parsePlayerPreferences({
    playbackMode: "shuffle",
    seekStep: 10,
    holdPlaybackRate: 3,
  });
  assert.equal(parsed.playbackMode, "shuffle");
  assert.equal(parsed.seekStep, 10);
  assert.equal(parsed.holdPlaybackRate, 3);

  const invalid = storage.parsePlayerPreferences({
    playbackMode: "invalid",
    seekStep: 20,
    holdPlaybackRate: 8,
  });
  assert.equal(invalid.playbackMode, "sequential");
  assert.equal(invalid.seekStep, 15);
  assert.equal(invalid.holdPlaybackRate, 4);
});

test("player preferences validate modes, booleans, subtitle style, and legacy series fields", () => {
  const parsed = storage.parsePlayerPreferences({
    playlistSortMode: "path",
    isPlaylistSortReversed: true,
    homeMediaMode: "special",
    isSeriesMode: true,
    selectedSeriesKey: "legacy-series",
    isCinemaMode: true,
    startFromHighEnergy: true,
    subtitleStyle: {
      fontSize: 32,
      fontFamily: "monospace",
      fontWeight: 700,
    },
  });

  assert.equal(parsed.playlistSortMode, "path");
  assert.equal(parsed.isPlaylistSortReversed, true);
  assert.equal(parsed.homeMediaMode, "special");
  assert.equal(parsed.isSeriesMode, false);
  assert.equal(parsed.selectedSeriesKey, "all");
  assert.equal(parsed.isCinemaMode, true);
  assert.equal(parsed.startFromHighEnergy, true);
  assert.deepEqual(parsed.subtitleStyle, { fontSize: 32, fontFamily: "monospace", fontWeight: 700 });

  const invalid = storage.parsePlayerPreferences({
    playlistSortMode: "invalid",
    isPlaylistSortReversed: "true",
    homeMediaMode: "all",
    isCinemaMode: 1,
    startFromHighEnergy: "true",
    subtitleStyle: {
      fontSize: 13,
      fontFamily: "fantasy",
      fontWeight: 500,
    },
  });

  assert.equal(invalid.playlistSortMode, "name");
  assert.equal(invalid.isPlaylistSortReversed, false);
  assert.equal(invalid.homeMediaMode, "anime");
  assert.equal(invalid.isCinemaMode, false);
  assert.equal(invalid.startFromHighEnergy, false);
  assert.deepEqual(invalid.subtitleStyle, { fontSize: 16, fontFamily: "sans-serif", fontWeight: 600 });
});

test("media root scan cache keeps valid server entries and drops invalid records", () => {
  const parsed = storage.parseCachedMediaRootScan(JSON.stringify({
    version: storage.mediaRootScanCacheVersion,
    videos: [
      {
        id: "anime|Show/01.mkv|100|200",
        name: "01.mkv",
        relativePath: "Show\\01.mkv",
        url: "/api/media/anime/Show/01.mkv",
        size: 100,
        lastModified: 200,
        mediaRootId: "anime",
        posterUrl: "/api/media/anime/Show/01-poster.jpg",
        fanartUrl: "/api/media/anime/Show/01-fanart.jpg",
        thumbUrl: "/api/media/anime/Show/01-thumb.jpg",
        thumbnailUrl: "blob:runtime",
      },
      { id: "bad", name: "bad.mkv" },
    ],
    subtitles: [
      {
        id: "anime|Show/01.srt|10|200",
        name: "01.srt",
        relativePath: "Show\\01.srt",
        url: "/api/media/anime/Show/01.srt",
        mediaRootId: "anime",
      },
      { id: "bad-subtitle", name: "bad.srt" },
    ],
    scannedFiles: 3,
    filteredSmallVideos: 1,
    metadata: {
      id: "global",
      name: "全局媒体库",
      videoCount: 2,
      scannedFiles: 3,
      updatedAt: 1000,
      mediaRoots: [
        { id: "anime", label: "Anime", source: "local", status: "ready", videoCount: 1, scannedFiles: 2, updatedAt: 1000 },
      ],
    },
    updatedAt: 1000,
  }));

  assert.equal(parsed.videos.length, 1);
  assert.equal(parsed.videos[0].relativePath, "Show/01.mkv");
  assert.equal(parsed.videos[0].playbackSource, "server");
  assert.equal(parsed.videos[0].posterUrl, "/api/media/anime/Show/01-poster.jpg");
  assert.equal(parsed.videos[0].fanartUrl, "/api/media/anime/Show/01-fanart.jpg");
  assert.equal(parsed.videos[0].thumbUrl, "/api/media/anime/Show/01-thumb.jpg");
  assert.equal(parsed.videos[0].thumbnailUrl, undefined);
  assert.equal(parsed.subtitles.length, 1);
  assert.equal(parsed.subtitles[0].relativePath, "Show/01.srt");
  assert.equal(parsed.metadata.videoCount, 1);
  assert.equal(parsed.filteredSmallVideos, 1);
});

test("invalid media root scan cache is ignored", () => {
  assert.equal(storage.parseCachedMediaRootScan(JSON.stringify({ version: 0 })), null);
  assert.equal(storage.parseCachedMediaRootScan(JSON.stringify({
    version: storage.mediaRootScanCacheVersion,
    videos: [],
    subtitles: [],
    metadata: { id: "legacy" },
  })), null);
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
    videoRatings: {
      "video-1": 8.5,
      "video-2": 12,
      "video-3": "bad",
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
    watchActivity: {
      "2026-06-29::video-1": {
        date: "2026-06-29",
        videoId: "video-1",
        watchedSeconds: 366.5,
        playCount: 2,
        completedCount: 1,
        emissionCount: 1,
        updatedAt: 1780000000000,
      },
      bad: {
        date: "20260629",
        videoId: "video-2",
        watchedSeconds: 1,
        playCount: 1,
        completedCount: 0,
        emissionCount: 0,
        updatedAt: 1780000000000,
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
  assert.deepEqual(parsed.videoRatings, {
    "video-1": 8.5,
    "video-2": 10,
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
  assert.deepEqual(parsed.watchActivity, {
    "2026-06-29::video-1": {
      date: "2026-06-29",
      videoId: "video-1",
      watchedSeconds: 366.5,
      playCount: 2,
      completedCount: 1,
      emissionCount: 1,
      updatedAt: 1780000000000,
    },
  });
  assert.deepEqual(parsed.tagMergeDecisions, {
    "a::b": { from: "腿玩年", to: "美腿", decision: "merge", updatedAt: 10 },
    "c::d": { from: "长镜头感", to: "长镜头", decision: "keep", updatedAt: 11 },
  });
});

test("player data store saves watch activity in full payload", async () => {
  const originalFetch = globalThis.fetch;
  let savedPayload = null;
  try {
    globalThis.fetch = async (_url, init) => {
      savedPayload = JSON.parse(init.body);
      return new Response("{}", { status: 200 });
    };

    await storage.saveGlobalPlayerDataStore({
      version: 5,
      progress: {},
      favorites: [],
      videoRatings: {},
      videoComments: {},
      videoTags: {},
      videoStats: {},
      watchActivity: {
        "2026-06-29::video-1": {
          date: "2026-06-29",
          videoId: "video-1",
          watchedSeconds: 120,
          playCount: 1,
          completedCount: 0,
          emissionCount: 0,
          updatedAt: 1780000000000,
        },
      },
      videoHighlights: {},
      tagMergeDecisions: {},
      embeddedSubtitles: [],
      danmakuSelections: {},
      danmakuPreferences: {},
      preferences: storage.defaultPlayerPreferences,
      settings: storage.defaultPlayerSettings,
      duplicateDetection: null,
      duplicateDetections: {},
      metadata: undefined,
    });

    assert.deepEqual(savedPayload.watchActivity, {
      "2026-06-29::video-1": {
        date: "2026-06-29",
        videoId: "video-1",
        watchedSeconds: 120,
        playCount: 1,
        completedCount: 0,
        emissionCount: 0,
        updatedAt: 1780000000000,
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
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
  assert.equal(oldStore.preferences.homeMediaMode, "anime");
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

  assert.equal(store.version, 6);
  assert.deepEqual(store.videoTags, {});
  assert.deepEqual(store.videoRatings, {});
  assert.deepEqual(store.videoStats, {});
  assert.deepEqual(store.tagMergeDecisions, {});
  assert.deepEqual(store.videoHighlights, {});
  assert.deepEqual(store.danmakuSelections, {});
  assert.equal(store.danmakuPreferences.showSimplified, true);
  assert.equal(store.preferences.homeMediaMode, "anime");
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

test("duplicate detection parsing keeps valid pairs while normalizing bounded metadata", () => {
  const message = `  ${"完成".repeat(120)}  `;
  const parsed = storage.parseDuplicateDetectionResult({
    mode: "anime",
    scopeKey: "   ",
    updatedAt: -2.6,
    message,
    pairs: [
      null,
      [],
      {
        key: "a\u0000b",
        aId: "a",
        bId: "b",
        score: -4.6,
        severity: "suspicious",
        reasons: ["  名称一致  ", "名称一致", 42],
      },
      {
        key: "bad-score",
        aId: "a",
        bId: "c",
        score: Number.POSITIVE_INFINITY,
        severity: "duplicate",
      },
    ],
  });

  assert.equal(parsed.mode, "anime");
  assert.equal(parsed.scopeKey, "anime");
  assert.equal(parsed.updatedAt, 0);
  assert.equal(parsed.message.length, 200);
  assert.deepEqual(parsed.pairs, [{
    key: "a\u0000b",
    aId: "a",
    bId: "b",
    score: 0,
    severity: "suspicious",
    reasons: ["名称一致"],
  }]);
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

test("player data stores parse valid edit retention segments", () => {
  const parsed = storage.parsePlayerDataStore(JSON.stringify({
    version: 5,
    items: {},
    favorites: [],
    videoEditSegments: {
      video1: [
        { id: "edit-2", startTime: 30, endTime: 40, updatedAt: 102 },
        { id: "edit-1", startTime: 5, endTime: 20, updatedAt: 100 },
        { id: "bad", startTime: 12, endTime: 8, updatedAt: 101 },
      ],
    },
  }));

  assert.deepEqual(parsed.videoEditSegments, {
    video1: [
      { id: "edit-1", startTime: 5, endTime: 20, updatedAt: 100 },
      { id: "edit-2", startTime: 30, endTime: 40, updatedAt: 102 },
    ],
  });
});
