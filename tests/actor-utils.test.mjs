import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const actors = await importTsModule(new URL("../src/actorUtils.ts", import.meta.url));
const storage = await importTsModule(new URL("../src/playerStorage.ts", import.meta.url));

const video = (id, overrides = {}) => ({ id, name: `${id}.mp4`, relativePath: `${id}.mp4`, url: "", size: 1, lastModified: 1, ...overrides });

test("resolves manual over nfo over actor tags and keeps manual empty lists", () => {
  const videos = [
    video("nfo", { actorHints: { fileName: "nfo.nfo", names: ["NFO Actor"], status: "parsed" } }),
    video("tag"),
    video("empty", { actorHints: { fileName: "empty.nfo", names: ["NFO Actor"], status: "parsed" } }),
  ];
  const actorTagDefinitions = { tagactor: { key: "tagactor", label: "Tag Actor", updatedAt: 1 } };
  const videoTags = { nfo: ["Tag Actor"], tag: ["Tag Actor"] };
  const profiles = actors.reconcileActorProfiles({ profiles: {}, videos, videoTags, actorTagDefinitions, now: 1 });
  const nfo = actors.resolveVideoActors({ video: videos[0], profiles, videoTags, actorTagDefinitions, videoActorOverrides: {} });
  const tag = actors.resolveVideoActors({ video: videos[1], profiles, videoTags, actorTagDefinitions, videoActorOverrides: {} });
  const empty = actors.resolveVideoActors({ video: videos[2], profiles, videoTags, actorTagDefinitions, videoActorOverrides: { empty: { actorIds: [], updatedAt: 2 } } });

  assert.equal(nfo.source, "nfo");
  assert.equal(profiles[nfo.actorIds[0]].name, "NFO Actor");
  assert.equal(tag.source, "tag");
  assert.equal(profiles[tag.actorIds[0]].name, "Tag Actor");
  assert.deepEqual(empty, { actorIds: [], source: "manual" });
});

test("adds actor names to an existing selection and deduplicates names and aliases", () => {
  const profiles = {
    "actor:existing": {
      id: "actor:existing",
      name: "Existing Actor",
      aliases: [{ key: "existing actor", label: "Existing Actor" }, { key: "existing", label: "Existing" }],
      updatedAt: 1,
    },
  };

  const merged = actors.addActorNamesToSelection({
    profiles,
    actorIds: ["actor:existing"],
    names: ["Existing", "New Actor", "New Actor"],
    now: 2,
  });
  assert.deepEqual(merged.actorIds, ["actor:existing", "actor:new actor"]);
  assert.equal(merged.profiles["actor:new actor"].name, "New Actor");

  const fromEmpty = actors.addActorNamesToSelection({ profiles, actorIds: [], names: ["New Actor"], now: 3 });
  assert.deepEqual(fromEmpty.actorIds, ["actor:new actor"]);
});

test("builds cached actor card tags and playback summaries", () => {
  const videos = [video("one", { name: "one.mp4", size: 10, lastModified: 10 }), video("two", { name: "two.mp4", size: 20, lastModified: 20 })];
  const profiles = {
    "actor:star": { id: "actor:star", name: "Star", aliases: [{ key: "star", label: "Star" }], updatedAt: 1 },
  };
  const insight = actors.buildActorInsights({
    videos,
    profiles,
    videoTags: { one: ["Star", "剧情", "高清"], two: ["剧情", "字幕"] },
    actorTagDefinitions: {},
    videoActorOverrides: {
      one: { actorIds: ["actor:star"], updatedAt: 1 },
      two: { actorIds: ["actor:star"], updatedAt: 1 },
    },
    videoStats: {
      "one.mp4|10|10": { totalPlayedSeconds: 120, playCount: 2, durationSeconds: 60, emissionCount: 1, updatedAt: 10 },
      "two.mp4|20|20": { totalPlayedSeconds: 180, playCount: 3, durationSeconds: 90, emissionCount: 2, updatedAt: 20 },
    },
    watchActivity: {
      recent: { date: "2026-07-19", videoId: "two", watchedSeconds: 1, playCount: 1, completedCount: 0, emissionCount: 0, updatedAt: 200 },
      emissionOnly: { date: "2026-07-20", videoId: "two", watchedSeconds: 0, playCount: 0, completedCount: 0, emissionCount: 1, updatedAt: 300 },
    },
  }).actors[0];

  assert.deepEqual(insight.commonTags, ["剧情", "高清", "字幕"]);
  assert.deepEqual(insight.stats, { emissionCount: 3, playCount: 5, totalPlayedSeconds: 300, lastWatchedAt: 200 });
});

test("media scan cache preserves optional nfo actor hints and accepts old videos without them", () => {
  const base = {
    version: 1,
    videos: [{ id: "root|movie.mp4|1|1", name: "movie.mp4", relativePath: "movie.mp4", url: "/movie", size: 1, lastModified: 1, mediaRootId: "root", actorHints: { fileName: "movie.nfo", names: ["Actor"], status: "parsed" } }],
    subtitles: [],
    scannedFiles: 1,
    filteredSmallVideos: 0,
    metadata: { id: "global", name: "全局媒体库", videoCount: 1, scannedFiles: 1, updatedAt: 1, mediaRoots: [] },
    updatedAt: 1,
  };
  assert.deepEqual(storage.parseCachedMediaRootScan(JSON.stringify(base)).videos[0].actorHints.names, ["Actor"]);
  delete base.videos[0].actorHints;
  assert.equal(storage.parseCachedMediaRootScan(JSON.stringify(base)).videos[0].actorHints, undefined);
});
