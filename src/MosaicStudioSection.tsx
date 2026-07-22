import {
  ChevronLeft,
  Download,
  Film,
  FolderOpen,
  Image as ImageIcon,
  Images,
  LoaderCircle,
  Play,
  Search,
  Shuffle,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { analyzeMosaicSources, matchMosaic, readMosaicTargetGrid, renderMosaic } from "./mosaicImagePipeline";
import { deleteMosaicProject, loadMosaicProjects, saveMosaicProject, writeMosaicPreview, writeMosaicTarget } from "./mosaicStorage";
import { normalizeMosaicTargetRotation } from "./mosaicRotation";
import { generateServerMosaicTarget } from "./playerStorage";
import type {
  MosaicProject,
  MosaicRuntimeSource,
  MosaicSourceFilter,
  MosaicTargetRef,
  MosaicTargetRotation,
  MosaicTileFit,
} from "./mosaicTypes";
import type { PhotoAlbum, VideoItem } from "./playerTypes";
import { createHighQualityVideoTarget } from "./videoThumbnail";
import { MosaicViewport } from "./MosaicViewport";

type RuntimeTarget = { ref: MosaicTargetRef; file?: Blob; url: string; persistFile?: boolean };
type GenerationState = { message: string; completed: number; total: number } | null;

type MosaicStudioSectionProps = {
  albums: PhotoAlbum[];
  videos: VideoItem[];
  onOpenAlbum: (album: PhotoAlbum, imageIndex: number) => void;
  onOpenVideo: (video: VideoItem) => void;
};

const pickerPageSize = 48;
type MosaicPreviewLongestEdge = 1400 | 2200 | 3200;

function createMosaicWorker() {
  return new Worker(new URL("./mosaicWorker.ts", import.meta.url), { type: "module" });
}

function normalizePreviewLongestEdge(value?: number): MosaicPreviewLongestEdge {
  return value === 1400 || value === 3200 ? value : 2200;
}

function createOriginalPhotoUrl(mediaRootId: string, relativePath: string) {
  return `/api/media/${encodeURIComponent(mediaRootId)}/${relativePath.split("/").map((segment) => encodeURIComponent(segment)).join("/")}`;
}

function createRuntimeSources(videos: VideoItem[], albums: PhotoAlbum[]) {
  const videoSources: MosaicRuntimeSource[] = videos.flatMap((video) => {
    const url = video.posterUrl || video.thumbnailUrl || video.thumbUrl || "";
    if (!url) return [];
    return [{
      id: `video:${video.id}`,
      kind: "video" as const,
      label: video.name,
      videoId: video.id,
      mediaRootId: video.mediaRootId,
      size: video.size,
      lastModified: video.lastModified,
      url,
    }];
  });
  const photoSources: MosaicRuntimeSource[] = albums.flatMap((album) => album.images.map((image) => ({
    id: `photo:${album.id}:${image.id}`,
    kind: "photo" as const,
    label: `${album.title} · ${image.name}`,
    albumId: album.id,
    imageId: image.id,
    imageIndex: image.index,
    mediaRootId: image.mediaRootId,
    size: image.size,
    lastModified: image.lastModified,
    url: image.url,
    originalUrl: image.file ? undefined : createOriginalPhotoUrl(image.mediaRootId, image.relativePath),
    file: image.file,
  })));
  return [...videoSources, ...photoSources];
}

function ResourceThumbnail({ source, preferOriginal = false }: { source: MosaicRuntimeSource; preferOriginal?: boolean }) {
  const preferredUrl = preferOriginal ? source.originalUrl || source.url : source.url;
  const [url, setUrl] = useState(preferredUrl);
  useEffect(() => {
    if (!preferOriginal && (source.url || !source.file)) {
      setUrl(source.url);
      return undefined;
    }
    if (!source.file) {
      setUrl(source.originalUrl || source.url);
      return undefined;
    }
    const nextUrl = URL.createObjectURL(source.file);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [preferOriginal, source.file, source.originalUrl, source.url]);
  return url ? <img src={url} alt="" loading="lazy" decoding="async" draggable={false} /> : <ImageIcon size={25} />;
}

function TargetPreview({ target, rotation }: { target: RuntimeTarget; rotation: MosaicTargetRotation }) {
  const [url, setUrl] = useState(target.url);
  const [aspectRatio, setAspectRatio] = useState(16 / 10);
  useEffect(() => {
    setAspectRatio(16 / 10);
    if (target.url || !target.file) {
      setUrl(target.url);
      return undefined;
    }
    const nextUrl = URL.createObjectURL(target.file);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [target.file, target.url]);
  const quarterTurn = rotation === 90 || rotation === 270;
  const displayAspectRatio = quarterTurn ? 1 / aspectRatio : aspectRatio;
  const previewWidth = Math.min(560, 360 * displayAspectRatio);
  const imageStyle = quarterTurn
    ? { width: `${100 / displayAspectRatio}%`, height: `${displayAspectRatio * 100}%`, transform: `translate(-50%, -50%) rotate(${rotation}deg)` }
    : { transform: `translate(-50%, -50%) rotate(${rotation}deg)` };
  return (
    <div className="mosaic-target-preview">
      <div className="mosaic-target-preview-image" style={{ width: `${previewWidth}px`, aspectRatio: displayAspectRatio }}>
        {url ? <img src={url} alt={target.ref.label} decoding="async" draggable={false} style={imageStyle} onLoad={(event) => {
          const { naturalWidth, naturalHeight } = event.currentTarget;
          if (naturalWidth && naturalHeight) setAspectRatio(naturalWidth / naturalHeight);
        }} /> : <ImageIcon size={32} />}
        <span>{target.ref.kind === "upload" ? "上传图片" : "项目资源"}</span>
      </div>
      <strong title={target.ref.label}>{target.ref.label}</strong>
    </div>
  );
}

function createProjectId() {
  return `mosaic-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function MosaicStudioSection({ albums, videos, onOpenAlbum, onOpenVideo }: MosaicStudioSectionProps) {
  const sources = useMemo(() => createRuntimeSources(videos, albums), [albums, videos]);
  const sourceById = useMemo(() => new Map(sources.map((source) => [source.id, source])), [sources]);
  const videoById = useMemo(() => new Map(videos.map((video) => [video.id, video])), [videos]);
  const albumById = useMemo(() => new Map(albums.map((album) => [album.id, album])), [albums]);
  const workerRef = useRef<Worker | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const targetResolveAbortRef = useRef<AbortController | null>(null);
  const runtimeTargetUrlRef = useRef("");
  const progressivePreviewUrlRef = useRef("");
  const [projects, setProjects] = useState<MosaicProject[]>([]);
  const [activeProject, setActiveProject] = useState<MosaicProject | null>(null);
  const [target, setTarget] = useState<RuntimeTarget | null>(null);
  const [sourceFilter, setSourceFilter] = useState<MosaicSourceFilter>("mixed");
  const [sourceLimit, setSourceLimit] = useState(10000);
  const [columns, setColumns] = useState(160);
  const [targetClarity, setTargetClarity] = useState(0.6);
  const [colorPreservation, setColorPreservation] = useState(0.55);
  const [targetRotation, setTargetRotation] = useState<MosaicTargetRotation>(0);
  const [tileFit, setTileFit] = useState<MosaicTileFit>("cover");
  const [previewLongestEdge, setPreviewLongestEdge] = useState<MosaicPreviewLongestEdge>(3200);
  const [maxReuse, setMaxReuse] = useState(3);
  const [seed, setSeed] = useState(() => Date.now() >>> 0);
  const [previewUrl, setPreviewUrl] = useState("");
  const [progressivePreviewUrl, setProgressivePreviewUrl] = useState("");
  const [generation, setGeneration] = useState<GenerationState>(null);
  const [backend, setBackend] = useState("");
  const [message, setMessage] = useState("");
  const [selectedSource, setSelectedSource] = useState<MosaicRuntimeSource | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isReplacingTarget, setIsReplacingTarget] = useState(false);
  const [resolvingTargetId, setResolvingTargetId] = useState("");
  const [pickerKind, setPickerKind] = useState<"video" | "photo">("video");
  const [pickerAlbumId, setPickerAlbumId] = useState<string | null>(null);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerPage, setPickerPage] = useState(1);
  const [deleteCandidate, setDeleteCandidate] = useState<MosaicProject | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    workerRef.current = createMosaicWorker();
    void loadMosaicProjects()
      .then((items) => setProjects(items.sort((left, right) => right.updatedAt - left.updatedAt)))
      .catch(() => setMessage("千图作品读取失败，新作品仍可在当前会话生成。"));
    return () => {
      abortRef.current?.abort();
      targetResolveAbortRef.current?.abort();
      workerRef.current?.terminate();
      if (runtimeTargetUrlRef.current) URL.revokeObjectURL(runtimeTargetUrlRef.current);
      if (progressivePreviewUrlRef.current) URL.revokeObjectURL(progressivePreviewUrlRef.current);
    };
  }, []);

  const filteredSources = useMemo(() => {
    const candidates = sources.filter((source) =>
      sourceFilter === "mixed" || (sourceFilter === "videos" ? source.kind === "video" : source.kind === "photo"));
    if (candidates.length <= sourceLimit) return candidates;
    const offset = (seed % 1000) / 1000;
    const sampled = Array.from({ length: sourceLimit }, (_, index) => candidates[Math.floor((index + offset) * candidates.length / sourceLimit) % candidates.length]);
    const targetSourceId = target?.ref.kind === "source" ? target.ref.sourceId : "";
    const targetSource = targetSourceId ? candidates.find((source) => source.id === targetSourceId) : undefined;
    if (targetSource && !sampled.some((source) => source.id === targetSource.id)) sampled[sampled.length - 1] = targetSource;
    return sampled;
  }, [seed, sourceFilter, sourceLimit, sources, target]);
  const normalizedPickerSearch = pickerSearch.trim().toLocaleLowerCase();
  const selectedPickerAlbum = pickerAlbumId ? albumById.get(pickerAlbumId) : undefined;
  const pickerVideoResults = useMemo(() => sources.filter((source) => source.kind === "video"
    && (!normalizedPickerSearch || source.label.toLocaleLowerCase().includes(normalizedPickerSearch))), [normalizedPickerSearch, sources]);
  const pickerAlbumResults = useMemo(() => albums.filter((album) => !normalizedPickerSearch
    || `${album.title} ${album.relativePath} ${album.mediaRootLabel}`.toLocaleLowerCase().includes(normalizedPickerSearch)), [albums, normalizedPickerSearch]);
  const pickerPhotoResults = useMemo(() => sources.filter((source) => source.kind === "photo"
    && source.albumId === selectedPickerAlbum?.id
    && (!normalizedPickerSearch || source.label.toLocaleLowerCase().includes(normalizedPickerSearch))), [normalizedPickerSearch, selectedPickerAlbum?.id, sources]);
  const pickerResultCount = pickerKind === "video"
    ? pickerVideoResults.length
    : selectedPickerAlbum ? pickerPhotoResults.length : pickerAlbumResults.length;
  const pickerPageCount = Math.max(1, Math.ceil(pickerResultCount / pickerPageSize));
  const pickerPageStart = (pickerPage - 1) * pickerPageSize;
  const pagedPickerVideoResults = pickerVideoResults.slice(pickerPageStart, pickerPageStart + pickerPageSize);
  const pagedPickerAlbums = pickerAlbumResults.slice(pickerPageStart, pickerPageStart + pickerPageSize);
  const pagedPickerPhotoResults = pickerPhotoResults.slice(pickerPageStart, pickerPageStart + pickerPageSize);

  const resolveTargetForProject = (project: MosaicProject) => {
    if (project.recipe.target.kind === "upload") {
      return { ref: project.recipe.target, url: project.targetUrl || project.recipe.target.assetUrl } satisfies RuntimeTarget;
    }
    const source = sourceById.get(project.recipe.target.sourceId);
    if (project.targetUrl) return { ref: project.recipe.target, url: project.targetUrl } satisfies RuntimeTarget;
    return source ? { ref: project.recipe.target, file: source.file, url: source.url } satisfies RuntimeTarget : null;
  };

  const releaseRuntimeTargetUrl = () => {
    if (!runtimeTargetUrlRef.current) return;
    URL.revokeObjectURL(runtimeTargetUrlRef.current);
    runtimeTargetUrlRef.current = "";
  };

  const cancelTargetResolution = () => {
    targetResolveAbortRef.current?.abort();
    targetResolveAbortRef.current = null;
    setResolvingTargetId("");
  };

  const closeTargetPicker = () => {
    cancelTargetResolution();
    setIsReplacingTarget(false);
    setIsPickerOpen(false);
  };

  const cancelGeneration = () => {
    abortRef.current?.abort();
    workerRef.current?.terminate();
    workerRef.current = createMosaicWorker();
  };

  const openProject = (project: MosaicProject) => {
    releaseRuntimeTargetUrl();
    setActiveProject(project);
    setTarget(resolveTargetForProject(project));
    setSourceFilter(project.recipe.sourceFilter);
    setSourceLimit(project.recipe.sourceLimit ?? 4000);
    setColumns(project.recipe.columns);
    setTargetClarity(project.recipe.targetClarity);
    setColorPreservation(project.recipe.colorPreservation);
    setTargetRotation(normalizeMosaicTargetRotation(project.recipe.targetRotation));
    setTileFit(project.recipe.tileFit === "contain" ? "contain" : "cover");
    setPreviewLongestEdge(normalizePreviewLongestEdge(project.recipe.previewLongestEdge));
    setMaxReuse(project.recipe.maxReuse);
    setSeed(project.recipe.seed);
    setPreviewUrl(project.previewUrl);
    setSelectedSource(null);
    const missing = project.recipe.sourceIds.filter((id) => !sourceById.has(id)).length;
    setMessage(missing ? `作品中有 ${missing} 项素材已不可用，预览仍可查看，重新生成会自动跳过。` : "作品已恢复。");
  };

  const selectSourceTarget = async (source: MosaicRuntimeSource) => {
    const replacingCurrentProject = isReplacingTarget;
    const targetRef = { kind: "source", label: source.label, sourceId: source.id } as const;
    if (source.kind !== "video" || !source.videoId) {
      cancelTargetResolution();
      releaseRuntimeTargetUrl();
      setTarget({ ref: targetRef, file: source.file, url: source.url });
      setTargetRotation(0);
      if (!replacingCurrentProject) setActiveProject(null);
      setPreviewUrl("");
      setIsPickerOpen(false);
      setIsReplacingTarget(false);
      setPickerAlbumId(null);
      setPickerSearch("");
      setPickerPage(1);
      setMessage(replacingCurrentProject ? "目标图已更换，请重新生成并保存作品。" : "已选择项目资源作为目标，将在生成时保留套娃单元。" );
      return;
    }

    const video = videoById.get(source.videoId);
    if (!video) return;
    targetResolveAbortRef.current?.abort();
    const controller = new AbortController();
    targetResolveAbortRef.current = controller;
    setResolvingTargetId(source.id);
    try {
      let targetBlob: Blob | null = null;
      let targetOrigin: "server" | "browser" | "fallback" | null = null;
      if (video.mediaRootId) {
        try {
          const serverUrl = await generateServerMosaicTarget(video.id, video.mediaRootId, video.relativePath, video.size, video.lastModified, controller.signal);
          if (serverUrl) {
            const response = await fetch(serverUrl, { signal: controller.signal });
            if (response.ok) {
              targetBlob = await response.blob();
              targetOrigin = "server";
            }
          }
        } catch (error) {
          if (controller.signal.aborted) throw error;
        }
      }
      if (!targetBlob) {
        targetBlob = await createHighQualityVideoTarget(video, controller.signal).catch(() => null);
        if (targetBlob) targetOrigin = "browser";
      }
      if (!targetBlob && source.url) {
        const response = await fetch(source.url, { signal: controller.signal });
        if (response.ok) {
          targetBlob = await response.blob();
          targetOrigin = "fallback";
        }
      }
      if (!targetBlob) throw new Error("无法读取该影片的高清目标图。");
      releaseRuntimeTargetUrl();
      const url = URL.createObjectURL(targetBlob);
      runtimeTargetUrlRef.current = url;
      setTarget({ ref: targetRef, file: targetBlob, url, persistFile: true });
      setTargetRotation(0);
      if (!replacingCurrentProject) setActiveProject(null);
      setPreviewUrl("");
      setIsPickerOpen(false);
      setIsReplacingTarget(false);
      setPickerAlbumId(null);
      setPickerSearch("");
      setPickerPage(1);
      setMessage(replacingCurrentProject
        ? "目标图已更换，请重新生成并保存作品。"
        : targetOrigin === "fallback"
        ? "原视频帧不可用，已回退到现有缩略图并将在作品中独立保存。"
        : "已从原视频提取最佳质量目标图，并将在作品中独立保存。" );
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError") && !(error instanceof Error && error.name === "AbortError")) {
        setMessage(error instanceof Error ? error.message : "高清目标图生成失败。" );
      }
    } finally {
      if (targetResolveAbortRef.current === controller) targetResolveAbortRef.current = null;
      setResolvingTargetId("");
    }
  };

  const selectUploadedTarget = (file: File, replaceCurrentProject: boolean) => {
    releaseRuntimeTargetUrl();
    const url = URL.createObjectURL(file);
    runtimeTargetUrlRef.current = url;
    setTarget({ ref: { kind: "upload", label: file.name, assetUrl: "" }, file, url, persistFile: true });
    setTargetRotation(0);
    if (!replaceCurrentProject) setActiveProject(null);
    setPreviewUrl("");
    setSelectedSource(null);
    setMessage(replaceCurrentProject ? "目标图已更换，请重新生成并保存作品。" : "目标图已就绪。" );
  };

  const generate = async () => {
    const worker = workerRef.current;
    if (!target || !worker) {
      setMessage("请先上传目标图，或从影片与图集中选择一张图片。");
      return;
    }
    if (!filteredSources.length) {
      setMessage("当前筛选下没有可用的小图素材。");
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    if (progressivePreviewUrlRef.current) URL.revokeObjectURL(progressivePreviewUrlRef.current);
    progressivePreviewUrlRef.current = "";
    setProgressivePreviewUrl("");
    setSelectedSource(null);
    setMessage("");
    try {
      setGeneration({ message: "正在分析素材色彩", completed: 0, total: filteredSources.length });
      const analyzed = await analyzeMosaicSources({
        sources: filteredSources,
        worker,
        signal: controller.signal,
        onProgress: (completed, total) => setGeneration({ message: "正在分析素材色彩", completed, total }),
      });
      if (!analyzed.features.length) throw new Error("没有能够成功解码的素材图片。");
      setGeneration({ message: "正在分析目标并匹配小图", completed: 0, total: 1 });
      const grid = await readMosaicTargetGrid({ file: target.file, url: target.url, columns, targetRotation });
      const minimumReuse = Math.ceil(grid.descriptors.length / analyzed.features.length);
      if (maxReuse < minimumReuse) throw new Error(`当前素材数量至少需要将单图复用上限设为 ${minimumReuse}。`);
      const targetSourceId = target.ref.kind === "source" ? target.ref.sourceId : undefined;
      const guaranteedSourceId = targetSourceId && analyzed.features.some((feature) => feature.sourceId === targetSourceId)
        ? targetSourceId
        : undefined;
      const matched = await matchMosaic({
        targets: grid.descriptors,
        features: analyzed.features,
        worker,
        columns,
        maxReuse,
        seed,
        guaranteedSourceId,
        signal: controller.signal,
      });
      setBackend(matched.backend === "webgpu" ? "WebGPU 匹配" : "CPU Worker 匹配");
      setGeneration({ message: "正在合成渐进预览", completed: 0, total: analyzed.features.length });
      const availableIds = new Set(analyzed.features.map((feature) => feature.sourceId));
      const availableSources = filteredSources.filter((source) => availableIds.has(source.id));
      const preview = await renderMosaic({
        sources: availableSources,
        assignments: matched.assignments,
        target: { file: target.file, url: target.url },
        targetColors: grid.colors,
        columns,
        rows: grid.rows,
        longestEdge: previewLongestEdge,
        colorPreservation,
        targetClarity,
        targetRotation,
        tileFit,
        type: "image/webp",
        signal: controller.signal,
        onProgress: (completed, total) => setGeneration({ message: "正在合成渐进预览", completed, total }),
        onPreview: (progressivePreview) => {
          if (controller.signal.aborted) return;
          const nextUrl = URL.createObjectURL(progressivePreview);
          const previousUrl = progressivePreviewUrlRef.current;
          progressivePreviewUrlRef.current = nextUrl;
          setProgressivePreviewUrl(nextUrl);
          if (previousUrl) URL.revokeObjectURL(previousUrl);
        },
      });
      const projectId = activeProject?.id ?? createProjectId();
      let targetRef = target.ref;
      let targetUrl = target.ref.kind === "upload" ? activeProject?.targetUrl : undefined;
      if (target.persistFile && target.file) {
        targetUrl = await writeMosaicTarget(projectId, target.file);
        if (target.ref.kind === "upload") targetRef = { ...target.ref, assetUrl: targetUrl };
      }
      const storedPreviewUrl = await writeMosaicPreview(projectId, preview);
      const now = Date.now();
      const project: MosaicProject = {
        id: projectId,
        name: activeProject?.name || `千图作品 ${new Date(now).toLocaleString()}`,
        createdAt: activeProject?.createdAt ?? now,
        updatedAt: now,
        previewUrl: storedPreviewUrl,
        targetUrl,
        recipe: {
          version: 1,
          algorithmVersion: 1,
          target: targetRef,
          sourceFilter,
          sourceLimit,
          columns,
          rows: grid.rows,
          targetClarity,
          colorPreservation,
          targetRotation,
          tileFit,
          previewLongestEdge,
          maxReuse,
          seed,
          sourceIds: availableSources.map((source) => source.id),
          assignments: matched.assignments,
        },
      };
      await saveMosaicProject(project);
      setProjects((items) => [project, ...items.filter((item) => item.id !== project.id)]);
      setActiveProject(project);
      setPreviewUrl(storedPreviewUrl);
      setTarget(target.persistFile && targetUrl ? { ref: targetRef, url: targetUrl } : target);
      if (target.persistFile) releaseRuntimeTargetUrl();
      setMessage(`作品已保存；使用 ${availableSources.length} 项素材，跳过 ${analyzed.skipped} 项不可解码素材。`);
    } catch (error) {
      setMessage(error instanceof DOMException && error.name === "AbortError" ? "生成已取消。" : error instanceof Error ? error.message : "千图生成失败。" );
    } finally {
      const progressiveUrl = progressivePreviewUrlRef.current;
      progressivePreviewUrlRef.current = "";
      setProgressivePreviewUrl("");
      if (progressiveUrl) URL.revokeObjectURL(progressiveUrl);
      setGeneration(null);
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const exportProject = async (longestEdge: 3840 | 7680) => {
    if (!activeProject || !target) return;
    setIsExporting(true);
    setMessage(`正在导出 ${longestEdge === 7680 ? "8K" : "4K"} PNG…`);
    try {
      const savedTargetRotation = normalizeMosaicTargetRotation(activeProject.recipe.targetRotation);
      const grid = await readMosaicTargetGrid({ file: target.file, url: target.url, columns: activeProject.recipe.columns, targetRotation: savedTargetRotation });
      const blob = await renderMosaic({
        sources,
        assignments: activeProject.recipe.assignments,
        target: { file: target.file, url: target.url },
        targetColors: grid.colors,
        columns: activeProject.recipe.columns,
        rows: activeProject.recipe.rows,
        longestEdge,
        colorPreservation: activeProject.recipe.colorPreservation,
        targetClarity: activeProject.recipe.targetClarity,
        targetRotation: savedTargetRotation,
        tileFit: activeProject.recipe.tileFit ?? "cover",
        type: "image/png",
        onProgress: (completed, total) => setGeneration({ message: `正在导出 ${longestEdge === 7680 ? "8K" : "4K"}`, completed, total }),
      });
      downloadBlob(blob, `${activeProject.name}-${longestEdge === 7680 ? "8K" : "4K"}.png`);
      setMessage("高清 PNG 已导出。" );
    } catch (error) {
      setMessage(longestEdge === 7680
        ? "当前设备无法完成8K导出，作品未受影响，请改用4K重试。"
        : error instanceof Error ? error.message : "PNG导出失败。" );
    } finally {
      setGeneration(null);
      setIsExporting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteCandidate) return;
    try {
      await deleteMosaicProject(deleteCandidate.id);
      setProjects((items) => items.filter((item) => item.id !== deleteCandidate.id));
      if (activeProject?.id === deleteCandidate.id) {
        setActiveProject(null);
        setPreviewUrl("");
      }
      setMessage("千图作品已删除。" );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "作品删除失败。" );
    } finally {
      setDeleteCandidate(null);
    }
  };

  const openSelectedSource = () => {
    if (!selectedSource) return;
    if (selectedSource.kind === "video" && selectedSource.videoId) {
      const video = videoById.get(selectedSource.videoId);
      if (video) onOpenVideo(video);
      return;
    }
    if (selectedSource.albumId) {
      const album = albumById.get(selectedSource.albumId);
      if (album) onOpenAlbum(album, selectedSource.imageIndex ?? 0);
    }
  };

  const progressPercent = generation ? Math.round(generation.completed / Math.max(generation.total, 1) * 100) : 0;

  return (
    <section className="mosaic-studio" aria-label="千图成像工作台">
      <header className="mosaic-studio-hero">
        <div>
          <span className="mosaic-eyebrow"><Sparkles size={15} /> 千图成像实验室</span>
          <h2>把你的媒体宇宙，拼成另一幅画</h2>
          <p>远看是目标，近看是影片与图集。每一个单元都能追溯并打开原始内容。</p>
        </div>
        <div className="mosaic-hero-stat"><strong>{sources.length.toLocaleString()}</strong><span>项可用素材</span></div>
      </header>

      <div className="mosaic-studio-layout">
        <aside className="mosaic-sidebar">
          <section className="mosaic-panel mosaic-controls">
            <label>素材池<select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as MosaicSourceFilter)}><option value="mixed">影片 + 图集</option><option value="videos">仅影片缩略图</option><option value="photos">仅图集图片</option></select></label>
            <label>参与素材上限<input type="number" min="8" max="10000" step="8" value={sourceLimit} onChange={(event) => setSourceLimit(Math.max(8, Math.min(10000, Number(event.target.value) || 8)))} /></label>
            <label>小图填充<select value={tileFit} onChange={(event) => setTileFit(event.target.value as MosaicTileFit)}><option value="cover">裁切铺满</option><option value="contain">完整显示</option></select></label>
            <label>目标方向<select value={targetRotation} onChange={(event) => setTargetRotation(Number(event.target.value) as MosaicTargetRotation)}><option value={0}>原始方向</option><option value={90}>顺时针 90°</option><option value={180}>旋转 180°</option><option value={270}>顺时针 270°</option></select></label>
            <label>预览质量<select value={previewLongestEdge} onChange={(event) => setPreviewLongestEdge(Number(event.target.value) as MosaicPreviewLongestEdge)}><option value="1400">快速 · 1400px</option><option value="2200">平衡 · 2200px</option><option value="3200">精细 · 3200px</option></select></label>
            <label>网格密度 <strong>{columns} 列</strong><input type="range" min="40" max="160" step="10" value={columns} onChange={(event) => setColumns(Number(event.target.value))} /></label>
            <label>目标清晰度 <strong>{Math.round(targetClarity * 100)}%</strong><input type="range" min="0" max="1" step="0.05" value={targetClarity} onChange={(event) => setTargetClarity(Number(event.target.value))} /></label>
            <label>素材原色 <strong>{Math.round(colorPreservation * 100)}%</strong><input type="range" min="0" max="1" step="0.05" value={colorPreservation} onChange={(event) => setColorPreservation(Number(event.target.value))} /></label>
            <label>单图复用上限<input type="number" min="1" max="999" value={maxReuse} onChange={(event) => setMaxReuse(Math.max(1, Number(event.target.value)))} /></label>
            <button className="secondary-button" type="button" onClick={() => setSeed(crypto.getRandomValues(new Uint32Array(1))[0])}><Shuffle size={17} /> 重新洗牌</button>
            <button className="primary-button mosaic-generate-button" type="button" disabled={Boolean(generation)} onClick={() => void generate()}>
              {generation ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />}{activeProject ? "重新生成并保存" : "生成千图作品"}
            </button>
            {generation ? <button className="secondary-button" type="button" onClick={cancelGeneration}><X size={17} /> 取消生成</button> : null}
          </section>

          <section className="mosaic-panel mosaic-projects">
            <div className="mosaic-panel-title"><span>已保存作品</span><small>{projects.length}</small></div>
            {projects.length ? projects.map((project) => (
              <button className={`mosaic-project-card ${activeProject?.id === project.id ? "active" : ""}`} key={project.id} type="button" onClick={() => openProject(project)}>
                <img src={project.previewUrl} alt="" loading="lazy" />
                <span><strong>{project.name}</strong><small>{new Date(project.updatedAt).toLocaleDateString()}</small></span>
                <span className="mosaic-project-delete" role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); setDeleteCandidate(project); }}><Trash2 size={15} /></span>
              </button>
            )) : <div className="mosaic-empty-mini">第一幅作品会自动保存在这里。</div>}
          </section>
        </aside>

        <div className="mosaic-main-stage">
          {generation ? (
            <div className={`mosaic-progress-overlay ${progressivePreviewUrl ? "has-preview" : ""}`}>
              <LoaderCircle className="spin" size={34} />
              <strong>{generation.message}</strong>
              <span>{progressPercent}% · {generation.completed} / {generation.total}</span>
              <div><i style={{ width: `${progressPercent}%` }} /></div>
            </div>
          ) : null}
          {progressivePreviewUrl ? (
            <div className="mosaic-progressive-preview"><img src={progressivePreviewUrl} alt="正在生成的千图作品预览" /></div>
          ) : previewUrl && activeProject ? (
            <>
              <div className="mosaic-stage-header">
                <input
                  aria-label="作品名称"
                  value={activeProject.name}
                  onChange={(event) => setActiveProject({ ...activeProject, name: event.target.value })}
                  onBlur={() => {
                    if (!activeProject.name.trim()) return;
                    const updated = { ...activeProject, updatedAt: Date.now() };
                    void saveMosaicProject(updated).then(() => setProjects((items) => items.map((item) => item.id === updated.id ? updated : item)));
                  }}
                />
                <span>{backend || "已保存预览"}</span>
                <label className="secondary-button mosaic-upload-button">
                  <Upload size={16} /> 上传新目标图
                  <input accept="image/*" type="file" onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    selectUploadedTarget(file, true);
                    event.currentTarget.value = "";
                  }} />
                </label>
                <button className="secondary-button" type="button" onClick={() => { setIsReplacingTarget(true); setIsPickerOpen(true); }}><FolderOpen size={16} /> 从项目更换</button>
                <button className="secondary-button" disabled={isExporting} type="button" onClick={() => void exportProject(3840)}><Download size={16} /> 4K PNG</button>
                <button className="secondary-button" disabled={isExporting} type="button" onClick={() => void exportProject(7680)}><Download size={16} /> 8K PNG</button>
              </div>
              <MosaicViewport
                assignments={activeProject.recipe.assignments}
                columns={activeProject.recipe.columns}
                rows={activeProject.recipe.rows}
                previewUrl={previewUrl}
                sources={sources}
                sourceCard={selectedSource ? (
                  <aside className="mosaic-source-card">
                    <button type="button" onClick={() => setSelectedSource(null)} title="关闭"><X size={17} /></button>
                    <div className="mosaic-source-preview"><ResourceThumbnail source={selectedSource} preferOriginal /></div>
                    <div className="mosaic-source-meta"><span>{selectedSource.kind === "video" ? "影片缩略图" : "图集图片"}</span><strong>{selectedSource.label}</strong></div>
                    <button className="primary-button" type="button" onClick={openSelectedSource}>{selectedSource.kind === "video" ? <><Play size={17} /> 播放影片</> : <><FolderOpen size={17} /> 打开图集</>}</button>
                  </aside>
                ) : null}
                tileFit={activeProject.recipe.tileFit ?? "cover"}
                onSelectSource={setSelectedSource}
              />
            </>
          ) : (
            <div className={`mosaic-stage-empty ${target ? "has-target" : ""}`}>
              {target ? (
                <TargetPreview target={target} rotation={targetRotation} />
              ) : <div className="mosaic-orbit"><Film size={32} /><Images size={28} /><Sparkles size={34} /></div>}
              <h3>{target ? "目标图已就绪" : "选择一张目标图，开始构建媒体宇宙"}</h3>
              <p>{target ? "可在左侧调整素材与生成参数，确认后生成千图作品；也可以在下方更换目标图。" : "已有影片缩略图和图集图片会被分析成颜色星图；支持上传，也支持从项目中选图实现套娃。"}</p>
              <div className="mosaic-stage-actions">
                <label className="primary-button mosaic-upload-button">
                  <Upload size={18} /> 上传图片
                  <input
                    accept="image/*"
                    type="file"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      selectUploadedTarget(file, Boolean(activeProject));
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
                <button className="secondary-button" type="button" onClick={() => { setIsReplacingTarget(Boolean(activeProject)); setIsPickerOpen(true); }}><FolderOpen size={18} /> 从项目选择</button>
              </div>
            </div>
          )}
          {message ? <div className="mosaic-status-message">{message}</div> : null}
        </div>
      </div>

      {isPickerOpen ? (
        <div className="modal-backdrop mosaic-picker-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeTargetPicker(); }}>
          <section className="mosaic-picker" role="dialog" aria-modal="true" aria-labelledby="mosaic-picker-title">
            <header><div><Sparkles size={24} /><span><h2 id="mosaic-picker-title">选择项目内目标图</h2><p>目标本身仍可出现在小图中，形成套娃效果。</p></span></div><button type="button" onClick={closeTargetPicker}><X size={20} /></button></header>
            <div className="mosaic-picker-toolbar">
              <div className="special-view-switch"><button className={pickerKind === "video" ? "active" : ""} type="button" onClick={() => { cancelTargetResolution(); setPickerKind("video"); setPickerAlbumId(null); setPickerSearch(""); setPickerPage(1); }}>影片缩略图</button><button className={pickerKind === "photo" ? "active" : ""} type="button" onClick={() => { cancelTargetResolution(); setPickerKind("photo"); setPickerAlbumId(null); setPickerSearch(""); setPickerPage(1); }}>图集图片</button></div>
              <label className="mosaic-picker-search">
                <Search size={17} />
                <input aria-label="搜索名称" type="search" value={pickerSearch} placeholder={selectedPickerAlbum ? "搜索照片名称" : pickerKind === "photo" ? "搜索图集名称" : "搜索影片名称"} onChange={(event) => { setPickerSearch(event.target.value); setPickerPage(1); }} />
              </label>
            </div>
            {pickerKind === "photo" && selectedPickerAlbum ? (
              <div className="mosaic-picker-album-nav">
                <button className="secondary-button" type="button" onClick={() => { setPickerAlbumId(null); setPickerSearch(""); setPickerPage(1); }}><ChevronLeft size={17} /> 返回图集</button>
                <span><strong>{selectedPickerAlbum.title}</strong><small>{selectedPickerAlbum.imageCount} 张照片</small></span>
              </div>
            ) : null}
            {pickerResultCount ? (
              <div className="mosaic-picker-grid">
                {pickerKind === "video" ? pagedPickerVideoResults.map((source) => <button disabled={Boolean(resolvingTargetId)} key={source.id} type="button" onClick={() => void selectSourceTarget(source)}><ResourceThumbnail source={source} /><span>{resolvingTargetId === source.id ? "正在生成高清目标图…" : source.label}</span></button>) : null}
                {pickerKind === "photo" && !selectedPickerAlbum ? pagedPickerAlbums.map((album) => {
                  const coverSource = album.images[0] ? sourceById.get(`photo:${album.id}:${album.images[0].id}`) : undefined;
                  return <button className="mosaic-picker-album-card" key={album.id} type="button" onClick={() => { setPickerAlbumId(album.id); setPickerSearch(""); setPickerPage(1); }}>{coverSource ? <ResourceThumbnail source={coverSource} /> : <ImageIcon size={25} />}<span><strong>{album.title}</strong><small>{album.imageCount} 张照片</small></span></button>;
                }) : null}
                {pickerKind === "photo" && selectedPickerAlbum ? pagedPickerPhotoResults.map((source) => <button key={source.id} type="button" onClick={() => void selectSourceTarget(source)}><ResourceThumbnail source={source} /><span>{source.label.replace(`${selectedPickerAlbum.title} · `, "")}</span></button>) : null}
              </div>
            ) : <div className="mosaic-picker-empty">{pickerKind === "video" ? "当前没有可选择的影片缩略图。" : selectedPickerAlbum ? "当前图集中没有可选择的照片。" : "当前没有可选择的图集。"}</div>}
            <footer><span>第 {pickerPage} / {pickerPageCount} 页 · {pickerResultCount} {pickerKind === "video" ? "项" : selectedPickerAlbum ? "张照片" : "个图集"}</span><div><button className="secondary-button" disabled={pickerPage <= 1} type="button" onClick={() => setPickerPage((page) => page - 1)}>上一页</button><button className="secondary-button" disabled={pickerPage >= pickerPageCount} type="button" onClick={() => setPickerPage((page) => page + 1)}>下一页</button></div></footer>
          </section>
        </div>
      ) : null}

      {deleteCandidate ? (
        <div className="modal-backdrop" role="presentation">
          <section className="confirm-dialog mosaic-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="mosaic-delete-title">
            <Trash2 size={28} /><h2 id="mosaic-delete-title">删除千图作品？</h2><p>将删除《{deleteCandidate.name}》的方案、上传目标和预览封面，已导出的 PNG 不受影响。</p>
            <div><button className="secondary-button" type="button" onClick={() => setDeleteCandidate(null)}>取消</button><button className="danger-button" type="button" onClick={() => void confirmDelete()}>确认删除</button></div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
