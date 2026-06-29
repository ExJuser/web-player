import type { ShortcutAction, ShortcutMap, VideoHighlightSegment } from "./playerTypes";

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function formatShortcutKey(code: string) {
  if (code === "Space") return "空格";
  if (code === "Slash") return "?";
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code === "ArrowLeft") return "←";
  if (code === "ArrowRight") return "→";
  if (code === "ArrowUp") return "↑";
  if (code === "ArrowDown") return "↓";
  if (code.startsWith("Numpad")) return `小键盘 ${code.slice(6)}`;
  return code.replace(/([a-z])([A-Z])/g, "$1 $2");
}

type ShortcutKeyboardEvent = {
  code?: string;
  key: string;
  shiftKey: boolean;
};

export function shortcutCodeFromEvent(event: ShortcutKeyboardEvent) {
  if (event.code === "Slash" && event.shiftKey) return "Slash";
  return event.code || event.key;
}

export function getShortcutConflict(shortcuts: ShortcutMap, action: ShortcutAction, nextCode: string) {
  return (Object.keys(shortcuts) as ShortcutAction[]).find(
    (candidate) =>
      candidate !== action &&
      shortcuts[candidate] === nextCode &&
      !(
        (action === "seekForward" && candidate === "holdSpeed") ||
        (action === "holdSpeed" && candidate === "seekForward")
      ),
  );
}

export function resolveInitialPlaybackTime({
  progressTime,
  progressCompleted = false,
  progressDuration = 0,
  highlights,
  startFromHighEnergy,
  forceBeginning = false,
}: {
  progressTime?: number;
  progressCompleted?: boolean;
  progressDuration?: number;
  highlights?: VideoHighlightSegment[];
  startFromHighEnergy: boolean;
  forceBeginning?: boolean;
}) {
  if (forceBeginning) return 0;

  if (startFromHighEnergy && highlights?.length) {
    const firstHighlight = highlights
      .filter((highlight) => Number.isFinite(highlight.startTime) && highlight.startTime >= 0)
      .sort((a, b) => a.startTime - b.startTime || a.endTime - b.endTime)[0];
    if (firstHighlight) return firstHighlight.startTime;
  }

  return !progressCompleted &&
    typeof progressTime === "number" &&
    Number.isFinite(progressTime) &&
    progressTime < Math.max(0, progressDuration - 8)
    ? progressTime
    : 0;
}
