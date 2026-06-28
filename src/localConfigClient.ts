export type ClientBangumiConfig = {
  configured: boolean;
  proxyConfigured: boolean;
};

export function normalizeClientLocalConfig<T extends { bangumi?: ClientBangumiConfig }>(
  config: T,
): T & { bangumi: ClientBangumiConfig } {
  return {
    ...config,
    bangumi: config.bangumi ?? { configured: false, proxyConfigured: false },
  };
}

export function shouldAutoScanGlobalMediaLibrary(_config: { mediaRoots?: unknown[] }) {
  return false;
}
