import assert from "node:assert/strict";
import test from "node:test";

import { createPlayerDeferredData, createPlayerStartupData } from "../server/playerDataViews.mjs";

const store = {
  version: 6,
  items: { video: { currentTime: 1 } },
  favorites: ["video"],
  videoRatings: { video: 8 },
  videoComments: { video: "good" },
  videoTags: { video: ["tag"] },
  actorProfiles: {},
  actorTagDefinitions: {},
  videoActorOverrides: {},
  videoStats: {},
  watchActivity: {},
  tagMergeDecisions: {},
  danmakuPreferences: {},
  preferences: { homeMediaMode: "anime" },
  settings: { theme: "dark" },
  metadata: { id: "global" },
  videoHighlights: { video: [{ id: "highlight" }] },
  videoEditSegments: {},
  embeddedSubtitles: [{ id: "subtitle" }],
  danmakuSelections: { video: { sourceId: "source" } },
  duplicateDetection: null,
  duplicateDetections: { all: { pairs: [] } },
};

test("player startup view excludes deferred player-only data", () => {
  const startup = createPlayerStartupData(store);
  assert.deepEqual(startup.videoTags, store.videoTags);
  assert.deepEqual(startup.preferences, store.preferences);
  assert.equal("embeddedSubtitles" in startup, false);
  assert.equal("duplicateDetections" in startup, false);
});

test("player deferred view excludes mutable startup data", () => {
  const deferred = createPlayerDeferredData(store);
  assert.deepEqual(deferred.embeddedSubtitles, store.embeddedSubtitles);
  assert.deepEqual(deferred.duplicateDetections, store.duplicateDetections);
  assert.equal("videoTags" in deferred, false);
  assert.equal("preferences" in deferred, false);
});
