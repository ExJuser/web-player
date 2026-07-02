import { ChevronLeft, ChevronRight } from "lucide-react";

type PhotoAlbumPaginationProps = {
  currentPage: number;
  end: number;
  pageCount: number;
  start: number;
  total: number;
  onNext: () => void;
  onPrevious: () => void;
};

export function PhotoAlbumPagination({
  currentPage,
  end,
  pageCount,
  start,
  total,
  onNext,
  onPrevious,
}: PhotoAlbumPaginationProps) {
  if (pageCount <= 1) {
    return null;
  }

  return (
    <nav className="photo-pagination" aria-label="看图分页">
      <span>
        {start}-{end} / {total}
      </span>
      <div>
        <button
          className="secondary-button"
          type="button"
          onClick={onPrevious}
          disabled={currentPage <= 1}
        >
          <ChevronLeft size={16} />
          上一页
        </button>
        <strong>{currentPage} / {pageCount}</strong>
        <button
          className="secondary-button"
          type="button"
          onClick={onNext}
          disabled={currentPage >= pageCount}
        >
          下一页
          <ChevronRight size={16} />
        </button>
      </div>
    </nav>
  );
}
