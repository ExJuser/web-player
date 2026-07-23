import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const emptyIndex = { version: 1, updatedAt: 0, samples: [] };

async function writeAtomic(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, content);
  await rename(temporaryPath, filePath);
}

function assertFrameId(frameId) {
  if (typeof frameId !== "string" || !/^echo-1-[a-z0-9]+-[a-z0-9]+$/.test(frameId)) {
    throw new Error("Invalid visual echo frame id.");
  }
}

function normalizeIndex(index) {
  if (index?.version !== 1 || !Array.isArray(index.samples)) throw new Error("Invalid visual echo index.");
  const samples = index.samples.filter((sample) =>
    sample
    && typeof sample.id === "string"
    && typeof sample.frameId === "string"
    && typeof sample.videoId === "string"
    && Number.isFinite(sample.timestamp)
    && typeof sample.videoSignature === "string"
    && sample.descriptor?.version === 1
    && Array.isArray(sample.descriptor.color)
    && typeof sample.descriptor.hash === "string"
    && Array.isArray(sample.descriptor.luma));
  samples.forEach((sample) => assertFrameId(sample.frameId));
  return {
    version: 1,
    updatedAt: Number.isFinite(index.updatedAt) ? index.updatedAt : Date.now(),
    samples,
  };
}

export function createVisualEchoStore(root) {
  const indexPath = path.join(root, "index.json");
  const framesRoot = path.join(root, "frames");
  const framePath = (frameId) => path.join(framesRoot, `${frameId}.blob`);

  return {
    async readIndex() {
      try {
        return normalizeIndex(JSON.parse(await readFile(indexPath, "utf8")));
      } catch (error) {
        if (error?.code === "ENOENT") return { ...emptyIndex };
        if (error instanceof SyntaxError) return { ...emptyIndex };
        throw error;
      }
    },

    async writeIndex(index) {
      const normalized = normalizeIndex(index);
      await writeAtomic(indexPath, `${JSON.stringify(normalized)}\n`);
      const retained = new Set(normalized.samples.map((sample) => `${sample.frameId}.blob`));
      let entries = [];
      try {
        entries = await readdir(framesRoot, { withFileTypes: true });
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
      await Promise.all(entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".blob") && !retained.has(entry.name))
        .map((entry) => rm(path.join(framesRoot, entry.name), { force: true })));
      return normalized;
    },

    async readFrame(frameId) {
      assertFrameId(frameId);
      return readFile(framePath(frameId));
    },

    async writeFrame(frameId, buffer) {
      assertFrameId(frameId);
      if (!buffer?.length) throw new Error("Visual echo frame is empty.");
      await writeAtomic(framePath(frameId), buffer);
    },

    async deleteIndex() {
      await rm(root, { recursive: true, force: true });
    },
  };
}
