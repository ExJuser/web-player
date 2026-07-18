import { useState } from "react";
import { CheckCircle2, Scissors } from "lucide-react";

import type { VideoEditSegment, VideoHighlightSegment } from "./playerTypes";

export type HighlightMontageMode = "lossless" | "precise";

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

export type HighlightMontageResultState = {
  fileName: string;
  mode: HighlightMontageMode;
  relativePath: string;
  durationSeconds: number;
};

type HighlightMontageDialogsProps = {
  confirm: HighlightMontageConfirmState | null;
  result: HighlightMontageResultState | null;
  formatTime: (time: number) => string;
  onCloseConfirm: () => void;
  onCreate: (mode: HighlightMontageMode) => void;
  onCloseResult: () => void;
};

export function HighlightMontageDialogs({
  confirm,
  result,
  formatTime,
  onCloseConfirm,
  onCreate,
  onCloseResult,
}: HighlightMontageDialogsProps) {
  const [mode, setMode] = useState<HighlightMontageMode>("lossless");
  const closeConfirm = () => {
    setMode("lossless");
    onCloseConfirm();
  };
  const createMontage = () => {
    onCreate(mode);
    setMode("lossless");
  };

  return (
    <>
      {confirm ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeConfirm}>
          <section className="compatible-media-dialog highlight-montage-dialog" role="dialog" aria-modal="true" aria-labelledby="highlight-montage-confirm-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="dialog-icon"><Scissors size={28} /></div>
            <div className="dialog-copy">
              <h2 id="highlight-montage-confirm-title">生成剪辑版？</h2>
              <p>按时间顺序拼接所有剪辑保留片段，原片不会被覆盖。</p>
            </div>
            <fieldset className="highlight-montage-mode-picker">
              <legend>生成方式</legend>
              <label className={mode === "lossless" ? "selected" : ""}>
                <input type="radio" name="highlight-montage-mode" value="lossless" checked={mode === "lossless"} onChange={() => setMode("lossless")} />
                <span><strong>快速无损</strong><small>直接复制码流，速度最快且不损失画质；切点会受关键帧影响，可能多出少量画面。</small></span>
              </label>
              <label className={mode === "precise" ? "selected" : ""}>
                <input type="radio" name="highlight-montage-mode" value="precise" checked={mode === "precise"} onChange={() => setMode("precise")} />
                <span><strong>精准 GPU</strong><small>按标记时间逐帧转码，切点准确；处理完整保留内容，因此耗时更长。</small></span>
              </label>
            </fieldset>
            <div className="compatible-media-dialog-file">
              <strong>{confirm.videoName}</strong>
              <span>{confirm.originalSegmentCount} 个标记合并为 {confirm.mergedSegmentCount} 段，预计时长 {formatTime(confirm.durationSeconds)}</span>
              <span>{mode === "lossless" ? "输出沿用原片格式" : "输出为兼容 MP4"}，命名为“原片名-edit”，重名时自动递增。</span>
            </div>
            <div className="dialog-actions">
              <button className="secondary-button" type="button" onClick={closeConfirm}>取消</button>
              <button className="primary-button" type="button" onClick={createMontage}><Scissors size={18} />开始生成</button>
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
              <p>{result.mode === "lossless"
                ? "已按关键帧快速无损拼接；实际切点和时长可能与标记范围略有差异。"
                : "高能片段已映射为成片的独立快照；下次刷新媒体库后即可在列表中看到成片。"}</p>
            </div>
            <div className="compatible-media-dialog-file"><strong>{result.fileName}</strong><span>{result.relativePath}</span><span>成片时长 {formatTime(result.durationSeconds)}</span></div>
            <div className="dialog-actions"><button className="primary-button" type="button" onClick={onCloseResult}>完成</button></div>
          </section>
        </div>
      ) : null}
    </>
  );
}
