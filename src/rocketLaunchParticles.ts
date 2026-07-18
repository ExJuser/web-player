export const ROCKET_LAUNCH_EFFECT_DURATION_MS = 3000;
const FIREWORK_FRAME_DURATION_MS = 1000 / 60;
const MAX_FIREWORK_DELTA_MS = 100;

export type FireworkCue = {
  at: number;
  x: number;
  y: number;
  colors: readonly string[];
  particleCount: number;
  speed: number;
};

export type FireworkParticle = {
  x: number;
  y: number;
  previousX: number;
  previousY: number;
  velocityX: number;
  velocityY: number;
  alpha: number;
  decay: number;
  drag: number;
  gravity: number;
  color: string;
  size: number;
};

export const FIREWORK_CUES: readonly FireworkCue[] = [
  { at: 520, x: 0.5, y: 0.38, colors: ["#fff4bd", "#ffb52e", "#ffffff"], particleCount: 180, speed: 10.4 },
  { at: 850, x: 0.2, y: 0.28, colors: ["#c084fc", "#7c3aed", "#f0abfc"], particleCount: 116, speed: 8.3 },
  { at: 1040, x: 0.8, y: 0.25, colors: ["#67e8f9", "#3b82f6", "#dbeafe"], particleCount: 120, speed: 8.6 },
  { at: 1350, x: 0.31, y: 0.56, colors: ["#fb7185", "#f472b6", "#fde68a"], particleCount: 128, speed: 8 },
  { at: 1570, x: 0.71, y: 0.52, colors: ["#a78bfa", "#fbbf24", "#f5d0fe"], particleCount: 128, speed: 8.3 },
  { at: 1940, x: 0.5, y: 0.27, colors: ["#ffffff", "#fbbf24", "#22d3ee", "#c084fc", "#fb7185"], particleCount: 160, speed: 10.8 },
] as const;

export function createFireworkParticles(
  cue: FireworkCue,
  width: number,
  height: number,
  random: () => number = Math.random,
): FireworkParticle[] {
  const originX = width * cue.x;
  const originY = height * cue.y;
  const viewportScale = Math.min(Math.max(Math.min(width, height) / 800, 0.9), 1.35);

  return Array.from({ length: cue.particleCount }, (_, index) => {
    const angle = (index / cue.particleCount) * Math.PI * 2 + (random() - 0.5) * 0.1;
    const speed = cue.speed * viewportScale * (0.5 + random() * 0.7);
    return {
      x: originX,
      y: originY,
      previousX: originX,
      previousY: originY,
      velocityX: Math.cos(angle) * speed,
      velocityY: Math.sin(angle) * speed,
      alpha: 1,
      decay: 0.01 + random() * 0.006,
      drag: 0.982 + random() * 0.006,
      gravity: 0.035 + random() * 0.025,
      color: cue.colors[index % cue.colors.length],
      size: (2.1 + random() * 2.4) * viewportScale,
    };
  });
}

export function advanceFireworkParticle(
  particle: FireworkParticle,
  deltaMs: number = FIREWORK_FRAME_DURATION_MS,
): boolean {
  const frameScale = Math.min(Math.max(deltaMs, 0), MAX_FIREWORK_DELTA_MS) / FIREWORK_FRAME_DURATION_MS;
  const drag = particle.drag ** frameScale;
  const gravity = particle.gravity * frameScale;
  particle.previousX = particle.x;
  particle.previousY = particle.y;
  particle.velocityX *= drag;
  particle.velocityY = particle.velocityY * drag + gravity;
  particle.x += particle.velocityX * frameScale;
  particle.y += particle.velocityY * frameScale;
  particle.alpha = Math.max(0, particle.alpha - particle.decay * frameScale);
  return particle.alpha > 0;
}
