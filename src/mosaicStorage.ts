import type { MosaicFeatureDescriptor, MosaicProject } from "./mosaicTypes";

async function readError(response: Response) {
  try {
    return ((await response.json()) as { error?: string }).error || response.statusText;
  } catch {
    return response.statusText;
  }
}

export async function loadMosaicProjects() {
  const response = await fetch("/api/mosaics", { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<MosaicProject[]>;
}

export async function saveMosaicProject(project: MosaicProject) {
  const response = await fetch(`/api/mosaics/${encodeURIComponent(project.id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(project),
  });
  if (!response.ok) throw new Error(await readError(response));
}

export async function deleteMosaicProject(projectId: string) {
  const response = await fetch(`/api/mosaics/${encodeURIComponent(projectId)}`, { method: "DELETE" });
  if (!response.ok) throw new Error(await readError(response));
}

async function writeMosaicAsset(projectId: string, kind: "target" | "preview", blob: Blob) {
  const response = await fetch(`/api/mosaics/${encodeURIComponent(projectId)}/${kind}`, {
    method: "PUT",
    headers: { "Content-Type": blob.type || "application/octet-stream" },
    body: blob,
  });
  if (!response.ok) throw new Error(await readError(response));
  return `/api/mosaics/${encodeURIComponent(projectId)}/${kind}?v=${Date.now()}`;
}

export function writeMosaicTarget(projectId: string, blob: Blob) {
  return writeMosaicAsset(projectId, "target", blob);
}

export function writeMosaicPreview(projectId: string, blob: Blob) {
  return writeMosaicAsset(projectId, "preview", blob);
}

export async function loadMosaicFeatures(sourceIds: string[]) {
  if (!sourceIds.length) return [];
  const response = await fetch("/api/mosaics/features", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ sourceIds }),
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<MosaicFeatureDescriptor[]>;
}

export async function saveMosaicFeatures(features: MosaicFeatureDescriptor[]) {
  if (!features.length) return;
  const response = await fetch("/api/mosaics/features", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ features }),
  });
  if (!response.ok) throw new Error(await readError(response));
}
