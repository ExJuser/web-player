// 搜索记录链基准：videoActorSearchMetadata + playlistSearchRecords 构建成本（2 万视频）。
// 用法：node scripts/benchmark-search-chain.mjs
import { performance } from "node:perf_hooks";
import { importTsModule } from "../tests/importTsModule.mjs";

const actorUtils = await importTsModule(new URL("../src/actorUtils.ts", import.meta.url));
const seriesUtils = await importTsModule(new URL("../src/playerSeriesUtils.ts", import.meta.url));
const tagUtils = await importTsModule(new URL("../src/tagUtils.ts", import.meta.url));
const nfoCore = await importTsModule(new URL("../src/actorNfoCore.mjs", import.meta.url));

const COUNT = 20000;
const videos = [];
const videoTags = {};
const actorProfiles = {};
const actorTagDefinitions = {};
const videoActorOverrides = {};
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
  });
  videoTags[videos[index].id] = index % 3 === 0 ? ["高能", "收藏"] : ["高能"];
  if (index % 50 === 0) actorProfiles[`actor-${index}`] = { id: `actor-${index}`, name: `演员${index}`, aliases: [], updatedAt: 1 };
}

function measure(label, fn) {
  const startedAt = performance.now();
  const result = fn();
  console.log(`${label.padEnd(58)} ${(performance.now() - startedAt).toFixed(1)} ms`);
  return result;
}

// 返回耗时（毫秒）而非结果对象，供后续百分比计算。
function measureTimed(label, fn) {
  const startedAt = performance.now();
  fn();
  const elapsedMs = performance.now() - startedAt;
  console.log(`${label.padEnd(58)} ${elapsedMs.toFixed(1)} ms`);
  return elapsedMs;
}

console.log(`视频规模: ${COUNT}`);
console.log("-".repeat(72));
const aliasIndex = actorUtils.createActorAliasIndex(actorProfiles);
const metadata = measure("videoActorSearchMetadata（每视频 resolveVideoActors）", () => {
  const out = {};
  for (const video of videos) {
    const resolved = actorUtils.resolveVideoActors({ video, profiles: actorProfiles, videoTags, actorTagDefinitions, videoActorOverrides });
    const profiles = resolved.actorIds.flatMap((actorId) => actorProfiles[actorId] ? [actorProfiles[actorId]] : []);
    out[video.id] = {
      names: profiles.map((profile) => profile.name),
      aliases: profiles.flatMap((profile) => profile.aliases.map((alias) => alias.label)),
    };
  }
  return out;
});
measure("playlistSearchRecords（含 inferSeriesTitle + 标签过滤）", () => {
  const out = [];
  for (const video of videos) {
    const actorMetadata = metadata[video.id] ?? { names: [], aliases: [] };
    const actorKeys = new Set([...actorMetadata.names, ...actorMetadata.aliases].map(tagUtils.normalizeTagKey));
    out.push({
      id: video.id,
      title: video.name,
      path: video.relativePath,
      score: undefined,
      series: seriesUtils.inferSeriesTitle(video),
      tags: (videoTags[video.id] ?? []).filter((tag) => !actorKeys.has(tagUtils.normalizeTagKey(tag))),
      actors: actorMetadata.names,
      actorAliases: actorMetadata.aliases,
      comment: undefined,
      highlightDescriptions: [],
      library: "root",
    });
  }
  return out;
});

// 逐视频缓存解析器：冷/暖两遍
const resolver = actorUtils.createVideoActorMetadataResolver();
const versionKey = "1";
const cold = measureTimed("缓存解析器冷构建（全量 20k）", () => {
  const out = {};
  for (const video of videos) {
    out[video.id] = resolver({ video, profiles: actorProfiles, tagDefinitions: actorTagDefinitions, overrides: videoActorOverrides, tags: videoTags[video.id] ?? [], versionKey });
  }
  return out;
});
const warm = measureTimed("缓存解析器暖遍历（依赖变化重跑）", () => {
  const out = {};
  for (const video of videos) {
    out[video.id] = resolver({ video, profiles: actorProfiles, tagDefinitions: actorTagDefinitions, overrides: videoActorOverrides, tags: videoTags[video.id] ?? [], versionKey });
  }
  return out;
});
console.log(`暖遍历/冷构建: ${(warm / cold * 100).toFixed(1)}%`);
