import { isObjectUrl } from "./playerLibraryUtils";

type RevokeObjectUrl = (url: string) => void;

export function revokeObjectUrl(url: string | null | undefined, revoke: RevokeObjectUrl = URL.revokeObjectURL) {
  if (url && isObjectUrl(url)) {
    revoke(url);
  }
}

export function revokeObjectUrls(
  urls: Iterable<string | null | undefined>,
  revoke: RevokeObjectUrl = URL.revokeObjectURL,
) {
  for (const url of urls) {
    revokeObjectUrl(url, revoke);
  }
}
