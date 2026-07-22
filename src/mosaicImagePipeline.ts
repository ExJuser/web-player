import { createMosaicSignature, findGpuCandidates, quantizeMosaicDescriptor } from "./mosaicEngine";
import { loadMosaicFeatures, saveMosaicFeatures } from "./mosaicStorage";
import type {
  MosaicComputeBackend,
  MosaicFeatureDescriptor,
  MosaicRuntimeSource,
  MosaicTileFit,
} from "./mosaicTypes";

type WorkerReply<T> = { id: number; result?: T; error?: string };
let workerRequestId = 0;

function callWorker<T>(worker: Worker, message: object, transfer: Transferable[] = [], signal?: AbortSignal) {
  const id = ++workerRequestId;
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => {
      worker.removeEventListener("message", onMessage);
      signal?.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException("生成已取消。", "AbortError"));
    };
    const onMessage = (event: MessageEvent<WorkerReply<T>>) => {
      if (event.data.id !== id) return;
      cleanup();
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(event.data.result as T);
    };
    if (signal?.aborted) {
      onAbort();
      return;
    }
    worker.addEventListener("message", onMessage);
    signal?.addEventListener("abort", onAbort, { once: true });
    worker.postMessage({ ...message, id }, transfer);
  });
}

export async function loadMosaicBitmap(input: { file?: Blob; url?: string }) {
  if (input.file) return createImageBitmap(input.file);
  if (!input.url) throw new Error("图片资源不可用。");
  const response = await fetch(input.url);
  if (!response.ok) throw new Error("图片资源读取失败。");
  return createImageBitmap(await response.blob());
}

export async function analyzeMosaicSources(input: {
  sources: MosaicRuntimeSource[];
  worker: Worker;
  signal: AbortSignal;
  onProgress: (completed: number, total: number) => void;
}) {
  const cached = await loadMosaicFeatures(input.sources.map((source) => source.id)).catch(() => []);
  const cachedById = new Map(cached.map((feature) => [feature.sourceId, feature]));
  const result: MosaicFeatureDescriptor[] = [];
  const missing: MosaicRuntimeSource[] = [];
  input.sources.forEach((source) => {
    const feature = cachedById.get(source.id);
    if (feature?.signature === createMosaicSignature(source)) result.push(feature);
    else missing.push(source);
  });
  input.onProgress(result.length, input.sources.length);

  const created: MosaicFeatureDescriptor[] = [];
  for (let offset = 0; offset < missing.length; offset += 12) {
    if (input.signal.aborted) throw new DOMException("生成已取消。", "AbortError");
    const batch = missing.slice(offset, offset + 12);
    const items = (await Promise.all(batch.map(async (source) => {
      try {
        return {
          sourceId: source.id,
          signature: createMosaicSignature(source),
          bitmap: await loadMosaicBitmap({ file: source.file, url: source.url }),
        };
      } catch {
        return null;
      }
    }))).filter((item): item is NonNullable<typeof item> => Boolean(item));
    if (items.length) {
      const features = await callWorker<MosaicFeatureDescriptor[]>(
        input.worker,
        { type: "analyze", items },
        items.map((item) => item.bitmap),
        input.signal,
      );
      created.push(...features);
      result.push(...features);
    }
    input.onProgress(Math.min(input.sources.length, result.length + offset + batch.length - created.length), input.sources.length);
  }
  void saveMosaicFeatures(created).catch(() => undefined);
  const availableIds = new Set(result.map((feature) => feature.sourceId));
  return {
    features: input.sources.flatMap((source) => {
      const feature = result.find((item) => item.sourceId === source.id);
      return feature ? [feature] : [];
    }),
    skipped: input.sources.length - availableIds.size,
  };
}

export async function readMosaicTargetGrid(input: { file?: Blob; url?: string; columns: number }) {
  const bitmap = await loadMosaicBitmap(input);
  const rows = Math.max(1, Math.round(input.columns * bitmap.height / Math.max(bitmap.width, 1)));
  const canvas = document.createElement("canvas");
  canvas.width = input.columns;
  canvas.height = rows;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("浏览器无法读取目标图片。");
  context.drawImage(bitmap, 0, 0, input.columns, rows);
  bitmap.close();
  const pixels = context.getImageData(0, 0, input.columns, rows).data;
  const descriptors: number[][] = [];
  const colors: number[][] = [];
  for (let index = 0; index < pixels.length; index += 4) {
    const color = [pixels[index], pixels[index + 1], pixels[index + 2]];
    colors.push(color);
  }
  colors.forEach((color, index) => {
    const x = index % input.columns;
    const y = Math.floor(index / input.columns);
    const regions = [-1, 0, 1].flatMap((deltaY) => [-1, 0, 1].map((deltaX) => {
      const sampleX = Math.max(0, Math.min(input.columns - 1, x + deltaX));
      const sampleY = Math.max(0, Math.min(rows - 1, y + deltaY));
      return colors[sampleY * input.columns + sampleX] ?? color;
    }));
    descriptors.push(quantizeMosaicDescriptor(color[0], color[1], color[2], 0, regions));
  });
  return { rows, descriptors, colors };
}

export async function matchMosaic(input: {
  targets: number[][];
  features: MosaicFeatureDescriptor[];
  worker: Worker;
  columns: number;
  maxReuse: number;
  seed: number;
  guaranteedSourceId?: string;
  signal?: AbortSignal;
}) {
  if (input.signal?.aborted) throw new DOMException("生成已取消。", "AbortError");
  const gpuResult = await findGpuCandidates(input.targets, input.features);
  if (input.signal?.aborted) throw new DOMException("生成已取消。", "AbortError");
  const assignments = await callWorker<string[]>(input.worker, {
    type: "match",
    targets: input.targets,
    sources: input.features,
    ...(gpuResult.candidates ? { candidates: gpuResult.candidates } : {}),
    columns: input.columns,
    maxReuse: input.maxReuse,
    seed: input.seed,
    guaranteedSourceId: input.guaranteedSourceId,
  }, [], input.signal);
  return { assignments, backend: gpuResult.backend as MosaicComputeBackend };
}

function createRenderCanvas(width: number, height: number) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function drawCover(
  context: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  bitmap: ImageBitmap,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const scale = Math.max(width / bitmap.width, height / bitmap.height);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  context.drawImage(bitmap, (bitmap.width - sourceWidth) / 2, (bitmap.height - sourceHeight) / 2, sourceWidth, sourceHeight, x, y, width, height);
}

function drawContain(
  context: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  bitmap: ImageBitmap,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const scale = Math.min(width / bitmap.width, height / bitmap.height);
  const drawWidth = bitmap.width * scale;
  const drawHeight = bitmap.height * scale;
  context.drawImage(bitmap, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

async function canvasToBlob(canvas: OffscreenCanvas | HTMLCanvasElement, type: string, quality?: number) {
  if (canvas instanceof OffscreenCanvas) return canvas.convertToBlob({ type, quality });
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("图片编码失败。")), type, quality));
}

function applyMosaicEffects(input: {
  context: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
  width: number;
  height: number;
  columns: number;
  rows: number;
  targetColors: number[][];
  colorPreservation: number;
  targetClarity: number;
  targetBitmap?: ImageBitmap | null;
}) {
  const cellWidth = input.width / input.columns;
  const cellHeight = input.height / input.rows;
  const tintOpacity = Math.max(0, Math.min(0.42, (1 - input.colorPreservation) * 0.42));
  if (tintOpacity > 0) {
    input.context.save();
    input.context.globalCompositeOperation = "source-atop";
    input.targetColors.forEach((color, cellIndex) => {
      input.context.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${tintOpacity})`;
      input.context.fillRect((cellIndex % input.columns) * cellWidth, Math.floor(cellIndex / input.columns) * cellHeight, Math.ceil(cellWidth + 0.5), Math.ceil(cellHeight + 0.5));
    });
    input.context.restore();
  }
  const overlayOpacity = Math.max(0, Math.min(0.28, input.targetClarity * 0.28));
  if (overlayOpacity > 0 && input.targetBitmap) {
    input.context.save();
    input.context.globalAlpha = overlayOpacity;
    input.context.drawImage(input.targetBitmap, 0, 0, input.width, input.height);
    input.context.restore();
  }
}

async function createProgressivePreview(input: {
  canvas: OffscreenCanvas | HTMLCanvasElement;
  width: number;
  height: number;
  columns: number;
  rows: number;
  targetColors: number[][];
  colorPreservation: number;
  targetClarity: number;
  targetBitmap?: ImageBitmap | null;
}) {
  const scale = Math.min(1, 960 / Math.max(input.width, input.height));
  const width = Math.max(1, Math.round(input.width * scale));
  const height = Math.max(1, Math.round(input.height * scale));
  const canvas = createRenderCanvas(width, height);
  const context = canvas.getContext("2d");
  if (!context || !("drawImage" in context)) throw new Error("浏览器无法创建渐进预览画布。");
  context.drawImage(input.canvas, 0, 0, width, height);
  applyMosaicEffects({ ...input, context, width, height });
  return canvasToBlob(canvas, "image/webp", 0.72);
}

export async function renderMosaic(input: {
  sources: MosaicRuntimeSource[];
  assignments: string[];
  target: { file?: Blob; url?: string };
  targetColors: number[][];
  columns: number;
  rows: number;
  longestEdge: number;
  colorPreservation: number;
  targetClarity: number;
  tileFit?: MosaicTileFit;
  type: "image/webp" | "image/png";
  signal?: AbortSignal;
  onProgress?: (completed: number, total: number) => void;
  onPreview?: (preview: Blob, completed: number, total: number) => void;
}) {
  const aspect = input.columns / input.rows;
  const width = aspect >= 1 ? input.longestEdge : Math.max(1, Math.round(input.longestEdge * aspect));
  const height = aspect >= 1 ? Math.max(1, Math.round(input.longestEdge / aspect)) : input.longestEdge;
  const canvas = createRenderCanvas(width, height);
  const context = canvas.getContext("2d");
  if (!context || !("drawImage" in context)) throw new Error("浏览器无法创建导出画布。");
  context.fillStyle = "#09090f";
  context.fillRect(0, 0, width, height);
  const sourceById = new Map(input.sources.map((source) => [source.id, source]));
  const cellsBySource = new Map<string, number[]>();
  input.assignments.forEach((sourceId, cellIndex) => {
    if (!sourceById.has(sourceId)) return;
    const cells = cellsBySource.get(sourceId) ?? [];
    cells.push(cellIndex);
    cellsBySource.set(sourceId, cells);
  });
  const entries = Array.from(cellsBySource.entries());
  const cellWidth = width / input.columns;
  const cellHeight = height / input.rows;
  const previewStep = Math.max(1, Math.ceil(entries.length / 16));
  let lastPreviewAt = Number.NEGATIVE_INFINITY;
  const overlayOpacity = Math.max(0, Math.min(0.28, input.targetClarity * 0.28));
  const targetBitmap = overlayOpacity > 0 ? await loadMosaicBitmap(input.target) : null;
  try {
    for (let sourceIndex = 0; sourceIndex < entries.length; sourceIndex++) {
      if (input.signal?.aborted) throw new DOMException("生成已取消。", "AbortError");
      const [sourceId, cells] = entries[sourceIndex];
      const source = sourceById.get(sourceId);
      if (!source) continue;
      try {
        const bitmap = await loadMosaicBitmap({ file: source.file, url: source.url });
        const drawTile = input.tileFit === "contain" ? drawContain : drawCover;
        cells.forEach((cellIndex) => drawTile(
          context,
          bitmap,
          (cellIndex % input.columns) * cellWidth,
          Math.floor(cellIndex / input.columns) * cellHeight,
          Math.ceil(cellWidth + 0.5),
          Math.ceil(cellHeight + 0.5),
        ));
        bitmap.close();
      } catch {
        // Keep missing cells dark; the saved preview remains usable when a source disappears.
      }
      const completed = sourceIndex + 1;
      input.onProgress?.(completed, entries.length);
      const now = performance.now();
      if (input.onPreview && completed < entries.length && completed % previewStep === 0 && now - lastPreviewAt >= 400) {
        const progressivePreview = await createProgressivePreview({ ...input, canvas, width, height, targetBitmap });
        if (input.signal?.aborted) throw new DOMException("生成已取消。", "AbortError");
        input.onPreview(progressivePreview, completed, entries.length);
        lastPreviewAt = performance.now();
      }
      if (sourceIndex % 12 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    }

    applyMosaicEffects({ ...input, context, width, height, targetBitmap });
    const result = await canvasToBlob(canvas, input.type, input.type === "image/webp" ? 0.88 : undefined);
    input.onPreview?.(result, entries.length, entries.length);
    return result;
  } finally {
    targetBitmap?.close();
  }
}
