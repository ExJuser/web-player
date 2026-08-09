import { saveMosaicProject, writeMosaicPreview, writeMosaicTarget } from "./mosaicStorage";
import type { MosaicProject, MosaicRecipe, MosaicTargetRef } from "./mosaicTypes";

type GeneratedMosaicRecipe = Omit<MosaicRecipe, "algorithmVersion" | "target" | "version">;

type SaveGeneratedMosaicProjectParams = {
  activeProject: MosaicProject | null;
  createProjectId?: () => string;
  getNow?: () => number;
  preview: Blob;
  recipe: GeneratedMosaicRecipe;
  saveProject?: typeof saveMosaicProject;
  target: {
    file?: Blob;
    persistFile?: boolean;
    ref: MosaicTargetRef;
  };
  writePreview?: typeof writeMosaicPreview;
  writeTarget?: typeof writeMosaicTarget;
};

function createProjectId() {
  return `mosaic-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function saveGeneratedMosaicProject({
  activeProject,
  createProjectId: createId = createProjectId,
  getNow = Date.now,
  preview,
  recipe,
  saveProject = saveMosaicProject,
  target,
  writePreview = writeMosaicPreview,
  writeTarget = writeMosaicTarget,
}: SaveGeneratedMosaicProjectParams) {
  const projectId = activeProject?.id ?? createId();
  let targetRef = target.ref;
  let targetUrl = target.ref.kind === "upload" ? activeProject?.targetUrl : undefined;
  if (target.persistFile && target.file) {
    targetUrl = await writeTarget(projectId, target.file);
    if (target.ref.kind === "upload") targetRef = { ...target.ref, assetUrl: targetUrl };
  }

  const previewUrl = await writePreview(projectId, preview);
  const now = getNow();
  const project: MosaicProject = {
    id: projectId,
    name: activeProject?.name || `千图作品 ${new Date(now).toLocaleString()}`,
    createdAt: activeProject?.createdAt ?? now,
    updatedAt: now,
    previewUrl,
    targetUrl,
    recipe: {
      version: 1,
      algorithmVersion: 1,
      target: targetRef,
      ...recipe,
    },
  };
  await saveProject(project);
  return { project, targetRef, targetUrl };
}
