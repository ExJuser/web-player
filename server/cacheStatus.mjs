import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

const cacheKindsByStatusId = {
  thumbnails: ["thumbnail"],
  "danmaku-sources": ["danmaku-source"],
  "ai-summaries": ["ai-summary"],
  "ai-qa": ["ai-qa"],
  "ai-recaps": ["ai-recap"],
  "bangumi-matches": ["bangumi-match"],
  "compatible-media": ["compatible-media"],
  subtitles: ["embedded-subtitle"],
};

export async function getPathStats(targetPath) {
  try {
    const entryStat = await stat(targetPath);
    if (!entryStat.isDirectory()) {
      return {
        bytes: entryStat.size,
        files: entryStat.isFile() ? 1 : 0,
        updatedAt: entryStat.mtimeMs,
      };
    }

    let bytes = 0;
    let files = 0;
    let updatedAt = null;
    const entries = await readdir(targetPath, { withFileTypes: true });
    for (const entry of entries) {
      const childStats = await getPathStats(path.join(targetPath, entry.name));
      bytes += childStats.bytes;
      files += childStats.files;
      updatedAt = Math.max(updatedAt ?? 0, childStats.updatedAt ?? 0) || null;
    }
    return { bytes, files, updatedAt };
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return { bytes: 0, files: 0, updatedAt: null };
    }
    return {
      bytes: 0,
      files: 0,
      updatedAt: null,
      error: error instanceof Error ? error.message : "Unable to inspect cache path.",
    };
  }
}

export async function createDanmakuSourcesStats(danmakuSourcesRoot) {
  try {
    const entries = await readdir(danmakuSourcesRoot, { withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"));
    const stats = await Promise.all(files.map((entry) => stat(path.join(danmakuSourcesRoot, entry.name))));
    return {
      bytes: stats.reduce((sum, entryStat) => sum + entryStat.size, 0),
      files: stats.length,
      updatedAt: stats.reduce((latest, entryStat) => Math.max(latest, entryStat.mtimeMs), 0) || null,
    };
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return { bytes: 0, files: 0, updatedAt: null };
    }
    return {
      bytes: 0,
      files: 0,
      updatedAt: null,
      error: error instanceof Error ? error.message : "Unable to inspect danmaku sources.",
    };
  }
}

export async function createCacheStatus({ dataRoot, definitions, createDatabaseStatusItem }) {
  const items = await Promise.all(
    definitions.map(async (definition) => ({
      ...definition,
      ...(await (definition.getStats ? definition.getStats() : getPathStats(definition.path))),
    })),
  );
  const visibleItems = items.filter((item) => item.bytes > 0 || item.files > 0 || item.updatedAt || item.error);
  const databaseItem = await createDatabaseStatusItem?.();
  if (databaseItem) visibleItems.push(databaseItem);

  const rootStats = await getPathStats(dataRoot);
  const totalBytes = visibleItems.reduce((sum, item) => sum + item.bytes, 0);
  const totalFiles = visibleItems.reduce((sum, item) => sum + item.files, 0);
  const unclassifiedBytes = Math.max(rootStats.bytes - totalBytes, 0);
  const unclassifiedFiles = Math.max(rootStats.files - totalFiles, 0);
  if (unclassifiedBytes > 0 || unclassifiedFiles > 0) {
    visibleItems.push({
      id: "other-local-data",
      label: "其他本地数据",
      path: dataRoot,
      bytes: unclassifiedBytes,
      files: unclassifiedFiles,
      updatedAt: rootStats.updatedAt,
      clearable: false,
    });
  }
  const updatedAt = visibleItems.reduce((latest, item) => Math.max(latest, item.updatedAt ?? 0), 0) || null;

  return {
    rootPath: dataRoot,
    totalBytes: rootStats.bytes,
    totalFiles: rootStats.files,
    updatedAt,
    items: visibleItems,
  };
}

function assertCachePathIsSafe(dataRoot, targetPath) {
  const resolvedDataRoot = path.resolve(dataRoot);
  const resolvedTarget = path.resolve(targetPath);
  const rootWithSeparator = resolvedDataRoot.endsWith(path.sep) ? resolvedDataRoot : `${resolvedDataRoot}${path.sep}`;
  if (resolvedTarget !== resolvedDataRoot && !resolvedTarget.startsWith(rootWithSeparator)) {
    throw new Error("Refusing to clear a path outside the local data directory.");
  }
}

export async function clearLocalCacheItems(payload, options) {
  const ids = Array.isArray(payload?.ids) ? payload.ids.filter((id) => typeof id === "string") : [];
  const uniqueIds = Array.from(new Set(ids));
  if (!uniqueIds.length) throw new Error("No cache items selected.");

  const currentStatus = await options.createStatus();
  const itemsById = new Map(currentStatus.items.map((item) => [item.id, item]));
  const invalidId = uniqueIds.find((id) => !itemsById.has(id));
  if (invalidId) throw new Error("Unknown cache item.");
  const readonlyId = uniqueIds.find((id) => itemsById.get(id)?.clearable === false);
  if (readonlyId) throw new Error("This cache item is read-only.");

  for (const id of uniqueIds) {
    const item = itemsById.get(id);
    assertCachePathIsSafe(options.dataRoot, item.path);
    await rm(item.path, { recursive: true, force: true });
  }

  options.clearCacheEntriesByKinds(uniqueIds.flatMap((id) => cacheKindsByStatusId[id] ?? []));

  return {
    cleared: uniqueIds,
    status: await options.createStatus(),
  };
}
