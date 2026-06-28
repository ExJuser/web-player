import { access, mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { hashValue } from "./hashUtils.mjs";
import { isImageSubtitleCodec } from "./subtitleCodecUtils.mjs";

const mp4FormatNames = new Set(["mov", "mp4", "m4a", "3gp", "3g2", "mj2"]);
const directVideoCodecs = new Set(["h264", "av1", "vp8", "vp9"]);
const directAudioCodecs = new Set(["aac", "mp3", "opus", "vorbis"]);
const mp4AudioCodecs = new Set(["aac", "mp3"]);
const mediaContentTypesByExtension = {
  ".vtt": "text/vtt; charset=utf-8",
  ".srt": "application/x-subrip; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".ogg": "video/ogg",
  ".ogv": "video/ogg",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
};

export function mediaContentTypeForPath(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return mediaContentTypesByExtension[extension] ?? "application/octet-stream";
}

export function createCompatibleMediaCacheId(rootId, relativePath, size, lastModified) {
  return hashValue(`${rootId || ""}|${relativePath || ""}|${size || 0}|${lastModified || 0}|mp4-remux-v1`);
}

export function createCompatibleMediaUrl(cacheId) {
  return `/api/media-compatible/${encodeURIComponent(cacheId)}.mp4`;
}

export function resolveCompatibleMediaPath(rootPath, cacheId) {
  if (!/^[a-f0-9]{64}$/.test(cacheId)) throw new Error("Invalid compatible media id.");
  return path.join(rootPath, `${cacheId}.mp4`);
}

function splitFormatNames(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function parseNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function parseFrameRate(value) {
  if (typeof value !== "string" || !value || value === "0/0") return undefined;
  const [numerator, denominator] = value.split("/").map(Number);
  if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0) {
    const frameRate = numerator / denominator;
    return frameRate > 0 ? frameRate : undefined;
  }
  return parseNumber(value);
}

function normalizeStream(stream) {
  const tags = stream?.tags && typeof stream.tags === "object" ? stream.tags : {};
  return {
    index: Number(stream?.index),
    type: String(stream?.codec_type || "unknown"),
    codec: String(stream?.codec_name || "unknown").toLowerCase(),
    profile: typeof stream?.profile === "string" ? stream.profile : undefined,
    level: parseNumber(stream?.level),
    pixelFormat: typeof stream?.pix_fmt === "string" ? stream.pix_fmt : undefined,
    width: Number.isFinite(Number(stream?.width)) ? Number(stream.width) : undefined,
    height: Number.isFinite(Number(stream?.height)) ? Number(stream.height) : undefined,
    frameRate: parseFrameRate(stream?.avg_frame_rate) ?? parseFrameRate(stream?.r_frame_rate),
    bitRate: parseNumber(stream?.bit_rate),
    language: typeof tags.language === "string" ? tags.language : undefined,
    title: typeof tags.title === "string" ? tags.title : undefined,
  };
}

function normalizeMediaProbe(rawProbe) {
  const streams = Array.isArray(rawProbe?.streams) ? rawProbe.streams.map(normalizeStream) : [];
  const formatNames = splitFormatNames(rawProbe?.format?.format_name);
  return {
    format: {
      name: rawProbe?.format?.format_name || "unknown",
      names: formatNames,
      duration: Number(rawProbe?.format?.duration) || undefined,
      size: Number(rawProbe?.format?.size) || undefined,
      bitRate: parseNumber(rawProbe?.format?.bit_rate),
    },
    video: streams.find((stream) => stream.type === "video") ?? null,
    audio: streams.find((stream) => stream.type === "audio") ?? null,
    subtitles: streams.filter((stream) => stream.type === "subtitle"),
    streams,
  };
}

function basePlayability(status, reason, probe) {
  const bitRate = probe?.video?.bitRate ?? probe?.format?.bitRate;
  return {
    status,
    reason,
    container: probe?.format?.name,
    videoCodec: probe?.video?.codec,
    audioCodec: probe?.audio?.codec,
    pixelFormat: probe?.video?.pixelFormat,
    videoProfile: probe?.video?.profile,
    videoLevel: probe?.video?.level,
    frameRate: probe?.video?.frameRate,
    bitRate,
    performanceWarning: createPlaybackPerformanceWarning(probe, bitRate),
  };
}

function formatRiskBitRate(bitRate) {
  return bitRate >= 1000 * 1000 ? `${Math.round(bitRate / 1000 / 1000)}Mbps` : `${Math.round(bitRate / 1000)}Kbps`;
}

function createPlaybackPerformanceWarning(probe, bitRate) {
  const video = probe?.video;
  if (!video || video.codec !== "h264" || /10/i.test(video.profile || "") || /10|12|16/.test(video.pixelFormat || "")) return undefined;

  const reasons = [];
  const pixels = (video.width || 0) * (video.height || 0);
  if (pixels >= 3840 * 2160) reasons.push("4K 分辨率");
  if (video.frameRate && video.frameRate > 45) reasons.push(`${Math.round(video.frameRate)}fps`);
  if (bitRate && bitRate >= 40 * 1000 * 1000) reasons.push(`${formatRiskBitRate(bitRate)} 高码率`);
  if (video.level && video.level > 42) reasons.push(`H.264 Level ${(video.level / 10).toFixed(1)}`);

  if (!reasons.length) return undefined;
  return `视频编码可播放，但 ${reasons.join("、")} 可能让浏览器解码掉帧；若画面卡顿，建议转码为较低码率的 H.264 MP4。`;
}

export function classifyMediaProbe(rawProbe, fileName = "") {
  const probe = normalizeMediaProbe(rawProbe);
  const extension = path.extname(fileName).toLowerCase();
  const video = probe.video;
  const audio = probe.audio;
  const hasImageSubtitle = probe.subtitles.some((subtitle) => isImageSubtitleCodec(subtitle.codec));

  if (!video) {
    return {
      probe,
      playability: basePlayability("unsupported", "未检测到视频轨。", probe),
      canRemux: false,
    };
  }

  if (video.codec === "hevc" || video.codec === "h265") {
    return {
      probe,
      playability: basePlayability("unsupported", "HEVC/H.265 通常需要转码，当前版本不自动处理。", probe),
      canRemux: false,
    };
  }

  if (video.codec === "h264" && /10/i.test(video.profile || "")) {
    return {
      probe,
      playability: basePlayability("unsupported", "10-bit H.264 需要转码，当前版本不自动处理。", probe),
      canRemux: false,
    };
  }

  if (video.pixelFormat && /10|12|16/.test(video.pixelFormat)) {
    return {
      probe,
      playability: basePlayability("unsupported", "高位深视频需要转码，当前版本不自动处理。", probe),
      canRemux: false,
    };
  }

  if (!directVideoCodecs.has(video.codec)) {
    return {
      probe,
      playability: basePlayability(`unsupported`, `${video.codec} 视频编码需要转码，当前版本不自动处理。`, probe),
      canRemux: false,
    };
  }

  if (audio && !directAudioCodecs.has(audio.codec)) {
    return {
      probe,
      playability: basePlayability("unsupported", `${audio.codec} 音频编码需要转码，当前版本不自动处理。`, probe),
      canRemux: false,
    };
  }

  const isMp4File = extension === ".mp4" || extension === ".m4v";
  const isMp4Container = probe.format.names.some((name) => mp4FormatNames.has(name));
  const hasMp4CompatibleStreams = video.codec === "h264" && (!audio || mp4AudioCodecs.has(audio.codec));

  if (isMp4File && isMp4Container) {
    return {
      probe,
      playability: basePlayability(
        "direct",
        hasImageSubtitle ? "视频可直接播放；内封图形字幕不会原生显示。" : "视频可直接播放。",
        probe,
      ),
      canRemux: hasMp4CompatibleStreams,
    };
  }

  if (hasMp4CompatibleStreams) {
    return {
      probe,
      playability: basePlayability("remuxRecommended", "编码可浏览器播放，但当前容器不稳定，建议生成兼容 MP4。", probe),
      canRemux: true,
    };
  }

  return {
    probe,
    playability: basePlayability("unknown", "当前容器或编码组合的浏览器兼容性不确定。", probe),
    canRemux: false,
  };
}

export function createNeedsLocalPathPlayability() {
  return {
    status: "needsLocalPath",
    reason: "浏览器添加的媒体库需要先配置本机路径，才能使用 ffprobe/ffmpeg。",
  };
}

function createUnknownPlayability(reason = "尚未探测媒体兼容性。") {
  return {
    status: "unknown",
    reason,
  };
}

export async function probeMediaFile(runProcess, filePath) {
  const raw = await runProcess("ffprobe", [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    filePath,
  ]);
  return JSON.parse(raw || "{}");
}

export async function getCachedCompatibleMedia(rootPath, rootId, video) {
  const cacheId = createCompatibleMediaCacheId(rootId, video.relativePath, video.size, video.lastModified);
  const cachePath = resolveCompatibleMediaPath(rootPath, cacheId);
  try {
    await access(cachePath);
    return { cacheId, cachePath, compatibleUrl: createCompatibleMediaUrl(cacheId) };
  } catch {
    return { cacheId, cachePath, compatibleUrl: undefined };
  }
}

async function createVideoPlayability({ root, video, filePath, compatibleMediaRoot, runProcess }) {
  if (root?.source === "browser" && !root.localPath) {
    return createNeedsLocalPathPlayability();
  }

  try {
    const rawProbe = await probeMediaFile(runProcess, filePath);
    const result = classifyMediaProbe(rawProbe, video.name || video.relativePath);
    const cached = await getCachedCompatibleMedia(compatibleMediaRoot, root.id, video);
    return {
      ...result.playability,
      ...(cached.compatibleUrl ? { compatibleUrl: cached.compatibleUrl } : {}),
    };
  } catch (error) {
    return createUnknownPlayability(error instanceof Error ? `媒体探测失败：${error.message}` : "媒体探测失败。");
  }
}

function parseFfmpegTimestamp(value) {
  const text = String(value || "").trim();
  const match = /^(\d+):(\d+):(\d+(?:\.\d+)?)$/.exec(text);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function parseFfmpegProgressChunk(chunk, state, durationSeconds, onProgress) {
  state.buffer += chunk.toString("utf8");
  const lines = state.buffer.split(/\r?\n/);
  state.buffer = lines.pop() ?? "";

  for (const line of lines) {
    const index = line.indexOf("=");
    if (index <= 0) continue;
    const key = line.slice(0, index);
    const value = line.slice(index + 1);
    let currentSeconds = null;
    if (key === "out_time_us" || key === "out_time_ms") {
      currentSeconds = Number(value) / 1_000_000;
    } else if (key === "out_time") {
      currentSeconds = parseFfmpegTimestamp(value);
    } else if (key === "progress" && value === "end") {
      onProgress?.({ percent: 100, message: "生成完成，正在写入缓存..." });
    }

    if (currentSeconds !== null && Number.isFinite(currentSeconds) && durationSeconds > 0) {
      const percent = Math.max(1, Math.min(99, Math.round((currentSeconds / durationSeconds) * 100)));
      if (percent !== state.lastPercent) {
        state.lastPercent = percent;
        onProgress?.({ percent, message: `正在复制媒体流 ${percent}%` });
      }
    }
  }
}

export async function remuxCompatibleMedia({ runProcess, sourcePath, outputPath, durationSeconds = 0, signal, onProgress }) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const temporaryOutputPath = `${outputPath}.tmp.mp4`;
  await rm(temporaryOutputPath, { force: true });
  const progressState = { buffer: "", lastPercent: 0 };
  onProgress?.({ percent: 0, message: "正在启动 ffmpeg..." });
  try {
    await runProcess(
      "ffmpeg",
      [
        "-v",
        "error",
        "-y",
        "-i",
        sourcePath,
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-c",
        "copy",
        "-movflags",
        "+faststart",
        "-progress",
        "pipe:1",
        "-nostats",
        temporaryOutputPath,
      ],
      {
        timeoutMs: 10 * 60 * 1000,
        timeoutMessage: "生成兼容 MP4 超时。",
        signal,
        abortMessage: "已取消生成兼容 MP4。",
        onStdout: (chunk) => parseFfmpegProgressChunk(chunk, progressState, durationSeconds, onProgress),
      },
    );
    await rename(temporaryOutputPath, outputPath);
  } catch (error) {
    await rm(temporaryOutputPath, { force: true });
    throw error;
  }
  const outputStat = await stat(outputPath);
  if (!outputStat.isFile() || outputStat.size <= 0) {
    throw new Error("生成兼容 MP4 失败。");
  }
  onProgress?.({ percent: 100, message: "已生成兼容 MP4。" });
}
