import type { LocalMediaRoot } from "./mediaRootScanCache";
import type { PhotoAlbum, PlayerMediaRootStatus } from "./playerTypes";

export type PhotoAlbumRootScanResult = {
  root: LocalMediaRoot;
  status: PlayerMediaRootStatus;
  albums: PhotoAlbum[];
};

export type PhotoAlbumScanResponse = {
  roots: PhotoAlbumRootScanResult[];
  albums: PhotoAlbum[];
  scannedFiles: number;
  metadata: {
    id: "photo-albums";
    name: string;
    albumCount: number;
    scannedFiles: number;
    updatedAt: number;
    mediaRoots: PlayerMediaRootStatus[];
  };
};

type FetchJson = <T>(url: string, options?: RequestInit) => Promise<T>;

export type DeletePhotoAlbumResult = {
  deletedImages: number;
  directoryRemoved: boolean;
  directoryRetainedReason?: "not-empty" | "root-directory";
};

export function hasReadyPhotoAlbumRoot(scan: PhotoAlbumScanResponse) {
  return scan.metadata.mediaRoots.some((status) => status.status === "ready");
}

export async function loadServerPhotoAlbumScan(fetchJson: FetchJson) {
  return fetchJson<PhotoAlbumScanResponse>("/api/photo-albums/scan");
}

export async function deleteServerPhotoImage(
  fetchJson: FetchJson,
  image: { mediaRootId: string; relativePath: string },
) {
  return fetchJson<{ deleted: boolean; missing?: boolean }>("/api/photo-albums/photo", {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      rootId: image.mediaRootId,
      relativePath: image.relativePath,
    }),
  });
}

export async function deleteServerPhotoAlbum(
  fetchJson: FetchJson,
  album: { mediaRootId: string; relativePath: string },
) {
  return fetchJson<DeletePhotoAlbumResult>("/api/photo-albums/album", {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      rootId: album.mediaRootId,
      relativePath: album.relativePath,
    }),
  });
}
