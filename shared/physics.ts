import type { BallState, Rect, Hazard, Vec2 } from './types';
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
}

export function stepPhysics(
  ball: BallState,
  walls: Rect[],
  hazards: Hazard[],
  holePos: Vec2,
): PhysicsResult {
  if (ball.sunk) return { sunk: true, waterReset: false, stopped: true };

  const result: PhysicsResult = { sunk: false, waterReset: false, stopped: false };

  const subFraction = 1 / SUBSTEPS;
  for (let sub = 0; sub < SUBSTEPS; sub++) {
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

    const d = dist(ball, holePos);
    const spd = ballSpeed(ball);

    if (d < ASSIST_DIST && spd < ASSIST_MAX_SPEED) {
      const pullX = (holePos.x - ball.x) / d;
      const pullY = (holePos.y - ball.y) / d;
      ball.vx += pullX * ASSIST_STRENGTH;
      ball.vy += pullY * ASSIST_STRENGTH;
    }

    if (d < SINK_DIST && spd < SINK_MAX_SPEED) {
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
