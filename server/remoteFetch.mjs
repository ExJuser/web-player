import http from "node:http";
import https from "node:https";
import tls from "node:tls";

function createBodyBuffer(body) {
  if (body === undefined || body === null) return null;
  return Buffer.isBuffer(body) ? body : Buffer.from(String(body));
}

function createProxyAuthorization(proxy) {
  if (!proxy.username) return {};
  const credentials = Buffer.from(`${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`).toString("base64");
  return { "Proxy-Authorization": `Basic ${credentials}` };
}

function normalizeHeaders(headers) {
  return Object.fromEntries(Object.entries(headers).filter(([, value]) => value !== undefined));
}

function collectTextResponse(response, requestLabel) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    response.on("data", (chunk) => chunks.push(chunk));
    response.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      if (response.statusCode < 200 || response.statusCode >= 300) {
        reject(new Error(`${response.statusCode}: ${text.slice(0, 240) || response.statusMessage || requestLabel}`));
        return;
      }
      resolve(text);
    });
    response.on("error", reject);
  });
}

export function getExternalProxyUrl(env = process.env) {
  const localProxy = typeof env.LOCAL_WEB_PLAYER_PROXY === "string" ? env.LOCAL_WEB_PLAYER_PROXY.trim() : "";
  if (localProxy) return localProxy;
  return typeof env.BANGUMI_LENS_PROXY === "string" ? env.BANGUMI_LENS_PROXY.trim() : "";
}

export function requestExternalTextViaHttpProxy(urlString, options) {
  const target = new URL(urlString);
  const proxy = new URL(options.proxyUrl);
  if (target.protocol !== "https:") throw new Error("代理请求目前只支持 HTTPS 目标。");
  if (proxy.protocol !== "http:") throw new Error("代理地址必须使用 http:// 协议。");

  const bodyBuffer = createBodyBuffer(options.body);
  const headers = normalizeHeaders({
    ...options.headers,
    ...(bodyBuffer ? { "Content-Length": String(bodyBuffer.length) } : {}),
  });
  const connectPath = `${target.hostname}:${target.port || 443}`;

  return new Promise((resolve, reject) => {
    let innerRequest = null;
    const fail = (error) => {
      if (innerRequest) innerRequest.destroy(error);
      reject(error);
    };
    const connectRequest = http.request({
      host: proxy.hostname,
      port: Number(proxy.port || 80),
      method: "CONNECT",
      path: connectPath,
      headers: {
        Host: connectPath,
        ...createProxyAuthorization(proxy),
      },
    });
    connectRequest.setTimeout(options.timeoutMs ?? 12000, () => connectRequest.destroy(new Error("代理连接超时。")));
    connectRequest.on("connect", (response, socket) => {
      if (response.statusCode !== 200) {
        socket.destroy();
        fail(new Error(`代理 CONNECT 失败：${response.statusCode}。`));
        return;
      }
      const tlsSocket = tls.connect({ socket, servername: target.hostname });
      innerRequest = https.request(
        {
          host: target.hostname,
          port: Number(target.port || 443),
          method: options.method || "GET",
          path: `${target.pathname}${target.search}`,
          headers,
          createConnection: () => tlsSocket,
        },
        (response) => {
          collectTextResponse(response, urlString).then(resolve, fail);
        },
      );
      innerRequest.setTimeout(options.timeoutMs ?? 12000, () => innerRequest.destroy(new Error("远端请求超时。")));
      innerRequest.on("error", fail);
      innerRequest.end(bodyBuffer ?? undefined);
    });
    connectRequest.on("error", fail);
    connectRequest.end();
  });
}

export async function requestExternalText(url, options = {}) {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 12000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const fetchImpl = options.fetchImpl ?? fetch;
  const proxyUrl = options.proxyUrl ?? getExternalProxyUrl();
  const headers = normalizeHeaders({
    Accept: options.accept || "text/plain,*/*",
    "User-Agent": options.userAgent || "local-web-player/0.1",
    Referer: options.referer || undefined,
    ...(options.headers || {}),
  });
  try {
    if (proxyUrl && !options.fetchImpl) {
      return await requestExternalTextViaHttpProxy(url, {
        method: options.method || "GET",
        headers,
        body: options.body,
        proxyUrl,
        timeoutMs,
      });
    }
    const response = await fetchImpl(url, {
      method: options.method || "GET",
      headers,
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`${response.status}: ${text.slice(0, 240) || response.statusText}`);
    return text;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(options.timeoutMessage || `远端请求超时（${Math.max(1, Math.ceil(timeoutMs / 1000))} 秒）。`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function formatRemoteFetchError(error) {
  if (!(error instanceof Error)) return String(error || "远端请求失败。");
  const cause = error.cause;
  if (cause instanceof Error && cause.message && cause.message !== error.message) {
    return `${error.message}（${cause.message}）`;
  }
  if (cause && typeof cause === "object" && "code" in cause) {
    return `${error.message}（${cause.code}）`;
  }
  return error.message;
}

export async function requestExternalJson(url, options = {}) {
  const text = await requestExternalText(url, { ...options, accept: "application/json,text/plain,*/*" });
  try {
    return JSON.parse(text || "{}");
  } catch {
    throw new Error("Remote API returned invalid JSON.");
  }
}
