import { access, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const defaultModelLabel = "Kotoba-Whisper v2.0";
const generatedSubtitleCacheVersion = "ja-vtt-v2";
const maxCueDurationSeconds = 8;

function isValidWebVtt(text) {
  return text.trimStart().startsWith("WEBVTT");
}

async function firstAccessiblePath(candidates) {
  for (const candidate of candidates.filter(Boolean)) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next configured or conventional location.
    }
  }
  return "";
}

export async function detectSubtitleGenerationRuntime({ dataRoot, env = {}, platform = process.platform }) {
  const executableName = platform === "win32" ? "whisper-cli.exe" : "whisper-cli";
  const executablePath = await firstAccessiblePath([
    env.WHISPER_CPP_PATH,
    path.join(dataRoot, "speech-to-text", executableName),
    platform === "win32" ? "D:\\whisper.cpp\\build\\bin\\Release\\whisper-cli.exe" : "",
    platform === "win32" ? "D:\\whisper\\whisper-cli.exe" : "",
  ]);
  const modelPath = await firstAccessiblePath([
    env.WHISPER_MODEL_PATH,
    path.join(dataRoot, "speech-to-text", "models", "ggml-kotoba-whisper-v2.0.bin"),
    platform === "win32" ? "D:\\whisper.cpp\\models\\ggml-kotoba-whisper-v2.0.bin" : "",
    platform === "win32" ? "D:\\whisper\\models\\ggml-kotoba-whisper-v2.0.bin" : "",
  ]);
  const vadModelPath = await firstAccessiblePath([
    env.WHISPER_VAD_MODEL_PATH,
    path.join(dataRoot, "speech-to-text", "models", "ggml-silero-v6.2.0.bin"),
    platform === "win32" ? "D:\\whisper.cpp\\models\\ggml-silero-v6.2.0.bin" : "",
  ]);
  const available = Boolean(executablePath && modelPath);
  const reason = !executablePath
    ? "未检测到 whisper-cli，请配置 WHISPER_CPP_PATH。"
    : !modelPath
      ? "未检测到日语语音识别模型，请配置 WHISPER_MODEL_PATH。"
      : "";
  return {
    available,
    engine: "whisper.cpp",
    modelLabel: env.WHISPER_MODEL_LABEL || defaultModelLabel,
    executablePath,
    modelPath,
    vadModelPath,
    vadAvailable: Boolean(vadModelPath),
    reason,
  };
}

export function publicSubtitleGenerationRuntime(runtime) {
  return {
    available: Boolean(runtime?.available),
    engine: runtime?.engine || "whisper.cpp",
    modelLabel: runtime?.modelLabel || defaultModelLabel,
    vadAvailable: Boolean(runtime?.vadAvailable),
    reason: runtime?.reason || "",
  };
}

export function assertSubtitleGenerationMediaRoot(root) {
  if (!root) throw new Error("未找到影片所属媒体库。");
  if (root.source === "browser" && !root.localPath) {
    throw new Error("浏览器添加的媒体库需要先配置本机路径，才能生成字幕。");
  }
}

export function createWhisperCliArgs({ audioPath, outputBasePath, runtime }) {
  const args = [
    "-m", runtime.modelPath,
    "-f", audioPath,
    "-l", "ja",
    "-ovtt",
    "-of", outputBasePath,
  ];
  if (runtime.vadModelPath) {
    args.push(
      "--vad",
      "--vad-model", runtime.vadModelPath,
      "--vad-threshold", "0.35",
      "--vad-min-speech-duration-ms", "100",
      "--vad-speech-pad-ms", "200",
      "--vad-samples-overlap", "0.20",
    );
  }
  return args;
}

export function normalizeGeneratedWebVtt(text) {
  return text.replace(
    /((?:\d{2}:)?\d{2}:\d{2}\.\d{3})\s*-->\s*((?:\d{2}:)?\d{2}:\d{2}\.\d{3})/g,
    (line, start, end) => {
      const startSeconds = parseVttTimestamp(start);
      const endSeconds = parseVttTimestamp(end);
      if (endSeconds - startSeconds <= maxCueDurationSeconds) return line;
      return `${start} --> ${formatVttTimestamp(startSeconds + maxCueDurationSeconds, start.split(":").length === 3)}`;
    },
  );
}

function parseVttTimestamp(timestamp) {
  const parts = timestamp.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return parts[0] * 60 + parts[1];
}

function formatVttTimestamp(totalSeconds, includeHours) {
  const totalMilliseconds = Math.round(totalSeconds * 1000);
  const hours = Math.floor(totalMilliseconds / 3_600_000);
  const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMilliseconds % 60_000) / 1000);
  const milliseconds = totalMilliseconds % 1000;
  const minuteText = String(includeHours ? minutes : minutes + hours * 60).padStart(2, "0");
  const time = `${minuteText}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
  return includeHours ? `${String(hours).padStart(2, "0")}:${time}` : time;
}

export function createWhisperProgressParser(onProgress) {
  let buffer = "";
  let lastPercent = 0;
  return (chunk) => {
    buffer += chunk.toString("utf8");
    const lines = buffer.split(/[\r\n]+/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const match = /progress\s*=\s*(\d{1,3})%/i.exec(line);
      if (!match) continue;
      const whisperPercent = Math.max(0, Math.min(100, Number(match[1])));
      const percent = Math.max(lastPercent, Math.min(98, 10 + Math.round(whisperPercent * 0.88)));
      if (percent <= lastPercent) continue;
      lastPercent = percent;
      onProgress?.({ percent, message: `正在识别日语语音 ${whisperPercent}%` });
    }
    if (buffer.length > 8192) buffer = buffer.slice(-8192);
  };
}

export function createGeneratedSubtitleService({
  cacheRoot,
  resolveVideoPath,
  ensureFileExists,
  runProcess,
  hashValue,
  getRuntime,
}) {
  async function createCacheRecord(config, payload) {
    const videoPath = resolveVideoPath(config, payload?.rootId, payload?.relativePath);
    await ensureFileExists(videoPath);
    const sourceStat = await stat(videoPath);
    const runtime = await getRuntime();
    const cacheId = hashValue([
      payload?.rootId,
      payload?.relativePath,
      sourceStat.size,
      sourceStat.mtimeMs,
      runtime.modelLabel,
      generatedSubtitleCacheVersion,
    ].join("|"));
    return {
      cacheId,
      cachePath: path.join(cacheRoot, `${cacheId}.vtt`),
      videoPath,
      runtime,
    };
  }

  async function readCachedGeneratedSubtitle(config, payload) {
    const { cacheId, cachePath, runtime } = await createCacheRecord(config, payload);
    let text = "";
    try {
      const cached = await readFile(cachePath, "utf8");
      text = isValidWebVtt(cached) ? cached : "";
    } catch {
      // A missing cache is a normal state before first generation.
    }
    return {
      id: cacheId,
      format: "vtt",
      language: "ja",
      modelLabel: runtime.modelLabel,
      text,
    };
  }

  async function generateSubtitle(config, payload, { signal, onProgress } = {}) {
    const { cacheId, cachePath, videoPath, runtime } = await createCacheRecord(config, payload);
    try {
      const cached = await readFile(cachePath, "utf8");
      if (isValidWebVtt(cached)) {
        onProgress?.({ percent: 100, message: "已读取生成字幕缓存。" });
        return createTaskResult(payload, cacheId, runtime);
      }
    } catch {
      // Generate the subtitle when no cache exists.
    }
    if (!runtime.available) throw new Error(runtime.reason || "日语字幕生成引擎不可用。");

    await mkdir(cacheRoot, { recursive: true });
    const taskDirectory = await mkdtemp(path.join(cacheRoot, ".generate-"));
    const audioPath = path.join(taskDirectory, "audio.wav");
    const outputBasePath = path.join(taskDirectory, "subtitle");
    const generatedVttPath = `${outputBasePath}.vtt`;
    onProgress?.({ percent: 1, message: "正在提取影片音频..." });

    try {
      await runProcess("ffmpeg", [
        "-v", "error",
        "-y",
        "-i", videoPath,
        "-vn",
        "-ac", "1",
        "-ar", "16000",
        "-c:a", "pcm_s16le",
        audioPath,
      ], {
        timeoutMs: 2 * 60 * 60 * 1000,
        timeoutMessage: "提取影片音频超时。",
        signal,
        abortMessage: "已取消字幕生成。",
        killTree: true,
      });
      onProgress?.({ percent: 10, message: "正在启动日语语音识别..." });
      const parseProgress = createWhisperProgressParser(onProgress);
      await runProcess(runtime.executablePath, createWhisperCliArgs({ audioPath, outputBasePath, runtime }), {
        timeoutMs: 0,
        signal,
        abortMessage: "已取消字幕生成。",
        killTree: true,
        stderrTailBytes: 64 * 1024,
        includeStdoutOnError: true,
        onStdout: parseProgress,
        onStderr: parseProgress,
      });
      const text = normalizeGeneratedWebVtt(await readFile(generatedVttPath, "utf8"));
      if (!isValidWebVtt(text)) {
        throw new Error("语音识别没有生成有效的 WebVTT 字幕。");
      }
      await writeFile(generatedVttPath, text, "utf8");
      await rename(generatedVttPath, cachePath);
      onProgress?.({ percent: 100, message: "日语字幕生成完成。" });
      return createTaskResult(payload, cacheId, runtime);
    } finally {
      await rm(taskDirectory, { recursive: true, force: true });
    }
  }

  return { generateSubtitle, readCachedGeneratedSubtitle };
}

function createTaskResult(payload, cacheId, runtime) {
  return {
    id: cacheId,
    rootId: String(payload?.rootId || ""),
    relativePath: String(payload?.relativePath || ""),
    sourceVideoId: String(payload?.sourceVideoId || ""),
    language: "ja",
    modelLabel: runtime.modelLabel,
  };
}
