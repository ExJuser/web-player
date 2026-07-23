import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createVisualEchoStore } from "../server/visualEchoStore.mjs";

function sample(frameId, videoId = "video-a") {
  return {
    id: frameId,
    frameId,
    videoId,
    timestamp: 10,
    videoSignature: `1|${videoId}|1|1`,
    descriptor: {
      version: 1,
      color: [1, 2, 3],
      hash: "0000000000000000",
      luma: [0.5],
    },
  };
}

test("persists visual echo index and frames and prunes orphan frames", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "visual-echo-store-"));
  const store = createVisualEchoStore(root);
  const retainedId = "echo-1-retained-frame";
  const orphanId = "echo-1-orphan-frame";

  await store.writeFrame(retainedId, Buffer.from("retained"));
  await store.writeFrame(orphanId, Buffer.from("orphan"));
  const written = await store.writeIndex({ version: 1, updatedAt: 123, samples: [sample(retainedId)] });

  assert.equal(written.samples.length, 1);
  assert.equal((await store.readFrame(retainedId)).toString(), "retained");
  await assert.rejects(() => readFile(path.join(root, "frames", `${orphanId}.blob`)), { code: "ENOENT" });
  assert.deepEqual(await store.readIndex(), written);
});

test("rejects invalid indexes and deletes the complete cache", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "visual-echo-store-"));
  const store = createVisualEchoStore(root);
  await assert.rejects(() => store.writeIndex({ version: 2, samples: [] }), /Invalid visual echo index/);
  await assert.rejects(() => store.writeFrame("../unsafe", Buffer.from("x")), /Invalid visual echo frame id/);

  const frameId = "echo-1-valid-frame";
  await store.writeFrame(frameId, Buffer.from("frame"));
  await store.deleteIndex();
  assert.deepEqual(await store.readIndex(), { version: 1, updatedAt: 0, samples: [] });
});
