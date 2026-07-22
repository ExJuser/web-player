import { access, link, mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import path from "node:path";

import { createGlobalVideoId } from "./mediaRoots.mjs";
import { probeMediaFile } from "./mediaCompatibility.mjs";
import {
  createHighlightMontageArgs,
  mapHighlightsToMontage,
  normalizeMontageSegments,
  selectHighlightMontageVideoEncoder,
} from "./highlightMontage.mjs";

export const ladaExecutablePath = "D:\\lada\\lada-cli.exe";
export const ladaWorkingDirectory = "D:\\lada";

export function assertLadaMediaRoot(root) {
  if (!root) throw new Error("未找到影片所属媒体库。");
  if (root.source === "browser" && !root.localPath) {
    throw new Error("浏览器添加的媒体库需要先配置本机路径，才能使用马赛克修复。");
  }
}

export async function detectLadaExecutable() {
  try {
    await access(ladaExecutablePath);
    return true;
  } catch {
    return false;
  }
}

export function parseLadaOptionTable(output) {
  const lines = String(output || "").replaceAll("\r", "").split("\n");
  const separatorIndex = lines.findIndex((line) => /^\s*-+(?:\s{2,}-+)+\s*$/.test(line));
  if (separatorIndex < 0) return [];
  return lines.slice(separatorIndex + 1).map((line) => line.trim()).filter(Boolean).map((line) => {
    const [value, ...descriptionParts] = line.split(/\s{2,}/);
    return { value, label: descriptionParts.join(" ").trim() || value };
  }).filter((item) => item.value);
}

function chooseDefault(items, preferred) {
  return items.some((item) => item.value === preferred) ? preferred : items[0]?.value ?? "";
}

export function createLadaCapabilitiesLoader(runProcess, {
  executablePath = ladaExecutablePath,
  workingDirectory = ladaWorkingDirectory,
} = {}) {
  let capabilitiesPromise = null;
  return () => {
    capabilitiesPromise ??= Promise.all([
      runProcess(executablePath, ["--list-devices"], { cwd: workingDirectory, timeoutMs: 30000 }),
      runProcess(executablePath, ["--list-encoding-presets"], { cwd: workingDirectory, timeoutMs: 30000 }),
    ]).then(([deviceOutput, presetOutput]) => {
      const devices = parseLadaOptionTable(deviceOutput);
      const encodingPresets = parseLadaOptionTable(presetOutput);
      if (!devices.length) throw new Error("LADA 未返回可用设备。");
      if (!encodingPresets.length) throw new Error("LADA 未返回可用编码预设。");
      return {
        devices,
        encodingPresets,
        defaults: {
          device: chooseDefault(devices, "cuda:0"),
          encodingPreset: chooseDefault(encodingPresets, "hevc-nvidia-gpu-hq"),
          fp16: true,
          detectFaceMosaics: false,
        },
      };
    }).catch((error) => {
      capabilitiesPromise = null;
      throw error;
    });
    return capabilitiesPromise;
  };
}

export function normalizeLadaOptions(source, capabilities) {
  const device = typeof source?.device === "string" ? source.device : "";
  const encodingPreset = typeof source?.encodingPreset === "string" ? source.encodingPreset : "";
  if (!capabilities?.devices?.some((item) => item.value === device)) {
    throw new Error("请选择有效的 LADA 处理设备。");
  }
  if (!capabilities?.encodingPresets?.some((item) => item.value === encodingPreset)) {
    throw new Error("请选择有效的 LADA 编码预设。");
  }
  if (typeof source?.fp16 !== "boolean") throw new Error("FP16 参数无效。");
  if (typeof source?.detectFaceMosaics !== "boolean") throw new Error("人脸马赛克检测参数无效。");
  return { device, encodingPreset, fp16: source.fp16, detectFaceMosaics: source.detectFaceMosaics };
}

export function createLadaArgs(sourcePath, outputPath, temporaryDirectory, options) {
  return [
    "--input", sourcePath,
    "--output", outputPath,
    "--temporary-directory", temporaryDirectory,
    "--device", options.device,
    options.fp16 ? "--fp16" : "--no-fp16",
    "--encoding-preset", options.encodingPreset,
    options.detectFaceMosaics ? "--detect-face-mosaics" : "--no-detect-face-mosaics",
  ];
}

export function createLadaProgressParser(onProgress) {
  let buffer = "";
  let lastPercent = 0;
  let audioReported = false;
  const processLine = (line) => {
    const percentMatch = /(\d{1,3})%\|/.exec(line);
    if (percentMatch) {
      const percent = Math.max(lastPercent, Math.min(99, Number(percentMatch[1])));
      if (percent > lastPercent) {
        lastPercent = percent;
        onProgress?.({ percent, message: `正在修复影片 ${percent}%` });
      }
    }
    if (!audioReported && /processing audio|处理音频|合并音频/i.test(line)) {
      audioReported = true;
      lastPercent = Math.max(lastPercent, 99);
      onProgress?.({ percent: lastPercent, message: "正在合并音频..." });
    }
  };

  return (chunk) => {
    buffer += chunk.toString("utf8");
    const lines = buffer.split(/[\r\n]+/);
    buffer = lines.pop() ?? "";
    for (const line of lines) processLine(line);
    if (buffer.length > 8192) buffer = buffer.slice(-8192);
  };
}

function outputFileName(sourcePath, sequence, highlightsOnly = false) {
  const stem = path.parse(sourcePath).name;
  const suffix = highlightsOnly ? ".highlights.restored" : ".restored";
  return sequence === 1 ? `${stem}${suffix}.mp4` : `${stem}${suffix}-${sequence}.mp4`;
}

async function commitTemporaryOutput(temporaryPath, sourcePath, highlightsOnly) {
  for (let sequence = 1; ; sequence += 1) {
    const fileName = outputFileName(sourcePath, sequence, highlightsOnly);
    const outputPath = path.join(path.dirname(sourcePath), fileName);
    try {
      await link(temporaryPath, outputPath);
      return { fileName, outputPath };
    } catch (error) {
      if (error?.code === "EEXIST") continue;
      throw error;
    }
  }
}

function createOutputRelativePath(sourceRelativePath, fileName) {
  const normalized = String(sourceRelativePath || "").replaceAll("\\", "/");
  const directory = path.posix.dirname(normalized);
  return directory === "." ? fileName : path.posix.join(directory, fileName);
}

export async function restoreVideoWithLada({
  runProcess,
  sourcePath,
  rootId,
  relativePath,
  sourceHighlights = [],
  highlightsOnly = false,
  options,
  capabilities,
  signal,
  onProgress,
  persistHighlights,
}) {
  await access(sourcePath);
  const normalizedOptions = normalizeLadaOptions(options, capabilities);
  const sourceDirectory = path.dirname(sourcePath);
  const stem = path.parse(sourcePath).name;
  let taskDirectory = null;
  let temporaryDirectory = null;
  let temporaryOutputPath = null;
  let restorationSourcePath = sourcePath;
  let outputHighlights = sourceHighlights;
  let committedPath = null;
  onProgress?.({ percent: 0, message: "正在准备马赛克修复..." });

  try {
    taskDirectory = await mkdtemp(path.join(sourceDirectory, `.${stem}-lada-`));
    temporaryDirectory = path.join(taskDirectory, "work");
    temporaryOutputPath = path.join(taskDirectory, "output.mp4");
    await mkdir(temporaryDirectory, { recursive: true });
    if (highlightsOnly) {
      if (!Array.isArray(sourceHighlights) || !sourceHighlights.length) throw new Error("请至少标记一个高能片段。");
      const rawProbe = await probeMediaFile(runProcess, sourcePath);
      const durationSeconds = Number(rawProbe?.format?.duration);
      const streams = Array.isArray(rawProbe?.streams) ? rawProbe.streams : [];
      if (!streams.some((stream) => stream?.codec_type === "video")) throw new Error("原片没有可用的视频流。");
      const segments = normalizeMontageSegments(sourceHighlights, durationSeconds);
      outputHighlights = mapHighlightsToMontage(sourceHighlights, segments);
      restorationSourcePath = path.join(taskDirectory, "highlights.mp4");
      onProgress?.({ percent: 0, message: "正在拼接高能片段..." });
      await runProcess("ffmpeg", createHighlightMontageArgs(sourcePath, restorationSourcePath, segments, {
        hasAudio: streams.some((stream) => stream?.codec_type === "audio"),
        videoEncoder: await selectHighlightMontageVideoEncoder(runProcess, { signal }),
      }), {
        timeoutMs: 2 * 60 * 60 * 1000,
        timeoutMessage: "拼接高能片段超时。",
        signal,
        abortMessage: "已取消马赛克修复。",
      });
      const montageStat = await stat(restorationSourcePath);
      if (!montageStat.isFile() || montageStat.size <= 0) throw new Error("拼接高能片段失败。");
    }
    const parseStdoutProgress = createLadaProgressParser(onProgress);
    const parseStderrProgress = createLadaProgressParser(onProgress);
    await runProcess(
      ladaExecutablePath,
      createLadaArgs(restorationSourcePath, temporaryOutputPath, temporaryDirectory, normalizedOptions),
      {
        cwd: ladaWorkingDirectory,
        timeoutMs: 0,
        signal,
        abortMessage: "已取消马赛克修复。",
        killTree: true,
        stderrTailBytes: 64 * 1024,
        includeStdoutOnError: true,
        onStdout: parseStdoutProgress,
        onStderr: parseStderrProgress,
      },
    );
    let temporaryStat;
    try {
      temporaryStat = await stat(temporaryOutputPath);
    } catch (error) {
      if (error?.code === "ENOENT") throw new Error("LADA 未生成输出文件。");
      throw error;
    }
    if (!temporaryStat.isFile() || temporaryStat.size <= 0) throw new Error("LADA 输出文件为空。");

    const committed = await commitTemporaryOutput(temporaryOutputPath, sourcePath, highlightsOnly);
    committedPath = committed.outputPath;
    await rm(temporaryOutputPath, { force: true });
    const outputStat = await stat(committed.outputPath);
    const outputRelativePath = createOutputRelativePath(relativePath, committed.fileName);
    const lastModified = Math.round(outputStat.mtimeMs);
    const videoId = createGlobalVideoId(rootId, outputRelativePath, outputStat.size, lastModified);
    await persistHighlights?.(videoId, outputHighlights);
    onProgress?.({ percent: 100, message: `已生成 ${committed.fileName}` });
    return {
      fileName: committed.fileName,
      relativePath: outputRelativePath,
      size: outputStat.size,
      lastModified,
    };
  } catch (error) {
    if (committedPath) await rm(committedPath, { force: true });
    throw error;
  } finally {
    if (taskDirectory) await rm(taskDirectory, { recursive: true, force: true });
  }
}
