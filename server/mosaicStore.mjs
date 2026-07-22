import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

async function writeFileAtomic(filePath, content, encoding) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, content, encoding);
  await rename(temporaryPath, filePath);
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function projectDirectory(root, projectId) {
  return path.join(root, projectId);
}

export function createMosaicStore(root) {
  return {
    async listProjects() {
      let entries = [];
      try {
        entries = await readdir(root, { withFileTypes: true });
      } catch {
        return [];
      }
      const projects = await Promise.all(entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => readJson(path.join(root, entry.name, "project.json"), null)));
      return projects.filter(Boolean).sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0));
    },

    async readProject(projectId) {
      return readJson(path.join(projectDirectory(root, projectId), "project.json"), null);
    },

    async writeProject(projectId, project) {
      if (!project || project.id !== projectId || project.recipe?.version !== 1) throw new Error("Invalid mosaic project.");
      await writeFileAtomic(
        path.join(projectDirectory(root, projectId), "project.json"),
        `${JSON.stringify(project, null, 2)}\n`,
        "utf8",
      );
    },

    async deleteProject(projectId) {
      await rm(projectDirectory(root, projectId), { recursive: true, force: true });
    },

    async readAsset(projectId, kind) {
      const directory = projectDirectory(root, projectId);
      const [buffer, contentType] = await Promise.all([
        readFile(path.join(directory, `${kind}.blob`)),
        readFile(path.join(directory, `${kind}.type`), "utf8").catch(() => kind === "preview" ? "image/webp" : "application/octet-stream"),
      ]);
      return { buffer, contentType: contentType.trim() };
    },

    async writeAsset(projectId, kind, buffer, contentType) {
      const directory = projectDirectory(root, projectId);
      await Promise.all([
        writeFileAtomic(path.join(directory, `${kind}.blob`), buffer),
        writeFileAtomic(path.join(directory, `${kind}.type`), contentType || "application/octet-stream", "utf8"),
      ]);
    },

    async readFeatures(sourceIds) {
      const store = await readJson(path.join(root, "features.json"), {});
      return sourceIds.flatMap((sourceId) => store[sourceId] ? [store[sourceId]] : []);
    },

    async writeFeatures(features) {
      const filePath = path.join(root, "features.json");
      const store = await readJson(filePath, {});
      features.forEach((feature) => {
        if (feature?.version === 1 && typeof feature.sourceId === "string" && Array.isArray(feature.values)) {
          store[feature.sourceId] = feature;
        }
      });
      await writeFileAtomic(filePath, `${JSON.stringify(store)}\n`, "utf8");
    },
  };
}
