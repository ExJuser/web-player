import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const discovery = await importTsModule(new URL("../src/actorDiscovery.ts", import.meta.url));

function createVideo(id) {
  return { id, name: `${id}.mp4`, relativePath: `${id}.mp4`, url: "", size: 1, lastModified: 1 };
}

function createActor(id, name, aliases, videoCount, latestModified, stats = {}) {
  const videos = Array.from({ length: videoCount }, (_, index) => ({ video: createVideo(`${id}-${index}`) }));
  return {
    actor: { id, name, aliases: aliases.map((label) => ({ key: label.toLowerCase(), label })) },
    videos,
    representativeVideo: videos[0]?.video ?? createVideo(`${id}-fallback`),
    latestModified,
    stats: {
      playCount: stats.playCount ?? 0,
      totalPlayedSeconds: stats.totalPlayedSeconds ?? 0,
      emissionCount: stats.emissionCount ?? 0,
      lastWatchedAt: 0,
    },
  };
}

const actors = [
  createActor("alice", "Alice", ["Alpha"], 1, 100, { playCount: 2, totalPlayedSeconds: 20, emissionCount: 3 }),
  createActor("bob", "Bob", ["Bravo"], 3, 300, { playCount: 1, totalPlayedSeconds: 40, emissionCount: 2 }),
  createActor("cara", "Cara", ["Charlie"], 2, 200, { playCount: 4, totalPlayedSeconds: 10, emissionCount: 1 }),
];

function filterAndSort(overrides = {}) {
  return discovery.filterAndSortActors({
    actors,
    discoveryBatch: 0,
    discoveryDateKey: "2026-08-09",
    discoveryScope: "all",
    query: "",
    recentActorIds: [],
    sort: "name",
    sortDirection: "asc",
    ...overrides,
  });
}

test("normalizes actor queries and matches aliases", () => {
  assert.deepEqual(filterAndSort({ query: " ＡＬＰＨＡ " }).map((entry) => entry.actor.id), ["alice"]);
  assert.deepEqual(filterAndSort({ query: "bob" }).map((entry) => entry.actor.id), ["bob"]);
});

test("sorts actor metrics in the requested direction without mutating the source array", () => {
  const originalOrder = actors.map((entry) => entry.actor.id);
  assert.deepEqual(filterAndSort({ sort: "count", sortDirection: "desc" }).map((entry) => entry.actor.id), ["bob", "cara", "alice"]);
  assert.deepEqual(filterAndSort({ sort: "recent", sortDirection: "asc" }).map((entry) => entry.actor.id), ["alice", "cara", "bob"]);
  assert.deepEqual(filterAndSort({ sort: "playCount", sortDirection: "desc" }).map((entry) => entry.actor.id), ["cara", "alice", "bob"]);
  assert.deepEqual(filterAndSort({ sort: "duration", sortDirection: "desc" }).map((entry) => entry.actor.id), ["bob", "alice", "cara"]);
  assert.deepEqual(filterAndSort({ sort: "emissionCount", sortDirection: "desc" }).map((entry) => entry.actor.id), ["alice", "bob", "cara"]);
  assert.deepEqual(actors.map((entry) => entry.actor.id), originalOrder);
});

test("explore sorting lowers otherwise equivalent recently shown actors", () => {
  const equalActors = [
    createActor("seen", "Seen", [], 1, 100),
    createActor("unseen", "Unseen", [], 1, 100),
  ];
  const result = filterAndSort({ actors: equalActors, recentActorIds: ["seen"], sort: "explore" });
  assert.deepEqual(result.map((entry) => entry.actor.id), ["unseen", "seen"]);
});

test("cover selection avoids recently used videos when alternatives exist", () => {
  const actor = createActor("star", "Star", [], 3, 100);
  const first = actor.videos[0].video;
  const selected = discovery.selectActorCoverVideo(actor, "seed", [first.id]);
  assert.notEqual(selected.id, first.id);

  const selectedAfterAllSeen = discovery.selectActorCoverVideo(actor, "seed", actor.videos.map(({ video }) => video.id));
  assert.notEqual(selectedAfterAllSeen.id, first.id);
});
