import { AudioLines, Scissors, Sparkles } from "lucide-react";

import type { MediaProcessingTaskSnapshot } from "./appTypes";

export type MediaProcessingTaskState = MediaProcessingTaskSnapshot & {
  isDialogOpen: boolean;
};

type MediaProcessingTaskDialogProps = {
  task: MediaProcessingTaskState | null;
  onCancel: () => void;
  onRunInBackground: () => void;
};

export function MediaProcessingTaskDialog({ task, onCancel, onRunInBackground }: MediaProcessingTaskDialogProps) {
  if (!task?.isDialogOpen) return null;
  const isLada = task.kind === "lada";
  const isSubtitleGeneration = task.kind === "subtitle-generation";
  const title = isLada ? "正在修复马赛克" : isSubtitleGeneration ? "正在生成日语字幕" : "正在生成剪辑版";
  const progressLabel = isLada ? "马赛克修复进度" : isSubtitleGeneration ? "字幕生成进度" : "剪辑进度";
  const Icon = isLada ? Sparkles : isSubtitleGeneration ? AudioLines : Scissors;

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="compatible-media-dialog highlight-montage-dialog" role="dialog" aria-modal="true" aria-labelledby="media-processing-task-title">
        <div className="dialog-icon"><Icon size={28} className="spin-icon" /></div>
        <div className="dialog-copy">
          <h2 id="media-processing-task-title">{title}</h2>
          <p>可以收起到后台继续使用播放器；刷新或关闭页面不会取消任务。</p>
        </div>
        <div className="compatible-media-dialog-file"><strong>{task.videoName}</strong><span>{task.status}</span></div>
        <div className="compatible-media-progress" aria-label={`${progressLabel} ${Math.round(task.progress)}%`}>
          <div className="compatible-media-progress-track"><span style={{ width: `${task.progress}%` }} /></div>
          <small>{Math.round(task.progress)}%</small>
        </div>
        <div className="dialog-actions">
          <button className="secondary-button" type="button" onClick={onCancel} disabled={task.state === "cancelling"}>
            {task.state === "cancelling" ? "正在取消" : "取消任务"}
          </button>
          <button className="primary-button" type="button" onClick={onRunInBackground}>后台运行</button>
        </div>
      </section>
    </div>
  );
}
