import type { ShortcutAction, ShortcutMap } from "./playerTypes";

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
