import type { BallState } from '../../../shared/types';
import { CANVAS_W, CANVAS_H } from '../../../shared/types';
import { MAX_POWER } from './physics';

export interface AimState {
  aiming: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  angle: number;
  power: number;
}

export function createAimState(): AimState {
  return {
    aiming: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    angle: 0,
    power: 0,
  };
}

const coordsResult = { x: 0, y: 0 };

export type ShootCallback = (angle: number, power: number) => void;

export function setupInput(
  canvas: HTMLCanvasElement,
  aim: AimState,
  getBall: () => BallState,
  onShoot: ShootCallback,
): () => void {
  let cachedRect = canvas.getBoundingClientRect();
  let scaleX = CANVAS_W / cachedRect.width;
  let scaleY = CANVAS_H / cachedRect.height;

  const onResize = () => {
    cachedRect = canvas.getBoundingClientRect();
    scaleX = CANVAS_W / cachedRect.width;
    scaleY = CANVAS_H / cachedRect.height;
  };
  window.addEventListener('resize', onResize);

  function canvasCoords(e: PointerEvent): { x: number; y: number } {
    coordsResult.x = (e.clientX - cachedRect.left) * scaleX;
    coordsResult.y = (e.clientY - cachedRect.top) * scaleY;
    return coordsResult;
  }
  const onPointerDown = (e: PointerEvent) => {
    const ball = getBall();
    if (ball.sunk || (ball.vx !== 0 || ball.vy !== 0)) return;

    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const pos = canvasCoords(e);
    aim.aiming = true;
    aim.startX = pos.x;
    aim.startY = pos.y;
    aim.currentX = pos.x;
    aim.currentY = pos.y;
    aim.power = 0;
    aim.angle = 0;
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!aim.aiming) return;
    e.preventDefault();
    const pos = canvasCoords(e);
    aim.currentX = pos.x;
    aim.currentY = pos.y;

    const dx = aim.startX - aim.currentX;
    const dy = aim.startY - aim.currentY;
    aim.angle = Math.atan2(dy, dx);
    aim.power = Math.min(Math.sqrt(dx * dx + dy * dy), MAX_POWER);
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!aim.aiming) return;
    e.preventDefault();
    aim.aiming = false;

    if (aim.power > 5) {
      onShoot(aim.angle, aim.power);
    }
    aim.power = 0;
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);

  return () => {
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerUp);
    window.removeEventListener('resize', onResize);
  };
}
