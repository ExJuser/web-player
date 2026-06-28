import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const formatUtils = await importTsModule(new URL("../src/playerFormatUtils.ts", import.meta.url));

test("formats playback time with hour rollover and invalid fallback", () => {
  assert.equal(formatUtils.formatTime(Number.NaN), "00:00");
  assert.equal(formatUtils.formatTime(-5), "00:00");
  assert.equal(formatUtils.formatTime(65.9), "01:05");
  assert.equal(formatUtils.formatTime(3661), "1:01:01");
});

test("formats file sizes with compact units", () => {
  assert.equal(formatUtils.formatFileSize(-1), "未知大小");
  assert.equal(formatUtils.formatFileSize(Number.POSITIVE_INFINITY), "未知大小");
  assert.equal(formatUtils.formatFileSize(512), "512 B");
  assert.equal(formatUtils.formatFileSize(1536), "1.5 KB");
  assert.equal(formatUtils.formatFileSize(10 * 1024 * 1024), "10 MB");
});

test("formats modified and relative times", () => {
  const originalNow = Date.now;
  const now = new Date("2024-01-10T12:00:00Z").getTime();
  Date.now = () => now;
  try {
    assert.equal(formatUtils.formatModifiedTime(0), "未知时间");
    assert.equal(
      formatUtils.formatModifiedTime(now),
      new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(now),
    );
    assert.equal(formatUtils.formatRelativeTime(0), "刚刚");
    assert.equal(formatUtils.formatRelativeTime(now - 30 * 1000), "刚刚");
    assert.equal(formatUtils.formatRelativeTime(now - 5 * 60 * 1000), "5 分钟前");
    assert.equal(formatUtils.formatRelativeTime(now - 3 * 60 * 60 * 1000), "3 小时前");
    assert.equal(formatUtils.formatRelativeTime(now - 2 * 24 * 60 * 60 * 1000), "2 天前");
    assert.equal(formatUtils.formatRelativeTime(now - 8 * 24 * 60 * 60 * 1000), formatUtils.formatModifiedTime(now - 8 * 24 * 60 * 60 * 1000));
  } finally {
    Date.now = originalNow;
  }
});

test("formats cumulative durations and resolution", () => {
  assert.equal(formatUtils.formatCumulativeDuration(0), "0 分钟");
  assert.equal(formatUtils.formatCumulativeDuration(30), "1 分钟");
  assert.equal(formatUtils.formatCumulativeDuration(125 * 60), "2小时5分");
  assert.equal(formatUtils.formatCumulativeDuration(2 * 3600), "2小时");

  assert.equal(formatUtils.formatResolution(), "读取中");
  assert.equal(formatUtils.formatResolution(1920, 1080), "1920 x 1080");
});
