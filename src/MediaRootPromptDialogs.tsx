import { FolderOpen, HardDrive, RefreshCw, X } from "lucide-react";

import type { LocalMediaRoot } from "./mediaRootScanCache";

type MediaRootLabelDialogProps = {
  directoryName: string;
  mediaKind?: "video" | "photo";
  value: string;
  onClose: () => void;
  onSubmit: () => void;
  onValueChange: (value: string) => void;
};

type ExistingMediaRootDialogProps = {
  directoryName: string;
  mediaRootLabel: string;
  mediaKind?: "video" | "photo";
  onCancel: () => void;
  onRescan: () => void;
};

type MediaRootLocalPathDialogViewProps = {
  root: LocalMediaRoot;
  value: string;
  error: string;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: () => void;
  onValueChange: (value: string) => void;
};

export function MediaRootLabelDialog({
  directoryName,
  mediaKind = "video",
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
          <h2 id="media-root-label-title">{mediaKind === "photo" ? "命名看图媒体库" : "命名媒体库"}</h2>
          <p>为“{directoryName}”设置一个{mediaKind === "photo" ? "看图" : ""}媒体库名称。</p>
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
  mediaKind = "video",
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
          <p>
            “{mediaRootLabel}”已在{mediaKind === "photo" ? "看图" : "全局"}媒体库中。重新扫描会刷新
            “{directoryName}”下的{mediaKind === "photo" ? "图片" : "视频和字幕"}。
          </p>
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

export function MediaRootLocalPathDialogView({
  root,
  value,
  error,
  isSaving,
  onClose,
  onSubmit,
  onValueChange,
}: MediaRootLocalPathDialogViewProps) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="media-root-local-path-title"
        aria-modal="true"
        className="media-root-local-path-dialog"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button aria-label="关闭" className="dialog-close" type="button" onClick={onClose} disabled={isSaving}>
          <X size={18} />
        </button>
        <div className="dialog-icon">
          <HardDrive size={28} />
        </div>
        <div className="dialog-copy">
          <h2 id="media-root-local-path-title">配置本机路径</h2>
          <p>为“{root.label}”填写服务端可访问的本机绝对路径。</p>
        </div>
        <div className="media-root-path-preview">
          <span>浏览器目录</span>
          <code>{root.path}</code>
        </div>
        <label className="media-root-label-field">
          <span>本机绝对路径</span>
          <input
            autoFocus
            type="text"
            value={value}
            placeholder="D:\\Media\\Anime"
            onChange={(event) => onValueChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onSubmit();
              if (event.key === "Escape") onClose();
            }}
            disabled={isSaving}
          />
        </label>
        {error ? <div className="dialog-inline-error">{error}</div> : null}
        <div className="dialog-actions">
          <button className="secondary-button" type="button" onClick={onClose} disabled={isSaving}>
            取消
          </button>
          <button className="primary-button" type="button" onClick={onSubmit} disabled={isSaving || !value.trim()}>
            <HardDrive size={18} />
            {isSaving ? "保存中..." : "保存路径"}
          </button>
        </div>
      </section>
    </div>
  );
}
