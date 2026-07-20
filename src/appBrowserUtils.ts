import { defaultPlayerSettings } from "./playerConstants";
import { clamp } from "./playerInteractionUtils";

export type AppTheme = "dark" | "light";

const playerVolumeStorageKey = "local-web-player-volume";
const appThemeStorageKey = "local-web-player-theme";

export function readStoredVolume() {
  if (typeof window === "undefined") return defaultPlayerSettings.volume;
  try {
    const storedVolume = window.localStorage.getItem(playerVolumeStorageKey);
    if (storedVolume === null) return defaultPlayerSettings.volume;
    const parsedVolume = Number(storedVolume);
    return Number.isFinite(parsedVolume) ? clamp(parsedVolume, 0, 1) : defaultPlayerSettings.volume;
  } catch {
    return defaultPlayerSettings.volume;
  }
}

export function readStoredTheme(): AppTheme {
  if (typeof window === "undefined") return "dark";
  const storedTheme = window.localStorage.getItem(appThemeStorageKey);
  return storedTheme === "light" ? "light" : "dark";
}

export function isFormControl(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(target.tagName);
}
