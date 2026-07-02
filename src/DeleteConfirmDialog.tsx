import { Trash2, X } from "lucide-react";
import type { ReactNode } from "react";

type DeleteConfirmDialogProps = {
  isOpen: boolean;
  titleId: string;
  title: string;
  description: string;
  primaryText: string;
  pendingText: string;
  isPending: boolean;
  previewTitle: string;
  previewMeta: ReactNode;
  error?: string;
  onClose: () => void;
  onConfirm: () => void;
};

export function DeleteConfirmDialog({
  isOpen,
  titleId,
  title,
  description,
  primaryText,
  pendingText,
  isPending,
  previewTitle,
  previewMeta,
  error = "",
  onClose,
  onConfirm,
}: DeleteConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={() => {
        if (!isPending) onClose();
      }}
    >
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className="delete-dialog"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button aria-label="关闭" className="dialog-close" type="button" onClick={onClose} disabled={isPending}>
          <X size={18} />
        </button>
        <div className="dialog-icon danger">
          <Trash2 size={28} />
        </div>
        <div className="dialog-copy">
          <h2 id={titleId}>{title}</h2>
          <p>{description}</p>
        </div>
        <div className="delete-file-preview">
          <strong>{previewTitle}</strong>
          <span>{previewMeta}</span>
        </div>
        {error ? <div className="dialog-inline-error">{error}</div> : null}
        <div className="dialog-actions">
          <button className="secondary-button" type="button" onClick={onClose} disabled={isPending}>
            取消
          </button>
          <button className="danger-button" type="button" onClick={onConfirm} disabled={isPending}>
            <Trash2 size={18} />
            {isPending ? pendingText : primaryText}
          </button>
        </div>
      </section>
    </div>
  );
}
