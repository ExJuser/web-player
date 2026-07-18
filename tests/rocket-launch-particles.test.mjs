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

test("keeps alpha and velocity consistent across equivalent frame time", () => {
  const seedParticle = particles.createFireworkParticles(
    { at: 0, x: 0.5, y: 0.5, colors: ["#fff"], particleCount: 1, speed: 5 },
    100,
    100,
    () => 0.5,
  )[0];
  const fullFrame = { ...seedParticle };
  const halfFrames = { ...seedParticle };
  const standardFrameMs = 1000 / 60;

  particles.advanceFireworkParticle(fullFrame, standardFrameMs);
  particles.advanceFireworkParticle(halfFrames, standardFrameMs / 2);
  particles.advanceFireworkParticle(halfFrames, standardFrameMs / 2);

  assert.ok(Math.abs(fullFrame.alpha - halfFrames.alpha) < 0.000001);
  assert.ok(Math.abs(fullFrame.velocityX - halfFrames.velocityX) < 0.000001);
  assert.ok(Math.abs(fullFrame.velocityY - halfFrames.velocityY) < 0.001);
});
