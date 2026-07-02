import { ExternalLink, RefreshCw } from "lucide-react";

type BangumiLinkButtonProps = {
  canOpen: boolean;
  isLoading: boolean;
  title: string;
  onOpen: () => void;
};

export function BangumiLinkButton({ canOpen, isLoading, title, onOpen }: BangumiLinkButtonProps) {
  return (
    <button
      className={`bangumi-link-button ${canOpen ? "active" : ""} ${isLoading ? "loading" : ""}`}
      type="button"
      onClick={onOpen}
      disabled={!canOpen}
      title={title}
      aria-label={title}
    >
      {isLoading ? <RefreshCw size={16} /> : <ExternalLink size={16} />}
    </button>
  );
}
