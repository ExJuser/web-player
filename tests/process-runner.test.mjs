import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { detectTools, runProcess } from "../server/processRunner.mjs";

const projectRoot = resolve(import.meta.dirname, "..");

test("runProcess resolves stdout for successful commands", async () => {
  const output = await runProcess(process.execPath, ["-e", "process.stdout.write('ok')"]);

  assert.equal(output, "ok");
});

test("runProcess defaults cwd to the project root", async () => {
  const previousCwd = process.cwd();
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "process-runner-"));
  try {
    process.chdir(temporaryDirectory);

    const output = await runProcess(process.execPath, ["-e", "process.stdout.write(process.cwd())"]);

    assert.equal(output, projectRoot);
  } finally {
    process.chdir(previousCwd);
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("runProcess rejects with stderr or exit code for failed commands", async () => {
  await assert.rejects(
    () => runProcess(process.execPath, ["-e", "process.stderr.write('bad'); process.exit(2)"]),
    /bad/,
  );
  await assert.rejects(
    () => runProcess(process.execPath, ["-e", "process.exit(3)"]),
    /exited with 3/,
  );
});

test("runProcess rejects with the configured timeout message", async () => {
  await assert.rejects(
    () =>
      runProcess(process.execPath, ["-e", "setTimeout(() => {}, 1000)"], {
        timeoutMs: 50,
        timeoutMessage: "custom timeout",
      }),
    /custom timeout/,
  );
});

test("runProcess rejects with the configured abort message", async () => {
  const controller = new AbortController();
  const promise = runProcess(process.execPath, ["-e", "setTimeout(() => {}, 1000)"], {
    signal: controller.signal,
    abortMessage: "custom abort",
  });

  controller.abort();

  await assert.rejects(() => promise, /custom abort/);
});

test("detectTools reports each tool independently", async () => {
  const calls = [];
  const result = await detectTools(async (command, args, options) => {
    calls.push({ command, args, options });
    if (command === "ffprobe") throw new Error("missing");
    return "";
  });

  assert.deepEqual(result, { ffmpeg: true, ffprobe: false });
  assert.deepEqual(
    calls.map((call) => [call.command, call.args, call.options]),
    [
      ["ffmpeg", ["-version"], { timeoutMs: 5000 }],
      ["ffprobe", ["-version"], { timeoutMs: 5000 }],
    ],
  );
});
