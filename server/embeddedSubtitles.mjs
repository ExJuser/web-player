import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const imageSubtitleCodecs = new Set(["hdmv_pgs_subtitle", "pgs", "dvd_subtitle", "dvb_subtitle", "xsub"]);

export function normalizeSubtitleTrack(stream) {
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

export function createEmbeddedSubtitleService({
  cacheRoot,
  resolveVideoPath,
  ensureFileExists,
  runProcess,
  hashValue,
  readTextFile,
}) {
  function createCacheRecord(payload, streamIndex) {
    const cacheId = hashValue(`${payload.rootId}|${payload.relativePath}|${streamIndex}|vtt`);
    return {
      cacheId,
      cachePath: path.join(cacheRoot, `${cacheId}.vtt`),
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
    const { cacheId, cachePath } = createCacheRecord(payload, streamIndex);
    const cached = await readTextFile(cachePath);
    if (cached) return { id: cacheId, format: "vtt", text: cached };
    const text = await runProcess(
      "ffmpeg",
      ["-v", "error", "-i", videoPath, "-map", `0:${streamIndex}`, "-f", "webvtt", "-"],
      { timeoutMs: 30000, timeoutMessage: "Timed out extracting embedded subtitles." },
    );
    if (!text.trim()) throw new Error("No subtitle text was extracted.");
    await mkdir(cacheRoot, { recursive: true });
    await writeFile(cachePath, text, "utf8");
    return { id: cacheId, format: "vtt", text };
  }

  async function readCachedEmbeddedSubtitle(config, payload) {
    resolveVideoPath(config, payload?.rootId, payload?.relativePath);
    const streamIndex = Number(payload?.streamIndex);
    if (!Number.isInteger(streamIndex) || streamIndex < 0) throw new Error("Invalid subtitle stream.");
    const { cacheId, cachePath } = createCacheRecord(payload, streamIndex);
    const text = await readTextFile(cachePath);
    return text ? { id: cacheId, format: "vtt", text } : { id: cacheId, format: "vtt", text: "" };
  }

  return {
    probeEmbeddedSubtitles,
    extractEmbeddedSubtitle,
    readCachedEmbeddedSubtitle,
  };
}
