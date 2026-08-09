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

async function persistMosaicProjectTarget(input: {
  activeProject: MosaicProject | null;
  projectId: string;
  target: SaveGeneratedMosaicProjectParams["target"];
  writeTarget: typeof writeMosaicTarget;
}) {
  let targetRef = input.target.ref;
  let targetUrl = input.target.ref.kind === "upload" ? input.activeProject?.targetUrl : undefined;
  if (input.target.persistFile && input.target.file) {
    targetUrl = await input.writeTarget(input.projectId, input.target.file);
    if (input.target.ref.kind === "upload") targetRef = { ...input.target.ref, assetUrl: targetUrl };
  }
  return { targetRef, targetUrl };
}

function createGeneratedMosaicProject(input: {
  activeProject: MosaicProject | null;
  now: number;
  previewUrl: string;
  projectId: string;
  recipe: GeneratedMosaicRecipe;
  targetRef: MosaicTargetRef;
  targetUrl?: string;
}): MosaicProject {
  return {
    id: input.projectId,
    name: input.activeProject?.name || `千图作品 ${new Date(input.now).toLocaleString()}`,
    createdAt: input.activeProject?.createdAt ?? input.now,
    updatedAt: input.now,
    previewUrl: input.previewUrl,
    targetUrl: input.targetUrl,
    recipe: {
      version: 1,
      algorithmVersion: 1,
      target: input.targetRef,
      ...input.recipe,
    },
  };
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
  const { targetRef, targetUrl } = await persistMosaicProjectTarget({ activeProject, projectId, target, writeTarget });
  const previewUrl = await writePreview(projectId, preview);
  const now = getNow();
  const project = createGeneratedMosaicProject({ activeProject, now, previewUrl, projectId, recipe, targetRef, targetUrl });
  await saveProject(project);
  return { project, targetRef, targetUrl };
}
