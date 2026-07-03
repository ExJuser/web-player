import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const viewModel = await importTsModule(new URL("../src/appViewModel.ts", import.meta.url));

test("creates primary home labels without changing existing copy", () => {
  assert.deepEqual(
    viewModel.createPrimaryHomeLabels({ primaryResumeCard: { video: { id: "v1" } }, modeFilteredVideoCount: 1 }),
    { title: "继续观看", action: "继续播放" },
  );
  assert.deepEqual(
    viewModel.createPrimaryHomeLabels({ primaryResumeCard: null, modeFilteredVideoCount: 2 }),
    { title: "开始观看", action: "播放第一个视频" },
  );
  assert.deepEqual(
    viewModel.createPrimaryHomeLabels({ primaryResumeCard: null, modeFilteredVideoCount: 0 }),
    { title: "准备播放", action: "播放第一个视频" },
  );
});

test("formats special insight ranking metrics for every tab", () => {
  const originalNow = Date.now;
  Date.now = () => new Date("2024-01-10T12:00:00Z").getTime();
  const insight = {
    stats: {
      totalPlayedSeconds: 125 * 60,
      playCount: 7,
      emissionCount: 3,
    },
    playIntensity: 2.345,
    activeAt: Date.now() - 3 * 60 * 60 * 1000,
  };

  try {
    assert.equal(viewModel.formatSpecialInsightVideoMetric(insight, "played"), "2小时5分 · 约 2.3 遍");
    assert.equal(viewModel.formatSpecialInsightVideoMetric({ ...insight, playIntensity: null }, "played"), "2小时5分");
    assert.equal(viewModel.formatSpecialInsightVideoMetric(insight, "count"), "7 次播放");
    assert.equal(viewModel.formatSpecialInsightVideoMetric(insight, "emission"), "3 次发射");
    assert.equal(viewModel.formatSpecialInsightVideoMetric(insight, "active"), "3 小时前");
  } finally {
    Date.now = originalNow;
  }
});
