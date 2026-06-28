export type LocalApiErrorResponse = {
  statusText: string;
  json: () => Promise<unknown>;
};

export type LocalApiRequestOptions = Pick<RequestInit, "body" | "headers">;

export type LocalApiStreamEvent = {
  type: string;
  error?: string;
};

export function createLocalApiHeaders(accept: string, init?: LocalApiRequestOptions) {
  return {
    Accept: accept,
    ...(init?.body ? { "Content-Type": "application/json" } : {}),
    ...(init?.headers ?? {}),
  };
}

export function handleLocalApiStreamLine<T extends LocalApiStreamEvent>(line: string, onEvent: (event: T) => void) {
  const trimmed = line.trim();
  if (!trimmed) return;
  const event = JSON.parse(trimmed) as T;
  if (event.type === "error") throw new Error(event.error);
  onEvent(event);
}

export async function fetchLocalJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: createLocalApiHeaders("application/json", init),
  });
  if (!response.ok) {
    throw new Error(await readLocalApiErrorMessage(response));
  }
  return response.json() as Promise<T>;
}

export async function readLocalApiStream<T extends LocalApiStreamEvent>(url: string, init: RequestInit, onEvent: (event: T) => void) {
  const response = await fetch(url, {
    ...init,
    headers: createLocalApiHeaders("application/x-ndjson", init),
  });
  if (!response.ok) {
    throw new Error(await readLocalApiErrorMessage(response));
  }
  if (!response.body) throw new Error("浏览器不支持流式响应。");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    lines.forEach((line) => handleLocalApiStreamLine<T>(line, onEvent));
  }
  buffer += decoder.decode();
  if (buffer.trim()) handleLocalApiStreamLine<T>(buffer, onEvent);
}

export async function readLocalApiErrorMessage(response: LocalApiErrorResponse) {
  let message = response.statusText;
  try {
    const payload = (await response.json()) as { error?: string };
    message = payload.error || message;
  } catch {
    // Keep status text when the local API does not return JSON.
  }
  return message;
}
