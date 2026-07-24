import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertSubtitleGenerationMediaRoot,
  createGeneratedSubtitleService,
  createWhisperCliArgs,
  createWhisperProgressParser,
  detectSubtitleGenerationRuntime,
  normalizeGeneratedWebVtt,
} from "../server/generatedSubtitles.mjs";

test("detectSubtitleGenerationRuntime reports configured engine, model, and optional VAD", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "web-player-whisper-runtime-"));
  try {
    const executablePath = path.join(directory, "whisper-cli.exe");
    const modelPath = path.join(directory, "model.bin");
    const vadModelPath = path.join(directory, "vad.bin");
    await Promise.all([
      writeFile(executablePath, ""),
      writeFile(modelPath, ""),
      writeFile(vadModelPath, ""),
    ]);

    const runtime = await detectSubtitleGenerationRuntime({
      dataRoot: directory,
      env: { WHISPER_CPP_PATH: executablePath, WHISPER_MODEL_PATH: modelPath, WHISPER_VAD_MODEL_PATH: vadModelPath },
      platform: "win32",
    });

    assert.equal(runtime.available, true);
    assert.equal(runtime.vadAvailable, true);
    assert.equal(runtime.modelLabel, "Kotoba-Whisper v2.0");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("createWhisperCliArgs fixes Japanese transcription and adds VAD when configured", () => {
  assert.deepEqual(createWhisperCliArgs({
    audioPath: "audio.wav",
    outputBasePath: "subtitle",
    runtime: { modelPath: "model.bin", vadModelPath: "vad.bin" },
  }), [
    "-m", "model.bin",
    "-f", "audio.wav",
    "-l", "ja",
    "-ovtt",
    "-of", "subtitle",
    "--vad", "--vad-model", "vad.bin",
    "--vad-threshold", "0.35",
    "--vad-min-speech-duration-ms", "100",
    "--vad-speech-pad-ms", "200",
    "--vad-samples-overlap", "0.20",
  ]);
});

test("normalizeGeneratedWebVtt caps abnormally long cues", () => {
  const source = "WEBVTT\n\n00:01.000 --> 00:24.000\n長すぎる字幕\n\n00:25.000 --> 00:28.000\n通常の字幕\n";
  assert.equal(
    normalizeGeneratedWebVtt(source),
    "WEBVTT\n\n00:01.000 --> 00:09.000\n長すぎる字幕\n\n00:25.000 --> 00:28.000\n通常の字幕\n",
  );
});

test("createWhisperProgressParser maps CLI progress into the transcription phase", () => {
  const events = [];
  const parse = createWhisperProgressParser((event) => events.push(event));
  parse(Buffer.from("whisper_print_progress_callback: progress =  25%\nprogress = 50%\n"));
  assert.deepEqual(events, [
    { percent: 32, message: "正在识别日语语音 25%" },
    { percent: 54, message: "正在识别日语语音 50%" },
  ]);
});

test("generated subtitle service extracts audio, runs whisper, and caches WebVTT", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "web-player-generated-subtitle-"));
  const cacheRoot = path.join(directory, "cache");
  const videoPath = path.join(directory, "video.mkv");
  await writeFile(videoPath, "video");
  const calls = [];
  const runtime = {
    available: true,
    executablePath: "whisper-cli.exe",
    modelPath: "model.bin",
    modelLabel: "Kotoba-Whisper v2.0",
    vadModelPath: "",
  };
  const service = createGeneratedSubtitleService({
    cacheRoot,
    resolveVideoPath: () => videoPath,
    ensureFileExists: async () => undefined,
    hashValue: () => "cache-id",
    getRuntime: async () => runtime,
    runProcess: async (command, args, options) => {
      calls.push({ command, args, options });
      if (command === "ffmpeg") {
        await mkdir(path.dirname(args.at(-1)), { recursive: true });
        await writeFile(args.at(-1), "audio");
      } else {
        const outputBasePath = args[args.indexOf("-of") + 1];
        await writeFile(`${outputBasePath}.vtt`, "WEBVTT\n\n00:00.000 --> 00:01.000\nこんにちは\n");
        options.onStderr(Buffer.from("progress = 100%\n"));
      }
      return "";
    },
  });

  try {
    const result = await service.generateSubtitle({}, {
      rootId: "root",
      relativePath: "video.mkv",
      sourceVideoId: "video-id",
    });

    assert.equal(result.id, "cache-id");
    assert.equal(calls.length, 2);
    assert.equal(calls[0].command, "ffmpeg");
    assert.equal(calls[1].command, "whisper-cli.exe");
    assert.match(await readFile(path.join(cacheRoot, "cache-id.vtt"), "utf8"), /こんにちは/);
    assert.deepEqual(await readdir(cacheRoot), ["cache-id.vtt"]);

    const cached = await service.readCachedGeneratedSubtitle({}, { rootId: "root", relativePath: "video.mkv" });
    assert.equal(cached.text.includes("こんにちは"), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("subtitle generation rejects browser roots without a local path", () => {
  assert.throws(
    () => assertSubtitleGenerationMediaRoot({ source: "browser" }),
    /需要先配置本机路径/,
  );
  assert.doesNotThrow(() => assertSubtitleGenerationMediaRoot({ source: "browser", localPath: "D:\\media" }));
});
