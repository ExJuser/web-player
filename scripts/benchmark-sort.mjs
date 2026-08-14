// 缩略图提交代价基准：每次 setVideos 触发的过滤+重排成本（2 万视频规模）。
// 用法：node scripts/benchmark-sort.mjs
import { performance } from "node:perf_hooks";
import { importTsModule } from "../tests/importTsModule.mjs";

const uiState = await importTsModule(new URL("../src/playerUiState.ts", import.meta.url));
const mediaUtils = await importTsModule(new URL("../src/playerMediaUtils.ts", import.meta.url));

const COUNT = 20000;
const videos = [];
for (let index = 0; index < COUNT; index += 1) {
  const series = String.fromCharCode(65 + (index % 26));
  videos.push({
    id: `root|系列${series}/第${String((index % 40) + 1).padStart(2, "0")}话.mkv|${index}|${index}`,
    name: `第${String((index % 40) + 1).padStart(2, "0")}话.mkv`,
    relativePath: `系列${series}/第${String((index % 40) + 1).padStart(2, "0")}话.mkv`,
    url: `/api/media/root/系列${series}/第${String((index % 40) + 1).padStart(2, "0")}话.mkv`,
    size: 1000 + index,
    lastModified: 1000 + index,
    mediaRootId: "root",
    duration: index % 2 ? 3600 : 1800,
    thumbnailStatus: "idle",
  });
}
const modeRootIds = new Set(["root"]);

function measure(label, fn) {
  const startedAt = performance.now();
  fn();
  const elapsedMs = performance.now() - startedAt;
  console.log(`${label.padEnd(52)} ${elapsedMs.toFixed(2)} ms`);
  return elapsedMs;
}

console.log(`视频规模: ${COUNT}`);
console.log("-".repeat(64));
const filterMs = measure("filterVideosByHomeMediaMode（全量过滤）", () => {
  uiState.filterVideosByHomeMediaMode(videos, modeRootIds, "anime");
});
const sortMs = measure("getSortedVideos name（全库排序，含昂贵比较器）", () => {
  mediaUtils.getSortedVideos(videos, "name", false, {});
});
const sortStatsMs = measure("getSortedVideos playedDuration（stats 排序）", () => {
  const stats = {};
  for (let index = 0; index < COUNT; index += 1) stats[`v${index}`] = { totalPlayedSeconds: index, updatedAt: index };
  mediaUtils.getSortedVideos(videos, "playedDuration", false, stats);
});
const firstMs = measure("getFirstSortedVideo name（单遍求首元素）", () => {
  mediaUtils.getFirstSortedVideo(videos, "name", false, {});
});
const batchMs = measure("合并后单次提交（filter+sort）", () => {
  uiState.filterVideosByHomeMediaMode(videos, modeRootIds, "anime");
  mediaUtils.getSortedVideos(videos, "name", false, {});
});
console.log("-".repeat(64));
console.log(`按当前批次(2条/次)提交 25 次合计 ≈ ${(batchMs * 25).toFixed(0)} ms`);
console.log(`只取首元素时（启动/切库初始选中），全量排序 → 单遍求值节省 ${(sortMs / Math.max(firstMs, 0.01)).toFixed(1)} 倍`);
