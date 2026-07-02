import { RefreshCw, Trash2 } from "lucide-react";

export type CompatibleMediaConfirmState = {
  label: string;
  rootId: string;
  relativePath: string;
  videoId: string;
  videoName: string;
};

export type CompatibleMediaDeleteConfirmState = {
  rootId: string;
  relativePath: string;
  videoId: string;
  videoName: string;
};

export type CompatibleMediaTaskState = {
  label: string;
  videoName: string;
  progress: number;
  status: string;
};

type CompatibleMediaDialogsProps = {
  confirm: CompatibleMediaConfirmState | null;
  task: CompatibleMediaTaskState | null;
  deleteConfirm: CompatibleMediaDeleteConfirmState | null;
  message: string;
  isDeleting: boolean;
  onCloseConfirm: () => void;
  onCreate: () => void;
  onCancelTask: () => void;
  onCloseDeleteConfirm: () => void;
  onDelete: () => void;
};

export function CompatibleMediaDialogs({
  confirm,
  task,
  deleteConfirm,
  message,
  isDeleting,
  onCloseConfirm,
  onCreate,
  onCancelTask,
  onCloseDeleteConfirm,
  onDelete,
}: CompatibleMediaDialogsProps) {
  return (
    <>
      {confirm ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={onCloseConfirm}>
          <section
            aria-labelledby="compatible-media-confirm-title"
            aria-modal="true"
            className="compatible-media-dialog"
            role="dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="dialog-icon">
              <RefreshCw size={28} />
            </div>
            <div className="dialog-copy">
              <h2 id="compatible-media-confirm-title">{confirm.label}？</h2>
              <p>播放器会用 ffmpeg 复制原视频和音频流，重新写入 MP4 封装、索引和 faststart 信息，不会转码、不会降低画质，也不会覆盖原文件。</p>
            </div>
            <div className="compatible-media-dialog-file">
              <strong>{confirm.videoName}</strong>
              <span>输出会保存到项目本地缓存目录，耗时主要取决于文件大小和磁盘速度。</span>
            </div>
            <div className="dialog-actions">
              <button className="secondary-button" type="button" onClick={onCloseConfirm}>
                取消
              </button>
              <button className="primary-button" type="button" onClick={onCreate}>
                <RefreshCw size={18} />
                开始生成
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {task ? (
        <div className="modal-backdrop" role="presentation">
          <section
            aria-labelledby="compatible-media-title"
            aria-modal="true"
            className="compatible-media-dialog"
            role="dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="dialog-icon">
              <RefreshCw size={28} className="spin-icon" />
            </div>
            <div className="dialog-copy">
              <h2 id="compatible-media-title">{task.label}</h2>
              <p>正在生成本地缓存文件，完成后播放器会自动优先使用修复版本。</p>
            </div>
            <div className="compatible-media-dialog-file">
              <strong>{task.videoName}</strong>
              <span>{task.status}</span>
            </div>
            <div className="compatible-media-progress" aria-label={`生成进度 ${Math.round(task.progress)}%`}>
              <div className="compatible-media-progress-track">
                <span style={{ width: `${task.progress}%` }} />
              </div>
              <small>{Math.round(task.progress)}%</small>
            </div>
            <div className="dialog-actions">
              <button className="secondary-button" type="button" onClick={onCancelTask}>
                取消生成
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {deleteConfirm ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => {
            if (!isDeleting) onCloseDeleteConfirm();
          }}
        >
          <section
            aria-labelledby="compatible-media-delete-title"
            aria-modal="true"
            className="delete-dialog"
            role="dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="dialog-icon danger">
              <Trash2 size={28} />
            </div>
            <div className="dialog-copy">
              <h2 id="compatible-media-delete-title">删除修复版？</h2>
              <p>只会删除项目本地缓存目录里的修复 MP4，不会删除原视频。删除后播放器会切回原版。</p>
            </div>
            <div className="delete-file-preview">
              <strong>{deleteConfirm.videoName}</strong>
              <span>{message || "修复版可重新生成。"}</span>
            </div>
            <div className="dialog-actions">
              <button className="secondary-button" type="button" onClick={onCloseDeleteConfirm} disabled={isDeleting}>
                取消
              </button>
              <button className="danger-button" type="button" onClick={onDelete} disabled={isDeleting}>
                <Trash2 size={18} />
                {isDeleting ? "删除中..." : "删除修复版"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
