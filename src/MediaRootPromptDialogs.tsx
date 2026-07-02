import { FolderOpen, RefreshCw, X } from "lucide-react";

type MediaRootLabelDialogProps = {
  directoryName: string;
  value: string;
  onClose: () => void;
  onSubmit: () => void;
  onValueChange: (value: string) => void;
};

type ExistingMediaRootDialogProps = {
  directoryName: string;
  mediaRootLabel: string;
  onCancel: () => void;
  onRescan: () => void;
};

export function MediaRootLabelDialog({
  directoryName,
  value,
  onClose,
  onSubmit,
  onValueChange,
}: MediaRootLabelDialogProps) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="media-root-label-title"
        aria-modal="true"
        className="media-root-label-dialog"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button aria-label="关闭" className="dialog-close" type="button" onClick={onClose}>
          <X size={18} />
        </button>
        <div className="dialog-icon">
          <FolderOpen size={28} />
        </div>
        <div className="dialog-copy">
          <h2 id="media-root-label-title">命名媒体库</h2>
          <p>为“{directoryName}”设置一个媒体库名称。</p>
        </div>
        <label className="media-root-label-field">
          <span>媒体库名称</span>
          <input
            autoFocus
            type="text"
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onSubmit();
              if (event.key === "Escape") onClose();
            }}
          />
        </label>
        <div className="dialog-actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            取消
          </button>
          <button className="primary-button" type="button" onClick={onSubmit} disabled={!value.trim()}>
            确定
          </button>
        </div>
      </section>
    </div>
  );
}

export function ExistingMediaRootDialog({
  directoryName,
  mediaRootLabel,
  onCancel,
  onRescan,
}: ExistingMediaRootDialogProps) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onCancel}>
      <section
        aria-labelledby="existing-media-root-title"
        aria-modal="true"
        className="media-root-label-dialog"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button aria-label="关闭" className="dialog-close" type="button" onClick={onCancel}>
          <X size={18} />
        </button>
        <div className="dialog-icon">
          <FolderOpen size={28} />
        </div>
        <div className="dialog-copy">
          <h2 id="existing-media-root-title">该媒体库已添加</h2>
          <p>“{mediaRootLabel}”已在全局媒体库中。重新扫描会刷新“{directoryName}”下的视频和字幕。</p>
        </div>
        <div className="dialog-actions">
          <button className="secondary-button" type="button" onClick={onCancel}>
            取消
          </button>
          <button className="primary-button" type="button" onClick={onRescan}>
            <RefreshCw size={18} />
            重新扫描
          </button>
        </div>
      </section>
    </div>
  );
}
