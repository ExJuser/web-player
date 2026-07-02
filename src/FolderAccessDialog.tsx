import { FolderOpen, ShieldCheck, X } from "lucide-react";

type FolderAccessDialogProps = {
  isOpen: boolean;
  skipPrompt: boolean;
  onClose: () => void;
  onSkipPromptChange: (checked: boolean) => void;
  onContinue: () => void;
};

export function FolderAccessDialog({
  isOpen,
  skipPrompt,
  onClose,
  onSkipPromptChange,
  onContinue,
}: FolderAccessDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="folder-access-title"
        aria-modal="true"
        className="folder-dialog"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button aria-label="关闭" className="dialog-close" type="button" onClick={onClose}>
          <X size={18} />
        </button>
        <div className="dialog-icon">
          <ShieldCheck size={28} />
        </div>
        <div className="dialog-copy">
          <h2 id="folder-access-title">添加媒体库</h2>
          <p>播放器只会读取你选择的目录，用来加入全局媒体库、扫描可播放的视频并保存本地播放进度。</p>
        </div>
        <div className="permission-notes">
          <span>不会上传文件</span>
          <span>仅本次选择生效</span>
          <span>可随时取消</span>
        </div>
        <label className="dialog-check">
          <input
            type="checkbox"
            checked={skipPrompt}
            onChange={(event) => onSkipPromptChange(event.target.checked)}
          />
          不再提示，直接新增媒体库
        </label>
        <div className="dialog-actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            取消
          </button>
          <button className="primary-button" type="button" onClick={onContinue}>
            <FolderOpen size={18} />
            继续添加
          </button>
        </div>
      </section>
    </div>
  );
}
