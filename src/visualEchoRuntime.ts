import { waitForMediaEvent } from "./videoThumbnail";
import type { VideoItem } from "./playerTypes";
import {
  createVisualEchoDescriptor,
  createVisualEchoFrameId,
  createVisualEchoSampleTimes,
  createVisualEchoVideoSignature,
} from "./visualEcho";
import type { VisualEchoIndexedFrame, VisualEchoSource } from "./visualEchoTypes";

function abortError() {
  const error = new DOMException("已取消画面回声处理。", "AbortError");
  return error;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError();
}

function waitForFrame(element: HTMLVideoElement, signal?: AbortSignal) {
  if (!("requestVideoFrameCallback" in element)) {
    return new Promise<void>((resolve, reject) => {
      const handleAbort = () => {
        window.clearTimeout(timer);
        reject(abortError());
      };
      const timer = window.setTimeout(() => {
        signal?.removeEventListener("abort", handleAbort);
        resolve();
      }, 80);
      signal?.addEventListener("abort", handleAbort, { once: true });
    });
  }
  return new Promise<void>((resolve, reject) => {
    throwIfAborted(signal);
    const frameId = element.requestVideoFrameCallback(() => {
      signal?.removeEventListener("abort", handleAbort);
      resolve();
    });
    const handleAbort = () => {
      element.cancelVideoFrameCallback(frameId);
      reject(abortError());
    };
    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}

function drawVideoCover(context: CanvasRenderingContext2D, video: HTMLVideoElement) {
  const sourceRatio = video.videoWidth / Math.max(1, video.videoHeight);
  const targetRatio = context.canvas.width / context.canvas.height;
  let sourceWidth = video.videoWidth;
  let sourceHeight = video.videoHeight;
  let sourceX = 0;
  let sourceY = 0;
  if (sourceRatio > targetRatio) {
    sourceWidth = video.videoHeight * targetRatio;
    sourceX = (video.videoWidth - sourceWidth) / 2;
  } else {
    sourceHeight = video.videoWidth / targetRatio;
    sourceY = (video.videoHeight - sourceHeight) / 2;
  }
  context.drawImage(
    video,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    context.canvas.width,
    context.canvas.height,
  );
}

function canvasToWebp(canvas: HTMLCanvasElement, signal?: AbortSignal) {
  return new Promise<Blob>((resolve, reject) => {
    throwIfAborted(signal);
    canvas.toBlob((blob) => {
      if (signal?.aborted) {
        reject(abortError());
        return;
      }
      blob ? resolve(blob) : reject(new Error("浏览器无法生成画面回声预览。"));
    }, "image/webp", 0.76);
  });
}

async function seekVideo(element: HTMLVideoElement, timestamp: number, signal?: AbortSignal) {
  throwIfAborted(signal);
  const duration = Number.isFinite(element.duration) ? element.duration : timestamp;
  const nextTime = Math.max(0, Math.min(timestamp, Math.max(0, duration - 0.05)));
  if (Math.abs(element.currentTime - nextTime) > 0.04) {
    const seeked = waitForMediaEvent(element, "seeked", 8000, signal);
    element.currentTime = nextTime;
    await seeked;
  }
  await waitForFrame(element, signal);
  return nextTime;
}

async function captureLoadedFrame(
  element: HTMLVideoElement,
  video: VideoItem,
  timestamp: number,
  signal?: AbortSignal,
) {
  const resolvedTime = await seekVideo(element, timestamp, signal);
  if (!element.videoWidth || !element.videoHeight) throw new Error("当前影片没有可读取的视频画面。");
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 180;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("浏览器无法创建画面分析画布。");
  drawVideoCover(context, element);
  const descriptor = createVisualEchoDescriptor(context.getImageData(0, 0, canvas.width, canvas.height));
  const preview = await canvasToWebp(canvas, signal);
  const videoSignature = createVisualEchoVideoSignature(video);
  const frameId = createVisualEchoFrameId(videoSignature, resolvedTime);
  return {
    preview,
    sample: {
      id: frameId,
      frameId,
      videoId: video.id,
      timestamp: resolvedTime,
      videoSignature,
      descriptor,
    },
  } satisfies VisualEchoIndexedFrame;
}

async function createVideoElement(url: string, signal?: AbortSignal) {
  if (!url) throw new Error("影片没有可用于画面分析的播放地址。");
  const element = document.createElement("video");
  element.preload = "auto";
  element.muted = true;
  element.playsInline = true;
  element.src = url;
  const loaded = waitForMediaEvent(element, "loadedmetadata", 10000, signal);
  element.load();
  await loaded;
  return element;
}

export async function captureVisualEchoSource(
  video: VideoItem,
  url: string,
  timestamp: number,
  signal?: AbortSignal,
): Promise<VisualEchoSource> {
  const element = await createVideoElement(url, signal);
  try {
    const frame = await captureLoadedFrame(element, video, timestamp, signal);
    return {
      video,
      timestamp: frame.sample.timestamp,
      duration: element.duration,
      descriptor: frame.sample.descriptor,
      previewUrl: URL.createObjectURL(frame.preview),
    };
  } finally {
    element.removeAttribute("src");
    element.load();
  }
}

export async function indexVisualEchoVideo(
  video: VideoItem,
  url: string,
  signal?: AbortSignal,
  onFrame?: (completed: number, total: number) => void,
) {
  const element = await createVideoElement(url, signal);
  try {
    const times = createVisualEchoSampleTimes(element.duration);
    const frames: VisualEchoIndexedFrame[] = [];
    for (let index = 0; index < times.length; index += 1) {
      throwIfAborted(signal);
      try {
        frames.push(await captureLoadedFrame(element, video, times[index], signal));
      } catch (error) {
        if (signal?.aborted) throw error;
      }
      onFrame?.(index + 1, times.length);
    }
    return frames;
  } finally {
    element.removeAttribute("src");
    element.load();
  }
}
