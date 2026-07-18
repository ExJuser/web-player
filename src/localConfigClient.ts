export type ClientBangumiConfig = {
  configured: boolean;
  proxyConfigured: boolean;
};

export type ClientLadaConfig = { available: boolean };

export function normalizeClientLocalConfig<T extends { bangumi?: ClientBangumiConfig; lada?: ClientLadaConfig }>(
  config: T,
): T & { bangumi: ClientBangumiConfig; lada: ClientLadaConfig } {
  return {
    ...config,
    bangumi: config.bangumi ?? { configured: false, proxyConfigured: false },
    lada: config.lada ?? { available: false },
  };
}

export function shouldAutoScanGlobalMediaLibrary(_config: { mediaRoots?: unknown[] }) {
  return false;
}

export function supportsServerFileAccess(root: { source?: string; localPath?: string } | null | undefined) {
  return Boolean(root && (root.source !== "browser" || root.localPath));
}
