import { CheckCircle2, Scissors } from "lucide-react";

import type { VideoEditSegment, VideoHighlightSegment } from "./playerTypes";

export type HighlightMontageConfirmState = {
  rootId: string;
  relativePath: string;
  sourceVideoId: string;
  videoName: string;
  segments: VideoEditSegment[];
  highlights: VideoHighlightSegment[];
  originalSegmentCount: number;
  mergedSegmentCount: number;
  durationSeconds: number;
};

export type HighlightMontageTaskState = {
  videoName: string;
  progress: number;
  status: string;
  isDialogOpen: boolean;
};

export type HighlightMontageResultState = {
  fileName: string;
  relativePath: string;
  durationSeconds: number;
};

type HighlightMontageDialogsProps = {
  confirm: HighlightMontageConfirmState | null;
  task: HighlightMontageTaskState | null;
  result: HighlightMontageResultState | null;
  formatTime: (time: number) => string;
  onCloseConfirm: () => void;
  onCreate: () => void;
  onCancelTask: () => void;
  onRunInBackground: () => void;
  onCloseResult: () => void;
};

export function HighlightMontageDialogs({
  confirm,
  task,
  result,
  formatTime,
  onCloseConfirm,
  onCreate,
  onCancelTask,
  onRunInBackground,
  onCloseResult,
}: HighlightMontageDialogsProps) {
  return (
    <>
      {confirm ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={onCloseConfirm}>
          <section className="compatible-media-dialog highlight-montage-dialog" role="dialog" aria-modal="true" aria-labelledby="highlight-montage-confirm-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="dialog-icon"><Scissors size={28} /></div>
            <div className="dialog-copy">
              <h2 id="highlight-montage-confirm-title">生成剪辑版？</h2>
              <p>将精准转码并按时间顺序拼接所有剪辑保留片段，原片不会被覆盖。</p>
            </div>
            <div className="compatible-media-dialog-file">
              <strong>{confirm.videoName}</strong>
              <span>{confirm.originalSegmentCount} 个标记合并为 {confirm.mergedSegmentCount} 段，预计时长 {formatTime(confirm.durationSeconds)}</span>
              <span>输出命名为“原片名-edit.mp4”，重名时自动递增。</span>
            </div>
            <div className="dialog-actions">
              <button className="secondary-button" type="button" onClick={onCloseConfirm}>取消</button>
              <button className="primary-button" type="button" onClick={onCreate}><Scissors size={18} />开始生成</button>
            </div>
          </section>
        </div>
      ) : null}

      {task?.isDialogOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section className="compatible-media-dialog highlight-montage-dialog" role="dialog" aria-modal="true" aria-labelledby="highlight-montage-task-title">
            <div className="dialog-icon"><Scissors size={28} className="spin-icon" /></div>
            <div className="dialog-copy">
              <h2 id="highlight-montage-task-title">正在生成剪辑版</h2>
              <p>可以收起到后台继续使用播放器；刷新或关闭页面会取消任务。</p>
            </div>
            <div className="compatible-media-dialog-file"><strong>{task.videoName}</strong><span>{task.status}</span></div>
            <div className="compatible-media-progress" aria-label={`剪辑进度 ${Math.round(task.progress)}%`}>
              <div className="compatible-media-progress-track"><span style={{ width: `${task.progress}%` }} /></div>
              <small>{Math.round(task.progress)}%</small>
            </div>
            <div className="dialog-actions">
              <button className="secondary-button" type="button" onClick={onCancelTask}>取消任务</button>
              <button className="primary-button" type="button" onClick={onRunInBackground}>后台运行</button>
            </div>
          </section>
        </div>
      ) : null}

      {result ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={onCloseResult}>
          <section className="compatible-media-dialog highlight-montage-dialog" role="dialog" aria-modal="true" aria-labelledby="highlight-montage-result-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="dialog-icon"><CheckCircle2 size={28} /></div>
            <div className="dialog-copy">
              <h2 id="highlight-montage-result-title">剪辑版已生成</h2>
              <p>高能片段已映射为成片的独立快照；下次刷新媒体库后即可在列表中看到成片。</p>
            </div>
            <div className="compatible-media-dialog-file"><strong>{result.fileName}</strong><span>{result.relativePath}</span><span>成片时长 {formatTime(result.durationSeconds)}</span></div>
            <div className="dialog-actions"><button className="primary-button" type="button" onClick={onCloseResult}>完成</button></div>
          </section>
        </div>
      ) : null}
    </>
  );
}
