import {
  useCallback,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MutableRefObject,
} from "react";

import {
  defaultShortcuts,
  shortcutGroups,
} from "./playerConstants";
import {
  formatShortcutKey,
  getShortcutConflict,
  shortcutCodeFromEvent,
} from "./playerInteractionUtils";
import type {
  PlayerPreferences,
  ShortcutAction,
} from "./playerTypes";

type UseShortcutSettingsParams = {
  playerPreferencesRef: MutableRefObject<PlayerPreferences>;
  replacePlayerPreferences: (nextPreferences: PlayerPreferences) => void;
};

export function useShortcutSettings({
  playerPreferencesRef,
  replacePlayerPreferences,
}: UseShortcutSettingsParams) {
  const [isShortcutDialogOpen, setIsShortcutDialogOpen] = useState(false);
  const [recordingShortcutAction, setRecordingShortcutAction] = useState<ShortcutAction | null>(null);
  const [shortcutMessage, setShortcutMessage] = useState("");

  const closeShortcutDialog = useCallback(() => {
    setIsShortcutDialogOpen(false);
  }, []);

  const toggleShortcutDialog = useCallback(() => {
    setIsShortcutDialogOpen((open) => !open);
  }, []);

  const startShortcutRecording = useCallback((action: ShortcutAction, label: string) => {
    setRecordingShortcutAction(action);
    setShortcutMessage(`按下新的“${label}”快捷键`);
  }, []);

  const updateShortcut = useCallback(
    (action: ShortcutAction, nextCode: string) => {
      const conflictAction = getShortcutConflict(playerPreferencesRef.current.shortcuts, action, nextCode);
      if (conflictAction) {
        const conflictItem = shortcutGroups
          .flatMap((group) => group.items)
          .find((item) => item.action === conflictAction);
        setShortcutMessage(`“${formatShortcutKey(nextCode)}” 已用于 ${conflictItem?.label ?? "其他动作"}`);
        return;
      }

      replacePlayerPreferences({
        ...playerPreferencesRef.current,
        shortcuts: {
          ...playerPreferencesRef.current.shortcuts,
          [action]: nextCode,
        },
      });
      setShortcutMessage(`已设置为 ${formatShortcutKey(nextCode)}`);
    },
    [playerPreferencesRef, replacePlayerPreferences],
  );

  const resetShortcuts = useCallback(() => {
    replacePlayerPreferences({
      ...playerPreferencesRef.current,
      shortcuts: defaultShortcuts,
    });
    setRecordingShortcutAction(null);
    setShortcutMessage("已恢复默认快捷键");
  }, [playerPreferencesRef, replacePlayerPreferences]);

  const handleShortcutCapture = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>, action: ShortcutAction) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        setRecordingShortcutAction(null);
        setShortcutMessage("");
        return;
      }
      const nextCode = shortcutCodeFromEvent(event);
      if (!nextCode) return;
      updateShortcut(action, nextCode);
      setRecordingShortcutAction(null);
    },
    [updateShortcut],
  );

  return {
    closeShortcutDialog,
    handleShortcutCapture,
    isShortcutDialogOpen,
    recordingShortcutAction,
    resetShortcuts,
    shortcutMessage,
    startShortcutRecording,
    toggleShortcutDialog,
  };
}
