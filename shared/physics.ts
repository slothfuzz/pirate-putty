import type { BallState, Rect, Hazard, Vec2, ZoneEffect } from './types';
import {
  BALL_RADIUS,
  WALL_INSET,
  WALL_THICKNESS,
  CANVAS_W,
  CANVAS_H,
} from './types';

export const FRICTION = 0.985;
const SAND_FRICTION = 0.95;
export const WALL_BOUNCE = 0.72;
const SINK_DIST = 12;
const SINK_MAX_SPEED = 4.5;
const ASSIST_DIST = 22;
const ASSIST_MAX_SPEED = 3.5;
const ASSIST_STRENGTH = 0.3;
const STOP_THRESHOLD = 0.06;
const SUBSTEPS = 5;
export const MAX_POWER = 200;
export const POWER_SCALE = 0.09;

// === Interference: finish-line effects ===
// How long each effect stays active once triggered (ms). From the brief legend.
export const ZONE_DURATIONS_MS: Record<ZoneEffect, number> = {
  reflect: 2000,
  hold: 1000,
  slow: 4000,
  reset: 500,
};
// Per-player cooldown after triggering any effect (ms).
export const ZONE_COOLDOWN_MS = 5000;
// Concentric radii around the goal, outermost first: slow > hold > reflect > reset.
// Board SVG geometry was visual-only; these are the gameplay radii (canvas units).
export const ZONE_RADII: Record<ZoneEffect, number> = {
  slow: 90,
  hold: 55,
  reflect: 30,
  reset: 18,
};
// Slow caps a ball's speed to ~10% of a max-power putt while it's in the zone.
const SLOW_SPEED_CAP = MAX_POWER * POWER_SCALE * 0.1;
// Reflect kicks the ball back out with a moderate boost.
const REFLECT_BOOST = 1.25;

const PERIMETER_LEFT = WALL_INSET;
const PERIMETER_RIGHT = CANVAS_W - WALL_INSET;
const PERIMETER_TOP = WALL_INSET;
const PERIMETER_BOTTOM = CANVAS_H - WALL_INSET;

export function launchBall(ball: BallState, angle: number, power: number): void {
  const p = Math.min(power, MAX_POWER);
  const speed = p * POWER_SCALE;
  ball.vx = Math.cos(angle) * speed;
  ball.vy = Math.sin(angle) * speed;
}

function ballSpeed(ball: BallState): number {
  return Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
}

function dist(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function collideRect(ball: BallState, rect: Rect): boolean {
  const r = BALL_RADIUS;
  const left = rect.x;
  const right = rect.x + rect.w;
  const top = rect.y;
  const bottom = rect.y + rect.h;

  const closestX = Math.max(left, Math.min(ball.x, right));
  const closestY = Math.max(top, Math.min(ball.y, bottom));
  const dx = ball.x - closestX;
  const dy = ball.y - closestY;
  const distSq = dx * dx + dy * dy;

  if (distSq < r * r) {
    const overlapDist = Math.sqrt(distSq);
    if (overlapDist === 0) {
      ball.x = left - r;
      ball.vx = -Math.abs(ball.vx) * WALL_BOUNCE;
      return true;
    }

    const nx = dx / overlapDist;
    const ny = dy / overlapDist;
    const penetration = r - overlapDist;
    ball.x += nx * penetration;
    ball.y += ny * penetration;

    const dotProduct = ball.vx * nx + ball.vy * ny;
    if (dotProduct < 0) {
      ball.vx -= 2 * dotProduct * nx;
      ball.vy -= 2 * dotProduct * ny;
      ball.vx *= WALL_BOUNCE;
      ball.vy *= WALL_BOUNCE;
    }
    return true;
  }
  return false;
}

function collidePerimeter(ball: BallState): void {
  const r = BALL_RADIUS;
  const innerLeft = PERIMETER_LEFT + WALL_THICKNESS;
  const innerRight = PERIMETER_RIGHT - WALL_THICKNESS;
  const innerTop = PERIMETER_TOP + WALL_THICKNESS;
  const innerBottom = PERIMETER_BOTTOM - WALL_THICKNESS;

  if (ball.x - r < innerLeft) {
    ball.x = innerLeft + r;
    ball.vx = Math.abs(ball.vx) * WALL_BOUNCE;
  } else if (ball.x + r > innerRight) {
    ball.x = innerRight - r;
    ball.vx = -Math.abs(ball.vx) * WALL_BOUNCE;
  }

  if (ball.y - r < innerTop) {
    ball.y = innerTop + r;
    ball.vy = Math.abs(ball.vy) * WALL_BOUNCE;
  } else if (ball.y + r > innerBottom) {
    ball.y = innerBottom - r;
    ball.vy = -Math.abs(ball.vy) * WALL_BOUNCE;
  }
}

function isInHazard(ball: BallState, hazards: Hazard[]): Hazard | null {
  for (const h of hazards) {
    const r = h.rect;
    if (ball.x >= r.x && ball.x <= r.x + r.w && ball.y >= r.y && ball.y <= r.y + r.h) {
      return h;
    }
  }
  return null;
}

export interface PhysicsResult {
  sunk: boolean;
  waterReset: boolean;
  stopped: boolean;
  reset: boolean;
}

export function stepPhysics(
  ball: BallState,
  walls: Rect[],
  hazards: Hazard[],
  holePos: Vec2,
  activeZones: ZoneEffect[] = [],
): PhysicsResult {
  if (ball.sunk) return { sunk: true, waterReset: false, stopped: true, reset: false };

  const result: PhysicsResult = { sunk: false, waterReset: false, stopped: false, reset: false };

  const reflect = activeZones.includes('reflect');
  const hold = activeZones.includes('hold');
  const slow = activeZones.includes('slow');
  const reset = activeZones.includes('reset');
  // Reflect/Hold/Reset deny the sink; Slow (and no active zone) still permits it.
  const sinkBlocked = reflect || hold || reset;

  // Slow: cap the ball to a crawl while inside the slow ring, so it still
  // creeps toward the cup (and can sink) instead of stopping dead.
  if (slow && dist(ball, holePos) < ZONE_RADII.slow) {
    const spd = ballSpeed(ball);
    if (spd > SLOW_SPEED_CAP) {
      const f = SLOW_SPEED_CAP / spd;
      ball.vx *= f;
      ball.vy *= f;
    }
  }

  const subFraction = 1 / SUBSTEPS;
  for (let sub = 0; sub < SUBSTEPS; sub++) {
    // Hold: freeze the ball in place while it's inside the hold ring.
    if (hold && dist(ball, holePos) < ZONE_RADII.hold) {
      ball.vx = 0;
      ball.vy = 0;
    }

    ball.x += ball.vx * subFraction;
    ball.y += ball.vy * subFraction;

    collidePerimeter(ball);

    for (const wall of walls) {
      collideRect(ball, wall);
    }

    const hazard = isInHazard(ball, hazards);
    if (hazard) {
      if (hazard.type === 'water') {
        result.waterReset = true;
        ball.vx = 0;
        ball.vy = 0;
        return result;
      } else if (hazard.type === 'sand') {
        ball.vx *= SAND_FRICTION;
        ball.vy *= SAND_FRICTION;
      }
    }

    // Reflect: bounce the ball off the goal's outer rim with a boost.
    if (reflect) {
      const dHole = dist(ball, holePos);
      if (dHole < ZONE_RADII.reflect) {
        const nx = dHole === 0 ? 1 : (ball.x - holePos.x) / dHole;
        const ny = dHole === 0 ? 0 : (ball.y - holePos.y) / dHole;
        ball.x = holePos.x + nx * ZONE_RADII.reflect;
        ball.y = holePos.y + ny * ZONE_RADII.reflect;
        const dot = ball.vx * nx + ball.vy * ny;
        if (dot < 0) {
          ball.vx -= 2 * dot * nx;
          ball.vy -= 2 * dot * ny;
          ball.vx *= REFLECT_BOOST;
          ball.vy *= REFLECT_BOOST;
        }
      }
    }

    // Reset: a ball that touches the goal reverts to its starting line.
    if (reset && dist(ball, holePos) < ZONE_RADII.reset) {
      ball.vx = 0;
      ball.vy = 0;
      result.reset = true;
      return result;
    }

    const d = dist(ball, holePos);
    const spd = ballSpeed(ball);

    if (!sinkBlocked && d < ASSIST_DIST && spd < ASSIST_MAX_SPEED) {
      const pullX = (holePos.x - ball.x) / d;
      const pullY = (holePos.y - ball.y) / d;
      ball.vx += pullX * ASSIST_STRENGTH;
      ball.vy += pullY * ASSIST_STRENGTH;
    }

    if (!sinkBlocked && d < SINK_DIST && spd < SINK_MAX_SPEED) {
      ball.x = holePos.x;
      ball.y = holePos.y;
      ball.vx = 0;
      ball.vy = 0;
      ball.sunk = true;
      result.sunk = true;
      return result;
    }
  }

  ball.vx *= FRICTION;
  ball.vy *= FRICTION;

  if (ballSpeed(ball) < STOP_THRESHOLD) {
    ball.vx = 0;
    ball.vy = 0;
    result.stopped = true;
  }

  return result;
}
