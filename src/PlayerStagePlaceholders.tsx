import { FolderOpen, Play } from "lucide-react";

type PlayerStagePlaceholdersProps = {
  isPrivacyMode: boolean;
  message: string;
  showEmptyState: boolean;
};

export function PlayerStagePlaceholders({ isPrivacyMode, message, showEmptyState }: PlayerStagePlaceholdersProps) {
  return (
    <>
      {showEmptyState && !isPrivacyMode ? (
        <div className="empty-player">
          <FolderOpen size={40} />
          <span>{message}</span>
        </div>
      ) : null}

      {isPrivacyMode ? (
        <div className="privacy-cover" role="status" aria-live="polite">
          <Play size={58} />
        </div>
      ) : null}
    </>
  );
}
