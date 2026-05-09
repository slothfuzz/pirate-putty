import type { Hole } from './types';

export const treasureCoast: Hole[] = [
  {
    name: 'Maiden Voyage',
    par: 2,
    ballStart: { x: 120, y: 240 },
    holePos: { x: 560, y: 240 },
    walls: [],
    hazards: [],
    decorations: [
      { type: 'coin', pos: { x: 340, y: 200 }, size: 12 },
      { type: 'coin', pos: { x: 340, y: 280 }, size: 12 },
      { type: 'starfish', pos: { x: 200, y: 140 }, size: 16 },
    ],
  },
  {
    name: "Smuggler's Bend",
    par: 3,
    ballStart: { x: 120, y: 340 },
    holePos: { x: 560, y: 120 },
    walls: [
      { x: 250, y: 60, w: 20, h: 220 },
      { x: 400, y: 200, w: 20, h: 220 },
    ],
    hazards: [],
    decorations: [
      { type: 'barrel', pos: { x: 180, y: 160 }, size: 18 },
      { type: 'anchor', pos: { x: 500, y: 340 }, size: 20 },
      { type: 'coin', pos: { x: 330, y: 300 }, size: 12 },
    ],
  },
  {
    name: "Dead Man's Corridor",
    par: 3,
    ballStart: { x: 120, y: 120 },
    holePos: { x: 560, y: 360 },
    walls: [
      { x: 200, y: 60, w: 20, h: 160 },
      { x: 200, y: 280, w: 20, h: 160 },
      { x: 350, y: 120, w: 20, h: 160 },
      { x: 350, y: 340, w: 20, h: 100 },
      { x: 480, y: 60, w: 20, h: 200 },
    ],
    hazards: [
      { type: 'sand', rect: { x: 270, y: 200, w: 60, h: 80 } },
    ],
    decorations: [
      { type: 'skull', pos: { x: 300, y: 100 }, size: 14 },
      { type: 'coin', pos: { x: 430, y: 300 }, size: 12 },
      { type: 'palm', pos: { x: 530, y: 140 }, size: 22 },
    ],
  },
];
