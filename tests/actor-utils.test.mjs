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
