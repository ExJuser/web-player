import { ChevronLeft, ChevronRight, HardDrive, RefreshCw, Trash2, X } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";

import { cacheStatusPageSize, type CacheStatus, type CacheStatusItem } from "./cacheStatusUtils";

type CacheStatusDialogProps = {
  isOpen: boolean;
  isClearConfirmOpen: boolean;
  cacheStatus: CacheStatus | null;
  cacheStatusItems: CacheStatusItem[];
  cacheStatusMessage: string;
  isCacheStatusLoading: boolean;
  isClearingCache: boolean;
  isAllCacheSelected: boolean;
  selectedCacheItemIds: Set<string>;
  selectedCacheItems: CacheStatusItem[];
  selectedCacheBytes: number;
  selectedCacheFiles: number;
  pagedCacheStatusItems: CacheStatusItem[];
  cacheStatusPageStart: number;
  cacheStatusPageEnd: number;
  visibleCacheStatusPage: number;
  cacheStatusPageCount: number;
  onClose: () => void;
  onCloseClearConfirm: () => void;
  onToggleAllCacheItems: () => void;
  onToggleCacheItemSelection: (id: string, checked: boolean) => void;
  onCacheStatusPageChange: Dispatch<SetStateAction<number>>;
  onLoadCacheStatus: () => void;
  onRequestClearSelectedCache: () => void;
  onConfirmClearSelectedCache: () => void;
  formatFileSize: (bytes: number) => string;
  formatModifiedTime: (time: number) => string;
};

export function CacheStatusDialog({
  isOpen,
  isClearConfirmOpen,
  cacheStatus,
  cacheStatusItems,
  cacheStatusMessage,
  isCacheStatusLoading,
  isClearingCache,
  isAllCacheSelected,
  selectedCacheItemIds,
  selectedCacheItems,
  selectedCacheBytes,
  selectedCacheFiles,
  pagedCacheStatusItems,
  cacheStatusPageStart,
  cacheStatusPageEnd,
  visibleCacheStatusPage,
  cacheStatusPageCount,
  onClose,
  onCloseClearConfirm,
  onToggleAllCacheItems,
  onToggleCacheItemSelection,
  onCacheStatusPageChange,
  onLoadCacheStatus,
  onRequestClearSelectedCache,
  onConfirmClearSelectedCache,
  formatFileSize,
  formatModifiedTime,
}: CacheStatusDialogProps) {
  return (
    <>
      {isOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
          <div
            aria-labelledby="cache-status-title"
            aria-modal="true"
            className="cache-status-modal-shell"
            role="dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <section className="cache-status-dialog">
              <div className="cache-status-dialog-header">
                <div className="dialog-icon">
                  <HardDrive size={28} />
                </div>
                <div>
                  <h2 id="cache-status-title">本地缓存状态</h2>
                  <span>{cacheStatus?.rootPath || ".local-web-player-data"}</span>
                </div>
              </div>

              <div className="cache-status-overview">
                <div>
                  <strong>{cacheStatus ? formatFileSize(cacheStatus.totalBytes) : "0 B"}</strong>
                  <span>总大小</span>
                </div>
                <div>
                  <strong>{cacheStatus?.totalFiles ?? 0}</strong>
                  <span>文件数</span>
                </div>
                <div>
                  <strong>{cacheStatus?.items.length ?? 0}</strong>
                  <span>缓存种类</span>
                </div>
                <div>
                  <strong>{cacheStatus?.updatedAt ? formatModifiedTime(cacheStatus.updatedAt) : "暂无缓存"}</strong>
                  <span>最近更新</span>
                </div>
              </div>

              {cacheStatusMessage ? <div className="ai-empty-state">{cacheStatusMessage}</div> : null}
              {isCacheStatusLoading && !cacheStatus ? <div className="ai-loading">正在读取缓存状态...</div> : null}

              <div className="cache-status-toolbar">
                <button
                  className={`cache-select-all-button ${isAllCacheSelected ? "active" : ""}`}
                  type="button"
                  onClick={onToggleAllCacheItems}
                  disabled={!cacheStatusItems.length || isCacheStatusLoading || isClearingCache}
                >
                  {isAllCacheSelected ? "取消全选" : "全选"}
                </button>
                <span>
                  已选择 {selectedCacheItems.length} 项 · {formatFileSize(selectedCacheBytes)} · {selectedCacheFiles} 个文件
                </span>
              </div>

              <div className="cache-status-list">
                {pagedCacheStatusItems.map((item) => (
                  <label
                    className={`cache-status-row ${selectedCacheItemIds.has(item.id) ? "selected" : ""} ${item.clearable === false ? "disabled" : ""}`}
                    key={item.id}
                  >
                    <span className="cache-status-check">
                      <input
                        type="checkbox"
                        checked={selectedCacheItemIds.has(item.id)}
                        onChange={(event) => onToggleCacheItemSelection(item.id, event.target.checked)}
                        disabled={isClearingCache || item.clearable === false}
                      />
                    </span>
                    <span className="cache-status-row-main">
                      <strong>{item.label}</strong>
                      <span>{item.path}</span>
                      {item.clearable === false ? <small>仅统计展示，不支持从这里清除。</small> : null}
                      {item.error ? <small>{item.error}</small> : null}
                    </span>
                    <dl>
                      <div>
                        <dt>{item.memoryBytes === undefined ? "大小" : "磁盘 / 内存"}</dt>
                        <dd>{formatFileSize(item.bytes)}{item.memoryBytes === undefined ? "" : ` / ${formatFileSize(item.memoryBytes)}`}</dd>
                      </div>
                      <div>
                        <dt>{item.memoryEntries === undefined ? "数量" : "文件 / 内存"}</dt>
                        <dd>{item.files}{item.memoryEntries === undefined ? "" : ` / ${item.memoryEntries} 张`}</dd>
                      </div>
                      <div>
                        <dt>更新</dt>
                        <dd>{item.updatedAt ? formatModifiedTime(item.updatedAt) : "暂无缓存"}</dd>
                      </div>
                    </dl>
                  </label>
                ))}
                {!cacheStatus?.items.length && !isCacheStatusLoading ? (
                  <div className="ai-empty-state">暂无缓存状态。</div>
                ) : null}
              </div>

              {cacheStatusItems.length > cacheStatusPageSize ? (
                <nav className="cache-status-pagination" aria-label="缓存状态分页">
                  <span>
                    {cacheStatusPageStart}-{cacheStatusPageEnd} / {cacheStatusItems.length}
                  </span>
                  <div>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => onCacheStatusPageChange((page) => Math.max(page - 1, 1))}
                      disabled={visibleCacheStatusPage <= 1}
                    >
                      <ChevronLeft size={16} />
                      上一页
                    </button>
                    <strong>{visibleCacheStatusPage} / {cacheStatusPageCount}</strong>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => onCacheStatusPageChange((page) => Math.min(page + 1, cacheStatusPageCount))}
                      disabled={visibleCacheStatusPage >= cacheStatusPageCount}
                    >
                      下一页
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </nav>
              ) : null}
            </section>

            <div className="cache-status-dialog-actions">
              <button className="secondary-button" type="button" onClick={onLoadCacheStatus} disabled={isCacheStatusLoading}>
                <RefreshCw size={17} />
                重新检查
              </button>
              <button
                className="danger-button"
                type="button"
                onClick={onRequestClearSelectedCache}
                disabled={!selectedCacheItems.length || isClearingCache}
              >
                <Trash2 size={17} />
                清除选中缓存
              </button>
              <button className="primary-button" type="button" onClick={onClose}>
                关闭
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {isClearConfirmOpen ? (
        <div className="modal-backdrop nested" role="presentation" onMouseDown={onCloseClearConfirm}>
          <section
            aria-labelledby="clear-cache-title"
            aria-modal="true"
            className="delete-dialog"
            role="dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              aria-label="关闭"
              className="dialog-close"
              type="button"
              onClick={onCloseClearConfirm}
              disabled={isClearingCache}
            >
              <X size={18} />
            </button>
            <div className="dialog-icon danger">
              <Trash2 size={28} />
            </div>
            <div className="dialog-copy">
              <h2 id="clear-cache-title">确认清除缓存？</h2>
              <p>将删除选中的本地缓存文件。播放数据、缩略图、字幕和 AI 结果被清除后会在需要时重新生成。</p>
            </div>
            <div className="delete-file-preview">
              <strong>{selectedCacheItems.length} 项缓存 · {formatFileSize(selectedCacheBytes)}</strong>
              <span>{selectedCacheFiles} 个文件</span>
            </div>
            <div className="dialog-actions">
              <button className="secondary-button" type="button" onClick={onCloseClearConfirm} disabled={isClearingCache}>
                取消
              </button>
              <button className="danger-button" type="button" onClick={onConfirmClearSelectedCache} disabled={isClearingCache}>
                <Trash2 size={18} />
                {isClearingCache ? "正在清除..." : "确认清除"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
