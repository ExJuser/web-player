import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const activityInsights = await importTsModule(new URL("../src/watchActivityInsights.ts", import.meta.url));

function createVideo(overrides = {}) {
  return {
    id: overrides.id ?? "video-1",
    name: overrides.name ?? "one.mp4",
    relativePath: overrides.relativePath ?? "one.mp4",
    url: "",
    size: 100,
    lastModified: 1,
    mediaRootId: overrides.mediaRootId ?? "root-a",
  };
}

test("builds heatmap days and top tags from the selected video scope", () => {
  const first = createVideo({ id: "video-1", name: "one.mp4" });
  const second = createVideo({ id: "video-2", name: "two.mp4" });
  const outsideScope = createVideo({ id: "video-3", name: "three.mp4" });

  const insights = activityInsights.buildWatchActivityInsights(
    {
      "2026-06-27::video-1": {
        date: "2026-06-27",
        videoId: "video-1",
        watchedSeconds: 120,
        playCount: 2,
        completedCount: 1,
        emissionCount: 0,
        updatedAt: 1,
      },
      "2026-06-28::video-2": {
        date: "2026-06-28",
        videoId: "video-2",
        watchedSeconds: 60,
        playCount: 1,
        completedCount: 0,
        emissionCount: 3,
        updatedAt: 2,
      },
      "2026-06-28::video-3": {
        date: "2026-06-28",
        videoId: "video-3",
        watchedSeconds: 999,
        playCount: 9,
        completedCount: 9,
        emissionCount: 9,
        updatedAt: 3,
      },
    },
    [first, second],
    {
      "video-1": ["剧情", "劇情"],
      "video-2": ["剧情", "AI字幕"],
      "video-3": ["不应出现"],
    },
    { rangeDays: 30, metric: "emission", today: "2026-06-29" },
  );

  assert.equal(insights.days.length, 30);
  assert.equal(insights.activeDays, 2);
  assert.equal(insights.totalWatchedSeconds, 180);
  assert.equal(insights.totalPlayCount, 3);
  assert.equal(insights.totalCompletedCount, 1);
  assert.equal(insights.totalEmissionCount, 3);
  assert.equal(insights.maxMetricValue, 3);
  assert.deepEqual(
    insights.topTags.map((tag) => [tag.key, tag.emissionCount, tag.videoIds.sort()]),
    [["剧情", 3, ["video-1", "video-2"]], ["ai字幕", 3, ["video-2"]]],
  );
});

test("groups activity days into Monday-first calendar months", () => {
  const days = [
    {
      date: "2026-05-31",
      watchedSeconds: 0,
      playCount: 0,
      completedCount: 0,
      emissionCount: 0,
      videoIds: [],
    },
    {
      date: "2026-06-01",
      watchedSeconds: 90,
      playCount: 1,
      completedCount: 0,
      emissionCount: 0,
      videoIds: ["video-1"],
    },
    {
      date: "2026-06-02",
      watchedSeconds: 0,
      playCount: 0,
      completedCount: 1,
      emissionCount: 0,
      videoIds: ["video-2"],
    },
  ];

  const months = activityInsights.groupWatchActivityDaysByMonth(days);

  assert.equal(months.length, 2);
  assert.deepEqual(
    months.map((month) => [month.key, month.label, month.leadingEmptyDays, month.activeDays, month.days.map((day) => day.date)]),
    [
      ["2026-05", "5月", 4, 0, ["2026-05-31"]],
      ["2026-06", "6月", 0, 2, ["2026-06-01", "2026-06-02"]],
    ],
  );
});

test("orders daily video ids by watched seconds for thumbnail carousels", () => {
  const videos = [
    createVideo({ id: "video-a", name: "a.mp4" }),
    createVideo({ id: "video-b", name: "b.mp4" }),
    createVideo({ id: "video-c", name: "c.mp4" }),
  ];

  const insights = activityInsights.buildWatchActivityInsights(
    {
      "2026-06-29::video-a": {
        date: "2026-06-29",
        videoId: "video-a",
        watchedSeconds: 30,
        playCount: 3,
        completedCount: 0,
        emissionCount: 0,
        updatedAt: 1,
      },
      "2026-06-29::video-b": {
        date: "2026-06-29",
        videoId: "video-b",
        watchedSeconds: 120,
        playCount: 1,
        completedCount: 0,
        emissionCount: 0,
        updatedAt: 2,
      },
      "2026-06-29::video-c": {
        date: "2026-06-29",
        videoId: "video-c",
        watchedSeconds: 120,
        playCount: 2,
        completedCount: 0,
        emissionCount: 0,
        updatedAt: 3,
      },
    },
    videos,
    {},
    { rangeDays: 30, today: "2026-06-29" },
  );

  assert.deepEqual(insights.days.at(-1).videoIds, ["video-b", "video-c", "video-a"]);
});
