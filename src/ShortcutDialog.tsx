import { Keyboard, X } from "lucide-react";
import type { KeyboardEvent } from "react";

import type { ShortcutAction, ShortcutMap } from "./playerTypes";

type ShortcutGroup = {
  title: string;
  items: Array<{ action: ShortcutAction; label: string }>;
};

type ShortcutDialogProps = {
  isOpen: boolean;
  shortcutGroups: ShortcutGroup[];
  shortcuts: ShortcutMap;
  recordingShortcutAction: ShortcutAction | null;
  shortcutMessage: string;
  onClose: () => void;
  onStartRecording: (action: ShortcutAction, label: string) => void;
  onCapture: (event: KeyboardEvent<HTMLButtonElement>, action: ShortcutAction) => void;
  onReset: () => void;
  formatShortcutKey: (code: string) => string;
};

export function ShortcutDialog({
  isOpen,
  shortcutGroups,
  shortcuts,
  recordingShortcutAction,
  shortcutMessage,
  onClose,
  onStartRecording,
  onCapture,
  onReset,
  formatShortcutKey,
}: ShortcutDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="shortcut-help-title"
        aria-modal="true"
        className="shortcut-dialog"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button aria-label="关闭" className="dialog-close" type="button" onClick={onClose}>
          <X size={18} />
        </button>
        <div className="shortcut-dialog-title">
          <Keyboard size={24} />
          <h2 id="shortcut-help-title">快捷键设置</h2>
        </div>
        <p className="shortcut-dialog-note">
          点击按键后按下新的快捷键。Esc 关闭录制，右方向默认同时用于短按快进和长按倍速。
        </p>
        <div className="shortcut-grid">
          {shortcutGroups.map((group) => (
            <section key={group.title} className="shortcut-group">
              <h3>{group.title}</h3>
              <dl>
                {group.items.map((item) => (
                  <div key={item.action}>
                    <dt>
                      <button
                        className={`shortcut-key-button ${recordingShortcutAction === item.action ? "recording" : ""}`}
                        type="button"
                        onClick={() => onStartRecording(item.action, item.label)}
                        onKeyDown={(event) => onCapture(event, item.action)}
                      >
                        {recordingShortcutAction === item.action
                          ? "录制中"
                          : formatShortcutKey(shortcuts[item.action])}
                      </button>
                    </dt>
                    <dd>{item.label}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
        <div className="shortcut-dialog-footer">
          <span>{shortcutMessage || "滚轮仍可在播放器区域调节音量。"}</span>
          <button className="secondary-button" type="button" onClick={onReset}>
            恢复默认
          </button>
        </div>
      </section>
    </div>
  );
}
