import { ChevronLeft, ChevronRight, SkipForward } from "lucide-react";

import { ControlSelect } from "./ControlSelect";

type PlaylistPaginationProps = {
  endLabel: number;
  page: number;
  pageCount: number;
  pageInput: string;
  pageSize: number;
  pageSizeOptions: Array<{ value: number; label: string }>;
  startLabel: number;
  total: number;
  onCommitPageInput: () => void;
  onPageInputChange: (value: string) => void;
  onPageSizeChange: (pageSize: number) => void;
  onRequestPage: (page: number) => void;
};

export function PlaylistPagination({
  endLabel,
  page,
  pageCount,
  pageInput,
  pageSize,
  pageSizeOptions,
  startLabel,
  total,
  onCommitPageInput,
  onPageInputChange,
  onPageSizeChange,
  onRequestPage,
}: PlaylistPaginationProps) {
  if (!total) {
    return null;
  }

  return (
    <nav className="playlist-pagination" aria-label="播放列表分页">
      <button
        className="playlist-page-button"
        type="button"
        onClick={() => onRequestPage(page - 5)}
        disabled={page <= 1}
        title="向前 5 页"
        aria-label="向前 5 页"
      >
        <SkipForward className="playlist-page-skip-back" size={16} />
      </button>
      <button
        className="playlist-page-button"
        type="button"
        onClick={() => onRequestPage(page - 1)}
        disabled={page <= 1}
        title="上一页"
        aria-label="上一页"
      >
        <ChevronLeft size={16} />
      </button>
      <span className="playlist-page-status">
        {startLabel}-{endLabel} / {total}
        <small>
          第
          <label className="playlist-page-status-jump" aria-label="跳转页数">
            <input
              className="playlist-page-jump-input"
              type="number"
              min={1}
              max={pageCount}
              step={1}
              inputMode="numeric"
              value={pageInput}
              onChange={(event) => onPageInputChange(event.target.value)}
              onBlur={onCommitPageInput}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onCommitPageInput();
                }
              }}
              aria-label="输入页码跳转"
            />
          </label>
          / {pageCount} 页
        </small>
      </span>
      <button
        className="playlist-page-button"
        type="button"
        onClick={() => onRequestPage(page + 1)}
        disabled={page >= pageCount}
        title="下一页"
        aria-label="下一页"
      >
        <ChevronRight size={16} />
      </button>
      <button
        className="playlist-page-button"
        type="button"
        onClick={() => onRequestPage(page + 5)}
        disabled={page >= pageCount}
        title="向后 5 页"
        aria-label="向后 5 页"
      >
        <SkipForward className="playlist-page-skip-forward" size={16} />
      </button>
      <ControlSelect
        label="每页"
        ariaLabel="播放列表每页数量"
        value={pageSize}
        options={pageSizeOptions}
        onChange={onPageSizeChange}
        className="playlist-page-size-control"
      />
    </nav>
  );
}
