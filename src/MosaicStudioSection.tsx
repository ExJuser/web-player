import {
  Download,
  Film,
  FolderOpen,
  Image as ImageIcon,
  Images,
  LoaderCircle,
  Play,
  Shuffle,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { analyzeMosaicSources, matchMosaic, readMosaicTargetGrid, renderMosaic } from "./mosaicImagePipeline";
import { deleteMosaicProject, loadMosaicProjects, saveMosaicProject, writeMosaicPreview, writeMosaicTarget } from "./mosaicStorage";
import type {
  MosaicProject,
  MosaicRuntimeSource,
  MosaicSourceFilter,
  MosaicTargetRef,
} from "./mosaicTypes";
import type { PhotoAlbum, VideoItem } from "./playerTypes";
import { MosaicViewport } from "./MosaicViewport";

type RuntimeTarget = { ref: MosaicTargetRef; file?: Blob; url: string };
type GenerationState = { message: string; completed: number; total: number } | null;

type MosaicStudioSectionProps = {
  albums: PhotoAlbum[];
  videos: VideoItem[];
  onOpenAlbum: (album: PhotoAlbum, imageIndex: number) => void;
  onOpenVideo: (video: VideoItem) => void;
};

const pickerPageSize = 48;

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
    file: image.file,
  })));
  return [...videoSources, ...photoSources];
}

function ResourceThumbnail({ source }: { source: MosaicRuntimeSource }) {
  const [url, setUrl] = useState(source.url);
  useEffect(() => {
    if (source.url || !source.file) {
      setUrl(source.url);
      return undefined;
    }
    const nextUrl = URL.createObjectURL(source.file);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [source.file, source.url]);
  return url ? <img src={url} alt="" loading="lazy" decoding="async" draggable={false} /> : <ImageIcon size={25} />;
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
  const uploadedTargetUrlRef = useRef("");
  const [projects, setProjects] = useState<MosaicProject[]>([]);
  const [activeProject, setActiveProject] = useState<MosaicProject | null>(null);
  const [target, setTarget] = useState<RuntimeTarget | null>(null);
  const [sourceFilter, setSourceFilter] = useState<MosaicSourceFilter>("mixed");
  const [sourceLimit, setSourceLimit] = useState(4000);
  const [columns, setColumns] = useState(100);
  const [targetClarity, setTargetClarity] = useState(0.55);
  const [colorPreservation, setColorPreservation] = useState(0.58);
  const [maxReuse, setMaxReuse] = useState(12);
  const [seed, setSeed] = useState(() => Date.now() >>> 0);
  const [previewUrl, setPreviewUrl] = useState("");
  const [generation, setGeneration] = useState<GenerationState>(null);
  const [backend, setBackend] = useState("");
  const [message, setMessage] = useState("");
  const [selectedSource, setSelectedSource] = useState<MosaicRuntimeSource | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [pickerKind, setPickerKind] = useState<"video" | "photo">("video");
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerPage, setPickerPage] = useState(1);
  const [deleteCandidate, setDeleteCandidate] = useState<MosaicProject | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    workerRef.current = new Worker(new URL("./mosaicWorker.ts", import.meta.url), { type: "module" });
    void loadMosaicProjects()
      .then((items) => setProjects(items.sort((left, right) => right.updatedAt - left.updatedAt)))
      .catch(() => setMessage("千图作品读取失败，新作品仍可在当前会话生成。"));
    return () => {
      abortRef.current?.abort();
      workerRef.current?.terminate();
      if (uploadedTargetUrlRef.current) URL.revokeObjectURL(uploadedTargetUrlRef.current);
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
  const pickerResults = useMemo(() => sources.filter((source) => {
    if (source.kind !== pickerKind) return false;
    return !pickerSearch.trim() || source.label.toLocaleLowerCase().includes(pickerSearch.trim().toLocaleLowerCase());
  }), [pickerKind, pickerSearch, sources]);
  const pickerPageCount = Math.max(1, Math.ceil(pickerResults.length / pickerPageSize));
  const pagedPickerResults = pickerResults.slice((pickerPage - 1) * pickerPageSize, pickerPage * pickerPageSize);

  const resolveTargetForProject = (project: MosaicProject) => {
    if (project.recipe.target.kind === "upload") {
      return { ref: project.recipe.target, url: project.targetUrl || project.recipe.target.assetUrl } satisfies RuntimeTarget;
    }
    const source = sourceById.get(project.recipe.target.sourceId);
    return source ? { ref: project.recipe.target, file: source.file, url: source.url } satisfies RuntimeTarget : null;
  };

  const openProject = (project: MosaicProject) => {
    setActiveProject(project);
    setTarget(resolveTargetForProject(project));
    setSourceFilter(project.recipe.sourceFilter);
    setSourceLimit(project.recipe.sourceLimit ?? 4000);
    setColumns(project.recipe.columns);
    setTargetClarity(project.recipe.targetClarity);
    setColorPreservation(project.recipe.colorPreservation);
    setMaxReuse(project.recipe.maxReuse);
    setSeed(project.recipe.seed);
    setPreviewUrl(project.previewUrl);
    setSelectedSource(null);
    const missing = project.recipe.sourceIds.filter((id) => !sourceById.has(id)).length;
    setMessage(missing ? `作品中有 ${missing} 项素材已不可用，预览仍可查看，重新生成会自动跳过。` : "作品已恢复。");
  };

  const selectSourceTarget = (source: MosaicRuntimeSource) => {
    setTarget({ ref: { kind: "source", label: source.label, sourceId: source.id }, file: source.file, url: source.url });
    setIsPickerOpen(false);
    setMessage("已选择项目资源作为目标，将在生成时保留套娃单元。" );
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
      const grid = await readMosaicTargetGrid({ file: target.file, url: target.url, columns });
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
        longestEdge: 2200,
        colorPreservation,
        targetClarity,
        type: "image/webp",
        signal: controller.signal,
        onProgress: (completed, total) => setGeneration({ message: "正在合成渐进预览", completed, total }),
      });
      const projectId = activeProject?.id ?? createProjectId();
      let targetRef = target.ref;
      let targetUrl = activeProject?.targetUrl;
      if (target.ref.kind === "upload" && target.file) {
        targetUrl = await writeMosaicTarget(projectId, target.file);
        targetRef = { ...target.ref, assetUrl: targetUrl };
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
      setTarget(targetRef.kind === "upload" ? { ref: targetRef, url: targetUrl || targetRef.assetUrl } : target);
      if (targetRef.kind === "upload" && uploadedTargetUrlRef.current) {
        URL.revokeObjectURL(uploadedTargetUrlRef.current);
        uploadedTargetUrlRef.current = "";
      }
      setMessage(`作品已保存；使用 ${availableSources.length} 项素材，跳过 ${analyzed.skipped} 项不可解码素材。`);
    } catch (error) {
      setMessage(error instanceof DOMException && error.name === "AbortError" ? "生成已取消。" : error instanceof Error ? error.message : "千图生成失败。" );
    } finally {
      setGeneration(null);
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const exportProject = async (longestEdge: 3840 | 7680) => {
    if (!activeProject || !target) return;
    setIsExporting(true);
    setMessage(`正在导出 ${longestEdge === 7680 ? "8K" : "4K"} PNG…`);
    try {
      const grid = await readMosaicTargetGrid({ file: target.file, url: target.url, columns: activeProject.recipe.columns });
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
          <section className="mosaic-panel">
            <div className="mosaic-panel-title"><span>目标图</span><small>{target?.ref.label || "尚未选择"}</small></div>
            <div className="mosaic-target-actions">
              <label className="primary-button mosaic-upload-button">
                <Upload size={17} /> 上传图片
                <input
                  accept="image/*"
                  type="file"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    if (uploadedTargetUrlRef.current) URL.revokeObjectURL(uploadedTargetUrlRef.current);
                    const url = URL.createObjectURL(file);
                    uploadedTargetUrlRef.current = url;
                    setTarget({ ref: { kind: "upload", label: file.name, assetUrl: "" }, file, url });
                    setActiveProject(null);
                    setPreviewUrl("");
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              <button className="secondary-button" type="button" onClick={() => setIsPickerOpen(true)}><Images size={17} /> 从项目选择</button>
            </div>
          </section>

          <section className="mosaic-panel mosaic-controls">
            <label>素材池<select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as MosaicSourceFilter)}><option value="mixed">影片 + 图集</option><option value="videos">仅影片缩略图</option><option value="photos">仅图集图片</option></select></label>
            <label>参与素材上限<input type="number" min="8" max="10000" step="8" value={sourceLimit} onChange={(event) => setSourceLimit(Math.max(8, Math.min(10000, Number(event.target.value) || 8)))} /></label>
            <label>网格密度 <strong>{columns} 列</strong><input type="range" min="40" max="160" step="10" value={columns} onChange={(event) => setColumns(Number(event.target.value))} /></label>
            <label>目标清晰度 <strong>{Math.round(targetClarity * 100)}%</strong><input type="range" min="0" max="1" step="0.05" value={targetClarity} onChange={(event) => setTargetClarity(Number(event.target.value))} /></label>
            <label>素材原色 <strong>{Math.round(colorPreservation * 100)}%</strong><input type="range" min="0" max="1" step="0.05" value={colorPreservation} onChange={(event) => setColorPreservation(Number(event.target.value))} /></label>
            <label>单图复用上限<input type="number" min="1" max="999" value={maxReuse} onChange={(event) => setMaxReuse(Math.max(1, Number(event.target.value)))} /></label>
            <button className="secondary-button" type="button" onClick={() => setSeed(crypto.getRandomValues(new Uint32Array(1))[0])}><Shuffle size={17} /> 重新洗牌</button>
            <button className="primary-button mosaic-generate-button" type="button" disabled={Boolean(generation)} onClick={() => void generate()}>
              {generation ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />}{activeProject ? "重新生成并保存" : "生成千图作品"}
            </button>
            {generation ? <button className="secondary-button" type="button" onClick={() => abortRef.current?.abort()}><X size={17} /> 取消生成</button> : null}
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
            <div className="mosaic-progress-overlay">
              <LoaderCircle className="spin" size={34} />
              <strong>{generation.message}</strong>
              <span>{progressPercent}% · {generation.completed} / {generation.total}</span>
              <div><i style={{ width: `${progressPercent}%` }} /></div>
            </div>
          ) : null}
          {previewUrl && activeProject ? (
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
                <button className="secondary-button" disabled={isExporting} type="button" onClick={() => void exportProject(3840)}><Download size={16} /> 4K PNG</button>
                <button className="secondary-button" disabled={isExporting} type="button" onClick={() => void exportProject(7680)}><Download size={16} /> 8K PNG</button>
              </div>
              <MosaicViewport
                assignments={activeProject.recipe.assignments}
                columns={activeProject.recipe.columns}
                rows={activeProject.recipe.rows}
                previewUrl={previewUrl}
                sources={sources}
                onSelectSource={setSelectedSource}
              />
            </>
          ) : (
            <div className="mosaic-stage-empty">
              <div className="mosaic-orbit"><Film size={32} /><Images size={28} /><Sparkles size={34} /></div>
              <h3>选择一张目标图，开始构建媒体宇宙</h3>
              <p>已有影片缩略图和图集图片会被分析成颜色星图；支持上传，也支持从项目中选图实现套娃。</p>
              <button className="primary-button" type="button" onClick={() => setIsPickerOpen(true)}><FolderOpen size={18} /> 从项目资源开始</button>
            </div>
          )}
          {message ? <div className="mosaic-status-message">{message}</div> : null}
          {selectedSource ? (
            <aside className="mosaic-source-card">
              <button type="button" onClick={() => setSelectedSource(null)} title="关闭"><X size={17} /></button>
              <ResourceThumbnail source={selectedSource} />
              <div><span>{selectedSource.kind === "video" ? "影片缩略图" : "图集图片"}</span><strong>{selectedSource.label}</strong></div>
              <button className="primary-button" type="button" onClick={openSelectedSource}>{selectedSource.kind === "video" ? <><Play size={17} /> 播放影片</> : <><FolderOpen size={17} /> 打开图集</>}</button>
            </aside>
          ) : null}
        </div>
      </div>

      {isPickerOpen ? (
        <div className="modal-backdrop mosaic-picker-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsPickerOpen(false); }}>
          <section className="mosaic-picker" role="dialog" aria-modal="true" aria-labelledby="mosaic-picker-title">
            <header><div><Sparkles size={24} /><span><h2 id="mosaic-picker-title">选择项目内目标图</h2><p>目标本身仍可出现在小图中，形成套娃效果。</p></span></div><button type="button" onClick={() => setIsPickerOpen(false)}><X size={20} /></button></header>
            <div className="mosaic-picker-toolbar">
              <div className="special-view-switch"><button className={pickerKind === "video" ? "active" : ""} type="button" onClick={() => { setPickerKind("video"); setPickerPage(1); }}>影片缩略图</button><button className={pickerKind === "photo" ? "active" : ""} type="button" onClick={() => { setPickerKind("photo"); setPickerPage(1); }}>图集图片</button></div>
              <input type="search" value={pickerSearch} placeholder="搜索名称" onChange={(event) => { setPickerSearch(event.target.value); setPickerPage(1); }} />
            </div>
            <div className="mosaic-picker-grid">
              {pagedPickerResults.map((source) => <button key={source.id} type="button" onClick={() => selectSourceTarget(source)}><ResourceThumbnail source={source} /><span>{source.label}</span></button>)}
            </div>
            {!pagedPickerResults.length ? <div className="mosaic-picker-empty">当前没有可选择的{pickerKind === "video" ? "已有影片缩略图" : "图集图片"}。</div> : null}
            <footer><span>第 {pickerPage} / {pickerPageCount} 页 · {pickerResults.length} 项</span><div><button className="secondary-button" disabled={pickerPage <= 1} type="button" onClick={() => setPickerPage((page) => page - 1)}>上一页</button><button className="secondary-button" disabled={pickerPage >= pickerPageCount} type="button" onClick={() => setPickerPage((page) => page + 1)}>下一页</button></div></footer>
          </section>
        </div>
      ) : null}

      {deleteCandidate ? (
        <div className="dialog-backdrop" role="presentation">
          <section className="confirm-dialog mosaic-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="mosaic-delete-title">
            <Trash2 size={28} /><h2 id="mosaic-delete-title">删除千图作品？</h2><p>将删除《{deleteCandidate.name}》的方案、上传目标和预览封面，已导出的 PNG 不受影响。</p>
            <div><button className="secondary-button" type="button" onClick={() => setDeleteCandidate(null)}>取消</button><button className="danger-button" type="button" onClick={() => void confirmDelete()}>确认删除</button></div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
