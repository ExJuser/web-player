// config/app.json 读取基准：每次请求全量读盘解析（旧） vs mtime 命中缓存（新）。
// 用法：node scripts/benchmark-config-read.mjs
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { readJsonFile } from "../server/jsonFiles.mjs";
import { stat } from "node:fs/promises";

const ITERATIONS = 2000;
const sampleConfig = {
  server: { port: 3001 },
  media: { roots: [{ id: "root-1", label: "影片", path: "E:\\影片", source: "local" }] },
  photoAlbums: { roots: [{ id: "photo-albums-local", label: "写真集", path: "I:\\写真集", source: "local" }] },
};

async function time(label, fn) {
  const startedAt = performance.now();
  await fn();
  const elapsedMs = performance.now() - startedAt;
  console.log(`${label.padEnd(44)} ${elapsedMs.toFixed(1)} ms（${(elapsedMs / ITERATIONS * 1000).toFixed(1)} µs/次）`);
  return elapsedMs;
}

async function main() {
  const root = await mkdtemp(path.join(tmpdir(), "web-player-config-read-"));
  const configPath = path.join(root, "app.json");
  await writeFile(configPath, JSON.stringify(sampleConfig));
  try {
    // 旧：每次调用全量 readFile + JSON.parse
    const oldMs = await time("旧：每次请求 readJsonFile 全量读盘", async () => {
      for (let index = 0; index < ITERATIONS; index += 1) {
        await readJsonFile(configPath, { server: { port: 3001 }, media: { roots: [] } });
      }
    });
    // 新：stat(mtime) 命中缓存，未变化时零读盘
    let cached = null;
    const newMs = await time("新：stat(mtime) 命中缓存（零读盘）", async () => {
      for (let index = 0; index < ITERATIONS; index += 1) {
        const fileStat = await stat(configPath);
        if (!cached || cached.mtimeMs !== fileStat.mtimeMs) {
          cached = { mtimeMs: fileStat.mtimeMs, config: await readJsonFile(configPath, { server: { port: 3001 }, media: { roots: [] } }) };
        }
      }
    });
    console.log("-".repeat(60));
    console.log(`单次请求读盘+解析成本: ${(oldMs / ITERATIONS * 1000).toFixed(0)} µs → ${(newMs / ITERATIONS * 1000).toFixed(1)} µs（${((1 - newMs / oldMs) * 100).toFixed(0)}% 减少）`);
    console.log(`热门 API（local-config/扫描/缩略图生成等）每日 1000 次请求节省 ≈ ${((oldMs - newMs) * 1000 / 1000).toFixed(0)} ms`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
