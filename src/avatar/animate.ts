import type { Rig } from './body';

/**
 * Procedural animation: idle (breathing, looking around, blinking), walk and
 * run cycles from the actual speed, a glide pose for fast travel and a tuck in
 * the air. Pure maths on the rig's joint groups; one state per avatar.
 */
export interface AnimState {
  phase: number;
  time: number;
  nextBlink: number;
  blinkT: number;
  seed: number;
}

export interface MotionInput {
  /** Horizontal speed, m/s. */
  speed: number;
  /** Height above the ground, meters (0 = standing). */
  air: number;
}

export function createAnimState(seed = 0): AnimState {
  const time = seed * 1.7;
  return { phase: 0, time, nextBlink: time + 1.5 + seed * 0.4, blinkT: -1, seed };
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function animateAvatar(rig: Rig, s: AnimState, dt: number, m: MotionInput): void {
  s.time += dt;
  const t = s.time;
  const walk = smooth(0.15, 2.5, m.speed);
  const run = smooth(9, 16, m.speed);
  const glide = smooth(60, 140, m.speed);
  const air = smooth(0.03, 0.35, m.air);

  // Stride: legs keep pace with the ground, capped so a 40 m/s run doesn't blur.
  const stride = 0.75 + run * 0.55;
  s.phase += Math.min((m.speed / stride) * Math.PI, 14) * dt;
  const swing = walk * (0.5 + 0.35 * run) * (1 - glide) * (1 - air * 0.7);
  const sinP = Math.sin(s.phase);
  const breathe = Math.sin(t * 1.6 + s.seed) * 0.004;

  rig.hips.position.y = Math.abs(sinP) * 0.025 * walk * (1 - glide) + breathe;
  rig.torsoPivot.rotation.x = run * 0.16 + glide * 0.35;
  rig.torsoPivot.rotation.y = sinP * 0.07 * walk * (1 - glide);

  rig.hip.forEach((hip, i) => {
    const side = i === 0 ? 1 : -1;
    const legSwing = side * sinP * swing;
    hip.rotation.x = legSwing - air * 0.55 + glide * 0.25;
    hip.rotation.z = side * 0.02;
    const back = Math.max(0, side * Math.sin(s.phase + Math.PI / 2));
    rig.knee[i]!.rotation.x = back * swing * 1.3 + air * 0.95 + glide * 0.2;
  });

  rig.shoulder.forEach((sh, i) => {
    const side = i === 0 ? -1 : 1;
    const armSwing = -(i === 0 ? 1 : -1) * sinP * swing * 0.85;
    const idleSway = Math.sin(t * 0.9 + i) * 0.02 * (1 - walk);
    sh.rotation.x = armSwing + glide * 0.9 + idleSway;
    sh.rotation.z = side * (0.1 + air * 0.55 + glide * 0.15 + Math.abs(breathe) * 2);
    rig.elbow[i]!.rotation.x = -(0.12 + walk * 0.25 + run * 0.8) * (1 - glide) - air * 0.3;
  });

  // Look around a little when standing.
  const idle = 1 - walk;
  rig.neckPivot.rotation.y = Math.sin(t * 0.37 + s.seed) * 0.28 * idle;
  rig.neckPivot.rotation.x = -rig.torsoPivot.rotation.x * 0.6 + Math.sin(t * 0.23) * 0.04 * idle;
  rig.neckPivot.rotation.z = Math.sin(t * 0.29 + 1) * 0.04 * idle;

  // Hair, ponytail and skirts follow the movement.
  rig.hair.rotation.x = -walk * 0.035 - glide * 0.08 + Math.sin(t * 1.1) * 0.008;
  if (rig.tail) {
    rig.tail.rotation.x = walk * 0.2 + glide * 0.6 + Math.sin(s.phase * 2) * 0.08 * walk;
    rig.tail.rotation.z = Math.sin(t * 1.6 + s.seed) * 0.08 + sinP * 0.1 * walk;
  }
  for (const o of rig.sway) o.rotation.y = Math.sin(s.phase) * 0.05 * walk + Math.sin(t * 1.3) * 0.015;

  // Blink every few seconds (sometimes twice).
  if (s.blinkT < 0 && t > s.nextBlink) s.blinkT = 0;
  if (s.blinkT >= 0) {
    s.blinkT += dt;
    const closed = s.blinkT < 0.09 || (s.seed % 3 === 0 && s.blinkT > 0.15 && s.blinkT < 0.22);
    for (const e of rig.eyes) e.scale.y = closed ? 0.12 : 1;
    if (s.blinkT > 0.26) {
      s.blinkT = -1;
      s.nextBlink = t + 2.4 + ((Math.sin(t * 12.9898) * 43758.5453) % 1 + 1) % 1 * 2.6;
    }
  }
}
