export const photoAlbumPageSize = 20;
export const photoThumbnailWindowSize = 24;
export const photoViewerWarmRadius = 4;
export const photoViewerDecodeRadius = 2;
export const photoAlbumScanCacheStaleMs = 24 * 60 * 60 * 1000;

let hasStartedLegacyThumbnailMigration = false;

export function shouldStartLegacyThumbnailMigration() {
  if (hasStartedLegacyThumbnailMigration) return false;
  hasStartedLegacyThumbnailMigration = true;
  return true;
}
