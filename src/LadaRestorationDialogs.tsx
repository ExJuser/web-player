import { CheckCircle2, LoaderCircle, Sparkles } from "lucide-react";

import { ControlSelect } from "./ControlSelect";
import type { LadaCapabilities, LadaRestoreOptions } from "./ladaPreferences";
import type { VideoHighlightSegment } from "./playerTypes";

export type LadaRestorationConfirmState = {
  rootId: string;
  relativePath: string;
  sourceVideoId: string;
  videoName: string;
  highlights: VideoHighlightSegment[];
  highlightsOnly: boolean;
  canCreateHighlightsOnly: boolean;
  capabilities: LadaCapabilities | null;
  options: LadaRestoreOptions | null;
  isLoading: boolean;
  error: string;
};

export type LadaRestorationResultState = {
  fileName: string;
  relativePath: string;
  size: number;
};

type LadaRestorationDialogsProps = {
  confirm: LadaRestorationConfirmState | null;
  result: LadaRestorationResultState | null;
  formatFileSize: (bytes: number) => string;
  onChangeOptions: (options: LadaRestoreOptions) => void;
  onChangeHighlightsOnly: (value: boolean) => void;
  onCloseConfirm: () => void;
  onCreate: () => void;
  onCloseResult: () => void;
};

export function LadaRestorationDialogs({
  confirm,
  result,
  formatFileSize,
  onChangeOptions,
  onChangeHighlightsOnly,
  onCloseConfirm,
  onCreate,
  onCloseResult,
}: LadaRestorationDialogsProps) {
  const updateOption = <K extends keyof LadaRestoreOptions>(key: K, value: LadaRestoreOptions[K]) => {
    if (confirm?.options) onChangeOptions({ ...confirm.options, [key]: value });
  };

  return (
    <>
      {confirm ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={onCloseConfirm}>
          <section className="compatible-media-dialog highlight-montage-dialog lada-restoration-dialog" role="dialog" aria-modal="true" aria-labelledby="lada-restoration-confirm-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="dialog-icon"><Sparkles size={28} /></div>
            <div className="dialog-copy">
              <h2 id="lada-restoration-confirm-title">修复影片马赛克？</h2>
              <p>{confirm.highlightsOnly
                ? `将按时间顺序拼接并修复 ${confirm.highlights.length} 个高能片段，原片和已有修复结果不会被覆盖。`
                : "将使用 LADA 处理整部原片，原片和已有修复结果不会被覆盖。"}</p>
            </div>
            <div className="compatible-media-dialog-file">
              <strong>{confirm.videoName}</strong>
              <span>输出命名为“原片名{confirm.highlightsOnly ? ".highlights" : ""}.restored.mp4”，重名时自动递增。</span>
            </div>
            {confirm.isLoading ? <div className="lada-options-status"><LoaderCircle size={17} className="spin-icon" />正在读取 LADA 设备和编码预设...</div> : null}
            {confirm.error ? <div className="lada-options-error" role="alert">{confirm.error}</div> : null}
            {confirm.capabilities && confirm.options ? (
              <div className="lada-options-grid">
                <div className="lada-option-field">
                  <ControlSelect
                    label="处理设备"
                    ariaLabel="LADA 处理设备"
                    value={confirm.options.device}
                    options={confirm.capabilities.devices}
                    onChange={(value) => updateOption("device", value)}
                  />
                </div>
                <div className="lada-option-field">
                  <ControlSelect
                    label="编码预设"
                    ariaLabel="LADA 编码预设"
                    value={confirm.options.encodingPreset}
                    options={confirm.capabilities.encodingPresets}
                    onChange={(value) => updateOption("encodingPreset", value)}
                  />
                </div>
                <div className="lada-option-toggles">
                  <label className="toggle-row">
                    <input
                      type="checkbox"
                      checked={confirm.highlightsOnly}
                      disabled={!confirm.highlights.length || !confirm.canCreateHighlightsOnly}
                      onChange={(event) => onChangeHighlightsOnly(event.target.checked)}
                    />
                    仅修复高能片段并自动拼接
                  </label>
                  <label className="toggle-row"><input type="checkbox" checked={confirm.options.fp16} onChange={(event) => updateOption("fp16", event.target.checked)} />启用 FP16</label>
                  <label className="toggle-row"><input type="checkbox" checked={confirm.options.detectFaceMosaics} onChange={(event) => updateOption("detectFaceMosaics", event.target.checked)} />检测并跳过人脸马赛克</label>
                </div>
              </div>
            ) : null}
            {!confirm.highlights.length ? <div className="lada-options-error">当前影片没有高能片段，无法使用片段修复。</div> : null}
            {confirm.highlights.length && !confirm.canCreateHighlightsOnly ? <div className="lada-options-error">仅修复高能片段需要 ffmpeg 和 ffprobe。</div> : null}
            <div className="dialog-actions">
              <button className="secondary-button" type="button" onClick={onCloseConfirm}>取消</button>
              <button className="primary-button" type="button" onClick={onCreate} disabled={confirm.isLoading || !confirm.options || Boolean(confirm.error)}><Sparkles size={18} />开始修复</button>
            </div>
          </section>
        </div>
      ) : null}

      {result ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={onCloseResult}>
          <section className="compatible-media-dialog highlight-montage-dialog" role="dialog" aria-modal="true" aria-labelledby="lada-restoration-result-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="dialog-icon"><CheckCircle2 size={28} /></div>
            <div className="dialog-copy">
              <h2 id="lada-restoration-result-title">马赛克修复已完成</h2>
              <p>下次刷新媒体库后即可在列表中看到修复结果。</p>
            </div>
            <div className="compatible-media-dialog-file"><strong>{result.fileName}</strong><span>{result.relativePath}</span><span>{formatFileSize(result.size)}</span></div>
            <div className="dialog-actions"><button className="primary-button" type="button" onClick={onCloseResult}>完成</button></div>
          </section>
        </div>
      ) : null}
    </>
  );
}
