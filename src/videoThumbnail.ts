import {
  thumbnailCacheTimeout,
  thumbnailEncodeTimeout,
  thumbnailGenerationTimeout,
  thumbnailHeight,
  thumbnailWidth,
} from "./playerConstants";
import { readCachedThumbnail, writeCachedThumbnail } from "./playerStorage";
import { revokeObjectUrl } from "./appResourceCleanup";
import type { VideoItem, VideoMetadata } from "./playerTypes";
import { getPlayableVideoUrl } from "./playerUiState";

export function waitForMediaEvent(
  element: HTMLVideoElement,
  eventName: keyof HTMLMediaElementEventMap,
  timeout = 7000,
) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      window.clearTimeout(timer);
      element.removeEventListener(eventName, handleEvent);
      element.removeEventListener("error", handleError);
    };
    const handleEvent = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error("Unable to load video."));
    };
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${eventName}.`));
    }, timeout);

    element.addEventListener(eventName, handleEvent, { once: true });
    element.addEventListener("error", handleError, { once: true });
  });
}

export function withTimeout<T>(promise: Promise<T>, timeout: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), timeout);
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

export async function selectVideoArtworkThumbnail(video: VideoItem, readSize: ArtworkSizeReader = readArtworkSize) {
  const candidates = [
    { file: video.posterFile, url: video.posterUrl },
    { file: video.fanartFile, url: video.fanartUrl },
    { file: video.thumbFile, url: video.thumbUrl },
  ].filter((candidate) => candidate.file || candidate.url);
  let fallbackUrl: string | null = null;

  for (const candidate of candidates) {
    const url = candidate.file ? URL.createObjectURL(candidate.file) : candidate.url!;
    let size: ArtworkSize;
    try {
      size = await readSize(url);
    } catch {
      revokeObjectUrl(url);
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

function waitForDrawableVideoFrame(element: HTMLVideoElement) {
  if ("requestVideoFrameCallback" in element) {
    return new Promise<void>((resolve) => {
      const timer = window.setTimeout(resolve, 160);
      element.requestVideoFrameCallback(() => {
        window.clearTimeout(timer);
        resolve();
      });
    });
  }

  return new Promise<void>((resolve) => window.setTimeout(resolve, 80));
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

function isCanvasNearlyBlack(context: CanvasRenderingContext2D, width: number, height: number) {
  const pixels = context.getImageData(0, 0, width, height).data;
  let brightPixels = 0;

  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index] + pixels[index + 1] + pixels[index + 2] > 36) {
      brightPixels += 1;
    }
  }

  return brightPixels / (width * height) < 0.01;
}

function encodeCanvasAsJpeg(canvas: HTMLCanvasElement) {
  return withTimeout(
    new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Unable to encode thumbnail."));
            return;
          }
          resolve(blob);
        },
        "image/jpeg",
        0.82,
      );
    }),
    thumbnailEncodeTimeout,
    "Timed out encoding thumbnail.",
  );
}

async function createVideoThumbnailBlob(video: VideoItem) {
  const element = document.createElement("video");
  const canvas = document.createElement("canvas");
  const cleanup = () => {
    element.removeAttribute("src");
    element.load();
  };

  try {
    element.muted = true;
    element.preload = "auto";
    element.playsInline = true;
    element.src = getPlayableVideoUrl(video);

    if (element.readyState < HTMLMediaElement.HAVE_METADATA) {
      await waitForMediaEvent(element, "loadedmetadata");
    }

    const metadata = await getVideoElementMetadata(element, video);
    const displaySize = getVideoDisplaySize(metadata.width, metadata.height);
    const width = displaySize?.width;
    const height = displaySize?.height;
    if (!width || !height) {
      throw new Error("Unable to create thumbnail.");
    }

    canvas.width = thumbnailWidth;
    canvas.height = thumbnailHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Unable to create thumbnail.");
    }

    const scale = Math.min(canvas.width / width, canvas.height / height);
    const drawWidth = width * scale;
    const drawHeight = height * scale;
    const drawLeft = (canvas.width - drawWidth) / 2;
    const drawTop = (canvas.height - drawHeight) / 2;
    const duration = Number.isFinite(element.duration) ? element.duration : 0;
    const targetTimes =
      duration > 0
        ? [duration * 0.1, duration * 0.25, duration * 0.5, duration * 0.75, 2]
            .map((time) => Math.min(Math.max(time, 0.1), Math.max(0.1, duration - 0.1)))
            .filter((time, index, times) => times.findIndex((other) => Math.abs(other - time) < 0.05) === index)
        : [0];
    let fallbackBlob: Blob | null = null;

    for (const targetTime of targetTimes) {
      if (Math.abs(element.currentTime - targetTime) > 0.05) {
        const seeked = waitForMediaEvent(element, "seeked");
        element.currentTime = targetTime;
        await seeked;
      } else if (element.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        await waitForMediaEvent(element, "loadeddata");
      }

      await waitForDrawableVideoFrame(element);

      context.fillStyle = "#050607";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(element, drawLeft, drawTop, drawWidth, drawHeight);

      const blob = await encodeCanvasAsJpeg(canvas);
      if (!fallbackBlob) fallbackBlob = blob;
      if (!isCanvasNearlyBlack(context, canvas.width, canvas.height)) {
        cleanup();
        return { thumbnailBlob: blob, metadata };
      }
    }

    cleanup();
    return { thumbnailBlob: fallbackBlob ?? (await encodeCanvasAsJpeg(canvas)), metadata };
  } catch (error) {
    cleanup();
    throw error;
  }
}

export async function loadVideoThumbnail(libraryId: string | null, video: VideoItem) {
  const artworkUrl = await selectVideoArtworkThumbnail(video);
  if (artworkUrl) return { thumbnailUrl: artworkUrl, metadata: undefined };

  const cachedThumbnail = await withTimeout(
    readCachedThumbnail(libraryId, video.id),
    thumbnailCacheTimeout,
    "Timed out reading cached thumbnail.",
  ).catch(() => null);
  if (cachedThumbnail) {
    return { thumbnailUrl: URL.createObjectURL(cachedThumbnail), metadata: undefined };
  }

  const { thumbnailBlob, metadata } = await withTimeout(
    createVideoThumbnailBlob(video),
    thumbnailGenerationTimeout,
    "Timed out creating thumbnail.",
  );
  void writeCachedThumbnail(libraryId, video.id, thumbnailBlob).catch(() => undefined);
  return { thumbnailUrl: URL.createObjectURL(thumbnailBlob), metadata };
}
