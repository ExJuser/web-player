import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { mediaContentTypeForPath } from "./mediaCompatibility.mjs";

function formatServerTiming(timings) {
  return Object.entries(timings)
    .filter(([, duration]) => Number.isFinite(duration))
    .map(([name, duration]) => `${name};dur=${Number(duration).toFixed(2)}`)
    .join(", ");
}

export function sendSerializedJson(response, status, body, options = {}) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Content-Length", String(Buffer.byteLength(body)));
  response.setHeader("X-Response-Bytes", String(Buffer.byteLength(body)));
  const serverTiming = formatServerTiming(options.timings ?? {});
  if (serverTiming) response.setHeader("Server-Timing", serverTiming);
  if (options.cacheStatus) response.setHeader("X-Cache", options.cacheStatus);
  response.end(body);
}

export function sendJson(response, status, payload, options = {}) {
  const startedAt = performance.now();
  const body = JSON.stringify(payload);
  sendSerializedJson(response, status, body, {
    ...options,
    timings: { ...(options.timings ?? {}), json: performance.now() - startedAt },
  });
}

export function sendNdjson(response, status) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  response.setHeader("Cache-Control", "no-cache, no-transform");
  response.setHeader("X-Accel-Buffering", "no");
}

export function writeStreamEvent(response, payload) {
  response.write(`${JSON.stringify(payload)}\n`);
}

export function sendBlob(response, status, buffer, options = {}) {
  response.statusCode = status;
  response.setHeader("Content-Type", options.contentType || "application/octet-stream");
  response.setHeader("Content-Length", String(buffer.length));
  if (options.cacheControl) response.setHeader("Cache-Control", options.cacheControl);
  if (options.etag) response.setHeader("ETag", options.etag);
  response.end(buffer);
}

export function parseHttpRange(range, fileSize) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(range || ""));
  if (!match) return null;

  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Number(match[2]) : fileSize - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start < 0 || end >= fileSize) {
    return null;
  }
  return { start, end };
}

export async function sendMediaFile(request, response, filePath) {
  const fileStat = await stat(filePath);
  const fileSize = fileStat.size;
  const contentType = mediaContentTypeForPath(filePath);
  const range = request.headers.range ? parseHttpRange(request.headers.range, fileSize) : null;

  if (request.headers.range && !range) {
    response.statusCode = 416;
    response.setHeader("Content-Range", `bytes */${fileSize}`);
    response.end();
    return;
  }

  if (range) {
    response.statusCode = 206;
    response.setHeader("Content-Type", contentType);
    response.setHeader("Accept-Ranges", "bytes");
    response.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${fileSize}`);
    response.setHeader("Content-Length", String(range.end - range.start + 1));
    createReadStream(filePath, { start: range.start, end: range.end }).pipe(response);
    return;
  }

  response.statusCode = 200;
  response.setHeader("Content-Type", contentType);
  response.setHeader("Accept-Ranges", "bytes");
  response.setHeader("Content-Length", String(fileSize));
  createReadStream(filePath).pipe(response);
}
