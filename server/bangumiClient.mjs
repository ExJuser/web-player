import http from "node:http";
import https from "node:https";
import tls from "node:tls";

export function createBodyBuffer(body) {
  if (body === undefined || body === null) return null;
  return Buffer.isBuffer(body) ? body : Buffer.from(String(body));
}

function collectJsonResponse(response, requestLabel) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    response.on("data", (chunk) => {
      size += chunk.length;
      if (size > 4 * 1024 * 1024) {
        reject(new Error("Bangumi response is too large."));
        response.destroy();
        return;
      }
      chunks.push(chunk);
    });
    response.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      if (response.statusCode < 200 || response.statusCode >= 300) {
        reject(new Error(`Bangumi API ${response.statusCode}: ${text.slice(0, 300) || response.statusMessage || requestLabel}`));
        return;
      }
      try {
        resolve(JSON.parse(text || "{}"));
      } catch {
        reject(new Error("Bangumi returned invalid JSON."));
      }
    });
    response.on("error", reject);
  });
}

export function requestJsonDirect(urlString, options) {
  const target = new URL(urlString);
  const bodyBuffer = createBodyBuffer(options.body);
  const headers = {
    ...options.headers,
    ...(bodyBuffer ? { "Content-Length": String(bodyBuffer.length) } : {}),
  };
  const client = target.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const request = client.request(
      target,
      {
        method: options.method || "GET",
        headers,
      },
      (response) => {
        collectJsonResponse(response, urlString).then(resolve, reject);
      },
    );
    request.setTimeout(options.timeoutMs ?? 12000, () => request.destroy(new Error("Bangumi request timed out.")));
    request.on("error", reject);
    request.end(bodyBuffer ?? undefined);
  });
}

export function createProxyAuthorization(proxy) {
  if (!proxy.username) return {};
  const credentials = Buffer.from(`${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`).toString("base64");
  return { "Proxy-Authorization": `Basic ${credentials}` };
}

export function requestJsonViaHttpProxy(urlString, options) {
  const target = new URL(urlString);
  const proxy = new URL(options.proxyUrl);
  if (target.protocol !== "https:") throw new Error("Bangumi proxy requests only support HTTPS targets.");
  if (proxy.protocol !== "http:") throw new Error("BANGUMI_LENS_PROXY must use the http:// scheme.");

  const bodyBuffer = createBodyBuffer(options.body);
  const headers = {
    ...options.headers,
    ...(bodyBuffer ? { "Content-Length": String(bodyBuffer.length) } : {}),
  };
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
    connectRequest.setTimeout(options.timeoutMs ?? 12000, () =>
      connectRequest.destroy(new Error("Bangumi proxy connection timed out.")),
    );
    connectRequest.on("connect", (response, socket) => {
      if (response.statusCode !== 200) {
        socket.destroy();
        fail(new Error(`Bangumi proxy CONNECT failed with ${response.statusCode}.`));
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
          collectJsonResponse(response, urlString).then(resolve, fail);
        },
      );
      innerRequest.setTimeout(options.timeoutMs ?? 12000, () =>
        innerRequest.destroy(new Error("Bangumi request timed out.")),
      );
      innerRequest.on("error", fail);
      innerRequest.end(bodyBuffer ?? undefined);
    });
    connectRequest.on("error", fail);
    connectRequest.end();
  });
}

function requestJsonWithOptionalProxy(urlString, options) {
  if (options.proxyUrl) return requestJsonViaHttpProxy(urlString, options);
  return requestJsonDirect(urlString, options);
}

export async function requestBangumiJson(env, pathname, payload, options = {}) {
  const userAgent = typeof env.BANGUMI_USER_AGENT === "string" ? env.BANGUMI_USER_AGENT.trim() : "";
  const token = typeof env.BANGUMI_ACCESS_TOKEN === "string" ? env.BANGUMI_ACCESS_TOKEN.trim() : "";
  if (!userAgent || !token) throw new Error("Bangumi is not configured.");

  const requestJsonImpl = options.requestJsonImpl || requestJsonWithOptionalProxy;
  return requestJsonImpl(`https://api.bgm.tv${pathname}`, {
    method: "POST",
    proxyUrl: typeof env.BANGUMI_LENS_PROXY === "string" && env.BANGUMI_LENS_PROXY.trim() ? env.BANGUMI_LENS_PROXY.trim() : "",
    timeoutMs: 12000,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": userAgent,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
}
