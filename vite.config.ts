// @ts-nocheck
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const dataRoot = path.resolve(__dirname, ".local-web-player-data");
const librariesRoot = path.join(dataRoot, "libraries");
const thumbnailsRoot = path.join(dataRoot, "thumbnails");
const embeddedSubtitlesRoot = path.join(dataRoot, "subtitles");
const aiRoot = path.join(dataRoot, "ai");
const indexPath = path.join(dataRoot, "index.json");
const appConfigPath = path.resolve(__dirname, "config", "app.json");
const videoExtensions = new Set([".mp4", ".webm", ".ogg", ".mov", ".m4v", ".mkv"]);
const imageSubtitleCodecs = new Set(["hdmv_pgs_subtitle", "pgs", "dvd_subtitle", "dvb_subtitle", "xsub"]);

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

function sendNdjson(response, status) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  response.setHeader("Cache-Control", "no-cache, no-transform");
  response.setHeader("X-Accel-Buffering", "no");
}

function writeStreamEvent(response, payload) {
  response.write(`${JSON.stringify(payload)}\n`);
}

function sendBlob(response, status, buffer) {
  response.statusCode = status;
  response.setHeader("Content-Type", "image/jpeg");
  response.end(buffer);
}

function sanitizeStorageId(value) {
  if (!/^[A-Za-z0-9._~-]{1,240}$/.test(value)) {
    return null;
  }
  return value;
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > 12 * 1024 * 1024) {
        reject(new Error("Request body is too large."));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

async function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function readTextFile(filePath, fallback = null) {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return fallback;
  }
}

async function writeJsonFile(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function hashValue(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function getPathStats(targetPath) {
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

async function createCacheStatus() {
  const definitions = [
    { id: "libraries", label: "播放数据", path: librariesRoot },
    { id: "thumbnails", label: "视频缩略图", path: thumbnailsRoot },
    { id: "subtitles", label: "内封字幕", path: embeddedSubtitlesRoot },
    { id: "ai-summaries", label: "AI 字幕总结", path: path.join(aiRoot, "summaries") },
    { id: "ai-qa", label: "AI 字幕问答", path: path.join(aiRoot, "qa") },
    { id: "ai-recaps", label: "AI 进度回顾", path: path.join(aiRoot, "recaps") },
    { id: "index", label: "索引数据", path: indexPath },
  ];

  const items = await Promise.all(
    definitions.map(async (definition) => ({
      ...definition,
      ...(await getPathStats(definition.path)),
    })),
  );
  const totalBytes = items.reduce((sum, item) => sum + item.bytes, 0);
  const totalFiles = items.reduce((sum, item) => sum + item.files, 0);
  const updatedAt = items.reduce((latest, item) => Math.max(latest, item.updatedAt ?? 0), 0) || null;

  return {
    rootPath: dataRoot,
    totalBytes,
    totalFiles,
    updatedAt,
    items,
  };
}

function normalizeMediaRoots(config) {
  const roots = Array.isArray(config?.media?.roots) ? config.media.roots : [];
  return roots
    .map((root) => {
      const id = typeof root?.id === "string" ? root.id.trim() : "";
      const rootPath = typeof root?.path === "string" ? path.resolve(root.path) : "";
      if (!id || !rootPath || !/^[A-Za-z0-9._~-]{1,80}$/.test(id)) return null;
      return {
        id,
        label: typeof root?.label === "string" && root.label.trim() ? root.label.trim() : path.basename(rootPath),
        path: rootPath,
        basename: path.basename(rootPath),
      };
    })
    .filter(Boolean);
}

async function loadAppConfig() {
  return readJsonFile(appConfigPath, { server: { port: 3001 }, media: { roots: [] } });
}

function publicLocalConfig(config, tools, env) {
  const roots = normalizeMediaRoots(config).map((root) => ({
    id: root.id,
    label: root.label,
    basename: root.basename,
  }));
  return {
    mediaRoots: roots,
    ffmpeg: tools,
    ai: {
      configured: Boolean(env.DEEPSEEK_API_KEY),
      model: env.DEEPSEEK_MODEL || "deepseek-chat",
    },
  };
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: __dirname,
      windowsHide: true,
      shell: false,
    });
    const stdout = [];
    const stderr = [];
    let stdoutSize = 0;
    const maxStdoutBytes = options.maxStdoutBytes ?? 10 * 1024 * 1024;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(options.timeoutMessage || `${command} timed out.`));
    }, options.timeoutMs ?? 15000);

    child.stdout.on("data", (chunk) => {
      stdoutSize += chunk.length;
      if (stdoutSize > maxStdoutBytes) {
        child.kill("SIGKILL");
        reject(new Error(`${command} output is too large.`));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(Buffer.concat(stdout).toString("utf8"));
        return;
      }
      reject(new Error(Buffer.concat(stderr).toString("utf8").trim() || `${command} exited with ${code}.`));
    });
  });
}

async function detectTools() {
  const [ffmpeg, ffprobe] = await Promise.all([
    runProcess("ffmpeg", ["-version"], { timeoutMs: 5000 }).then(() => true, () => false),
    runProcess("ffprobe", ["-version"], { timeoutMs: 5000 }).then(() => true, () => false),
  ]);
  return { ffmpeg, ffprobe };
}

function resolveVideoPath(config, rootId, relativePath) {
  const root = normalizeMediaRoots(config).find((item) => item.id === rootId);
  if (!root) throw new Error("Unknown media root.");
  if (typeof relativePath !== "string" || !relativePath.trim()) throw new Error("Invalid relative path.");
  const normalizedRelativePath = relativePath.replace(/\\/g, "/");
  if (path.isAbsolute(normalizedRelativePath) || normalizedRelativePath.split("/").includes("..")) {
    throw new Error("Invalid relative path.");
  }
  if (!videoExtensions.has(path.extname(normalizedRelativePath).toLowerCase())) {
    throw new Error("Unsupported video file.");
  }
  const resolved = path.resolve(root.path, normalizedRelativePath);
  const rootWithSeparator = root.path.endsWith(path.sep) ? root.path : `${root.path}${path.sep}`;
  if (resolved !== root.path && !resolved.startsWith(rootWithSeparator)) {
    throw new Error("Resolved video path is outside the configured media root.");
  }
  return resolved;
}

async function ensureFileExists(filePath) {
  await access(filePath);
}

function normalizeSubtitleTrack(stream) {
  const codec = String(stream.codec_name || "unknown");
  const tags = stream.tags && typeof stream.tags === "object" ? stream.tags : {};
  const extractable = !imageSubtitleCodecs.has(codec.toLowerCase());
  return {
    streamIndex: Number(stream.index),
    codec,
    language: typeof tags.language === "string" ? tags.language : undefined,
    title: typeof tags.title === "string" ? tags.title : undefined,
    extractable,
    reason: extractable ? undefined : "Image subtitles need OCR and are not supported yet.",
  };
}

async function probeEmbeddedSubtitles(config, payload) {
  const videoPath = resolveVideoPath(config, payload?.rootId, payload?.relativePath);
  await ensureFileExists(videoPath);
  const raw = await runProcess("ffprobe", [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_streams",
    "-select_streams",
    "s",
    videoPath,
  ]);
  const parsed = JSON.parse(raw || "{}");
  const tracks = Array.isArray(parsed.streams) ? parsed.streams.map(normalizeSubtitleTrack) : [];
  return { tracks };
}

async function extractEmbeddedSubtitle(config, payload) {
  const videoPath = resolveVideoPath(config, payload?.rootId, payload?.relativePath);
  await ensureFileExists(videoPath);
  const streamIndex = Number(payload?.streamIndex);
  if (!Number.isInteger(streamIndex) || streamIndex < 0) throw new Error("Invalid subtitle stream.");
  const cacheId = hashValue(`${payload.rootId}|${payload.relativePath}|${streamIndex}|vtt`);
  const cachePath = path.join(embeddedSubtitlesRoot, `${cacheId}.vtt`);
  const cached = await readTextFile(cachePath);
  if (cached) return { id: cacheId, format: "vtt", text: cached };
  const text = await runProcess(
    "ffmpeg",
    ["-v", "error", "-i", videoPath, "-map", `0:${streamIndex}`, "-f", "webvtt", "-"],
    { timeoutMs: 30000, timeoutMessage: "Timed out extracting embedded subtitles." },
  );
  if (!text.trim()) throw new Error("No subtitle text was extracted.");
  await mkdir(embeddedSubtitlesRoot, { recursive: true });
  await writeFile(cachePath, text, "utf8");
  return { id: cacheId, format: "vtt", text };
}

function chunkText(text, size = 12000) {
  const chunks = [];
  for (let index = 0; index < text.length; index += size) {
    chunks.push(text.slice(index, index + size));
  }
  return chunks;
}

async function callDeepSeek(env, messages) {
  if (!env.DEEPSEEK_API_KEY) throw new Error("DEEPSEEK_API_KEY is not configured.");
  const baseUrl = (env.DEEPSEEK_BASE_URL || env.DEEPSEEK_API_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.DEEPSEEK_MODEL || "deepseek-chat",
      temperature: 0.3,
      messages,
    }),
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(errorText || response.statusText);
  }
  const payload = await response.json();
  return payload?.choices?.[0]?.message?.content?.trim() || "";
}

async function streamDeepSeek(env, messages, onDelta) {
  if (!env.DEEPSEEK_API_KEY) throw new Error("DEEPSEEK_API_KEY is not configured.");
  const baseUrl = (env.DEEPSEEK_BASE_URL || env.DEEPSEEK_API_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.DEEPSEEK_MODEL || "deepseek-chat",
      temperature: 0.3,
      stream: true,
      messages,
    }),
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(errorText || response.statusText);
  }
  if (!response.body) throw new Error("Streaming response is unavailable.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let output = "";

  const handleBlock = (block) => {
    const lines = block
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("data:"));
    for (const line of lines) {
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const payload = JSON.parse(data);
        const delta = payload?.choices?.[0]?.delta?.content || "";
        if (delta) {
          output += delta;
          onDelta(delta);
        }
      } catch {
        // Ignore malformed SSE keepalive chunks.
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() ?? "";
    blocks.forEach(handleBlock);
  }
  buffer += decoder.decode();
  if (buffer.trim()) handleBlock(buffer);
  return output.trim();
}

async function summarizeSubtitle(env, payload) {
  const subtitleText = typeof payload?.subtitleText === "string" ? payload.subtitleText.trim() : "";
  if (!subtitleText) throw new Error("Subtitle text is required.");
  const cacheId = hashValue(`summary|${payload?.videoName || ""}|${subtitleText}`);
  const cachePath = path.join(aiRoot, "summaries", `${cacheId}.json`);
  const cached = await readJsonFile(cachePath, null);
  if (cached?.summary) return cached;

  const parts = [];
  for (const chunk of chunkText(subtitleText)) {
    parts.push(
      await callDeepSeek(env, [
        { role: "system", content: "你是一个视频字幕分析助手。请只根据用户提供的字幕内容总结，不要编造。" },
        { role: "user", content: `视频：${payload?.videoName || "未命名"}\n\n请总结这段字幕的剧情要点、人物/关系、情绪基调和关键词：\n\n${chunk}` },
      ]),
    );
  }
  const summary =
    parts.length === 1
      ? parts[0]
      : await callDeepSeek(env, [
          { role: "system", content: "你是一个视频字幕分析助手。请合并分段摘要，避免重复，不要加入字幕外信息。" },
          { role: "user", content: `视频：${payload?.videoName || "未命名"}\n\n请合并以下分段摘要，输出本集概要、关键事件、人物关系、情绪基调、关键词：\n\n${parts.join("\n\n---\n\n")}` },
        ]);
  const result = { summary, updatedAt: Date.now() };
  await writeJsonFile(cachePath, result);
  return result;
}

async function streamSubtitleSummary(env, payload, response) {
  sendNdjson(response, 200);
  try {
    const subtitleText = typeof payload?.subtitleText === "string" ? payload.subtitleText.trim() : "";
    if (!subtitleText) throw new Error("Subtitle text is required.");
    const cacheId = hashValue(`summary|${payload?.videoName || ""}|${subtitleText}`);
    const cachePath = path.join(aiRoot, "summaries", `${cacheId}.json`);
    const cached = await readJsonFile(cachePath, null);
    if (cached?.summary) {
      writeStreamEvent(response, { type: "result", text: cached.summary });
      writeStreamEvent(response, { type: "done" });
      return;
    }

    const chunks = chunkText(subtitleText);
    const parts = [];
    for (let index = 0; index < chunks.length; index += 1) {
      if (chunks.length > 1) {
        writeStreamEvent(response, { type: "message", text: `正在分析第 ${index + 1}/${chunks.length} 段字幕...` });
      }
      parts.push(
        await callDeepSeek(env, [
          { role: "system", content: "你是一个视频字幕分析助手。只根据字幕内容总结，不要编造。输出简洁中文，控制在 80-120 字。" },
          { role: "user", content: `视频：${payload?.videoName || "未命名"}\n\n请概括这段字幕的关键事件、人物关系和情绪变化：\n\n${chunks[index]}` },
        ]),
      );
    }

    if (chunks.length > 1) {
      writeStreamEvent(response, { type: "message", text: "正在合并字幕总结..." });
    }
    const messages =
      parts.length === 1
        ? [
            { role: "system", content: "你是一个视频字幕分析助手。只根据字幕内容总结，不要编造。输出简洁中文，控制在 180-260 字。" },
            { role: "user", content: `视频：${payload?.videoName || "未命名"}\n\n请总结这段字幕的主要内容、人物关系、情绪基调和关键词：\n\n${subtitleText}` },
          ]
        : [
            { role: "system", content: "你是一个视频字幕分析助手。请合并分段摘要，避免重复，不要加入字幕外信息。输出简洁中文，控制在 180-260 字。" },
            { role: "user", content: `视频：${payload?.videoName || "未命名"}\n\n请合并以下分段摘要，输出本集概要、关键事件、人物关系、情绪基调和关键词：\n\n${parts.join("\n\n---\n\n")}` },
          ];
    let summary = "";
    summary = await streamDeepSeek(env, messages, (delta) => {
      writeStreamEvent(response, { type: "delta", text: delta });
    });
    const result = { summary, updatedAt: Date.now() };
    await writeJsonFile(cachePath, result);
    writeStreamEvent(response, { type: "done" });
  } catch (error) {
    writeStreamEvent(response, { type: "error", error: error instanceof Error ? error.message : "Failed to summarize subtitles." });
  } finally {
    response.end();
  }
}

async function askSubtitleQuestion(env, payload) {
  const question = typeof payload?.question === "string" ? payload.question.trim() : "";
  const chunks = Array.isArray(payload?.chunks) ? payload.chunks : [];
  if (!question) throw new Error("Question is required.");
  if (!chunks.length) throw new Error("Relevant subtitle chunks are required.");
  const context = chunks
    .map((chunk) => `[${chunk.start || "?"} - ${chunk.end || "?"}]\n${chunk.text || ""}`)
    .join("\n\n");
  const cacheId = hashValue(`qa|${payload?.videoName || ""}|${question}|${context}`);
  const cachePath = path.join(aiRoot, "qa", `${cacheId}.json`);
  const cached = await readJsonFile(cachePath, null);
  if (cached?.answer) return cached;
  const answer = await callDeepSeek(env, [
    { role: "system", content: "你是一个视频字幕问答助手。只能根据给定字幕片段回答；如果片段不足以回答，请明确说明。回答中尽量引用时间范围。" },
    { role: "user", content: `视频：${payload?.videoName || "未命名"}\n问题：${question}\n\n相关字幕片段：\n${context}` },
  ]);
  const result = { answer, updatedAt: Date.now() };
  await writeJsonFile(cachePath, result);
  return result;
}

async function streamSubtitleAnswer(env, payload, response) {
  sendNdjson(response, 200);
  try {
    const question = typeof payload?.question === "string" ? payload.question.trim() : "";
    const chunks = Array.isArray(payload?.chunks) ? payload.chunks : [];
    if (!question) throw new Error("Question is required.");
    if (!chunks.length) throw new Error("Relevant subtitle chunks are required.");
    const context = chunks
      .map((chunk) => `[${chunk.start || "?"} - ${chunk.end || "?"}]\n${chunk.text || ""}`)
      .join("\n\n");
    const cacheId = hashValue(`qa|${payload?.videoName || ""}|${question}|${context}`);
    const cachePath = path.join(aiRoot, "qa", `${cacheId}.json`);
    const cached = await readJsonFile(cachePath, null);
    if (cached?.answer) {
      writeStreamEvent(response, { type: "result", text: cached.answer });
      writeStreamEvent(response, { type: "done" });
      return;
    }

    const answer = await streamDeepSeek(
      env,
      [
        {
          role: "system",
          content:
            "你是一个视频字幕问答助手。只能根据给定字幕片段回答；如果片段不足以回答，请明确说明。回答要直接、简洁，控制在 120-220 字，必要时引用时间范围。",
        },
        { role: "user", content: `视频：${payload?.videoName || "未命名"}\n问题：${question}\n\n相关字幕片段：\n${context}` },
      ],
      (delta) => {
        writeStreamEvent(response, { type: "delta", text: delta });
      },
    );
    const result = { answer, updatedAt: Date.now() };
    await writeJsonFile(cachePath, result);
    writeStreamEvent(response, { type: "done" });
  } catch (error) {
    writeStreamEvent(response, { type: "error", error: error instanceof Error ? error.message : "Failed to answer subtitle question." });
  } finally {
    response.end();
  }
}

async function streamProgressRecap(env, payload, response) {
  sendNdjson(response, 200);
  try {
    const viewedText = typeof payload?.viewedText === "string" ? payload.viewedText.trim() : "";
    const currentTime = Number(payload?.currentTime);
    const subtitleId = typeof payload?.subtitleId === "string" ? payload.subtitleId : "";
    if (!viewedText) throw new Error("Viewed subtitle text is required.");
    if (!Number.isFinite(currentTime) || currentTime < 0) throw new Error("Current time is required.");

    const recapEndSeconds = Math.floor(currentTime);
    const cacheId = hashValue(`recap|${payload?.videoName || ""}|${subtitleId}|${recapEndSeconds}|${viewedText}`);
    const cachePath = path.join(aiRoot, "recaps", `${cacheId}.json`);
    const cached = await readJsonFile(cachePath, null);
    if (cached?.recap) {
      writeStreamEvent(response, { type: "result", text: cached.recap });
      writeStreamEvent(response, { type: "done" });
      return;
    }

    writeStreamEvent(response, { type: "message", text: "正在生成无剧透进度回顾..." });
    const recap = await streamDeepSeek(
      env,
      [
        {
          role: "system",
          content:
            "你是视频字幕进度回顾助手。只能基于用户提供的已观看字幕内容回答，不得推断、补充或暗示后续剧情，不得提及尚未在字幕中出现的事件。请用简洁中文输出 120-220 字。",
        },
        {
          role: "user",
          content: `视频：${payload?.videoName || "未命名"}\n看到这里为止：${recapEndSeconds} 秒\n\n请生成“看到这里为止”的无剧透回顾，概括已发生的关键事件、人物关系和当前悬念。只使用下面这些字幕：\n\n${viewedText}`,
        },
      ],
      (delta) => {
        writeStreamEvent(response, { type: "delta", text: delta });
      },
    );
    const result = { recap, updatedAt: Date.now() };
    await writeJsonFile(cachePath, result);
    writeStreamEvent(response, { type: "done" });
  } catch (error) {
    writeStreamEvent(response, { type: "error", error: error instanceof Error ? error.message : "Failed to generate progress recap." });
  } finally {
    response.end();
  }
}

function parseAiJsonObject(text) {
  const trimmed = String(text || "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function normalizeLibrarySearchCandidates(source) {
  const candidates = Array.isArray(source) ? source : [];
  return candidates
    .map((candidate) => ({
      id: typeof candidate?.id === "string" ? candidate.id.slice(0, 240) : "",
      name: typeof candidate?.name === "string" ? candidate.name.slice(0, 240) : "",
      relativePath: typeof candidate?.relativePath === "string" ? candidate.relativePath.slice(0, 360) : "",
      seriesTitle: typeof candidate?.seriesTitle === "string" ? candidate.seriesTitle.slice(0, 160) : "",
      progressLabel: typeof candidate?.progressLabel === "string" ? candidate.progressLabel.slice(0, 80) : "",
      isFavorite: Boolean(candidate?.isFavorite),
      isCompleted: Boolean(candidate?.isCompleted),
    }))
    .filter((candidate) => candidate.id && candidate.name)
    .slice(0, 80);
}

async function searchLibraryWithAi(env, payload) {
  const query = typeof payload?.query === "string" ? payload.query.trim().slice(0, 300) : "";
  const candidates = normalizeLibrarySearchCandidates(payload?.candidates);
  if (!query) throw new Error("Search query is required.");
  if (!candidates.length) throw new Error("Library candidates are required.");

  const catalog = candidates
    .map(
      (candidate, index) =>
        `${index + 1}. id=${JSON.stringify(candidate.id)} | series=${candidate.seriesTitle || "未分组"} | name=${candidate.name} | path=${candidate.relativePath} | progress=${candidate.progressLabel || "未知"} | favorite=${candidate.isFavorite ? "yes" : "no"} | completed=${candidate.isCompleted ? "yes" : "no"}`,
    )
    .join("\n");

  const raw = await callDeepSeek(env, [
    {
      role: "system",
      content:
        "你是本地片库搜索助手。只能从用户提供的候选视频中选择，不能编造片名或使用候选外内容。请返回严格 JSON：{\"answer\":\"简短中文理由\",\"matchIds\":[\"候选 id\"]}。matchIds 最多 5 个。",
    },
    {
      role: "user",
      content: `搜索需求：${query}\n\n候选片库：\n${catalog}`,
    },
  ]);
  const parsed = parseAiJsonObject(raw);
  const candidateIds = new Set(candidates.map((candidate) => candidate.id));
  const matchIds = Array.isArray(parsed?.matchIds)
    ? parsed.matchIds.filter((id) => typeof id === "string" && candidateIds.has(id)).slice(0, 5)
    : [];
  const answer = typeof parsed?.answer === "string" && parsed.answer.trim() ? parsed.answer.trim() : raw.trim();
  return { answer, matchIds };
}

async function updateIndex(libraryId, metadata) {
  await mkdir(dataRoot, { recursive: true });
  const index = await readJsonFile(indexPath, { version: 1, libraries: {} });
  index.version = 1;
  index.libraries = index.libraries && typeof index.libraries === "object" ? index.libraries : {};
  index.libraries[libraryId] = {
    ...(index.libraries[libraryId] ?? {}),
    ...(metadata && typeof metadata === "object" ? metadata : {}),
    updatedAt: Date.now(),
  };
  await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
}

function playerDataApiPlugin(env) {
  let toolsPromise = null;
  const getTools = () => {
    toolsPromise ??= detectTools();
    return toolsPromise;
  };

  const middleware = async (request, response, next) => {
    if (!request.url?.startsWith("/api/")) {
      next();
      return;
    }

    const url = new URL(request.url, "http://127.0.0.1");
    const libraryMatch = url.pathname.match(/^\/api\/player-data\/libraries\/([^/]+)$/);
    const thumbnailMatch = url.pathname.match(/^\/api\/player-data\/thumbnails\/([^/]+)$/);

    try {
      if (url.pathname === "/api/local-config" && request.method === "GET") {
        sendJson(response, 200, publicLocalConfig(await loadAppConfig(), await getTools(), env));
        return;
      }

      if (url.pathname === "/api/cache-status" && request.method === "GET") {
        sendJson(response, 200, await createCacheStatus());
        return;
      }

      if (url.pathname === "/api/subtitles/embedded/probe" && request.method === "POST") {
        const payload = JSON.parse((await readBody(request)).toString("utf8"));
        sendJson(response, 200, await probeEmbeddedSubtitles(await loadAppConfig(), payload));
        return;
      }

      if (url.pathname === "/api/subtitles/embedded/extract" && request.method === "POST") {
        const payload = JSON.parse((await readBody(request)).toString("utf8"));
        sendJson(response, 200, await extractEmbeddedSubtitle(await loadAppConfig(), payload));
        return;
      }

      if (url.pathname === "/api/ai/subtitles/summarize" && request.method === "POST") {
        const payload = JSON.parse((await readBody(request)).toString("utf8"));
        await streamSubtitleSummary(env, payload, response);
        return;
      }

      if (url.pathname === "/api/ai/subtitles/ask" && request.method === "POST") {
        const payload = JSON.parse((await readBody(request)).toString("utf8"));
        await streamSubtitleAnswer(env, payload, response);
        return;
      }

      if (url.pathname === "/api/ai/subtitles/recap" && request.method === "POST") {
        const payload = JSON.parse((await readBody(request)).toString("utf8"));
        await streamProgressRecap(env, payload, response);
        return;
      }

      if (url.pathname === "/api/ai/library/search" && request.method === "POST") {
        const payload = JSON.parse((await readBody(request)).toString("utf8"));
        sendJson(response, 200, await searchLibraryWithAi(env, payload));
        return;
      }

      if (libraryMatch) {
        const libraryId = sanitizeStorageId(decodeURIComponent(libraryMatch[1]));
        if (!libraryId) {
          sendJson(response, 400, { error: "Invalid library id." });
          return;
        }

        const filePath = path.join(librariesRoot, `${libraryId}.json`);
        if (request.method === "GET") {
          const payload = await readJsonFile(filePath, null);
          sendJson(response, payload ? 200 : 404, payload ?? { error: "Library data not found." });
          return;
        }

        if (request.method === "PUT") {
          const rawBody = await readBody(request);
          const payload = JSON.parse(rawBody.toString("utf8"));
          await mkdir(librariesRoot, { recursive: true });
          await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
          await updateIndex(libraryId, payload.metadata);
          sendJson(response, 200, { ok: true });
          return;
        }
      }

      if (thumbnailMatch) {
        const thumbnailId = sanitizeStorageId(decodeURIComponent(thumbnailMatch[1]));
        if (!thumbnailId) {
          sendJson(response, 400, { error: "Invalid thumbnail id." });
          return;
        }

        const filePath = path.join(thumbnailsRoot, `${thumbnailId}.blob`);
        if (request.method === "GET") {
          try {
            sendBlob(response, 200, await readFile(filePath));
          } catch {
            response.statusCode = 404;
            response.end();
          }
          return;
        }

        if (request.method === "PUT") {
          const rawBody = await readBody(request);
          await mkdir(thumbnailsRoot, { recursive: true });
          await writeFile(filePath, rawBody);
          sendJson(response, 200, { ok: true });
          return;
        }
      }

      sendJson(response, 404, { error: "Not found." });
    } catch (error) {
      sendJson(response, 500, { error: error instanceof Error ? error.message : "Internal server error." });
    }
  };

  return {
    name: "local-web-player-data-api",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), playerDataApiPlugin(env)],
  };
});
