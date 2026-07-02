import { Star } from "lucide-react";

import type { PlaylistFilter } from "./playerTypes";

type PlaylistFilterControlProps = {
  disabled: boolean;
  filter: PlaylistFilter;
  onChange: (filter: PlaylistFilter) => void;
};

export function PlaylistFilterControl({ disabled, filter, onChange }: PlaylistFilterControlProps) {
  return (
    <div className="playlist-filter" aria-label="播放列表筛选">
      <button
        className={filter === "all" ? "active" : ""}
        type="button"
        onClick={() => onChange("all")}
        disabled={disabled}
      >
        全部
      </button>
      <button
        className={filter === "favorites" ? "active" : ""}
        type="button"
        onClick={() => onChange("favorites")}
        disabled={disabled}
      >
        <Star size={14} />
      </button>
    </div>
  );
}
