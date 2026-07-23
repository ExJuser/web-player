import type { VisualEchoIndex } from "./visualEchoTypes";

const emptyVisualEchoIndex: VisualEchoIndex = { version: 1, updatedAt: 0, samples: [] };

async function readError(response: Response) {
  try {
    return ((await response.json()) as { error?: string }).error || response.statusText;
  } catch {
    return response.statusText;
  }
}

export function visualEchoFrameUrl(frameId: string) {
  return `/api/visual-echo/frames/${encodeURIComponent(frameId)}`;
}

export async function loadVisualEchoIndex() {
  const response = await fetch("/api/visual-echo/index", { headers: { Accept: "application/json" } });
  if (response.status === 404) return { ...emptyVisualEchoIndex };
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<VisualEchoIndex>;
}

export async function saveVisualEchoIndex(index: VisualEchoIndex) {
  const response = await fetch("/api/visual-echo/index", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(index),
  });
  if (!response.ok) throw new Error(await readError(response));
}

export async function deleteVisualEchoIndex() {
  const response = await fetch("/api/visual-echo/index", { method: "DELETE" });
  if (!response.ok) throw new Error(await readError(response));
}

export async function writeVisualEchoFrame(frameId: string, preview: Blob) {
  const response = await fetch(visualEchoFrameUrl(frameId), {
    method: "PUT",
    headers: { "Content-Type": preview.type || "image/webp" },
    body: preview,
  });
  if (!response.ok) throw new Error(await readError(response));
  return visualEchoFrameUrl(frameId);
}
