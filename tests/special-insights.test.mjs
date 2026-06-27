import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const specialInsights = await importTsModule(new URL("../src/specialInsights.ts", import.meta.url));
const uiState = await importTsModule(new URL("../src/playerUiState.ts", import.meta.url));

function createVideo(overrides = {}) {
  return {
    id: overrides.id ?? "root-a|actor/a.mp4|100|1",
    name: overrides.name ?? "a.mp4",
    relativePath: overrides.relativePath ?? "actor/a.mp4",
    url: "",
    size: overrides.size ?? 100,
    lastModified: overrides.lastModified ?? 1,
    mediaRootId: overrides.mediaRootId ?? "root-a",
    duration: overrides.duration,
  };
}

function statsFor(video, stats) {
  return {
    [uiState.createVideoStatsKey(video)]: {
      totalPlayedSeconds: 0,
      playCount: 0,
      durationSeconds: 0,
      emissionCount: 0,
      updatedAt: 0,
      ...stats,
    },
  };
}

test("builds special mode summary and video rankings from existing stats", () => {
  const first = createVideo({ id: "root-a|actor/b.mp4|100|1", name: "b.mp4", relativePath: "actor/b.mp4", duration: 100 });
  const second = createVideo({ id: "root-a|actor/a.mp4|100|2", name: "a.mp4", relativePath: "actor/a.mp4", lastModified: 2 });
  const third = createVideo({ id: "root-a|actor/c.mp4|100|3", name: "c.mp4", relativePath: "actor/c.mp4", lastModified: 3 });
  const videoStats = {
    ...statsFor(first, {
      totalPlayedSeconds: 250,
      playCount: 2,
      durationSeconds: 100,
      emissionCount: 1,
      lastEmissionAt: 1000,
      updatedAt: 900,
    }),
    ...statsFor(second, {
      totalPlayedSeconds: 250,
      playCount: 4,
      durationSeconds: 0,
      emissionCount: 3,
      lastEmissionAt: 1200,
      updatedAt: 1100,
    }),
  };

  const insights = specialInsights.buildSpecialModeInsights(
    [first, second, third],
    videoStats,
    {
      [first.id]: ["剧情", "劇情", "剧情"],
      [second.id]: ["美腿"],
    },
    {
      [third.id]: {
        currentTime: 12,
        duration: 100,
        updatedAt: 1300,
        completed: false,
      },
    },
  );

  assert.equal(insights.summary.totalVideos, 3);
  assert.equal(insights.summary.taggedVideos, 2);
  assert.equal(insights.summary.totalPlayedSeconds, 500);
  assert.equal(insights.summary.playCount, 6);
  assert.equal(insights.summary.emissionCount, 4);
  assert.equal(insights.summary.lastEmissionAt, 1200);
  assert.equal(insights.videosByPlayedDuration.map((insight) => insight.video.relativePath).join(","), "actor/a.mp4,actor/b.mp4");
  assert.equal(insights.videosByPlayCount[0].video.id, second.id);
  assert.equal(insights.videosByEmissionCount[0].video.id, second.id);
  assert.equal(insights.videosByRecentActivity[0].video.id, third.id);
  assert.equal(insights.videosByPlayedDuration[1].playIntensity, 2.5);
  assert.equal(insights.videosByPlayedDuration[0].playIntensity, null);
});

test("aggregates normalized tag stats by video count, played duration, and emission count", () => {
  const first = createVideo({ id: "root-a|one.mp4|100|1", name: "one.mp4", relativePath: "one.mp4" });
  const second = createVideo({ id: "root-b|two.mp4|100|2", name: "two.mp4", relativePath: "two.mp4", lastModified: 2, mediaRootId: "root-b" });
  const third = createVideo({ id: "root-b|three.mp4|100|3", name: "three.mp4", relativePath: "three.mp4", lastModified: 3, mediaRootId: "root-b" });
  const insights = specialInsights.buildSpecialModeInsights(
    [first, second, third],
    {
      ...statsFor(first, { totalPlayedSeconds: 120, emissionCount: 1 }),
      ...statsFor(second, { totalPlayedSeconds: 60, emissionCount: 4 }),
      ...statsFor(third, { totalPlayedSeconds: 300, emissionCount: 0 }),
    },
    {
      [first.id]: ["AI-字幕", "ＡＩ字幕"],
      [second.id]: ["AI字幕", "剧情"],
      [third.id]: ["剧情"],
    },
    {},
  );

  assert.deepEqual(
    insights.tagsByVideoCount.map((tag) => [tag.key, tag.videoCount]),
    [["剧情", 2], ["ai字幕", 2]],
  );
  assert.deepEqual(
    insights.tagsByPlayedDuration.map((tag) => [tag.key, tag.totalPlayedSeconds]),
    [["剧情", 360], ["ai字幕", 180]],
  );
  assert.deepEqual(
    insights.tagsByEmissionCount.map((tag) => [tag.key, tag.emissionCount]),
    [["ai字幕", 5], ["剧情", 4]],
  );
});

test("surfaces active untagged videos without including idle untagged videos", () => {
  const active = createVideo({ id: "root-a|active.mp4|100|1", name: "active.mp4", relativePath: "active.mp4" });
  const idle = createVideo({ id: "root-a|idle.mp4|100|2", name: "idle.mp4", relativePath: "idle.mp4", lastModified: 2 });

  const insights = specialInsights.buildSpecialModeInsights(
    [active, idle],
    statsFor(active, { playCount: 1 }),
    {},
    {},
  );

  assert.deepEqual(insights.untaggedActiveVideos.map((insight) => insight.video.id), [active.id]);
});
