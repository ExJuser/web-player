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
