export type LadaCapabilityOption = { value: string; label: string };

export type LadaRestoreOptions = {
  device: string;
  encodingPreset: string;
  fp16: boolean;
  detectFaceMosaics: boolean;
};

export type LadaCapabilities = {
  devices: LadaCapabilityOption[];
  encodingPresets: LadaCapabilityOption[];
  defaults: LadaRestoreOptions;
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;

const ladaOptionsStorageKey = "local-web-player-lada-options";

function getBrowserStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

export function readStoredLadaOptions(storage: StorageLike | null = getBrowserStorage()): Partial<LadaRestoreOptions> | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(ladaOptionsStorageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function writeStoredLadaOptions(options: LadaRestoreOptions, storage: StorageLike | null = getBrowserStorage()) {
  if (!storage) return;
  try {
    storage.setItem(ladaOptionsStorageKey, JSON.stringify(options));
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

export function resolveLadaOptions(source: Partial<LadaRestoreOptions> | null, capabilities: LadaCapabilities): LadaRestoreOptions {
  const defaults = capabilities.defaults;
  return {
    device: capabilities.devices.some((item) => item.value === source?.device) ? source!.device! : defaults.device,
    encodingPreset: capabilities.encodingPresets.some((item) => item.value === source?.encodingPreset)
      ? source!.encodingPreset!
      : defaults.encodingPreset,
    fp16: typeof source?.fp16 === "boolean" ? source.fp16 : defaults.fp16,
    detectFaceMosaics: typeof source?.detectFaceMosaics === "boolean"
      ? source.detectFaceMosaics
      : defaults.detectFaceMosaics,
  };
}
