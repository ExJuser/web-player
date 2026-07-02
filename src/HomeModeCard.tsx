import { Play, ShieldCheck, Subtitles } from "lucide-react";

import type { HomeMediaMode } from "./playerTypes";

type HomeModeCardProps = {
  homeMediaMode: HomeMediaMode;
  homeMediaModeLabel: string;
  onModeChange: (mode: HomeMediaMode) => void;
};

export function HomeModeCard({ homeMediaMode, homeMediaModeLabel, onModeChange }: HomeModeCardProps) {
  return (
    <section className="home-mode-card">
      <div className="home-section-header">
        <h2>媒体模式</h2>
        <span>{homeMediaModeLabel}</span>
      </div>
      <div className="home-mode-switch" role="group" aria-label="首页媒体库模式">
        <button
          className={homeMediaMode === "all" ? "active" : ""}
          type="button"
          onClick={() => onModeChange("all")}
          aria-pressed={homeMediaMode === "all"}
        >
          <Play size={15} />
          全部
        </button>
        <button
          className={homeMediaMode === "anime" ? "active" : ""}
          type="button"
          onClick={() => onModeChange("anime")}
          aria-pressed={homeMediaMode === "anime"}
        >
          <Subtitles size={15} />
          追番模式
        </button>
        <button
          className={homeMediaMode === "special" ? "active" : ""}
          type="button"
          onClick={() => onModeChange("special")}
          aria-pressed={homeMediaMode === "special"}
        >
          <ShieldCheck size={15} />
          特殊模式
        </button>
      </div>
    </section>
  );
}
