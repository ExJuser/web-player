import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { readJsonFile, writeJsonFile } from "../server/jsonFiles.mjs";

test("readJsonFile returns fallback for missing or invalid JSON files", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "web-player-json-"));
  try {
    const fallback = { ok: false };
    assert.equal(await readJsonFile(path.join(tempDir, "missing.json"), fallback), fallback);

    const invalidPath = path.join(tempDir, "invalid.json");
    await writeFile(invalidPath, "{", "utf8");
    assert.equal(await readJsonFile(invalidPath, fallback), fallback);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("writeJsonFile creates parent directories and writes formatted JSON", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "web-player-json-"));
  try {
    const filePath = path.join(tempDir, "nested", "value.json");
    await writeJsonFile(filePath, { name: "library", count: 2 });

    assert.deepEqual(await readJsonFile(filePath, null), { name: "library", count: 2 });
    assert.equal(await readFile(filePath, "utf8"), '{\n  "name": "library",\n  "count": 2\n}\n');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
