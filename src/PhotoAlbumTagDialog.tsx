import { Tags, X } from "lucide-react";

import type { PhotoAlbum } from "./playerTypes";

type PhotoAlbumTagDialogProps = {
  album: PhotoAlbum | null;
  tags: string[];
  tagInput: string;
  message: string;
  onClose: () => void;
  onAddTags: () => void;
  onRemoveTag: (tag: string) => void;
  onTagInputChange: (value: string) => void;
};

export function PhotoAlbumTagDialog({
  album,
  tags,
  tagInput,
  message,
  onClose,
  onAddTags,
  onRemoveTag,
  onTagInputChange,
}: PhotoAlbumTagDialogProps) {
  if (!album) return null;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="photo-album-tag-dialog-title"
        aria-modal="true"
        className="tag-dialog photo-album-tag-dialog"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button aria-label="关闭" className="dialog-close" type="button" onClick={onClose}>
          <X size={18} />
        </button>
        <div className="tag-dialog-header auto-tag-dialog-header">
          <div className="dialog-icon">
            <Tags size={28} />
          </div>
          <div className="dialog-copy">
            <h2 id="photo-album-tag-dialog-title">图集标签</h2>
            <p>{album.title}</p>
          </div>
        </div>

        <div className="tag-editor-current">
          {tags.length ? (
            tags.map((tag) => (
              <button className="tag-editor-chip" key={tag} type="button" onClick={() => onRemoveTag(tag)}>
                <span>{tag}</span>
                <X size={14} />
              </button>
            ))
          ) : (
            <div className="ai-empty-state">当前图集还没有标签。</div>
          )}
        </div>

        <form
          className="tag-editor-form"
          onSubmit={(event) => {
            event.preventDefault();
            onAddTags();
          }}
        >
          <input
            autoFocus
            value={tagInput}
            placeholder="输入标签，可用空格、逗号、顿号分隔"
            onChange={(event) => onTagInputChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") onClose();
            }}
          />
          <button className="primary-button" type="submit" disabled={!tagInput.trim()}>
            添加
          </button>
        </form>

        {message ? <div className="ai-empty-state">{message}</div> : null}
      </section>
    </div>
  );
}
