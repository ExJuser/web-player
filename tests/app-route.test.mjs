import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const routes = await importTsModule(new URL("../src/appRoute.ts", import.meta.url));

test("parses and serializes every supported route", () => {
  const cases = [
    [{ kind: "home" }, "#/home"],
    [{ kind: "feed" }, "#/feed"],
    [{ kind: "explore", section: "overview" }, "#/explore/overview"],
    [{ kind: "explore", section: "actors" }, "#/explore/actors"],
    [{ kind: "explore", section: "creative" }, "#/explore/creative"],
    [{ kind: "explore", section: "creative", feature: "rings" }, "#/explore/creative/rings"],
    [{ kind: "explore", section: "creative", feature: "mosaic" }, "#/explore/creative/mosaic"],
    [{ kind: "photos" }, "#/photos"],
  ];

  cases.forEach(([route, hash]) => {
    assert.equal(routes.serializeAppRoute(route), hash);
    assert.deepEqual(routes.parseAppRoute(hash), route);
  });
});

test("round trips resource ids containing paths, separators, spaces, and Chinese", () => {
  const cases = [
    { kind: "explore", section: "actors", actorId: "actor:张 三/测试|演员" },
    { kind: "player", videoId: "root|电影/示例 01.mkv|1024|99" },
    {
      kind: "photoViewer",
      albumId: "root|写真/第一册",
      imageId: "root|写真/第一册/01 图.jpg|2048|100",
      returnTo: "mosaic",
    },
  ];

  cases.forEach((route) => {
    assert.deepEqual(routes.parseAppRoute(routes.serializeAppRoute(route)), route);
  });
});

test("falls back safely for unknown routes and missing required ids", () => {
  assert.deepEqual(routes.parseAppRoute(""), { kind: "home" });
  assert.deepEqual(routes.parseAppRoute("#/unknown"), { kind: "home" });
  assert.deepEqual(routes.parseAppRoute("#/player"), { kind: "home" });
  assert.deepEqual(routes.parseAppRoute("#/photos/viewer?image=orphan"), { kind: "photos" });
  assert.deepEqual(routes.parseAppRoute("#/photos/viewer?album=album-1&from=invalid"), {
    kind: "photoViewer",
    albumId: "album-1",
    returnTo: "photos",
  });
});

test("maps routes to existing view names", () => {
  assert.equal(routes.activeViewForRoute({ kind: "home" }), "home");
  assert.equal(routes.activeViewForRoute({ kind: "feed" }), "feed");
  assert.equal(routes.activeViewForRoute({ kind: "explore", section: "actors" }), "explore");
  assert.equal(routes.activeViewForRoute({ kind: "player", videoId: "v1" }), "player");
  assert.equal(routes.activeViewForRoute({ kind: "photos" }), "photos");
  assert.equal(
    routes.activeViewForRoute({ kind: "photoViewer", albumId: "a1", returnTo: "photos" }),
    "photoViewer",
  );
});
