// 浏览器目录扫描并发基准：模拟每文件 I/O 延迟，对比串行与有界并发(8)的墙钟时间。
// 用法：node scripts/benchmark-browser-scan.mjs
import { performance } from "node:perf_hooks";
import { importTsModule } from "../tests/importTsModule.mjs";

const browserMediaScan = await importTsModule(new URL("../src/browserMediaScan.ts", import.meta.url));

const FILE_COUNT = 200;
const FILE_DELAY_MS = 15;

const createFileEntry = (name, index) => ({
  kind: "file",
  name,
  async getFile() {
    await new Promise((resolve) => setTimeout(resolve, FILE_DELAY_MS));
    return {
      name,
      size: 100 * 1024 * 1024,
      lastModified: index,
      arrayBuffer: async () => new ArrayBuffer(0),
    };
  },
});

const createDirectoryEntry = (name, entries) => ({
  kind: "directory",
  name,
  async *values() {
    yield* entries;
  },
});

const originalCreateObjectUrl = URL.createObjectURL;
URL.createObjectURL = (file) => `blob:${file.name}`;

const directory = createDirectoryEntry("Root", [
  createDirectoryEntry("Season 1", Array.from({ length: FILE_COUNT }, (_, index) => createFileEntry(`Episode ${String(index + 1).padStart(3, "0")}.mp4`, index))),
]);

try {
  // 串行基线：与旧实现等价（逐文件 await getFile）
  const serialStart = performance.now();
  for (let index = 0; index < FILE_COUNT; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, FILE_DELAY_MS));
  }
  const serialMs = performance.now() - serialStart;

  // 有界并发（新实现）
  const concurrentStart = performance.now();
  let scannedFiles = 0;
  for await (const batch of browserMediaScan.collectVideos(directory, "root-a")) {
    scannedFiles = batch.scannedFiles; // scannedFiles 为累计值，取最后一批
  }
  const concurrentMs = performance.now() - concurrentStart;

  console.log(`文件数: ${FILE_COUNT}，每文件模拟 I/O 延迟: ${FILE_DELAY_MS}ms`);
  console.log("-".repeat(56));
  console.log(`串行基线（等价旧实现）: ${serialMs.toFixed(0)} ms`);
  console.log(`有界并发 8（新实现） : ${concurrentMs.toFixed(0)} ms（扫描 ${scannedFiles} 个文件）`);
  console.log(`提速: ${(serialMs / Math.max(concurrentMs, 1)).toFixed(1)}x`);
} finally {
  URL.createObjectURL = originalCreateObjectUrl;
}
