import { HardDrive, Subtitles } from "lucide-react";

import type { LocalMediaRoot } from "./mediaRootScanCache";
import type { HomeVideoCard } from "./playerTypes";

type HomeRecapCardProps = {
  canUseRecapSubtitle: boolean;
  canUseEmbeddedSubtitles: boolean;
  formatProgressLabel: (card: HomeVideoCard) => string;
  homeRecapCard: HomeVideoCard | null | undefined;
  homeRecapMediaRoot: LocalMediaRoot | null | undefined;
  homeRecapSubtitle: unknown;
  homeRecapVideoId: string;
  homeProgressRecap: string;
  homeProgressRecapMessage: string;
  homeProgressRecapVideoId: string;
  isAiConfigured: boolean;
  isLoading: boolean;
  onConfigureLocalPath: (mediaRoot: LocalMediaRoot) => void;
  onLoadRecap: () => void;
};

export function HomeRecapCard({
  canUseRecapSubtitle,
  canUseEmbeddedSubtitles,
  formatProgressLabel,
  homeRecapCard,
  homeRecapMediaRoot,
  homeRecapSubtitle,
  homeRecapVideoId,
  homeProgressRecap,
  homeProgressRecapMessage,
  homeProgressRecapVideoId,
  isAiConfigured,
  isLoading,
  onConfigureLocalPath,
  onLoadRecap,
}: HomeRecapCardProps) {
  const output = homeRecapCard
    ? homeProgressRecapVideoId === homeRecapVideoId && homeProgressRecap
      ? homeProgressRecap
      : homeProgressRecapMessage ||
        (homeRecapSubtitle
          ? "根据当前进度前的字幕生成回顾，不包含后续剧情。"
          : canUseEmbeddedSubtitles
            ? "可自动提取内封文本字幕，并根据当前进度生成回顾。"
            : homeRecapMediaRoot?.source === "browser"
              ? "浏览器添加的媒体库只能播放和匹配外置字幕；自动提取内封字幕需要在服务端配置该媒体库的本机绝对路径。"
              : "没有匹配字幕，暂时无法生成回顾。")
    : "当前没有可回顾的观看进度。播放一集并保留进度后，就能在这里生成无剧透回顾。";
  const showConfigureLocalPath = Boolean(
    homeRecapCard && homeRecapMediaRoot?.source === "browser" && !homeRecapMediaRoot.localPath,
  );

  return (
    <section className="home-section home-recap-card">
      <div className="home-section-header">
        <h2>无剧透回顾</h2>
        <span>{homeRecapCard ? formatProgressLabel(homeRecapCard) : "等待观看进度"}</span>
      </div>
      {homeRecapCard ? (
        <div className="home-recap-target">
          <Subtitles size={22} />
          <div>
            <strong>{homeRecapCard.video.name}</strong>
            <span>{homeRecapCard.seriesTitle}</span>
          </div>
        </div>
      ) : null}
      <div className="home-recap-output">{output}</div>
      {showConfigureLocalPath && homeRecapMediaRoot ? (
        <button
          className="secondary-button home-recap-button"
          type="button"
          onClick={() => onConfigureLocalPath(homeRecapMediaRoot)}
        >
          <HardDrive size={16} />
          配置本机路径
        </button>
      ) : null}
      <button
        className="secondary-button home-recap-button"
        type="button"
        onClick={onLoadRecap}
        disabled={isLoading || !homeRecapCard || !isAiConfigured || !canUseRecapSubtitle}
        title={!homeRecapCard ? "当前没有可回顾的观看进度" : !isAiConfigured ? "未配置 DEEPSEEK_API_KEY" : undefined}
      >
        {homeProgressRecap ? "重新生成" : isLoading ? "生成中..." : "生成回顾"}
      </button>
    </section>
  );
}
