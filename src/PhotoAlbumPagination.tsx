import { useEffect, useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

type PhotoAlbumPaginationProps = {
  currentPage: number;
  end: number;
  pageCount: number;
  start: number;
  total: number;
  onPageChange: (page: number) => void;
};

export function PhotoAlbumPagination({
  currentPage,
  end,
  pageCount,
  start,
  total,
  onPageChange,
}: PhotoAlbumPaginationProps) {
  const [pageInput, setPageInput] = useState(String(currentPage));

  useEffect(() => setPageInput(String(currentPage)), [currentPage]);

  if (pageCount <= 1) {
    return null;
  }

  const changePage = (page: number) => {
    const nextPage = Math.min(Math.max(page, 1), pageCount);
    setPageInput(String(nextPage));
    onPageChange(nextPage);
  };
  const submitPage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const page = Number.parseInt(pageInput, 10);
    if (Number.isFinite(page)) changePage(page);
    else setPageInput(String(currentPage));
  };

  return (
    <nav className="photo-pagination" aria-label="看图分页">
      <span>
        {start}-{end} / {total}
      </span>
      <div className="photo-pagination-controls">
        <button
          className="icon-button"
          type="button"
          onClick={() => changePage(currentPage - 5)}
          disabled={currentPage <= 1}
          title="向前 5 页"
          aria-label="向前 5 页"
        >
          <ChevronsLeft size={17} />
        </button>
        <button
          className="icon-button"
          type="button"
          onClick={() => changePage(currentPage - 1)}
          disabled={currentPage <= 1}
          title="上一页"
          aria-label="上一页"
        >
          <ChevronLeft size={16} />
        </button>
        <strong>{currentPage} / {pageCount}</strong>
        <button
          className="icon-button"
          type="button"
          onClick={() => changePage(currentPage + 1)}
          disabled={currentPage >= pageCount}
          title="下一页"
          aria-label="下一页"
        >
          <ChevronRight size={16} />
        </button>
        <button
          className="icon-button"
          type="button"
          onClick={() => changePage(currentPage + 5)}
          disabled={currentPage >= pageCount}
          title="向后 5 页"
          aria-label="向后 5 页"
        >
          <ChevronsRight size={17} />
        </button>
      </div>
      <form className="photo-page-jump" onSubmit={submitPage}>
        <label htmlFor="photo-page-input">跳至</label>
        <input
          id="photo-page-input"
          type="number"
          min={1}
          max={pageCount}
          value={pageInput}
          onChange={(event) => setPageInput(event.target.value)}
          aria-label={`输入页码，范围 1 到 ${pageCount}`}
        />
        <button className="secondary-button" type="submit">跳转</button>
      </form>
    </nav>
  );
}
