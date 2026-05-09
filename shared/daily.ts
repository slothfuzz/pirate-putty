import type { Hole, Rect, Hazard, Decor, Vec2 } from './types';
import { PLAYABLE_LEFT, PLAYABLE_RIGHT, PLAYABLE_TOP, PLAYABLE_BOTTOM } from './types';

// Mulberry32 seeded PRNG - deterministic, fast, 32-bit state
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HOLE_NAMES = [
  'Barnacle Bay',
  'Cutlass Cove',
  "Davy's Detour",
  'Skull Shore',
  'Rum Runner',
  'Anchor Drop',
  'Plank Walk',
  'Cannon Alley',
  'Mermaid Lagoon',
  'Kraken Pass',
  "Blackbeard's Bluff",
  'Parrot Perch',
  'Treasure Trail',
  "Siren's Strait",
  'Mutiny Mile',
  'Doubloon Dunes',
  'Crow\'s Nest',
  'Typhoon Turn',
  'Marooned Mesa',
  'Ghost Ship Gap',
  'Coral Crossing',
  'Whirlpool Way',
  'Jolly Pass',
  'Peg Leg Path',
  'Buccaneer Bend',
  'Shark Tooth Strait',
  'Gunpowder Gulch',
  'Scallywag Slope',
  'Compass Rose',
  'Tidal Twist',
];

const DECOR_TYPES: Decor['type'][] = ['coin', 'skull', 'anchor', 'starfish', 'barrel', 'palm'];

function randRange(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}

function randInt(rng: () => number, min: number, max: number): number {
  return Math.floor(randRange(rng, min, max + 1));
}

function randPick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

function rectsOverlap(a: Rect, b: Rect, margin: number): boolean {
  return !(
    a.x + a.w + margin <= b.x ||
    b.x + b.w + margin <= a.x ||
    a.y + a.h + margin <= b.y ||
    b.y + b.h + margin <= a.y
  );
}

function pointInRect(p: Vec2, r: Rect, margin: number): boolean {
  return (
    p.x >= r.x - margin &&
    p.x <= r.x + r.w + margin &&
    p.y >= r.y - margin &&
    p.y <= r.y + r.h + margin
  );
}

export function generateDailyHole(dateString: string): Hole {
  const seed = parseInt(dateString, 10);
  const rng = mulberry32(seed);

  const name = randPick(rng, HOLE_NAMES);

  // Ball start in left third, hole in right third
  const ballStart: Vec2 = {
    x: randRange(rng, PLAYABLE_LEFT + 20, PLAYABLE_LEFT + 160),
    y: randRange(rng, PLAYABLE_TOP + 40, PLAYABLE_BOTTOM - 40),
  };

  const holePos: Vec2 = {
    x: randRange(rng, PLAYABLE_RIGHT - 160, PLAYABLE_RIGHT - 20),
    y: randRange(rng, PLAYABLE_TOP + 40, PLAYABLE_BOTTOM - 40),
  };

  // Generate walls
  const wallCount = randInt(rng, 1, 4);
  const walls: Rect[] = [];
  const ballRect: Rect = { x: ballStart.x - 20, y: ballStart.y - 20, w: 40, h: 40 };
  const holeRect: Rect = { x: holePos.x - 20, y: holePos.y - 20, w: 40, h: 40 };

  for (let i = 0; i < wallCount; i++) {
    const isVertical = rng() > 0.4;
    let wall: Rect;

    for (let attempt = 0; attempt < 20; attempt++) {
      if (isVertical) {
        const wx = randRange(rng, PLAYABLE_LEFT + 80, PLAYABLE_RIGHT - 80);
        const wy = randRange(rng, PLAYABLE_TOP, PLAYABLE_BOTTOM - 80);
        const wh = randRange(rng, 80, 220);
        wall = { x: wx, y: wy, w: 20, h: Math.min(wh, PLAYABLE_BOTTOM - wy) };
      } else {
        const wx = randRange(rng, PLAYABLE_LEFT + 40, PLAYABLE_RIGHT - 120);
        const wy = randRange(rng, PLAYABLE_TOP + 40, PLAYABLE_BOTTOM - 40);
        const ww = randRange(rng, 60, 160);
        wall = { x: wx, y: wy, w: Math.min(ww, PLAYABLE_RIGHT - wx), h: 20 };
      }

      // Ensure wall doesn't cover ball start or hole
      if (pointInRect(ballStart, wall!, 20)) continue;
      if (pointInRect(holePos, wall!, 20)) continue;

      // Ensure wall doesn't overlap existing walls too closely
      let overlaps = false;
      for (const existing of walls) {
        if (rectsOverlap(wall!, existing, 30)) {
          overlaps = true;
          break;
        }
      }
      if (overlaps) continue;

      walls.push(wall!);
      break;
    }
  }

  // Generate hazards
  const hazardCount = randInt(rng, 0, 2);
  const hazards: Hazard[] = [];

  for (let i = 0; i < hazardCount; i++) {
    const hazardType: 'water' | 'sand' = rng() > 0.5 ? 'water' : 'sand';

    for (let attempt = 0; attempt < 15; attempt++) {
      const hx = randRange(rng, PLAYABLE_LEFT + 60, PLAYABLE_RIGHT - 120);
      const hy = randRange(rng, PLAYABLE_TOP + 40, PLAYABLE_BOTTOM - 100);
      const hw = randRange(rng, 50, 90);
      const hh = randRange(rng, 50, 90);
      const rect: Rect = { x: hx, y: hy, w: hw, h: hh };

      if (pointInRect(ballStart, rect, 25)) continue;
      if (pointInRect(holePos, rect, 25)) continue;

      hazards.push({ type: hazardType, rect });
      break;
    }
  }

  // Generate decorations
  const decorCount = randInt(rng, 2, 5);
  const decorations: Decor[] = [];

  for (let i = 0; i < decorCount; i++) {
    const dtype = randPick(rng, DECOR_TYPES);
    const size = randRange(rng, 10, 22);
    const pos: Vec2 = {
      x: randRange(rng, PLAYABLE_LEFT + 30, PLAYABLE_RIGHT - 30),
      y: randRange(rng, PLAYABLE_TOP + 30, PLAYABLE_BOTTOM - 30),
    };
    decorations.push({ type: dtype, pos, size });
  }

  // Calculate par: base 2, +1 per 2 walls, +1 if hazards present
  const par = Math.min(4, 2 + Math.floor(walls.length / 2) + (hazards.length > 0 ? 1 : 0));

  return {
    name,
    par,
    ballStart,
    holePos,
    walls,
    hazards,
    decorations,
  };
}

export function getTodayDateString(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}
