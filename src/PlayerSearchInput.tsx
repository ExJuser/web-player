import { Search } from "lucide-react";
import { useState } from "react";

export function PlayerSearchInput() {
  const [inputValue, setInputValue] = useState("");

  return (
    <section className="player-search" aria-label="播放器搜索">
      <form className="player-search-form" onSubmit={(event) => event.preventDefault()}>
        <input
          type="search"
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          placeholder="搜索片名、路径或标签"
          aria-label="播放器搜索"
        />
        <Search className="player-search-icon" size={17} aria-hidden="true" />
      </form>
    </section>
  );
}
