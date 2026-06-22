import http from "node:http";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import WebTorrent from "webtorrent";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const cacheDir = path.join(rootDir, ".torrent-cache");
const host = "127.0.0.1";
const port = Number(process.env.TORRENT_STREAM_PORT || 3002);
const client = new WebTorrent();
const tasks = new Map();

const videoMimeTypes = new Map([
  [".mp4", "video/mp4"],
  [".m4v", "video/mp4"],
  [".webm", "video/webm"],
  [".ogg", "video/ogg"],
  [".ogv", "video/ogg"],
  [".mov", "video/quicktime"],
  [".mkv", "video/x-matroska"],
]);

function sendJson(response, status, data) {
  const body = JSON.stringify(data);
  response.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Range",
    "Access-Control-Expose-Headers": "Content-Length,Content-Range,Accept-Ranges",
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  response.end(body);
}

function sendEmpty(response, status = 204) {
  response.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Range",
    "Access-Control-Expose-Headers": "Content-Length,Content-Range,Accept-Ranges",
  });
  response.end();
}

function sendError(response, status, message) {
  sendJson(response, status, { error: message });
}

function parseJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 64 * 1024) {
        reject(new Error("Request body is too large."));
        request.destroy();
      }
    });
    request.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Request body must be valid JSON."));
      }
    });
    request.on("error", reject);
  });
}

function normalizeFile(file, index, torrentId) {
  const extension = path.extname(file.name || file.path).toLowerCase();
  const mimeType = videoMimeTypes.get(extension) || "application/octet-stream";
  return {
    index,
    name: file.name || path.basename(file.path),
    path: file.path,
    length: file.length,
    mimeType,
    streamUrl: `http://${host}:${port}/api/torrents/${encodeURIComponent(torrentId)}/files/${index}/stream`,
  };
}

function serializeTask(task) {
  const torrent = task.torrent;
  return {
    torrentId: task.id,
    name: torrent.name || task.name || "磁力链接",
    infoHash: torrent.infoHash,
    status: torrent.ready ? "ready" : "resolving",
    progress: torrent.progress || 0,
    downloadSpeed: torrent.downloadSpeed || 0,
    uploadSpeed: torrent.uploadSpeed || 0,
    numPeers: torrent.numPeers || 0,
    files: torrent.files.map((file, index) => normalizeFile(file, index, task.id)),
  };
}

function waitForMetadata(torrent, timeoutMs = 120_000) {
  if (torrent.ready) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("解析种子元数据超时，请确认磁力链接、tracker 或 DHT 网络可用。"));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timeout);
      torrent.off("ready", handleReady);
      torrent.off("error", handleError);
    };
    const handleReady = () => {
      cleanup();
      resolve();
    };
    const handleError = (error) => {
      cleanup();
      reject(error);
    };
    torrent.once("ready", handleReady);
    torrent.once("error", handleError);
  });
}

async function createTorrentTask(magnetUri) {
  if (typeof magnetUri !== "string" || !magnetUri.trim().toLowerCase().startsWith("magnet:?")) {
    throw new Error("请输入有效的 magnet:? 磁力链接。");
  }

  const torrent = client.add(magnetUri.trim(), { path: cacheDir });
  const task = {
    id: torrent.infoHash || randomUUID(),
    name: "磁力链接",
    torrent,
  };
  tasks.set(task.id, task);
  torrent.once("metadata", () => {
    if (torrent.infoHash && torrent.infoHash !== task.id) {
      tasks.delete(task.id);
      task.id = torrent.infoHash;
      tasks.set(task.id, task);
    }
    task.name = torrent.name || task.name;
  });
  torrent.once("error", (error) => {
    task.error = error;
  });

  try {
    await waitForMetadata(torrent);
    task.name = torrent.name || task.name;
    return task;
  } catch (error) {
    await destroyTask(task);
    throw error;
  }
}

function parseRange(rangeHeader, fileLength) {
  if (!rangeHeader) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
  if (!match) return "invalid";

  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return "invalid";

  let start;
  let end;
  if (!rawStart) {
    const suffixLength = Number(rawEnd);
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) return "invalid";
    start = Math.max(fileLength - suffixLength, 0);
    end = fileLength - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd ? Number(rawEnd) : fileLength - 1;
  }

  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= fileLength) {
    return "invalid";
  }

  return { start, end: Math.min(end, fileLength - 1) };
}

async function streamTorrentFile(request, response, task, fileIndex) {
  const file = task.torrent.files[fileIndex];
  if (!file) {
    sendError(response, 404, "Torrent file not found.");
    return;
  }

  const range = parseRange(request.headers.range, file.length);
  if (range === "invalid") {
    response.writeHead(416, {
      "Access-Control-Allow-Origin": "*",
      "Content-Range": `bytes */${file.length}`,
    });
    response.end();
    return;
  }

  const start = range?.start ?? 0;
  const end = range?.end ?? file.length - 1;
  const contentLength = end - start + 1;
  const mimeType = normalizeFile(file, fileIndex, task.id).mimeType;
  const status = range ? 206 : 200;
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Expose-Headers": "Content-Length,Content-Range,Accept-Ranges",
    "Accept-Ranges": "bytes",
    "Content-Type": mimeType,
    "Content-Length": contentLength,
  };
  if (range) {
    headers["Content-Range"] = `bytes ${start}-${end}/${file.length}`;
  }

  response.writeHead(status, headers);
  try {
    await pipeline(file.createReadStream({ start, end }), response);
  } catch (error) {
    if (!response.destroyed) response.destroy(error);
  }
}

async function destroyTask(task) {
  tasks.delete(task.id);
  await new Promise((resolve) => {
    task.torrent.destroy({ destroyStore: true }, () => resolve());
  });
}

async function route(request, response) {
  if (request.method === "OPTIONS") {
    sendEmpty(response);
    return;
  }

  const url = new URL(request.url || "/", `http://${request.headers.host || `${host}:${port}`}`);
  const segments = url.pathname.split("/").filter(Boolean);

  if (request.method === "POST" && url.pathname === "/api/torrents") {
    try {
      const body = await parseJsonBody(request);
      const task = await createTorrentTask(body.magnetUri);
      sendJson(response, 201, serializeTask(task));
    } catch (error) {
      sendError(response, 400, error instanceof Error ? error.message : "磁力链接加载失败。");
    }
    return;
  }

  if (segments[0] === "api" && segments[1] === "torrents" && segments[2]) {
    const task = tasks.get(decodeURIComponent(segments[2]));
    if (!task) {
      sendError(response, 404, "Torrent task not found.");
      return;
    }

    if (request.method === "GET" && segments.length === 3) {
      sendJson(response, 200, serializeTask(task));
      return;
    }

    if (request.method === "DELETE" && segments.length === 3) {
      await destroyTask(task);
      sendEmpty(response);
      return;
    }

    if (
      request.method === "GET" &&
      segments.length === 6 &&
      segments[3] === "files" &&
      segments[5] === "stream"
    ) {
      await streamTorrentFile(request, response, task, Number(segments[4]));
      return;
    }
  }

  sendError(response, 404, "Not found.");
}

async function main() {
  await mkdir(cacheDir, { recursive: true });
  const server = http.createServer((request, response) => {
    route(request, response).catch((error) => {
      sendError(response, 500, error instanceof Error ? error.message : "Internal server error.");
    });
  });
  server.listen(port, host, () => {
    console.log(`Torrent stream server listening on http://${host}:${port}`);
  });

  const shutdown = () => {
    server.close(() => undefined);
    client.destroy(() => process.exit(0));
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
