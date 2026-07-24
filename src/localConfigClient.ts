export type ClientBangumiConfig = {
  configured: boolean;
  proxyConfigured: boolean;
};

export type ClientLadaConfig = { available: boolean };
export type ClientSubtitleGenerationConfig = {
  available: boolean;
  engine: string;
  modelLabel: string;
  vadAvailable: boolean;
  reason: string;
};

export function normalizeClientLocalConfig<T extends {
  bangumi?: ClientBangumiConfig;
  lada?: ClientLadaConfig;
  subtitleGeneration?: ClientSubtitleGenerationConfig;
}>(
  config: T,
): T & {
  bangumi: ClientBangumiConfig;
  lada: ClientLadaConfig;
  subtitleGeneration: ClientSubtitleGenerationConfig;
} {
  return {
    ...config,
    bangumi: config.bangumi ?? { configured: false, proxyConfigured: false },
    lada: config.lada ?? { available: false },
    subtitleGeneration: config.subtitleGeneration ?? {
      available: false,
      engine: "whisper.cpp",
      modelLabel: "Kotoba-Whisper v2.0",
      vadAvailable: false,
      reason: "未检测到日语字幕生成引擎。",
    },
  };
}

export function shouldAutoScanGlobalMediaLibrary(_config: { mediaRoots?: unknown[] }) {
  return false;
}

export function supportsServerFileAccess(root: { source?: string; localPath?: string } | null | undefined) {
  return Boolean(root && (root.source !== "browser" || root.localPath));
}
