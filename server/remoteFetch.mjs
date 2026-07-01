export async function requestExternalText(url, options = {}) {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 12000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(url, {
      method: options.method || "GET",
      headers: {
        Accept: options.accept || "text/plain,*/*",
        "User-Agent": options.userAgent || "local-web-player/0.1",
        Referer: options.referer || undefined,
        ...(options.headers || {}),
      },
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
