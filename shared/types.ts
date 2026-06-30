export interface Vec2 {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Hazard {
  type: 'water' | 'sand';
  rect: Rect;
}

export interface Decor {
  type: 'coin' | 'skull' | 'anchor' | 'starfish' | 'barrel' | 'palm';
  pos: Vec2;
  size: number;
}

export interface Hole {
  name: string;
  par: number;
  ballStart: Vec2;
  holePos: Vec2;
  walls: Rect[];
  hazards: Hazard[];
  decorations: Decor[];
}

export interface BallState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  sunk: boolean;
}

export interface HoleScore {
  holeIndex: number;
  holeName: string;
  par: number;
  strokes: number;
}

export type GameScreen = 'title' | 'playing' | 'results';

// Interference: the four finish-line effects, keyed by their brief legend.
export type ZoneEffect = 'reflect' | 'hold' | 'slow' | 'reset';

export const CANVAS_W = 680;
export const CANVAS_H = 480;
export const BALL_RADIUS = 8;
export const WALL_THICKNESS = 20;
export const WALL_INSET = 40;
export const PLAYABLE_LEFT = WALL_INSET + WALL_THICKNESS;
export const PLAYABLE_RIGHT = CANVAS_W - WALL_INSET - WALL_THICKNESS;
export const PLAYABLE_TOP = WALL_INSET + WALL_THICKNESS;
export const PLAYABLE_BOTTOM = CANVAS_H - WALL_INSET - WALL_THICKNESS;
