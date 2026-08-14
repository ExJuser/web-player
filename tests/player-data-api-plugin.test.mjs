// playerDataApiPlugin 的 HTTP 冒烟测试：用 mock req/res 直接驱动 middleware，
// 覆盖主要数据路由的 200/404 语义与持久化往返。
// 不触达 ffmpeg/lada/媒体文件等外部依赖（那些路由需要真实文件）。
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { fileURLToPath } from "node:url";

import * as esbuild from "esbuild";

// playerDataApiPlugin.mjs 直接 import 了 src 下的 TS 模块（danmakuUtils 等），
// node 原生解析不了，先用 esbuild 打成单文件 ESM 再加载。
// 注意必须写到真实文件再 import：产物内可能用 import.meta.url 做相对路径解析，
// data: URL 的 import.meta.url 无法解析相对路径。
async function loadBundledPlugin() {
  const bundled = await esbuild.build({
    bundle: true,
    entryPoints: [fileURLToPath(new URL("../server/playerDataApiPlugin.mjs", import.meta.url))],
    format: "esm",
    platform: "node",
    target: "node22",
    write: false,
    logLevel: "silent",
  });
  const bundlePath = path.join(await mkdtemp(path.join(tmpdir(), "web-player-api-bundle-")), "playerDataApiPlugin.mjs");
  await writeFile(bundlePath, bundled.outputFiles[0].text);
  const module = await import(pathToFileURL(bundlePath).href);
  return module.playerDataApiPlugin;
}

function createMockRequest({ method, url, headers = {}, body = null }) {
  return {
    method,
    url,
    headers,
    on(event, callback) {
      if (event === "data" && body !== null) callback(Buffer.from(body));
      if (event === "end") callback();
      return this;
    },
    destroy() {},
  };
}

function createMockResponse() {
  const headers = {};
  let body = "";
  return {
    statusCode: 0,
    headers,
    body,
    setHeader(name, value) {
      headers[name.toLowerCase()] = value;
    },
    write(chunk) {
      body += chunk;
    },
    end(chunk) {
      if (chunk) body += chunk;
    },
    getBody() {
      return body;
    },
  };
}

async function createPluginFixture() {
  const playerDataApiPlugin = await loadBundledPlugin();
  const projectRoot = await mkdtemp(path.join(tmpdir(), "web-player-api-plugin-"));
  await mkdir(path.join(projectRoot, "config"), { recursive: true });
  await writeFile(
    path.join(projectRoot, "config", "app.json"),
    JSON.stringify({ server: { port: 3001 }, media: { roots: [] }, photoAlbums: { roots: [] } }),
  );
  // 缓存状态只展示有内容的项：预置一份缩略图，保证 /api/cache-status 包含 thumbnails。
  const thumbnailsRoot = path.join(projectRoot, ".local-web-player-data", "thumbnails");
  await mkdir(thumbnailsRoot, { recursive: true });
  await writeFile(path.join(thumbnailsRoot, "seed.blob"), Buffer.from("seed"));
  const captured = { middleware: null };
  const plugin = playerDataApiPlugin({ projectRoot, env: {} });
  await plugin.configureServer({
    middlewares: {
      use: (handler) => {
        captured.middleware = handler;
      },
    },
  });
  return { middleware: captured.middleware, projectRoot };
}

async function requestJson(middleware, { method = "GET", url, body = null }) {
  const response = createMockResponse();
  let nextCalled = false;
  await middleware(
    createMockRequest({ method, url, body: body === null ? null : JSON.stringify(body), headers: { "content-type": "application/json" } }),
    response,
    () => {
      nextCalled = true;
    },
  );
  let payload = null;
  try {
    payload = response.getBody() ? JSON.parse(response.getBody()) : null;
  } catch {
    payload = null;
  }
  return { status: response.statusCode, payload, nextCalled, body: response.getBody() };
}

let fixture;

test.before(async () => {
  fixture = await createPluginFixture();
});

test.after(async () => {
  // sqlite 连接保持打开，Windows 上递归删除可能 EBUSY；清理失败可忽略（临时目录由系统回收）。
  try {
    await rm(fixture.projectRoot, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

test("non-api urls fall through to next middleware", async () => {
  const { status, nextCalled } = await requestJson(fixture.middleware, { url: "/index.html" });
  assert.equal(status, 0);
  assert.equal(nextCalled, true);
});

test("unknown api routes return 404", async () => {
  const { status } = await requestJson(fixture.middleware, { url: "/api/does-not-exist" });
  assert.equal(status, 404);
});

test("GET global player data returns 404 before any data exists", async () => {
  const { status } = await requestJson(fixture.middleware, { url: "/api/player-data/global" });
  assert.equal(status, 404);
});

test("progress write round trips through the global store", async () => {
  const videoId = "root|视频A.mp4|1|2";
  const put = await requestJson(fixture.middleware, {
    method: "PUT",
    url: `/api/player-data/progress/${encodeURIComponent(videoId)}`,
    body: { currentTime: 120, duration: 3600, completed: false, updatedAt: 1700000000000 },
  });
  assert.equal(put.status, 200);

  const { status, payload } = await requestJson(fixture.middleware, { url: "/api/player-data/global" });
  assert.equal(status, 200);
  // 服务端 store 的 progress 字段序列化为 items（客户端 parse 时再归一化为 progress）。
  assert.equal(payload.items[videoId].currentTime, 120);
});

test("favorite and tags writes round trip through the global store", async () => {
  const videoId = "root|视频B.mp4|3|4";
  await requestJson(fixture.middleware, { method: "PUT", url: `/api/player-data/favorites/${encodeURIComponent(videoId)}` });
  await requestJson(fixture.middleware, {
    method: "PUT",
    url: `/api/player-data/tags/${encodeURIComponent(videoId)}`,
    body: { tags: ["动作", "悬疑"] },
  });

  const { payload } = await requestJson(fixture.middleware, { url: "/api/player-data/global" });
  assert.ok(payload.favorites.includes(videoId));
  assert.deepEqual(payload.videoTags[videoId], ["动作", "悬疑"]);
});

test("startup view excludes deferred player-only data", async () => {
  const { status, payload } = await requestJson(fixture.middleware, { url: "/api/player-data/global?view=startup" });
  assert.equal(status, 200);
  assert.equal(payload.version, 6);
  // 启动视图含 items/favorites，但不含 deferred 字段（progress 归入 items）。
  assert.ok("items" in payload);
  assert.ok(!("videoHighlights" in payload));
  assert.ok(!("embeddedSubtitles" in payload));
});

test("preference writes round trip through the global store", async () => {
  await requestJson(fixture.middleware, {
    method: "PUT",
    url: "/api/player-data/preferences/playlistSortMode",
    body: { value: "size" },
  });
  const { payload } = await requestJson(fixture.middleware, { url: "/api/player-data/global" });
  assert.equal(payload.preferences.playlistSortMode, "size");
});

test("GET cache status returns item list including thumbnails", async () => {
  const { status, payload } = await requestJson(fixture.middleware, { url: "/api/cache-status" });
  assert.equal(status, 200);
  assert.ok(Array.isArray(payload.items));
  const thumbnails = payload.items.find((item) => item.id === "thumbnails");
  assert.ok(thumbnails);
  assert.equal(thumbnails.files, 1);
});

test("GET mosaics lists an empty store", async () => {
  const { status, payload } = await requestJson(fixture.middleware, { url: "/api/mosaics" });
  assert.equal(status, 200);
  assert.deepEqual(payload, []);
});

test("GET photo album store returns a shaped store after a write", async () => {
  const put = await requestJson(fixture.middleware, {
    method: "PUT",
    url: "/api/photo-albums/global",
    body: { favorites: ["album-1"] },
  });
  assert.equal(put.status, 200);

  const { status, payload } = await requestJson(fixture.middleware, { url: "/api/photo-albums/global" });
  assert.equal(status, 200);
  assert.deepEqual(payload.favorites, ["album-1"]);
});

test("GET local config reflects external edits through the mtime cache", async () => {
  const first = await requestJson(fixture.middleware, { url: "/api/local-config" });
  assert.equal(first.status, 200);
  assert.equal(first.payload.mediaRoots.length, 0);

  // 直接改磁盘上的 config/app.json，mtime 变化应使缓存失效
  const configPath = path.join(fixture.projectRoot, "config", "app.json");
  await writeFile(
    configPath,
    JSON.stringify({
      server: { port: 3001 },
      media: { roots: [{ id: "root-1", label: "影片", path: "E:\\影片", source: "local" }] },
      photoAlbums: { roots: [] },
    }),
  );

  const second = await requestJson(fixture.middleware, { url: "/api/local-config" });
  assert.equal(second.status, 200);
  assert.equal(second.payload.mediaRoots.length, 1);
  assert.equal(second.payload.mediaRoots[0].id, "root-1");
});

test("missing thumbnail file returns 404", async () => {
  const { status } = await requestJson(fixture.middleware, { url: "/api/player-data/thumbnails/root.1.zzzzzz" });
  assert.equal(status, 404);
});
