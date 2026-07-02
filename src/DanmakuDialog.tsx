import { Trash2, X } from "lucide-react";

import { danmakuSpeedMax, danmakuSpeedMin, danmakuSpeedStep } from "./playerConstants";
import { formatDanmakuProviderLabel, formatDanmakuSpeedLevel } from "./danmakuUtils";
import type { DanmakuPreferences, DanmakuSource, DanmakuSourceBreakdown } from "./playerTypes";

type DanmakuDialogProps = {
  isOpen: boolean;
  currentVideoName: string;
  currentDanmakuSource: DanmakuSource | null;
  danmakuSourceBreakdown: DanmakuSourceBreakdown[];
  danmakuSourceTotalCount: number;
  isDanmakuSourceDetailOpen: boolean;
  danmakuManualUrl: string;
  danmakuPreferences: DanmakuPreferences;
  isDanmakuLoading: boolean;
  danmakuMessage: string;
  onClose: () => void;
  onToggleSourceDetail: () => void;
  onManualUrlChange: (value: string) => void;
  onFetchManualUrl: (url: string) => void;
  onRemoveMatch: () => void;
  onReplacePreferences: (preferences: DanmakuPreferences) => void;
};

export function DanmakuDialog({
  isOpen,
  currentVideoName,
  currentDanmakuSource,
  danmakuSourceBreakdown,
  danmakuSourceTotalCount,
  isDanmakuSourceDetailOpen,
  danmakuManualUrl,
  danmakuPreferences,
  isDanmakuLoading,
  danmakuMessage,
  onClose,
  onToggleSourceDetail,
  onManualUrlChange,
  onFetchManualUrl,
  onRemoveMatch,
  onReplacePreferences,
}: DanmakuDialogProps) {
  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section role="dialog" aria-modal="true" aria-labelledby="danmaku-title" className="danmaku-dialog">
        <header className="danmaku-dialog-header">
          <h2 id="danmaku-title">追番弹幕</h2>
          <button aria-label="关闭" className="dialog-close" type="button" onClick={onClose} title="关闭弹幕设置">
            <X size={18} />
          </button>
        </header>

        <div className="danmaku-dialog-grid">
          <section className="danmaku-panel">
            <div className="danmaku-source-card-list">
              {currentDanmakuSource && danmakuSourceBreakdown.length ? (
                danmakuSourceBreakdown.map((source, index) => (
                  <article className="danmaku-source-card" key={`${source.provider}:${source.sourceUrl || source.label}`}>
                    <div className="danmaku-source-card-main">
                      <strong>{source.label}</strong>
                      <span>
                        {formatDanmakuProviderLabel(source.provider)} · {source.commentCount} 条
                      </span>
                    </div>
                    {index === 0 ? (
                      <button
                        className="icon-button danmaku-source-delete"
                        type="button"
                        onClick={onRemoveMatch}
                        disabled={isDanmakuLoading}
                        aria-label="删除全部弹幕匹配"
                        title="删除全部弹幕匹配"
                      >
                        <Trash2 size={15} />
                      </button>
                    ) : null}
                  </article>
                ))
              ) : (
                <div className="danmaku-source-empty">
                  <strong>未加载弹幕</strong>
                  <span>{currentVideoName || "未选择视频"}</span>
                </div>
              )}
              {currentDanmakuSource ? (
                <div className="danmaku-source-summary">
                  <span>共 {danmakuSourceTotalCount} 条弹幕</span>
                  <button className="secondary-button compact" type="button" onClick={onToggleSourceDetail}>
                    {isDanmakuSourceDetailOpen ? "收起来源详情" : "查看来源详情"}
                  </button>
                </div>
              ) : null}
              {currentDanmakuSource && isDanmakuSourceDetailOpen ? (
                <div className="danmaku-source-detail-list">
                  {danmakuSourceBreakdown.map((source) => (
                    <div className="danmaku-source-detail" key={`detail:${source.provider}:${source.sourceUrl || source.label}`}>
                      <strong>{source.label}</strong>
                      <span>
                        {source.commentCount} 条{source.translatedCount ? ` · ${source.translatedCount} 条可简体显示` : ""}
                      </span>
                      {source.sourceUrl ? <span className="danmaku-source-url">{source.sourceUrl}</span> : null}
                      {source.children?.length ? (
                        <div className="danmaku-source-child-list">
                          {source.children.map((child) => (
                            <span key={`${child.label}:${child.commentCount}`}>
                              {child.label}：{child.commentCount} 条
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="danmaku-manual-source">
              <label className="danmaku-field">
                <span>弹幕链接</span>
                <input
                  value={danmakuManualUrl}
                  onChange={(event) => onManualUrlChange(event.target.value)}
                  placeholder="https://www.bilibili.com/video/BV... 或 https://ani.gamer.com.tw/animeVideo.php?sn=..."
                  disabled={isDanmakuLoading}
                />
              </label>
              <div className="danmaku-bottom-actions">
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => onFetchManualUrl(danmakuManualUrl)}
                  disabled={!danmakuManualUrl.trim() || isDanmakuLoading}
                >
                  拉取链接弹幕
                </button>
              </div>
            </div>
          </section>

          <section className="danmaku-panel">
            <div className="danmaku-panel-header">
              <strong>显示设置</strong>
            </div>
            <div className="danmaku-toggle-line">
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={danmakuPreferences.enabled}
                  onChange={(event) =>
                    onReplacePreferences({ ...danmakuPreferences, enabled: event.target.checked, opacity: 1 })
                  }
                />
                <span>显示弹幕</span>
              </label>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={danmakuPreferences.showSimplified}
                  onChange={(event) =>
                    onReplacePreferences({ ...danmakuPreferences, showSimplified: event.target.checked, opacity: 1 })
                  }
                />
                <span>优先显示简体中文</span>
              </label>
            </div>
            <label className="danmaku-field">
              <span>速度 {formatDanmakuSpeedLevel(danmakuPreferences.speed)}</span>
              <input
                aria-label="弹幕速度"
                type="range"
                min={danmakuSpeedMin}
                max={danmakuSpeedMax}
                step={danmakuSpeedStep}
                value={danmakuPreferences.speed}
                onChange={(event) => onReplacePreferences({ ...danmakuPreferences, speed: Number(event.target.value) })}
              />
            </label>
            <label className="danmaku-field">
              <span>密度 {Math.round(danmakuPreferences.density * 100)}%</span>
              <input
                type="range"
                min={0.2}
                max={1}
                step={0.05}
                value={danmakuPreferences.density}
                onChange={(event) => onReplacePreferences({ ...danmakuPreferences, density: Number(event.target.value) })}
              />
            </label>
            <label className="danmaku-field">
              <span>显示区域 {Math.round(danmakuPreferences.displayArea * 100)}%</span>
              <input
                type="range"
                min={0.25}
                max={1}
                step={0.05}
                value={danmakuPreferences.displayArea}
                onChange={(event) => onReplacePreferences({ ...danmakuPreferences, displayArea: Number(event.target.value) })}
              />
            </label>
            <label className="danmaku-field">
              <span>字号 {Math.round(danmakuPreferences.fontSize)}px</span>
              <input
                type="range"
                min={14}
                max={36}
                step={1}
                value={danmakuPreferences.fontSize}
                onChange={(event) => onReplacePreferences({ ...danmakuPreferences, fontSize: Number(event.target.value) })}
              />
            </label>
          </section>
        </div>

        <span className={isDanmakuLoading ? "ai-loading" : "ai-empty-state"}>
          {danmakuMessage || "匹配或拉取 Bilibili / 巴哈姆特动画疯弹幕后显示在视频上方。"}
        </span>
      </section>
    </div>
  );
}
