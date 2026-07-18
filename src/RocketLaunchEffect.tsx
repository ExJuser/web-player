import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import {
  FIREWORK_CUES,
  advanceFireworkParticle,
  createFireworkParticles,
  type FireworkParticle,
} from "./rocketLaunchParticles";

type RocketLaunchEffectProps = {
  effectKey: number;
};

const easeOutCubic = (value: number) => 1 - (1 - value) ** 3;

export function RocketLaunchEffect({ effectKey }: RocketLaunchEffectProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let width = window.innerWidth;
    let height = window.innerHeight;
    let frameId = 0;
    let nextCueIndex = 0;
    let activeParticles: FireworkParticle[] = [];
    const startedAt = performance.now();
    let previousFrameAt = startedAt;

    const resizeCanvas = () => {
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    };

    const drawRocket = (elapsed: number) => {
      if (elapsed > 620) return;
      const progress = easeOutCubic(Math.min(elapsed / 620, 1));
      const x = width / 2;
      const y = height * (1.08 - progress * 0.7);
      const tail = context.createLinearGradient(x, y, x, y + height * 0.24);
      tail.addColorStop(0, "rgba(255,255,225,0.95)");
      tail.addColorStop(0.25, "rgba(255,177,46,0.82)");
      tail.addColorStop(1, "rgba(244,63,94,0)");
      context.strokeStyle = tail;
      context.lineWidth = 8;
      context.beginPath();
      context.moveTo(x, y + 8);
      context.lineTo(x, y + height * 0.24);
      context.stroke();
      context.fillStyle = "#fffbd5";
      context.shadowBlur = 24;
      context.shadowColor = "#ffb52e";
      context.beginPath();
      context.arc(x, y, 5, 0, Math.PI * 2);
      context.fill();
      context.shadowBlur = 0;
    };

    const render = (now: number) => {
      const elapsed = now - startedAt;
      const deltaMs = now - previousFrameAt;
      previousFrameAt = now;
      context.globalCompositeOperation = "source-over";
      context.fillStyle = "rgba(4, 6, 16, 0.22)";
      context.fillRect(0, 0, width, height);
      context.globalCompositeOperation = "lighter";
      drawRocket(elapsed);

      while (nextCueIndex < FIREWORK_CUES.length && FIREWORK_CUES[nextCueIndex].at <= elapsed) {
        if (!document.hidden) {
          activeParticles.push(...createFireworkParticles(FIREWORK_CUES[nextCueIndex], width, height));
        }
        nextCueIndex += 1;
      }

      if (!document.hidden) {
        activeParticles = activeParticles.filter((particle) => {
          const alive = advanceFireworkParticle(particle, deltaMs);
          if (!alive) return false;
          context.globalAlpha = particle.alpha;
          context.strokeStyle = particle.color;
          context.lineWidth = particle.size;
          context.beginPath();
          context.moveTo(particle.previousX, particle.previousY);
          context.lineTo(particle.x, particle.y);
          context.stroke();
          return true;
        });
      }
      context.globalAlpha = 1;

      frameId = window.requestAnimationFrame(render);
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    frameId = window.requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resizeCanvas);
    };
  }, [effectKey]);

  return createPortal(
    <div key={effectKey} className="rocket-launch-effect" aria-hidden="true">
      <div className="rocket-launch-effect__atmosphere" />
      <canvas ref={canvasRef} className="rocket-launch-effect__canvas" />
      <span className="rocket-launch-effect__flash" />
      <span className="rocket-launch-effect__shockwave shockwave-primary" />
      <span className="rocket-launch-effect__shockwave shockwave-secondary" />
    </div>,
    document.body,
  );
}
