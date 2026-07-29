import { gzipSync } from "node:zlib";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

import { importTsModule } from "../tests/importTsModule.mjs";
import {
  createLargeLibrarySearchRecords,
  createLargeMosaicAlbums,
  defaultLargeLibraryPhotoCount,
  defaultLargeLibraryVideoCount,
  flattenMosaicPhotoSources,
} from "./large-library-fixtures.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(rootDir, "dist");
const search = await importTsModule(new URL("../src/playerPlaylistSearch.ts", import.meta.url));

function percentile(values, percent) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * percent))];
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
}

async function measureAssets() {
  let entries;
  try {
    entries = await readdir(path.join(distDir, "assets"), { withFileTypes: true });
  } catch {
    return { available: false, files: [] };
  }
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/\.(?:js|css)$/u.test(entry.name)) continue;
    const contents = await readFile(path.join(distDir, "assets", entry.name));
    files.push({
      name: entry.name,
      bytes: contents.byteLength,
      gzipBytes: gzipSync(contents).byteLength,
    });
  }
  return { available: true, files: files.sort((left, right) => right.bytes - left.bytes) };
}

function measureSearch() {
  const records = createLargeLibrarySearchRecords();
  const buildStartedAt = performance.now();
  const documents = search.createPlaylistSearchDocuments(records);
  const buildMs = performance.now() - buildStartedAt;
  const videos = records.map(({ id }) => ({ id }));
  const queries = ["系列 100", "演员 42", "中文字幕 >=8", '"第 08 集" -高清', "高能片段 12"];
  const samples = [];
  for (let iteration = 0; iteration < 8; iteration += 1) {
    for (const query of queries) {
      const startedAt = performance.now();
      search.searchPlaylistVideos(videos, documents, query);
      samples.push(performance.now() - startedAt);
    }
  }
  return {
    recordCount: records.length,
    buildMs,
    p50Ms: percentile(samples, 0.5),
    p95Ms: percentile(samples, 0.95),
  };
}

function measureMosaicMaterialization() {
  const beforeHeap = process.memoryUsage().heapUsed;
  const albumsStartedAt = performance.now();
  const albums = createLargeMosaicAlbums();
  const albumsMs = performance.now() - albumsStartedAt;
  const flattenStartedAt = performance.now();
  const sources = flattenMosaicPhotoSources(albums);
  const flattenMs = performance.now() - flattenStartedAt;
  const heapDelta = Math.max(0, process.memoryUsage().heapUsed - beforeHeap);
  return {
    photoCount: sources.length,
    albumCount: albums.length,
    albumsMs,
    flattenMs,
    heapDelta,
  };
}

const assets = await measureAssets();
const searchMetrics = measureSearch();
const mosaicMetrics = measureMosaicMaterialization();

console.log(`Large-library baseline (${defaultLargeLibraryVideoCount} videos / ${defaultLargeLibraryPhotoCount} photos)`);
console.log(`Search documents: ${searchMetrics.buildMs.toFixed(1)} ms`);
console.log(`Search warm P50/P95: ${searchMetrics.p50Ms.toFixed(1)} / ${searchMetrics.p95Ms.toFixed(1)} ms`);
console.log(`Mosaic albums/materialization: ${mosaicMetrics.albumsMs.toFixed(1)} / ${mosaicMetrics.flattenMs.toFixed(1)} ms`);
console.log(`Mosaic heap delta: ${formatBytes(mosaicMetrics.heapDelta)}`);
if (assets.available) {
  console.log("Current dist assets:");
  assets.files.forEach((file) => {
    console.log(`  ${file.name}: ${formatBytes(file.bytes)} raw / ${formatBytes(file.gzipBytes)} gzip`);
  });
} else {
  console.log("Current dist assets: unavailable; run npm run build before collecting bundle metrics.");
}
