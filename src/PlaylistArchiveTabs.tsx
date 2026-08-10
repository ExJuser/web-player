import { X } from "lucide-react";

export type PlaylistArchiveTab = {
  id: string;
  label: string;
  marker: string;
  closable: boolean;
};

type PlaylistArchiveTabsProps = {
  activeTabId: string;
  tabs: PlaylistArchiveTab[];
  onActivate: (tabId: string) => void;
  onClose: (tabId: string) => void;
};

export function PlaylistArchiveTabs({ activeTabId, tabs, onActivate, onClose }: PlaylistArchiveTabsProps) {
  const visibleTabs = tabs.length <= 3 ? tabs : tabs.slice(0, 3);
  const activeTab = tabs.find((tab) => tab.id === activeTabId);
  if (activeTab && !visibleTabs.some((tab) => tab.id === activeTab.id)) visibleTabs[visibleTabs.length - 1] = activeTab;
  const visibleTabIds = new Set(visibleTabs.map((tab) => tab.id));
  const hiddenTabs = tabs.filter((tab) => !visibleTabIds.has(tab.id));

  return (
    <div className="playlist-archive-tabs" role="tablist" aria-label="影片队列">
      {visibleTabs.map((tab) => (
        <div className={`playlist-archive-tab ${activeTabId === tab.id ? "active" : ""}`} key={tab.id}>
          <button
            className="playlist-archive-tab-select"
            type="button"
            role="tab"
            aria-selected={activeTabId === tab.id}
            onClick={() => onActivate(tab.id)}
            title={tab.label}
          >
            <span className="playlist-archive-tab-marker" aria-hidden="true">{tab.marker}</span>
            <span>{tab.label}</span>
          </button>
          {tab.closable ? (
            <button className="playlist-archive-tab-close" type="button" onClick={() => onClose(tab.id)} aria-label={`关闭${tab.label}队列`}>
              <X size={12} />
            </button>
          ) : null}
        </div>
      ))}
      {hiddenTabs.length ? (
        <details className="playlist-archive-more">
          <summary>更多队列 · {hiddenTabs.length}</summary>
          <div className="playlist-archive-more-popover">
            {hiddenTabs.map((tab) => (
              <div key={tab.id}>
                <button type="button" onClick={() => onActivate(tab.id)}>
                  <span className="playlist-archive-tab-marker" aria-hidden="true">{tab.marker}</span>
                  <span>{tab.label}</span>
                </button>
                <button type="button" onClick={() => onClose(tab.id)} aria-label={`关闭${tab.label}队列`}><X size={12} /></button>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
