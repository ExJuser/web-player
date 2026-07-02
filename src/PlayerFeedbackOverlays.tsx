type DoubleClickFeedback = {
  side: "left" | "center" | "right";
  text: string;
};

type PlayerFeedbackOverlaysProps = {
  doubleClickFeedback: DoubleClickFeedback | null;
  playerOverlayFeedback: string;
};

export function PlayerFeedbackOverlays({ doubleClickFeedback, playerOverlayFeedback }: PlayerFeedbackOverlaysProps) {
  return (
    <>
      {doubleClickFeedback ? (
        <div className={`double-click-feedback ${doubleClickFeedback.side}`} aria-live="polite">
          {doubleClickFeedback.text}
        </div>
      ) : null}

      {playerOverlayFeedback ? (
        <div className="player-overlay-feedback" aria-live="polite">
          {playerOverlayFeedback}
        </div>
      ) : null}
    </>
  );
}
