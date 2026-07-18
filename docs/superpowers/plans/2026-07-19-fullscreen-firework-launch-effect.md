# Fullscreen Firework Launch Effect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current simple rocket overlay with a three-second, full-screen firework sequence using a performant Canvas particle system and CSS flash/shockwave layers.

**Architecture:** Keep the existing `launchEffectKey` rendering flow and emission statistics untouched. Put deterministic particle creation and motion in a pure TypeScript module, while `RocketLaunchEffect` owns Canvas setup, animation scheduling, drawing, resize handling, reduced-motion behavior, and cleanup.

**Tech Stack:** React 19, TypeScript, Canvas 2D API, CSS animations, Node.js built-in test runner.

## Global Constraints

- Do not change emission statistics, player business flow, button layout, or unrelated animations.
- The overlay must remain `pointer-events: none` and `aria-hidden="true"`.
- Do not add dependencies or sound effects.
- Cap device pixel ratio and particle count.
- Under `prefers-reduced-motion: reduce`, skip the Canvas particle loop and show only a short, low-intensity central flash.
- PowerShell commands must run as separate commands and must not use `&&`.

---

### Task 1: Particle timeline and motion model

**Files:**
- Create: `src/rocketLaunchParticles.ts`
- Create: `tests/rocket-launch-particles.test.mjs`

**Interfaces:**
- Produces: `ROCKET_LAUNCH_EFFECT_DURATION_MS`, `FIREWORK_CUES`, `createFireworkParticles(cue, width, height, random?)`, and `advanceFireworkParticle(particle)`.
- Consumed by: `src/RocketLaunchEffect.tsx` and `src/App.tsx` in Task 2.

- [ ] **Step 1: Write the failing particle-model tests**

Create `tests/rocket-launch-particles.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const particles = await importTsModule(new URL("../src/rocketLaunchParticles.ts", import.meta.url));

test("defines a dense three-second firework timeline", () => {
  assert.equal(particles.ROCKET_LAUNCH_EFFECT_DURATION_MS, 3000);
  assert.equal(particles.FIREWORK_CUES.length, 6);
  assert.deepEqual(
    particles.FIREWORK_CUES.map((cue) => cue.at),
    [...particles.FIREWORK_CUES.map((cue) => cue.at)].sort((a, b) => a - b),
  );
  assert.equal(particles.FIREWORK_CUES.reduce((sum, cue) => sum + cue.particleCount, 0), 482);
});

test("creates particles at the cue origin with bounded visual properties", () => {
  const cue = particles.FIREWORK_CUES[0];
  const burst = particles.createFireworkParticles(cue, 1000, 800, () => 0.5);

  assert.equal(burst.length, cue.particleCount);
  assert.equal(burst.every((particle) => particle.x === 500 && particle.y === 304), true);
  assert.equal(burst.every((particle) => cue.colors.includes(particle.color)), true);
  assert.equal(burst.every((particle) => particle.alpha === 1 && particle.size > 0), true);
});

test("advances particles with drag, gravity, and finite lifetime", () => {
  const particle = particles.createFireworkParticles(
    { at: 0, x: 0.5, y: 0.5, colors: ["#fff"], particleCount: 1, speed: 5 },
    100,
    100,
    () => 0.5,
  )[0];
  const initialAlpha = particle.alpha;
  const initialY = particle.y;

  assert.equal(particles.advanceFireworkParticle(particle), true);
  assert.equal(particle.previousY, initialY);
  assert.equal(particle.alpha < initialAlpha, true);

  let alive = true;
  for (let index = 0; index < 200 && alive; index += 1) {
    alive = particles.advanceFireworkParticle(particle);
  }
  assert.equal(alive, false);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- tests/rocket-launch-particles.test.mjs`

Expected: FAIL because `src/rocketLaunchParticles.ts` does not exist.

- [ ] **Step 3: Implement the particle model**

Create `src/rocketLaunchParticles.ts`:

```ts
export const ROCKET_LAUNCH_EFFECT_DURATION_MS = 3000;

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
  { at: 520, x: 0.5, y: 0.38, colors: ["#fff4bd", "#ffb52e", "#ffffff"], particleCount: 108, speed: 7.2 },
  { at: 850, x: 0.22, y: 0.3, colors: ["#c084fc", "#7c3aed", "#f0abfc"], particleCount: 66, speed: 5.5 },
  { at: 1040, x: 0.78, y: 0.27, colors: ["#67e8f9", "#3b82f6", "#dbeafe"], particleCount: 68, speed: 5.8 },
  { at: 1350, x: 0.34, y: 0.54, colors: ["#fb7185", "#f472b6", "#fde68a"], particleCount: 72, speed: 5.3 },
  { at: 1570, x: 0.68, y: 0.5, colors: ["#a78bfa", "#fbbf24", "#f5d0fe"], particleCount: 72, speed: 5.6 },
  { at: 1940, x: 0.5, y: 0.28, colors: ["#ffffff", "#fbbf24", "#22d3ee", "#c084fc", "#fb7185"], particleCount: 96, speed: 7.5 },
] as const;

export function createFireworkParticles(
  cue: FireworkCue,
  width: number,
  height: number,
  random: () => number = Math.random,
): FireworkParticle[] {
  const originX = width * cue.x;
  const originY = height * cue.y;

  return Array.from({ length: cue.particleCount }, (_, index) => {
    const angle = (index / cue.particleCount) * Math.PI * 2 + (random() - 0.5) * 0.1;
    const speed = cue.speed * (0.58 + random() * 0.54);
    return {
      x: originX,
      y: originY,
      previousX: originX,
      previousY: originY,
      velocityX: Math.cos(angle) * speed,
      velocityY: Math.sin(angle) * speed,
      alpha: 1,
      decay: 0.012 + random() * 0.009,
      drag: 0.982 + random() * 0.006,
      gravity: 0.035 + random() * 0.025,
      color: cue.colors[index % cue.colors.length],
      size: 1.3 + random() * 1.9,
    };
  });
}

export function advanceFireworkParticle(particle: FireworkParticle): boolean {
  particle.previousX = particle.x;
  particle.previousY = particle.y;
  particle.velocityX *= particle.drag;
  particle.velocityY = particle.velocityY * particle.drag + particle.gravity;
  particle.x += particle.velocityX;
  particle.y += particle.velocityY;
  particle.alpha = Math.max(0, particle.alpha - particle.decay);
  return particle.alpha > 0;
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `npm test -- tests/rocket-launch-particles.test.mjs`

Expected: 3 tests pass and 0 tests fail.

- [ ] **Step 5: Commit the particle model**

Run separately:

```powershell
git add -- src/rocketLaunchParticles.ts tests/rocket-launch-particles.test.mjs
git commit -m "feat: add firework particle timeline"
```

---

### Task 2: Full-screen Canvas renderer and integration

**Files:**
- Modify: `src/RocketLaunchEffect.tsx`
- Modify: `src/styles.css:705-807,3359-3442,8880-8890`
- Modify: `src/App.tsx:2000-2010`

**Interfaces:**
- Consumes: `ROCKET_LAUNCH_EFFECT_DURATION_MS`, `FIREWORK_CUES`, `createFireworkParticles`, `advanceFireworkParticle`, and `FireworkParticle` from Task 1.
- Preserves: `RocketLaunchEffect({ effectKey }: { effectKey: number })` and the existing `launchEffectKey` render contract.

- [ ] **Step 1: Replace the presentational component with a lifecycle-managed Canvas renderer**

Replace `src/RocketLaunchEffect.tsx` with:

```tsx
import { useEffect, useRef } from "react";

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
          const alive = advanceFireworkParticle(particle);
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

  return (
    <div key={effectKey} className="rocket-launch-effect" aria-hidden="true">
      <div className="rocket-launch-effect__atmosphere" />
      <canvas ref={canvasRef} className="rocket-launch-effect__canvas" />
      <span className="rocket-launch-effect__flash" />
      <span className="rocket-launch-effect__shockwave shockwave-primary" />
      <span className="rocket-launch-effect__shockwave shockwave-secondary" />
    </div>
  );
}
```

- [ ] **Step 2: Replace the old rocket/star/smoke styles and keyframes**

In `src/styles.css`, replace the existing `.rocket-launch-effect` block through `.rocket-launch-effect__smoke.smoke-three` and the old `launch-*` keyframes with:

```css
.rocket-launch-effect {
  position: fixed;
  inset: 0;
  z-index: 80;
  overflow: hidden;
  background: rgba(3, 5, 14, 0.46);
  pointer-events: none;
  animation: firework-effect-fade 3000ms ease-out forwards;
}

.rocket-launch-effect__atmosphere,
.rocket-launch-effect__canvas,
.rocket-launch-effect__flash,
.rocket-launch-effect__shockwave {
  position: absolute;
  inset: 0;
}

.rocket-launch-effect__atmosphere {
  background:
    radial-gradient(circle at 50% 38%, rgba(255, 190, 75, 0.2), transparent 24%),
    radial-gradient(circle at 22% 30%, rgba(157, 78, 221, 0.14), transparent 22%),
    radial-gradient(circle at 78% 27%, rgba(34, 211, 238, 0.13), transparent 22%),
    linear-gradient(180deg, rgba(2, 6, 23, 0.4), rgba(3, 5, 14, 0.68));
}

.rocket-launch-effect__canvas {
  width: 100%;
  height: 100%;
}

.rocket-launch-effect__flash {
  inset: 38% auto auto 50%;
  width: 18vmin;
  height: 18vmin;
  border-radius: 50%;
  background: #fffde8;
  filter: blur(3px);
  transform: translate(-50%, -50%) scale(0);
  animation: firework-flash 760ms 480ms ease-out both;
}

.rocket-launch-effect__shockwave {
  inset: 38% auto auto 50%;
  width: 12vmin;
  height: 12vmin;
  border: 3px solid rgba(255, 237, 174, 0.9);
  border-radius: 50%;
  box-shadow: 0 0 28px rgba(255, 181, 46, 0.72), inset 0 0 20px rgba(255, 255, 255, 0.55);
  transform: translate(-50%, -50%) scale(0);
}

.rocket-launch-effect__shockwave.shockwave-primary {
  animation: firework-shockwave 920ms 500ms ease-out both;
}

.rocket-launch-effect__shockwave.shockwave-secondary {
  animation: firework-shockwave 1080ms 610ms ease-out both;
}

@keyframes firework-effect-fade {
  0% { opacity: 0; }
  8%, 82% { opacity: 1; }
  100% { opacity: 0; }
}

@keyframes firework-flash {
  0% { opacity: 0; transform: translate(-50%, -50%) scale(0); }
  18% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -50%) scale(4.8); }
}

@keyframes firework-shockwave {
  0% { opacity: 0; transform: translate(-50%, -50%) scale(0); }
  16% { opacity: 1; }
  100% { opacity: 0; transform: translate(-50%, -50%) scale(9); }
}
```

Extend the existing `@media (prefers-reduced-motion: reduce)` block with:

```css
  .rocket-launch-effect {
    animation-duration: 900ms;
  }

  .rocket-launch-effect__canvas,
  .rocket-launch-effect__shockwave {
    display: none;
  }

  .rocket-launch-effect__flash {
    animation: firework-reduced-flash 700ms ease-out both;
  }
```

Add the reduced-motion keyframe beside the other firework keyframes:

```css
@keyframes firework-reduced-flash {
  0% { opacity: 0; transform: translate(-50%, -50%) scale(0.7); }
  30% { opacity: 0.42; transform: translate(-50%, -50%) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -50%) scale(1.5); }
}
```

- [ ] **Step 3: Synchronize component cleanup with the shared duration**

In `src/App.tsx`, import the duration constant:

```ts
import { ROCKET_LAUNCH_EFFECT_DURATION_MS } from "./rocketLaunchParticles";
```

Replace the current `1800` timer delay in `recordEmissionForCurrentVideo` with:

```ts
    launchEffectTimerRef.current = window.setTimeout(() => {
      setLaunchEffectKey(0);
      launchEffectTimerRef.current = null;
    }, ROCKET_LAUNCH_EFFECT_DURATION_MS);
```

- [ ] **Step 4: Run focused verification**

Before running, announce that the command verifies only the new particle model and does not run the full suite.

Run: `npm test -- tests/rocket-launch-particles.test.mjs`

Expected: 3 tests pass and 0 tests fail.

Perform static checks:

```powershell
git diff --check
rg -n -F "launch-effect-fade" src
rg -n -F "launch-rocket" src
rg -n -F "launch-smoke" src
```

Expected: `git diff --check` exits successfully; the three fixed-string searches return no matches, confirming the obsolete animation names were removed.

- [ ] **Step 5: Commit the renderer and integration**

Run separately:

```powershell
git add -- src/RocketLaunchEffect.tsx src/rocketLaunchParticles.ts src/styles.css src/App.tsx tests/rocket-launch-particles.test.mjs
git commit -m "feat: redesign launch effect with fullscreen fireworks"
```
