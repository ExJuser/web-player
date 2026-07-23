import { useEffect, useMemo, useRef, useState } from "react";
import {
  Ban,
  Clock3,
  Film,
  LoaderCircle,
  Pause,
  Play,
  RefreshCw,
  ScanSearch,
  Sparkles,
} from "lucide-react";

import type { VideoItem } from "./playerTypes";
import { getPlayableVideoUrl } from "./playerUiState";
import {
  createVisualEchoVideoSignature,
  filterVisualEchoIndex,
  findVisualEchoMatches,
} from "./visualEcho";
import { captureVisualEchoSource, indexVisualEchoVideo } from "./visualEchoRuntime";
import {
  loadVisualEchoIndex,
  saveVisualEchoIndex,
  visualEchoFrameUrl,
  writeVisualEchoFrame,
} from "./visualEchoStorage";
import type {
  VisualEchoBuildProgress,
  VisualEchoIndex,
  VisualEchoMatch,
  VisualEchoSource,
} from "./visualEchoTypes";

type VisualEchoEntry = { videoId: string; timestamp: number; nonce: number } | null;

type VisualEchoStudioSectionProps = {
  initialEntry: VisualEchoEntry;
  videos: VideoItem[];
  formatTime: (seconds: number) => string;
  onOpenVideoAt: (video: VideoItem, timestamp: number) => void;
};

const emptyIndex: VisualEchoIndex = { version: 1, updatedAt: 0, samples: [] };

function frameLabel(match: VisualEchoMatch) {
  return `${match.reason} · ${match.score.toFixed(1)}%`;
}

export function VisualEchoStudioSection({
  initialEntry,
  videos,
  formatTime,
  onOpenVideoAt,
}: VisualEchoStudioSectionProps) {
  const [index, setIndex] = useState<VisualEchoIndex>(emptyIndex);
  const [isIndexLoaded, setIsIndexLoaded] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false);
  const [buildProgress, setBuildProgress] = useState<VisualEchoBuildProgress | null>(null);
  const [message, setMessage] = useState("");
  const [videoQuery, setVideoQuery] = useState("");
  const [selectedVideoId, setSelectedVideoId] = useState(initialEntry?.videoId ?? videos[0]?.id ?? "");
  const [sourceTimestamp, setSourceTimestamp] = useState(initialEntry?.timestamp ?? 0);
  const [source, setSource] = useState<VisualEchoSource | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [includeSameVideo, setIncludeSameVideo] = useState(false);
  const [matches, setMatches] = useState<VisualEchoMatch[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState("");
  const [blend, setBlend] = useState(52);
  const [runtimeFrameUrls, setRuntimeFrameUrls] = useState<Record<string, string>>({});
  const buildAbortRef = useRef<AbortController | null>(null);
  const captureAbortRef = useRef<AbortController | null>(null);
  const sourceUrlRef = useRef("");
  const runtimeFrameUrlsRef = useRef<Record<string, string>>({});
  const handledEntryNonceRef = useRef<number | null>(null);

  const videoById = useMemo(() => new Map(videos.map((video) => [video.id, video])), [videos]);
  const videoScopeKey = useMemo(
    () => videos.map((video) => `${video.id}:${video.size}:${video.lastModified}`).join("|"),
    [videos],
  );
  const filteredVideos = useMemo(() => {
    const query = videoQuery.trim().toLocaleLowerCase("zh-Hans-CN");
    return query
      ? videos.filter((video) => `${video.name} ${video.relativePath}`.toLocaleLowerCase("zh-Hans-CN").includes(query))
      : videos;
  }, [videoQuery, videos]);
  const selectedVideo = videoById.get(selectedVideoId) ?? filteredVideos[0] ?? videos[0] ?? null;
  const filteredIndex = useMemo(() => filterVisualEchoIndex(index, videos), [index, videos]);
  const indexedVideoIds = useMemo(() => new Set(filteredIndex.samples.map((sample) => sample.videoId)), [filteredIndex.samples]);
  const missingVideos = videos.filter((video) => !indexedVideoIds.has(video.id));
  const selectedMatch = matches.find((match) => match.sample.id === selectedMatchId) ?? matches[0] ?? null;

  const resolveFrameUrl = (frameId: string) => runtimeFrameUrls[frameId] ?? visualEchoFrameUrl(frameId);

  useEffect(() => {
    let isCurrent = true;
    void loadVisualEchoIndex()
      .then((loaded) => {
        if (isCurrent) setIndex(filterVisualEchoIndex(loaded, videos));
      })
      .catch(() => {
        if (isCurrent) setMessage("无法读取持久化索引，当前会话仍可构建和搜索。");
      })
      .finally(() => {
        if (isCurrent) setIsIndexLoaded(true);
      });
    return () => {
      isCurrent = false;
    };
  }, [videoScopeKey]);

  useEffect(() => {
    runtimeFrameUrlsRef.current = runtimeFrameUrls;
  }, [runtimeFrameUrls]);

  useEffect(() => () => {
    buildAbortRef.current?.abort();
    captureAbortRef.current?.abort();
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    Object.values(runtimeFrameUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const replaceSource = (nextSource: VisualEchoSource) => {
    if (sourceUrlRef.current && sourceUrlRef.current !== nextSource.previewUrl) URL.revokeObjectURL(sourceUrlRef.current);
    sourceUrlRef.current = nextSource.previewUrl.startsWith("blob:") ? nextSource.previewUrl : "";
    setSource(nextSource);
    setSourceTimestamp(nextSource.timestamp);
  };

  const searchFromSource = (nextSource: VisualEchoSource, sameVideo = includeSameVideo) => {
    const nextMatches = findVisualEchoMatches(
      {
        id: `query:${nextSource.video.id}:${nextSource.timestamp}`,
        videoId: nextSource.video.id,
        descriptor: nextSource.descriptor,
      },
      filteredIndex,
      { includeSameVideo: sameVideo },
    );
    setMatches(nextMatches);
    setSelectedMatchId(nextMatches[0]?.sample.id ?? "");
    setMessage(nextMatches.length
      ? `找到 ${nextMatches.length} 个视觉回声。`
      : filteredIndex.samples.length
        ? "当前索引中没有其他影片可供匹配。"
        : "请先构建画面回声索引。");
  };

  const captureSource = async (video: VideoItem, timestamp: number, autoSearch = true) => {
    captureAbortRef.current?.abort();
    const controller = new AbortController();
    captureAbortRef.current = controller;
    setIsCapturing(true);
    setMessage("正在读取源画面…");
    try {
      const nextSource = await captureVisualEchoSource(video, getPlayableVideoUrl(video), timestamp, controller.signal);
      replaceSource(nextSource);
      if (autoSearch) searchFromSource(nextSource);
      else setMessage("源画面已就绪。");
    } catch (error) {
      if (controller.signal.aborted) return;
      setMessage(error instanceof Error ? error.message : "无法读取源画面。");
    } finally {
      if (captureAbortRef.current === controller) captureAbortRef.current = null;
      setIsCapturing(false);
    }
  };

  useEffect(() => {
    if (!isIndexLoaded || !initialEntry || handledEntryNonceRef.current === initialEntry.nonce) return;
    const entryVideo = videoById.get(initialEntry.videoId);
    if (!entryVideo) return;
    handledEntryNonceRef.current = initialEntry.nonce;
    setSelectedVideoId(entryVideo.id);
    setSourceTimestamp(initialEntry.timestamp);
    void captureSource(entryVideo, initialEntry.timestamp, true);
  }, [initialEntry, isIndexLoaded, videoById]);

  const buildIndex = async () => {
    if (!videos.length || isBuilding) return;
    const controller = new AbortController();
    buildAbortRef.current = controller;
    setIsBuilding(true);
    setMessage("开始构建画面回声索引…");
    let workingIndex = filteredIndex;
    let completedFrames = 0;
    let skippedVideos = 0;
    const targets = videos.filter((video) => !indexedVideoIds.has(video.id));
    try {
      for (let videoIndex = 0; videoIndex < targets.length; videoIndex += 1) {
        if (controller.signal.aborted) throw new DOMException("已取消。", "AbortError");
        const video = targets[videoIndex];
        setBuildProgress({
          completedVideos: videoIndex,
          totalVideos: targets.length,
          completedFrames,
          currentVideoName: video.name,
        });
        try {
          const frames = await indexVisualEchoVideo(
            video,
            getPlayableVideoUrl(video),
            controller.signal,
            (completed) => setBuildProgress({
              completedVideos: videoIndex,
              totalVideos: targets.length,
              completedFrames: completedFrames + completed,
              currentVideoName: video.name,
            }),
          );
          const nextRuntimeUrls: Record<string, string> = {};
          for (const frame of frames) {
            try {
              await writeVisualEchoFrame(frame.sample.frameId, frame.preview);
            } catch {
              nextRuntimeUrls[frame.sample.frameId] = URL.createObjectURL(frame.preview);
            }
          }
          if (Object.keys(nextRuntimeUrls).length) {
            setRuntimeFrameUrls((current) => ({ ...current, ...nextRuntimeUrls }));
          }
          completedFrames += frames.length;
          workingIndex = {
            version: 1,
            updatedAt: Date.now(),
            samples: [
              ...workingIndex.samples.filter((sample) => sample.videoId !== video.id),
              ...frames.map((frame) => frame.sample),
            ],
          };
          setIndex(workingIndex);
          await saveVisualEchoIndex(workingIndex).catch(() => {
            setMessage("索引正在当前会话中生长，但无法写入项目数据目录。");
          });
        } catch (error) {
          if (controller.signal.aborted) throw error;
          skippedVideos += 1;
        }
      }
      setMessage(`索引更新完成：${workingIndex.samples.length} 帧${skippedVideos ? `，跳过 ${skippedVideos} 部无法解码的影片` : ""}。`);
    } catch (error) {
      if (controller.signal.aborted) {
        setMessage(`已取消构建，已完成的 ${workingIndex.samples.length} 帧仍然保留。`);
      } else {
        setMessage(error instanceof Error ? error.message : "画面回声索引构建失败。");
      }
    } finally {
      if (buildAbortRef.current === controller) buildAbortRef.current = null;
      setBuildProgress(null);
      setIsBuilding(false);
    }
  };

  const useMatchAsSource = (match: VisualEchoMatch) => {
    const video = videoById.get(match.sample.videoId);
    if (!video) return;
    const nextSource = {
      video,
      timestamp: match.sample.timestamp,
      duration: video.duration ?? match.sample.timestamp,
      descriptor: match.sample.descriptor,
      previewUrl: resolveFrameUrl(match.sample.frameId),
    };
    if (sourceUrlRef.current) {
      URL.revokeObjectURL(sourceUrlRef.current);
      sourceUrlRef.current = "";
    }
    setSource(nextSource);
    setSelectedVideoId(video.id);
    setSourceTimestamp(match.sample.timestamp);
    searchFromSource(nextSource);
  };

  const sourceDuration = source?.video.id === selectedVideo?.id
    ? source.duration
    : selectedVideo?.duration ?? Math.max(1, sourceTimestamp);

  return (
    <section className="visual-echo-studio">
      <header className="visual-echo-hero">
        <div>
          <span><ScanSearch size={15} /> Local visual fingerprint</span>
          <h2>有些画面，隔着作品仍会彼此回应</h2>
          <p>选择一个瞬间，寻找媒体库里构图、色彩和光影相似的另一个瞬间。所有分析都在本机完成。</p>
        </div>
        <div className="visual-echo-index-summary">
          <strong>{filteredIndex.samples.length}</strong>
          <span>已索引画面</span>
          <small>{indexedVideoIds.size} / {videos.length} 部影片</small>
          <button className="secondary-button" type="button" disabled={isBuilding || !missingVideos.length} onClick={() => void buildIndex()}>
            {isBuilding ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />}
            {missingVideos.length ? "构建 / 更新索引" : "索引已是最新"}
          </button>
          {isBuilding ? (
            <button className="secondary-button danger" type="button" onClick={() => buildAbortRef.current?.abort()}>
              <Ban size={14} /> 取消
            </button>
          ) : null}
        </div>
      </header>

      {buildProgress ? (
        <div className="visual-echo-progress">
          <span><LoaderCircle className="spin" size={15} /> {buildProgress.currentVideoName}</span>
          <strong>{buildProgress.completedVideos} / {buildProgress.totalVideos} 部 · {buildProgress.completedFrames} 帧</strong>
        </div>
      ) : null}
      {message ? <div className="visual-echo-message">{message}</div> : null}

      <div className="visual-echo-layout">
        <div className="visual-echo-source-panel">
          <div className="visual-echo-panel-heading">
            <span>01</span>
            <div><strong>选择源画面</strong><small>从特殊媒体库选一部影片和时间点</small></div>
          </div>
          <label className="visual-echo-video-search">
            <ScanSearch size={15} />
            <input value={videoQuery} placeholder="筛选影片" onChange={(event) => setVideoQuery(event.target.value)} />
          </label>
          <select
            className="visual-echo-video-select"
            value={selectedVideo?.id ?? ""}
            onChange={(event) => {
              const video = videoById.get(event.target.value);
              if (!video) return;
              setSelectedVideoId(video.id);
              setSourceTimestamp((video.duration ?? 0) * 0.5);
              setSource(null);
              setMatches([]);
            }}
          >
            {filteredVideos.map((video) => <option key={video.id} value={video.id}>{video.name}</option>)}
          </select>
          <div className="visual-echo-source-preview">
            {source ? <img src={source.previewUrl} alt={`${source.video.name} ${formatTime(source.timestamp)} 的画面`} /> : <Film size={42} />}
          </div>
          <label className="visual-echo-time">
            <span><Clock3 size={14} /> 时间点</span>
            <strong>{formatTime(sourceTimestamp)}</strong>
            <input
              type="range"
              min={0}
              max={Math.max(1, sourceDuration)}
              step={0.1}
              value={Math.min(sourceTimestamp, Math.max(1, sourceDuration))}
              onChange={(event) => setSourceTimestamp(Number(event.target.value))}
            />
          </label>
          <button
            className="primary-button visual-echo-search-button"
            type="button"
            disabled={!selectedVideo || isCapturing}
            onClick={() => selectedVideo && void captureSource(selectedVideo, sourceTimestamp, true)}
          >
            {isCapturing ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}
            {isCapturing ? "读取画面中" : "寻找画面回声"}
          </button>
          <label className="visual-echo-same-video">
            <input
              type="checkbox"
              checked={includeSameVideo}
              onChange={(event) => {
                setIncludeSameVideo(event.target.checked);
                if (source) searchFromSource(source, event.target.checked);
              }}
            />
            包含同一影片中的画面
          </label>
        </div>

        <div className="visual-echo-results-panel">
          <div className="visual-echo-panel-heading">
            <span>02</span>
            <div><strong>视觉回声</strong><small>{matches.length ? `${matches.length} 个相似瞬间` : "等待一次搜索"}</small></div>
          </div>
          {matches.length ? (
            <div className="visual-echo-results">
              {matches.map((match) => {
                const video = videoById.get(match.sample.videoId);
                if (!video) return null;
                return (
                  <button
                    className={`visual-echo-result ${selectedMatch?.sample.id === match.sample.id ? "active" : ""}`}
                    key={match.sample.id}
                    type="button"
                    onClick={() => setSelectedMatchId(match.sample.id)}
                  >
                    <img src={resolveFrameUrl(match.sample.frameId)} alt="" loading="lazy" decoding="async" />
                    <span><strong>{video.name}</strong><small>{formatTime(match.sample.timestamp)} · {frameLabel(match)}</small></span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="visual-echo-results-empty"><ScanSearch size={36} /><span>选择一个画面，回声会在这里出现。</span></div>
          )}
        </div>

        <aside className="visual-echo-compare-panel">
          <div className="visual-echo-panel-heading">
            <span>03</span>
            <div><strong>叠化比较</strong><small>观察两个画面为什么相似</small></div>
          </div>
          {source && selectedMatch ? (
            <>
              <div className="visual-echo-comparison">
                <img src={source.previewUrl} alt="源画面" />
                <img src={resolveFrameUrl(selectedMatch.sample.frameId)} alt="回声画面" style={{ opacity: blend / 100 }} />
                <span>源</span><span>回声 {blend}%</span>
              </div>
              <input
                className="visual-echo-blend"
                type="range"
                min={0}
                max={100}
                value={blend}
                aria-label="回声画面透明度"
                onChange={(event) => setBlend(Number(event.target.value))}
              />
              <div className="visual-echo-match-score">
                <strong>{selectedMatch.score.toFixed(1)}%</strong>
                <span>{selectedMatch.reason}</span>
                <small>构图 {Math.round(selectedMatch.hashScore * 100)} · 光影 {Math.round(selectedMatch.compositionScore * 100)} · 色彩 {Math.round(selectedMatch.colorScore * 100)}</small>
              </div>
              <div className="visual-echo-actions">
                <button className="primary-button" type="button" onClick={() => {
                  const video = videoById.get(selectedMatch.sample.videoId);
                  if (video) onOpenVideoAt(video, selectedMatch.sample.timestamp);
                }}><Play size={15} fill="currentColor" /> 跳转到此处</button>
                <button className="secondary-button" type="button" onClick={() => useMatchAsSource(selectedMatch)}>
                  <Pause size={15} /> 以此为源
                </button>
              </div>
            </>
          ) : (
            <div className="visual-echo-compare-empty">选择一个回声后，可在这里叠化比较。</div>
          )}
        </aside>
      </div>
    </section>
  );
}
