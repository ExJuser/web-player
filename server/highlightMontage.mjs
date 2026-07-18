import { access, link, rm, stat } from "node:fs/promises";
import path from "node:path";

import { probeMediaFile } from "./mediaCompatibility.mjs";

const SOFTWARE_VIDEO_ENCODER = "libx264";
const HARDWARE_VIDEO_ENCODERS = ["h264_nvenc", "h264_qsv", "h264_amf"];
const VIDEO_ENCODER_ARGS = {
  libx264: ["-c:v", "libx264", "-preset", "fast", "-crf", "20"],
  h264_nvenc: ["-c:v", "h264_nvenc", "-preset", "p4", "-cq", "20", "-b:v", "0"],
  h264_qsv: ["-c:v", "h264_qsv", "-preset", "fast", "-global_quality", "20"],
  h264_amf: ["-c:v", "h264_amf", "-quality", "balanced", "-rc", "cqp", "-qp_i", "20", "-qp_p", "20"],
};

function asTimestamp(value) {
  return Number(Number(value).toFixed(3));
}

function segmentDuration(segments) {
  return segments.reduce((total, segment) => total + segment.endTime - segment.startTime, 0);
}

export function assertMontageMediaRoot(root) {
  if (!root) throw new Error("未找到影片所属媒体库。");
  if (root.source === "browser" && !root.localPath) {
    throw new Error("浏览器添加的媒体库需要先配置本机路径，才能生成剪辑版。");
  }
}

export function normalizeMontageSegments(source, durationSeconds) {
  if (!Array.isArray(source) || !source.length) {
    throw new Error("请至少标记一个剪辑保留片段。");
  }
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("无法获取原片有效时长。");
  }

  const normalized = source.map((segment) => {
    const startTime = Number(segment?.startTime);
    const endTime = Number(segment?.endTime);
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || startTime < 0 || endTime <= startTime) {
      throw new Error("存在无效的剪辑保留片段。");
    }
    return {
      startTime: asTimestamp(startTime),
      endTime: asTimestamp(Math.min(endTime, durationSeconds)),
    };
  }).filter((segment) => segment.startTime < durationSeconds && segment.endTime > segment.startTime)
    .sort((a, b) => a.startTime - b.startTime || a.endTime - b.endTime);

  if (!normalized.length) {
    throw new Error("没有位于原片时长内的有效剪辑保留片段。");
  }

  const merged = [];
  for (const segment of normalized) {
    const previous = merged.at(-1);
    if (previous && segment.startTime <= previous.endTime) {
      previous.endTime = Math.max(previous.endTime, segment.endTime);
    } else {
      merged.push({ ...segment });
    }
  }
  return merged;
}

export function mapHighlightsToMontage(source, segments, updatedAt = Date.now()) {
  const boundaryTolerance = 0.001;
  let outputOffset = 0;
  const offsets = segments.map((segment) => {
    const item = { ...segment, outputOffset };
    outputOffset += segment.endTime - segment.startTime;
    return item;
  });

  return (Array.isArray(source) ? source : []).map((highlight, index) => {
    if (
      typeof highlight?.id !== "string" ||
      !highlight.id.trim() ||
      !Number.isFinite(highlight.startTime) ||
      !Number.isFinite(highlight.endTime) ||
      highlight.startTime < 0 ||
      highlight.endTime <= highlight.startTime
    ) {
      throw new Error("存在无效的高能片段数据。");
    }
    const container = offsets.find((segment) => (
      highlight.startTime >= segment.startTime - boundaryTolerance &&
      highlight.endTime <= segment.endTime + boundaryTolerance
    ));
    if (!container) {
      throw new Error("存在不完全位于剪辑保留片段内的高能片段，请先调整标记。");
    }
    const segmentDurationSeconds = container.endTime - container.startTime;
    const mappedStart = Math.max(0, highlight.startTime - container.startTime);
    const mappedEnd = Math.min(segmentDurationSeconds, highlight.endTime - container.startTime);
    return {
      id: `edit-${highlight.id.trim()}-${index + 1}`,
      startTime: asTimestamp(container.outputOffset + mappedStart),
      endTime: asTimestamp(container.outputOffset + mappedEnd),
      ...(typeof highlight.tag === "string" && highlight.tag.trim() ? { tag: highlight.tag.trim().slice(0, 40) } : {}),
      updatedAt,
    };
  });
}

function videoEncoderArgs(videoEncoder) {
  return VIDEO_ENCODER_ARGS[videoEncoder] ?? VIDEO_ENCODER_ARGS[SOFTWARE_VIDEO_ENCODER];
}

export async function selectHighlightMontageVideoEncoder(runProcess, { signal } = {}) {
  for (const videoEncoder of HARDWARE_VIDEO_ENCODERS) {
    try {
      await runProcess(
        "ffmpeg",
        [
          "-v", "error",
          "-f", "lavfi",
          "-i", "color=c=black:s=64x64:r=1:d=1",
          "-frames:v", "1",
          "-an",
          ...videoEncoderArgs(videoEncoder),
          "-pix_fmt", "yuv420p",
          "-f", "null",
          "-",
        ],
        {
          timeoutMs: 10_000,
          timeoutMessage: "GPU 编码器探测超时。",
          signal,
          abortMessage: "已取消生成剪辑版。",
        },
      );
      return videoEncoder;
    } catch (error) {
      if (signal?.aborted) throw error;
    }
  }
  return SOFTWARE_VIDEO_ENCODER;
}

export function createHighlightMontageArgs(sourcePath, outputPath, segments, { hasAudio, videoEncoder = SOFTWARE_VIDEO_ENCODER }) {
  const filters = [];
  const concatInputs = [];
  segments.forEach((segment, index) => {
    filters.push(`[0:v:0]trim=start=${segment.startTime}:end=${segment.endTime},setpts=PTS-STARTPTS[v${index}]`);
    concatInputs.push(`[v${index}]`);
    if (hasAudio) {
      filters.push(`[0:a:0]atrim=start=${segment.startTime}:end=${segment.endTime},asetpts=PTS-STARTPTS[a${index}]`);
      concatInputs.push(`[a${index}]`);
    }
  });
  filters.push(`${concatInputs.join("")}concat=n=${segments.length}:v=1:a=${hasAudio ? 1 : 0}[vout]${hasAudio ? "[aout]" : ""}`);

  return [
    "-v", "error",
    "-y",
    "-i", sourcePath,
    "-filter_complex", filters.join(";"),
    "-map", "[vout]",
    ...(hasAudio ? ["-map", "[aout]"] : []),
    ...videoEncoderArgs(videoEncoder),
    "-pix_fmt", "yuv420p",
    ...(hasAudio ? ["-c:a", "aac", "-b:a", "192k"] : []),
    "-map_metadata", "-1",
    "-map_chapters", "-1",
    "-movflags", "+faststart",
    "-progress", "pipe:1",
    "-nostats",
    outputPath,
  ];
}

function parseProgressChunk(chunk, state, durationSeconds, onProgress) {
  state.buffer += chunk.toString("utf8");
  const lines = state.buffer.split(/\r?\n/);
  state.buffer = lines.pop() ?? "";
  for (const line of lines) {
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator);
    const value = line.slice(separator + 1);
    let seconds = null;
    if (key === "out_time_us" || key === "out_time_ms") {
      seconds = Number(value) / 1_000_000;
    } else if (key === "out_time") {
      const match = /^(\d+):(\d+):(\d+(?:\.\d+)?)$/.exec(value);
      if (match) seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
    }
    if (seconds !== null && Number.isFinite(seconds) && durationSeconds > 0) {
      const percent = Math.max(1, Math.min(99, Math.round((seconds / durationSeconds) * 100)));
      if (percent !== state.lastPercent) {
        state.lastPercent = percent;
        onProgress?.({ percent, message: `正在生成剪辑版 ${percent}%` });
      }
    }
  }
}

function outputFileName(sourcePath, sequence) {
  const stem = path.parse(sourcePath).name;
  return `${stem}-edit${sequence > 1 ? `-${sequence}` : ""}.mp4`;
}

async function commitTemporaryOutput(temporaryPath, sourcePath) {
  for (let sequence = 1; ; sequence += 1) {
    const fileName = outputFileName(sourcePath, sequence);
    const outputPath = path.join(path.dirname(sourcePath), fileName);
    try {
      await access(outputPath);
      continue;
    } catch {
      try {
        await link(temporaryPath, outputPath);
        return { fileName, outputPath };
      } catch (error) {
        if (error?.code === "EEXIST") continue;
        throw error;
      }
    }
  }
}

function createOutputRelativePath(sourceRelativePath, fileName) {
  const normalized = String(sourceRelativePath || "").replaceAll("\\", "/");
  const directory = path.posix.dirname(normalized);
  return directory === "." ? fileName : path.posix.join(directory, fileName);
}

export async function createHighlightMontage({
  runProcess,
  sourcePath,
  rootId,
  relativePath,
  segments,
  sourceHighlights = [],
  signal,
  onProgress,
  persistHighlights,
  now = Date.now,
}) {
  const rawProbe = await probeMediaFile(runProcess, sourcePath);
  const durationSeconds = Number(rawProbe?.format?.duration);
  const streams = Array.isArray(rawProbe?.streams) ? rawProbe.streams : [];
  if (!streams.some((stream) => stream?.codec_type === "video")) {
    throw new Error("原片没有可用的视频流。");
  }
  const normalizedSegments = normalizeMontageSegments(segments, durationSeconds);
  const mappedHighlights = mapHighlightsToMontage(sourceHighlights, normalizedSegments, now());
  const outputDuration = segmentDuration(normalizedSegments);
  const temporaryPath = path.join(
    path.dirname(sourcePath),
    `.${path.parse(sourcePath).name}-edit-${process.pid}-${now()}.tmp.mp4`,
  );
  let committedPath = null;
  onProgress?.({ percent: 0, message: "正在准备剪辑任务..." });

  try {
    const progressState = { buffer: "", lastPercent: 0 };
    await rm(temporaryPath, { force: true });
    const videoEncoder = await selectHighlightMontageVideoEncoder(runProcess, { signal });
    await runProcess(
      "ffmpeg",
      createHighlightMontageArgs(sourcePath, temporaryPath, normalizedSegments, {
        hasAudio: streams.some((stream) => stream?.codec_type === "audio"),
        videoEncoder,
      }),
      {
        timeoutMs: 2 * 60 * 60 * 1000,
        timeoutMessage: "生成剪辑版超时。",
        signal,
        abortMessage: "已取消生成剪辑版。",
        onStdout: (chunk) => parseProgressChunk(chunk, progressState, outputDuration, onProgress),
      },
    );
    const temporaryStat = await stat(temporaryPath);
    if (!temporaryStat.isFile() || temporaryStat.size <= 0) throw new Error("生成剪辑版失败。");

    const committed = await commitTemporaryOutput(temporaryPath, sourcePath);
    committedPath = committed.outputPath;
    await rm(temporaryPath, { force: true });
    const outputStat = await stat(committed.outputPath);
    const outputRelativePath = createOutputRelativePath(relativePath, committed.fileName);
    const lastModified = Math.round(outputStat.mtimeMs);
    const videoId = `${rootId}|${outputRelativePath}|${outputStat.size}|${lastModified}`;
    await persistHighlights?.(videoId, mappedHighlights);
    onProgress?.({ percent: 100, message: `已生成 ${committed.fileName}` });
    return {
      fileName: committed.fileName,
      relativePath: outputRelativePath,
      segmentCount: normalizedSegments.length,
      durationSeconds: asTimestamp(outputDuration),
      videoId,
      size: outputStat.size,
      lastModified,
    };
  } catch (error) {
    if (committedPath) await rm(committedPath, { force: true });
    throw error;
  } finally {
    await rm(temporaryPath, { force: true });
  }
}
