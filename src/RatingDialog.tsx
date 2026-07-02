import { Star, X } from "lucide-react";

type RatingDialogProps = {
  isOpen: boolean;
  videoName: string;
  ratingInput: string;
  ratingCommentInput: string;
  ratingHoverValue: number | null;
  ratingMessage: string;
  onClose: () => void;
  onSave: () => void;
  onClear: () => void;
  onRatingInputChange: (value: string) => void;
  onRatingCommentInputChange: (value: string) => void;
  onRatingHoverValueChange: (value: number | null) => void;
  onRatingMessageChange: (value: string) => void;
};

export function RatingDialog({
  isOpen,
  videoName,
  ratingInput,
  ratingCommentInput,
  ratingHoverValue,
  ratingMessage,
  onClose,
  onSave,
  onClear,
  onRatingInputChange,
  onRatingCommentInputChange,
  onRatingHoverValueChange,
  onRatingMessageChange,
}: RatingDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop tag-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="rating-dialog-title"
        aria-modal="true"
        className="tag-dialog rating-dialog"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button aria-label="关闭" className="dialog-close" type="button" onClick={onClose}>
          <X size={18} />
        </button>
        <div className="tag-dialog-header rating-dialog-header">
          <div className="dialog-icon">
            <Star size={28} />
          </div>
          <div className="dialog-copy">
            <h2 id="rating-dialog-title">视频评分</h2>
            <p>{videoName || "未选择视频"}</p>
          </div>
        </div>

        <form
          className="rating-editor-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSave();
          }}
        >
          <div
            className="rating-star-picker"
            role="radiogroup"
            aria-label="视频评分"
            onMouseLeave={() => onRatingHoverValueChange(null)}
          >
            {Array.from({ length: 10 }, (_, index) => {
              const value = index + 1;
              const selectedRating = ratingHoverValue ?? (Number(ratingInput) || 0);
              const isActive = value <= selectedRating;
              return (
                <button
                  autoFocus={value === Math.max(1, Math.min(10, Math.round(selectedRating || 1)))}
                  className={isActive ? "active" : ""}
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={Number(ratingInput) === value}
                  aria-label={`${value} 分`}
                  title={`${value} 分`}
                  onClick={() => {
                    onRatingInputChange(String(value));
                    onRatingMessageChange("");
                  }}
                  onBlur={() => onRatingHoverValueChange(null)}
                  onMouseEnter={() => onRatingHoverValueChange(value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") onClose();
                  }}
                >
                  <Star size={24} fill={isActive ? "currentColor" : "currentColor"} />
                </button>
              );
            })}
          </div>
          <div className="rating-editor-status">
            {ratingInput ? `${ratingInput} / 10` : "未评分"}
          </div>
          <textarea
            className="rating-comment-input"
            rows={3}
            value={ratingCommentInput}
            placeholder="输入评价"
            onChange={(event) => onRatingCommentInputChange(event.currentTarget.value)}
          />
          <div className="rating-editor-actions">
            <button className="primary-button" type="submit">
              保存
            </button>
            <button className="secondary-button" type="button" onClick={onClear}>
              清除
            </button>
          </div>
        </form>

        {ratingMessage ? <div className="ai-empty-state">{ratingMessage}</div> : null}
      </section>
    </div>
  );
}
