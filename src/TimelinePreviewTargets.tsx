import type { Ref } from "react";

type TimelinePreviewTargetsProps = {
  previewCanvasRef: Ref<HTMLCanvasElement>;
  previewVideoRef: Ref<HTMLVideoElement>;
};

export function TimelinePreviewTargets({ previewCanvasRef, previewVideoRef }: TimelinePreviewTargetsProps) {
  return (
    <>
      <video
        ref={previewVideoRef}
        className="timeline-preview-video"
        muted
        preload="metadata"
        playsInline
        tabIndex={-1}
      />
      <canvas ref={previewCanvasRef} className="timeline-preview-canvas" width={192} height={108} />
    </>
  );
}
