import {
  thumbnailCacheTimeout,
  thumbnailEncodeTimeout,
  thumbnailGenerationTimeout,
  thumbnailHeight,
  playlistThumbnailHeight,
  playlistThumbnailWidth,
  thumbnailServerGenerationTimeout,
  thumbnailWidth,
} from "./playerConstants";
import { findCachedThumbnailUrl, generateServerThumbnail, writeCachedThumbnail, type ThumbnailVariant } from "./playerStorage";
import { revokeObjectUrl } from "./appResourceCleanup";
import type { VideoItem, VideoMetadata } from "./playerTypes";
import { getPlayableVideoUrl } from "./playerUiState";

export function waitForMediaEvent(
  element: HTMLVideoElement,
  eventName: keyof HTMLMediaElementEventMap,
  timeout = 7000,
  signal?: AbortSignal,
) {
  return new Promise<void>((resolve, reject) => {
    throwIfAborted(signal);
    const cleanup = () => {
      window.clearTimeout(timer);
      element.removeEventListener(eventName, handleEvent);
      element.removeEventListener("error", handleError);
      signal?.removeEventListener("abort", handleAbort);
    };
    const handleEvent = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error("Unable to load video."));
    };
    const handleAbort = () => {
      cleanup();
      reject(createAbortError());
    };
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${eventName}.`));
    }, timeout);

    element.addEventListener(eventName, handleEvent, { once: true });
    element.addEventListener("error", handleError, { once: true });
    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}

export function withTimeout<T>(promise: Promise<T>, timeout: number, message: string, onTimeout?: () => void) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      onTimeout?.();
      reject(new Error(message));
    }, timeout);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

type ArtworkSize = { width: number; height: number };
type ArtworkSizeReader = (url: string) => Promise<ArtworkSize>;

function readArtworkSize(url: string) {
  return new Promise<ArtworkSize>((resolve, reject) => {
    const image = new Image();
    const cleanup = () => {
      window.clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
    };
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("Timed out reading artwork dimensions."));
    }, thumbnailCacheTimeout);
    image.onload = () => {
      const size = { width: image.naturalWidth, height: image.naturalHeight };
      cleanup();
      size.width > 0 && size.height > 0 ? resolve(size) : reject(new Error("Invalid artwork dimensions."));
    };
    image.onerror = () => {
      cleanup();
      reject(new Error("Unable to load artwork."));
    };
    image.src = url;
  });
}

function createAbortError() {
  const error = new Error("Thumbnail loading was aborted.");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw createAbortError();
}

function withAbort<T>(promise: Promise<T>, signal?: AbortSignal) {
  if (!signal) return promise;
  throwIfAborted(signal);
  return new Promise<T>((resolve, reject) => {
    const handleAbort = () => reject(createAbortError());
    const cleanup = () => signal.removeEventListener("abort", handleAbort);
    signal.addEventListener("abort", handleAbort, { once: true });
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
}

export async function selectVideoArtworkThumbnail(
  video: VideoItem,
  readSize: ArtworkSizeReader = readArtworkSize,
  signal?: AbortSignal,
) {
  const candidates = [
    { file: video.posterFile, url: video.posterUrl },
    { file: video.fanartFile, url: video.fanartUrl },
    { file: video.thumbFile, url: video.thumbUrl },
  ].filter((candidate) => candidate.file || candidate.url);
  let fallbackUrl: string | null = null;

  for (const candidate of candidates) {
    throwIfAborted(signal);
    const url = candidate.file ? URL.createObjectURL(candidate.file) : candidate.url!;
    let size: ArtworkSize;
    try {
      size = await withAbort(readSize(url), signal);
    } catch {
      revokeObjectUrl(url);
      throwIfAborted(signal);
      continue;
    }
    if (size.width >= size.height) {
      revokeObjectUrl(fallbackUrl);
      return url;
    }
    if (!fallbackUrl) fallbackUrl = url;
    else revokeObjectUrl(url);
  }

  return fallbackUrl;
}

function waitForDrawableVideoFrame(element: HTMLVideoElement, signal?: AbortSignal) {
  if ("requestVideoFrameCallback" in element) {
    return new Promise<void>((resolve, reject) => {
      throwIfAborted(signal);
      let isSettled = false;
      const finish = (callback: () => void) => {
        if (isSettled) return;
        isSettled = true;
        window.clearTimeout(timer);
        signal?.removeEventListener("abort", handleAbort);
        callback();
      };
      const handleAbort = () => {
        element.cancelVideoFrameCallback(frameId);
        finish(() => reject(createAbortError()));
      };
      const timer = window.setTimeout(() => finish(resolve), 160);
      const frameId = element.requestVideoFrameCallback(() => finish(resolve));
      signal?.addEventListener("abort", handleAbort, { once: true });
    });
  }

  return withAbort(new Promise<void>((resolve) => window.setTimeout(resolve, 80)), signal);
}

export function readUint64(data: DataView, offset: number) {
  const high = data.getUint32(offset);
  const low = data.getUint32(offset + 4);
  return high * 2 ** 32 + low;
}

export function parseMp4MovieDuration(buffer: ArrayBuffer) {
  const data = new DataView(buffer);
  let offset = 8;

  while (offset + 8 <= data.byteLength) {
    const size = data.getUint32(offset);
    const type = String.fromCharCode(
      data.getUint8(offset + 4),
      data.getUint8(offset + 5),
      data.getUint8(offset + 6),
      data.getUint8(offset + 7),
    );
    const headerSize = size === 1 ? 16 : 8;
    const boxSize = size === 1 ? readUint64(data, offset + 8) : size;
    if (boxSize < headerSize || offset + boxSize > data.byteLength) break;

    if (type === "mvhd") {
      const version = data.getUint8(offset + headerSize);
      const timescaleOffset = offset + headerSize + (version === 1 ? 20 : 12);
      const durationOffset = timescaleOffset + 4;
      if (durationOffset + (version === 1 ? 8 : 4) > offset + boxSize) return undefined;
      const timescale = data.getUint32(timescaleOffset);
      const duration = version === 1 ? readUint64(data, durationOffset) : data.getUint32(durationOffset);
      return timescale > 0 && duration > 0 ? duration / timescale : undefined;
    }

    offset += boxSize;
  }

  return undefined;
}

async function readMp4DurationFromFile(file: File) {
  if (!/\.(?:mp4|m4v|mov)$/i.test(file.name)) return undefined;
  let offset = 0;
  const maxBoxHeaderBytes = 16;

  while (offset + 8 <= file.size) {
    const header = new DataView(await file.slice(offset, Math.min(file.size, offset + maxBoxHeaderBytes)).arrayBuffer());
    const size = header.getUint32(0);
    const type = String.fromCharCode(header.getUint8(4), header.getUint8(5), header.getUint8(6), header.getUint8(7));
    const headerSize = size === 1 ? 16 : 8;
    const boxSize = size === 1 && header.byteLength >= 16 ? readUint64(header, 8) : size;
    if (boxSize < headerSize) break;
    if (type === "moov") {
      const maxMoovBytes = 32 * 1024 * 1024;
      if (boxSize > maxMoovBytes) return undefined;
      return parseMp4MovieDuration(await file.slice(offset, offset + boxSize).arrayBuffer());
    }
    offset += boxSize;
  }

  return undefined;
}

export function selectTrustedDuration(candidates: Array<number | undefined>) {
  const durations = candidates.filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);
  if (!durations.length) return undefined;
  return Math.min(...durations);
}

export async function getVideoElementMetadata(element: HTMLVideoElement, video?: VideoItem): Promise<VideoMetadata> {
  const fileDuration = video?.file ? await readMp4DurationFromFile(video.file).catch(() => undefined) : undefined;
  return {
    duration: selectTrustedDuration([fileDuration, Number.isFinite(element.duration) ? element.duration : undefined]),
    width: element.videoWidth || undefined,
    height: element.videoHeight || undefined,
  };
}

const widescreenAspectRatio = 16 / 9;

export function getVideoDisplaySize(width?: number, height?: number) {
  if (!width || !height) return null;
  return { width, height };
}

export function getPlayerFrameAspectRatio(width?: number, height?: number) {
  if (!width || !height || !Number.isFinite(width) || !Number.isFinite(height)) return widescreenAspectRatio;
  return width / height;
}

function isCanvasNearlyBlack(canvas: HTMLCanvasElement, sampleContext: CanvasRenderingContext2D) {
  sampleContext.drawImage(canvas, 0, 0, sampleContext.canvas.width, sampleContext.canvas.height);
  const pixels = sampleContext.getImageData(0, 0, sampleContext.canvas.width, sampleContext.canvas.height).data;
  let brightPixels = 0;

  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index] + pixels[index + 1] + pixels[index + 2] > 36) {
      brightPixels += 1;
    }
  }

  return brightPixels / (sampleContext.canvas.width * sampleContext.canvas.height) < 0.01;
}

function encodeCanvasAsJpeg(canvas: HTMLCanvasElement, signal?: AbortSignal, quality = 0.82) {
  return withTimeout(
    withAbort(new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Unable to encode thumbnail."));
            return;
          }
          resolve(blob);
        },
        "image/jpeg",
        quality,
      );
    }), signal),
    thumbnailEncodeTimeout,
    "Timed out encoding thumbnail.",
  );
}

async function createVideoThumbnailBlob(
  video: VideoItem,
  signal?: AbortSignal,
  highQuality = false,
  variant: ThumbnailVariant = "standard",
  targetTime?: number,
) {
  const element = document.createElement("video");
  const canvas = document.createElement("canvas");
  const sampleCanvas = document.createElement("canvas");
  const cleanup = () => {
    element.removeAttribute("src");
    element.load();
  };

  try {
    throwIfAborted(signal);
    element.muted = true;
    element.preload = "metadata";
    element.playsInline = true;
    element.src = getPlayableVideoUrl(video);

    if (element.readyState < HTMLMediaElement.HAVE_METADATA) {
      await waitForMediaEvent(element, "loadedmetadata", 7000, signal);
    }

    const metadata = await getVideoElementMetadata(element, video);
    throwIfAborted(signal);
    const displaySize = getVideoDisplaySize(metadata.width, metadata.height);
    const width = displaySize?.width;
    const height = displaySize?.height;
    if (!width || !height) {
      throw new Error("Unable to create thumbnail.");
    }

    const targetScale = highQuality ? Math.min(1, 3840 / width, 2160 / height) : 1;
    canvas.width = highQuality ? Math.max(1, Math.round(width * targetScale)) : variant === "playlist" ? playlistThumbnailWidth : thumbnailWidth;
    canvas.height = highQuality ? Math.max(1, Math.round(height * targetScale)) : variant === "playlist" ? playlistThumbnailHeight : thumbnailHeight;
    sampleCanvas.width = 32;
    sampleCanvas.height = 18;
    const context = canvas.getContext("2d");
    const sampleContext = sampleCanvas.getContext("2d", { willReadFrequently: true });
    if (!context || !sampleContext) {
      throw new Error("Unable to create thumbnail.");
    }

    const scale = Math.min(canvas.width / width, canvas.height / height);
    const drawWidth = width * scale;
    const drawHeight = height * scale;
    const drawLeft = (canvas.width - drawWidth) / 2;
    const drawTop = (canvas.height - drawHeight) / 2;
    const duration = Number.isFinite(element.duration) ? element.duration : 0;
    const targetTimes = Number.isFinite(targetTime)
      ? [Math.min(Math.max(targetTime ?? 0, 0.1), Math.max(0.1, duration - 0.1))]
      : duration > 0
        ? [duration * 0.1, duration * 0.25, duration * 0.5, duration * 0.75, 2]
            .map((time) => Math.min(Math.max(time, 0.1), Math.max(0.1, duration - 0.1)))
            .filter((time, index, times) => times.findIndex((other) => Math.abs(other - time) < 0.05) === index)
        : [0];
    for (const targetTime of targetTimes) {
      throwIfAborted(signal);
      if (Math.abs(element.currentTime - targetTime) > 0.05) {
        const seeked = waitForMediaEvent(element, "seeked", 7000, signal);
        element.currentTime = targetTime;
        await seeked;
      } else if (element.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        await waitForMediaEvent(element, "loadeddata", 7000, signal);
      }

      await waitForDrawableVideoFrame(element, signal);

      context.fillStyle = "#050607";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(element, drawLeft, drawTop, drawWidth, drawHeight);

      if (!isCanvasNearlyBlack(canvas, sampleContext)) break;
    }

    const thumbnailBlob = await encodeCanvasAsJpeg(canvas, signal, highQuality ? 0.95 : 0.82);
    return { thumbnailBlob, metadata };
  } finally {
    cleanup();
  }
}

export async function createHighQualityVideoTarget(video: VideoItem, signal?: AbortSignal) {
  return (await createVideoThumbnailBlob(video, signal, true)).thumbnailBlob;
}

export async function generateResumeVideoThumbnail(
  libraryId: string | null,
  video: VideoItem,
  currentTime: number,
  signal?: AbortSignal,
) {
  throwIfAborted(signal);
  if (video.mediaRootId) {
    const serverController = new AbortController();
    const abortServerRequest = () => serverController.abort();
    signal?.addEventListener("abort", abortServerRequest, { once: true });
    try {
      const serverThumbnailUrl = await withTimeout(
        generateServerThumbnail(
          libraryId,
          video.id,
          video.mediaRootId,
          video.relativePath,
          serverController.signal,
          "resume",
          currentTime,
        ),
        thumbnailServerGenerationTimeout,
        "Timed out generating resume thumbnail.",
        abortServerRequest,
      );
      if (serverThumbnailUrl) return serverThumbnailUrl;
    } catch (error) {
      throwIfAborted(signal);
    } finally {
      signal?.removeEventListener("abort", abortServerRequest);
    }
  }

  const generationController = new AbortController();
  const abortGeneration = () => generationController.abort();
  signal?.addEventListener("abort", abortGeneration, { once: true });
  try {
    const { thumbnailBlob } = await withTimeout(
      createVideoThumbnailBlob(video, generationController.signal, false, "resume", currentTime),
      thumbnailGenerationTimeout,
      "Timed out creating resume thumbnail.",
      abortGeneration,
    );
    return URL.createObjectURL(thumbnailBlob);
  } finally {
    signal?.removeEventListener("abort", abortGeneration);
  }
}

export async function loadAvailableVideoThumbnail(libraryId: string | null, video: VideoItem, signal?: AbortSignal, variant: ThumbnailVariant = "standard") {
  throwIfAborted(signal);
  const artworkUrl = await selectVideoArtworkThumbnail(video, readArtworkSize, signal);
  if (artworkUrl) return { thumbnailUrl: artworkUrl, metadata: undefined };

  let cachedThumbnailUrl: string | null;
  try {
    cachedThumbnailUrl = await withTimeout(
      findCachedThumbnailUrl(libraryId, video.id, signal, variant),
      thumbnailCacheTimeout,
      "Timed out reading cached thumbnail.",
    );
  } catch (error) {
    throwIfAborted(signal);
    cachedThumbnailUrl = null;
  }
  if (cachedThumbnailUrl) {
    return { thumbnailUrl: cachedThumbnailUrl, metadata: undefined };
  }

  return null;
}

export async function generateVideoThumbnail(libraryId: string | null, video: VideoItem, signal?: AbortSignal, variant: ThumbnailVariant = "standard") {
  throwIfAborted(signal);
  if (video.mediaRootId) {
    const serverController = new AbortController();
    const abortServerRequest = () => serverController.abort();
    signal?.addEventListener("abort", abortServerRequest, { once: true });
    try {
      const serverThumbnailUrl = await withTimeout(
        generateServerThumbnail(
          libraryId,
          video.id,
          video.mediaRootId,
          video.relativePath,
          serverController.signal,
          variant,
        ),
        thumbnailServerGenerationTimeout,
        "Timed out generating server thumbnail.",
        abortServerRequest,
      );
      if (serverThumbnailUrl) return { thumbnailUrl: serverThumbnailUrl, metadata: undefined };
    } catch (error) {
      throwIfAborted(signal);
    } finally {
      signal?.removeEventListener("abort", abortServerRequest);
    }
  }

  const generationController = new AbortController();
  const abortGeneration = () => generationController.abort();
  signal?.addEventListener("abort", abortGeneration, { once: true });
  let thumbnailBlob: Blob;
  let metadata: VideoMetadata;
  try {
    ({ thumbnailBlob, metadata } = await withTimeout(
      createVideoThumbnailBlob(video, generationController.signal, false, variant),
      thumbnailGenerationTimeout,
      "Timed out creating thumbnail.",
      abortGeneration,
    ));
  } finally {
    signal?.removeEventListener("abort", abortGeneration);
  }
  void writeCachedThumbnail(libraryId, video.id, thumbnailBlob, variant).catch(() => undefined);
  return { thumbnailUrl: URL.createObjectURL(thumbnailBlob), metadata };
}

export async function loadVideoThumbnail(libraryId: string | null, video: VideoItem, signal?: AbortSignal) {
  return (
    (await loadAvailableVideoThumbnail(libraryId, video, signal)) ??
    generateVideoThumbnail(libraryId, video, signal)
  );
}
