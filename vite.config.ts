// @ts-nocheck
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const dataRoot = path.resolve(__dirname, ".local-web-player-data");
const librariesRoot = path.join(dataRoot, "libraries");
const thumbnailsRoot = path.join(dataRoot, "thumbnails");
const indexPath = path.join(dataRoot, "index.json");

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
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

function playerDataApiPlugin() {
  const middleware = async (request, response, next) => {
    if (!request.url?.startsWith("/api/player-data/")) {
      next();
      return;
    }

    const url = new URL(request.url, "http://127.0.0.1");
    const libraryMatch = url.pathname.match(/^\/api\/player-data\/libraries\/([^/]+)$/);
    const thumbnailMatch = url.pathname.match(/^\/api\/player-data\/thumbnails\/([^/]+)$/);

    try {
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

export default defineConfig({
  plugins: [react(), playerDataApiPlugin()],
});
