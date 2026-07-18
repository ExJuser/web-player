import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertLadaMediaRoot,
  createLadaArgs,
  createLadaCapabilitiesLoader,
  createLadaProgressParser,
  normalizeLadaOptions,
  parseLadaOptionTable,
  restoreVideoWithLada,
} from "../server/ladaRestoration.mjs";
import {
  readStoredLadaOptions,
  resolveLadaOptions,
  writeStoredLadaOptions,
} from "../src/ladaPreferences.ts";

const capabilities = {
  devices: [
    { value: "cpu", label: "CPU" },
    { value: "cuda:0", label: "NVIDIA GeForce RTX 5070" },
  ],
  encodingPresets: [
    { value: "h264-cpu-fast", label: "H.264 CPU" },
    { value: "hevc-nvidia-gpu-hq", label: "H.265 NVIDIA" },
  ],
  defaults: {
    device: "cuda:0",
    encodingPreset: "hevc-nvidia-gpu-hq",
    fp16: true,
    detectFaceMosaics: false,
  },
};

test("restores valid LADA preferences and falls back from stale choices", () => {
  assert.deepEqual(resolveLadaOptions({
    device: "cpu",
    encodingPreset: "h264-cpu-fast",
    fp16: false,
    detectFaceMosaics: true,
  }, capabilities), {
    device: "cpu",
    encodingPreset: "h264-cpu-fast",
    fp16: false,
    detectFaceMosaics: true,
  });
  assert.deepEqual(resolveLadaOptions({
    device: "cuda:9",
    encodingPreset: "removed-preset",
    fp16: false,
    detectFaceMosaics: true,
  }, capabilities), {
    ...capabilities.defaults,
    fp16: false,
    detectFaceMosaics: true,
  });
});

test("reads and writes LADA preferences through storage", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  writeStoredLadaOptions(capabilities.defaults, storage);
  assert.deepEqual(readStoredLadaOptions(storage), capabilities.defaults);
});

test("parses localized LADA option tables without depending on headers", () => {
  const chinese = [
    "可用设备：",
    "  设备    描述",
    "  ------  -----------------------",
    "  cpu     CPU",
    "  cuda:0  NVIDIA GeForce RTX 5070",
  ].join("\n");
  const english = [
    "Available encoding presets:",
    "  Name                      Description",
    "  ------------------------  -------------------------",
    "  h264-cpu-fast             H.264 / AVC, Fast",
    "  hevc-nvidia-gpu-hq        H.265 / HEVC, High Quality",
  ].join("\n");

  assert.deepEqual(parseLadaOptionTable(chinese), capabilities.devices);
  assert.deepEqual(parseLadaOptionTable(english), [
    { value: "h264-cpu-fast", label: "H.264 / AVC, Fast" },
    { value: "hevc-nvidia-gpu-hq", label: "H.265 / HEVC, High Quality" },
  ]);
});

test("loads and caches LADA devices and encoding presets", async () => {
  const calls = [];
  const loadCapabilities = createLadaCapabilitiesLoader(async (command, args, options) => {
    calls.push({ command, args, options });
    if (args[0] === "--list-devices") {
      return "Device  Description\n------  -----------\ncpu     CPU\ncuda:0  NVIDIA GPU";
    }
    return "Name  Description\n----  -----------\nh264-cpu-fast  H.264 CPU\nhevc-nvidia-gpu-hq  H.265 GPU";
  });

  const first = await loadCapabilities();
  const second = await loadCapabilities();

  assert.equal(first, second);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((call) => call.args), [["--list-devices"], ["--list-encoding-presets"]]);
  assert.equal(first.defaults.device, "cuda:0");
  assert.equal(first.defaults.encodingPreset, "hevc-nvidia-gpu-hq");
  assert.equal(calls.every((call) => call.command === "D:\\lada\\lada-cli.exe"), true);
  assert.equal(calls.every((call) => call.options.cwd === "D:\\lada"), true);
});

test("validates LADA choices and creates explicit CLI arguments", () => {
  const options = normalizeLadaOptions({
    device: "cuda:0",
    encodingPreset: "hevc-nvidia-gpu-hq",
    fp16: false,
    detectFaceMosaics: true,
  }, capabilities);
  const args = createLadaArgs("D:\\Media\\Movie.mkv", "D:\\Media\\.output.tmp.mp4", "D:\\Media\\.lada-temp", options);

  assert.deepEqual(args, [
    "--input", "D:\\Media\\Movie.mkv",
    "--output", "D:\\Media\\.output.tmp.mp4",
    "--temporary-directory", "D:\\Media\\.lada-temp",
    "--device", "cuda:0",
    "--no-fp16",
    "--encoding-preset", "hevc-nvidia-gpu-hq",
    "--detect-face-mosaics",
  ]);
  assert.throws(() => normalizeLadaOptions({ ...options, device: "cuda:9" }, capabilities), /设备/);
  assert.throws(() => normalizeLadaOptions({ ...options, encodingPreset: "bad; calc" }, capabilities), /编码预设/);
  assert.throws(() => normalizeLadaOptions({ ...options, fp16: "true" }, capabilities), /FP16/);
});

test("parses fragmented carriage-return progress and the audio stage", () => {
  const events = [];
  const parseProgress = createLadaProgressParser((event) => events.push(event));

  parseProgress(Buffer.from("Processing vid"));
  parseProgress(Buffer.from("eo:  42%|####\r正在处理视频: 100%|########\r"));
  parseProgress(Buffer.from("Processing audio\n"));

  assert.deepEqual(events, [
    { percent: 42, message: "正在修复影片 42%" },
    { percent: 99, message: "正在修复影片 99%" },
    { percent: 99, message: "正在合并音频..." },
  ]);
});

test("requires a server-accessible media root", () => {
  assert.throws(() => assertLadaMediaRoot(null), /未找到/);
  assert.throws(() => assertLadaMediaRoot({ source: "browser" }), /配置本机路径/);
  assert.doesNotThrow(() => assertLadaMediaRoot({ source: "browser", localPath: "D:/Media" }));
});

test("restores to an incremented file and removes all temporary content", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "web-player-lada-"));
  const sourcePath = path.join(directory, "Movie.mkv");
  await writeFile(sourcePath, "source");
  await writeFile(path.join(directory, "Movie.restored.mp4"), "existing");
  const progressEvents = [];

  try {
    const result = await restoreVideoWithLada({
      runProcess: async (command, args, options) => {
        assert.equal(command, "D:\\lada\\lada-cli.exe");
        assert.equal(options.timeoutMs, 0);
        assert.equal(options.killTree, true);
        options.onStderr(Buffer.from("Processing video:  50%|####\r"));
        options.onStdout(Buffer.from("Processing audio\n"));
        const outputPath = args[args.indexOf("--output") + 1];
        await writeFile(outputPath, "restored-video");
        return "";
      },
      sourcePath,
      relativePath: "Classics/Movie.mkv",
      options: capabilities.defaults,
      capabilities,
      now: () => 1234,
      onProgress: (event) => progressEvents.push(event),
    });

    assert.equal(result.fileName, "Movie.restored-2.mp4");
    assert.equal(result.relativePath, "Classics/Movie.restored-2.mp4");
    assert.equal(result.size, Buffer.byteLength("restored-video"));
    assert.equal(await readFile(path.join(directory, result.fileName), "utf8"), "restored-video");
    assert.deepEqual((await readdir(directory)).sort(), ["Movie.mkv", "Movie.restored-2.mp4", "Movie.restored.mp4"]);
    assert.equal(progressEvents.some((event) => event.percent === 50), true);
    assert.equal(progressEvents.some((event) => event.message === "正在合并音频..."), true);
    assert.equal(progressEvents.at(-1).percent, 100);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("removes partial output and task directories after failure", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "web-player-lada-failure-"));
  const sourcePath = path.join(directory, "Movie.mp4");
  await writeFile(sourcePath, "source");

  try {
    await assert.rejects(() => restoreVideoWithLada({
      runProcess: async (command, args) => {
        await writeFile(args[args.indexOf("--output") + 1], "partial");
        throw new Error("LADA crashed");
      },
      sourcePath,
      relativePath: "Movie.mp4",
      options: capabilities.defaults,
      capabilities,
      now: () => 2345,
    }), /LADA crashed/);

    assert.deepEqual(await readdir(directory), ["Movie.mp4"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects an empty LADA output", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "web-player-lada-empty-"));
  const sourcePath = path.join(directory, "Movie.mp4");
  await writeFile(sourcePath, "source");

  try {
    await assert.rejects(() => restoreVideoWithLada({
      runProcess: async (command, args) => writeFile(args[args.indexOf("--output") + 1], ""),
      sourcePath,
      relativePath: "Movie.mp4",
      options: capabilities.defaults,
      capabilities,
      now: () => 3456,
    }), /输出文件为空/);
    assert.deepEqual(await readdir(directory), ["Movie.mp4"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("reports when LADA exits without creating an output file", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "web-player-lada-missing-"));
  const sourcePath = path.join(directory, "Movie.mp4");
  await writeFile(sourcePath, "source");

  try {
    await assert.rejects(() => restoreVideoWithLada({
      runProcess: async () => "",
      sourcePath,
      relativePath: "Movie.mp4",
      options: capabilities.defaults,
      capabilities,
      now: () => 4567,
    }), /未生成输出文件/);
    assert.deepEqual(await readdir(directory), ["Movie.mp4"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("uses distinct owned temporary directories for concurrent restorations", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "web-player-lada-concurrent-"));
  const sourcePath = path.join(directory, "Movie.mp4");
  await writeFile(sourcePath, "source");
  const temporaryDirectories = [];
  let releaseBoth;
  const bothStarted = new Promise((resolve) => { releaseBoth = resolve; });

  try {
    const runProcess = async (command, args) => {
      temporaryDirectories.push(args[args.indexOf("--temporary-directory") + 1]);
      if (temporaryDirectories.length === 2) releaseBoth();
      await bothStarted;
      await writeFile(args[args.indexOf("--output") + 1], "restored");
      return "";
    };
    const results = await Promise.all([
      restoreVideoWithLada({ runProcess, sourcePath, relativePath: "Movie.mp4", options: capabilities.defaults, capabilities, now: () => 9999 }),
      restoreVideoWithLada({ runProcess, sourcePath, relativePath: "Movie.mp4", options: capabilities.defaults, capabilities, now: () => 9999 }),
    ]);

    assert.equal(new Set(temporaryDirectories).size, 2);
    assert.deepEqual(results.map((result) => result.fileName).sort(), ["Movie.restored-2.mp4", "Movie.restored.mp4"]);
    assert.deepEqual((await readdir(directory)).sort(), ["Movie.mp4", "Movie.restored-2.mp4", "Movie.restored.mp4"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
