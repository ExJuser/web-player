import { mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const thumbnailWidth = 480;
const thumbnailHeight = 270;

export function createVideoThumbnailFfmpegArgs(sourcePath, outputPath) {
  return [
    "-v", "error",
    "-ss", "2",
    "-i", sourcePath,
    "-frames:v", "1",
    "-an",
    "-vf", `thumbnail=60,scale=${thumbnailWidth}:${thumbnailHeight}:force_original_aspect_ratio=decrease,pad=${thumbnailWidth}:${thumbnailHeight}:(ow-iw)/2:(oh-ih)/2:color=0x050607`,
    "-c:v", "mjpeg",
    "-q:v", "3",
    "-f", "image2",
    "-y",
    outputPath,
  ];
}

async function readExistingThumbnail(filePath) {
  try {
    const fileStat = await stat(filePath);
    return fileStat.isFile() && fileStat.size > 0 ? fileStat : null;
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export function createVideoThumbnailService({ cacheRoot, runProcess, maxConcurrency = 1 }) {
  const pendingJobs = [];
  const inFlightJobs = new Map();
  const concurrency = Math.max(1, Math.floor(maxConcurrency));
  let activeJobs = 0;

  const runNextJobs = () => {
    while (activeJobs < concurrency && pendingJobs.length) {
      const job = pendingJobs.shift();
      activeJobs += 1;
      void job.run().then(job.resolve, job.reject).finally(() => {
        activeJobs -= 1;
        inFlightJobs.delete(job.thumbnailId);
        runNextJobs();
      });
    }
  };

  const generate = ({ thumbnailId, sourcePath }) => {
    const existingJob = inFlightJobs.get(thumbnailId);
    if (existingJob) return existingJob;

    const jobPromise = new Promise((resolve, reject) => {
      pendingJobs.push({
        thumbnailId,
        resolve,
        reject,
        run: async () => {
          await mkdir(cacheRoot, { recursive: true });
          const filePath = path.join(cacheRoot, `${thumbnailId}.blob`);
          const existingThumbnail = await readExistingThumbnail(filePath);
          if (existingThumbnail) {
            return { filePath, size: existingThumbnail.size, cached: true };
          }

          const temporaryPath = path.join(cacheRoot, `.${thumbnailId}.${randomUUID()}.jpg`);
          try {
            await runProcess("ffmpeg", createVideoThumbnailFfmpegArgs(sourcePath, temporaryPath), {
              timeoutMs: 30_000,
              timeoutMessage: "生成视频缩略图超时。",
              killTree: true,
              stderrTailBytes: 8 * 1024,
            });
            const generatedThumbnail = await readExistingThumbnail(temporaryPath);
            if (!generatedThumbnail) throw new Error("ffmpeg 未生成有效的视频缩略图。");
            try {
              await rename(temporaryPath, filePath);
            } catch (error) {
              if (!await readExistingThumbnail(filePath)) throw error;
            }
            const cachedThumbnail = await readExistingThumbnail(filePath);
            if (!cachedThumbnail) throw new Error("视频缩略图缓存写入失败。");
            return { filePath, size: cachedThumbnail.size, cached: false };
          } finally {
            await rm(temporaryPath, { force: true });
          }
        },
      });
      runNextJobs();
    });
    inFlightJobs.set(thumbnailId, jobPromise);
    return jobPromise;
  };

  return { generate };
}
