import type { BallState, Hole, Rect, Decor, Hazard, Vec2 } from '../../../shared/types';
import {
  CANVAS_W,
  CANVAS_H,
  BALL_RADIUS,
  WALL_INSET,
  WALL_THICKNESS,
  PLAYABLE_LEFT,
  PLAYABLE_RIGHT,
  PLAYABLE_TOP,
  PLAYABLE_BOTTOM,
} from '../../../shared/types';
import type { AimState } from './input';
import { MAX_POWER } from './physics';

const COLORS = {
  ocean: '#1e6091',
  oceanDark: '#164d77',
  sand: '#e8d5a8',
  sandSpec: '#c9a876',
  wood: '#6b4423',
  woodDark: '#3a2410',
  woodLight: '#8a6038',
  hole: '#1a0f08',
  ball: '#fafafa',
  ballShadow: '#d4d4d4',
  gold: '#d4af37',
  goldDark: '#9a7e22',
  flag: '#a83232',
  skull: '#fff8e0',
  water: '#2980b9',
  sandHazard: '#c9a050',
};

let frameCount = 0;

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  hole: Hole,
  ball: BallState,
  aim: AimState,
  strokes: number,
  message: string,
  messageTimer: number,
): void {
  ctx.save();

  drawOcean(ctx);
  drawFairway(ctx);
  drawPerimeterWalls(ctx);
  drawHazards(ctx, hole.hazards);
  drawInternalWalls(ctx, hole.walls);
  drawDecorations(ctx, hole.decorations);
  drawHoleTarget(ctx, hole.holePos);

  if (!ball.sunk) {
    drawBall(ctx, ball);
  }

  if (aim.aiming && aim.power > 5) {
    drawAimArrow(ctx, ball, aim);
    drawPowerMeter(ctx, aim.power);
  }

  drawHUD(ctx, hole.name, hole.par, strokes);

  if (messageTimer > 0) {
    drawMessage(ctx, message);
  }

  ctx.restore();
}

function drawWaves(
  ctx: CanvasRenderingContext2D,
  count: number,
  startY: number,
  spacing: number,
  alpha: number,
  amplitude: number,
  phaseSpacing: number,
): void {
  ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
  ctx.lineWidth = 1.5;
  for (let i = 0; i < count; i++) {
    const y = startY + i * spacing + Math.sin(frameCount * 0.02 + i * phaseSpacing) * amplitude;
    ctx.beginPath();
    for (let x = 0; x < CANVAS_W; x += 4) {
      const sy = y + Math.sin(x * 0.015 + frameCount * 0.03 + i) * (amplitude * 0.67);
      if (x === 0) ctx.moveTo(x, sy);
      else ctx.lineTo(x, sy);
    }
    ctx.stroke();
  }
}

function drawOceanBackground(ctx: CanvasRenderingContext2D, waveCount: number, waveSpacing: number, alpha: number): void {
  ctx.fillStyle = COLORS.ocean;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  drawWaves(ctx, waveCount, 30, waveSpacing, alpha, 6, 1.2);
}

function drawOcean(ctx: CanvasRenderingContext2D): void {
  drawOceanBackground(ctx, 8, 60, 0.08);
}

function drawFairway(ctx: CanvasRenderingContext2D): void {
  const left = PLAYABLE_LEFT;
  const top = PLAYABLE_TOP;
  const w = PLAYABLE_RIGHT - PLAYABLE_LEFT;
  const h = PLAYABLE_BOTTOM - PLAYABLE_TOP;

  ctx.fillStyle = COLORS.sand;
  ctx.fillRect(left, top, w, h);

  ctx.fillStyle = COLORS.sandSpec;
  const seed = 42;
  for (let i = 0; i < 60; i++) {
    const px = left + ((seed * (i + 1) * 7) % w);
    const py = top + ((seed * (i + 1) * 13) % h);
    ctx.fillRect(px, py, 2, 2);
  }
}

function drawWoodRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = COLORS.wood;
  ctx.fillRect(x, y, w, h);

  ctx.fillStyle = COLORS.woodLight;
  ctx.fillRect(x, y, w, 2);

  ctx.fillStyle = COLORS.woodDark;
  ctx.fillRect(x, y + h - 2, w, 2);

  ctx.strokeStyle = COLORS.woodDark;
  ctx.lineWidth = 1;
  if (w > h) {
    for (let sx = x + 40; sx < x + w; sx += 40) {
      ctx.beginPath();
      ctx.moveTo(sx, y);
      ctx.lineTo(sx, y + h);
      ctx.stroke();
    }
  } else {
    for (let sy = y + 40; sy < y + h; sy += 40) {
      ctx.beginPath();
      ctx.moveTo(x, sy);
      ctx.lineTo(x + w, sy);
      ctx.stroke();
    }
  }
}

function drawPerimeterWalls(ctx: CanvasRenderingContext2D): void {
  const left = WALL_INSET;
  const top = WALL_INSET;
  const right = CANVAS_W - WALL_INSET;
  const bottom = CANVAS_H - WALL_INSET;
  const t = WALL_THICKNESS;

  drawWoodRect(ctx, left, top, right - left, t);
  drawWoodRect(ctx, left, bottom - t, right - left, t);
  drawWoodRect(ctx, left, top + t, t, bottom - top - 2 * t);
  drawWoodRect(ctx, right - t, top + t, t, bottom - top - 2 * t);
}

function drawInternalWalls(ctx: CanvasRenderingContext2D, walls: Rect[]): void {
  for (const wall of walls) {
    drawWoodRect(ctx, wall.x, wall.y, wall.w, wall.h);
  }
}

function drawHazards(ctx: CanvasRenderingContext2D, hazards: Hazard[]): void {
  for (const h of hazards) {
    if (h.type === 'water') {
      ctx.fillStyle = COLORS.water;
      ctx.globalAlpha = 0.6;
      ctx.fillRect(h.rect.x, h.rect.y, h.rect.w, h.rect.h);
      ctx.globalAlpha = 1;

      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        const wy = h.rect.y + 8 + i * 12 + Math.sin(frameCount * 0.04 + i) * 3;
        ctx.beginPath();
        for (let x = h.rect.x; x < h.rect.x + h.rect.w; x += 3) {
          const sy = wy + Math.sin(x * 0.08 + frameCount * 0.05) * 2;
          if (x === h.rect.x) ctx.moveTo(x, sy);
          else ctx.lineTo(x, sy);
        }
        ctx.stroke();
      }
    } else if (h.type === 'sand') {
      ctx.fillStyle = COLORS.sandHazard;
      ctx.fillRect(h.rect.x, h.rect.y, h.rect.w, h.rect.h);

      ctx.fillStyle = COLORS.wood;
      for (let i = 0; i < 12; i++) {
        const sx = h.rect.x + ((i * 17 + 7) % h.rect.w);
        const sy = h.rect.y + ((i * 23 + 3) % h.rect.h);
        ctx.fillRect(sx, sy, 1, 1);
      }
    }
  }
}

function drawHoleTarget(ctx: CanvasRenderingContext2D, pos: Vec2): void {
  ctx.fillStyle = COLORS.hole;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, 14, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = COLORS.gold;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(pos.x - 10, pos.y - 10);
  ctx.lineTo(pos.x + 10, pos.y + 10);
  ctx.moveTo(pos.x + 10, pos.y - 10);
  ctx.lineTo(pos.x - 10, pos.y + 10);
  ctx.stroke();

  ctx.strokeStyle = COLORS.goldDark;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pos.x, pos.y - 16);
  ctx.lineTo(pos.x, pos.y - 30);
  ctx.stroke();

  ctx.fillStyle = COLORS.flag;
  ctx.beginPath();
  ctx.moveTo(pos.x, pos.y - 30);
  ctx.lineTo(pos.x + 12, pos.y - 25);
  ctx.lineTo(pos.x, pos.y - 20);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = COLORS.skull;
  ctx.font = '7px serif';
  ctx.fillText('\u2620', pos.x + 1, pos.y - 23);
}

function drawBall(ctx: CanvasRenderingContext2D, ball: BallState): void {
  ctx.fillStyle = COLORS.ballShadow;
  ctx.beginPath();
  ctx.arc(ball.x + 1, ball.y + 1, BALL_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  const gradient = ctx.createRadialGradient(
    ball.x - 2, ball.y - 2, 1,
    ball.x, ball.y, BALL_RADIUS,
  );
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(1, COLORS.ballShadow);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, BALL_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, BALL_RADIUS, 0, Math.PI * 2);
  ctx.stroke();
}

function powerColor(power: number): string {
  const t = Math.min(power / MAX_POWER, 1);
  if (t < 0.5) {
    // Green to gold
    const r = Math.round(34 + (212 - 34) * (t * 2));
    const g = Math.round(197 + (175 - 197) * (t * 2));
    const b = Math.round(94 + (55 - 94) * (t * 2));
    return `rgb(${r},${g},${b})`;
  }
  // Gold to red
  const t2 = (t - 0.5) * 2;
  const r = Math.round(212 + (168 - 212) * t2);
  const g = Math.round(175 + (50 - 175) * t2);
  const b = Math.round(55 + (50 - 55) * t2);
  return `rgb(${r},${g},${b})`;
}

function drawAimArrow(ctx: CanvasRenderingContext2D, ball: BallState, aim: AimState): void {
  const length = Math.min(aim.power * 0.6, 120);
  const endX = ball.x + Math.cos(aim.angle) * length;
  const endY = ball.y + Math.sin(aim.angle) * length;

  const color = powerColor(aim.power);

  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(ball.x, ball.y);
  ctx.lineTo(endX, endY);
  ctx.stroke();
  ctx.setLineDash([]);

  const arrowSize = 8;
  const arrowAngle = aim.angle;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(endX, endY);
  ctx.lineTo(
    endX - arrowSize * Math.cos(arrowAngle - 0.4),
    endY - arrowSize * Math.sin(arrowAngle - 0.4),
  );
  ctx.lineTo(
    endX - arrowSize * Math.cos(arrowAngle + 0.4),
    endY - arrowSize * Math.sin(arrowAngle + 0.4),
  );
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
}

let cachedPowerGradient: CanvasGradient | null = null;

function drawPowerMeter(ctx: CanvasRenderingContext2D, power: number): void {
  const meterWidth = 200;
  const meterHeight = 12;
  const mx = (CANVAS_W - meterWidth) / 2;
  const my = CANVAS_H - 28;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.fillRect(mx - 2, my - 2, meterWidth + 4, meterHeight + 4);

  const ratio = power / MAX_POWER;
  const fillWidth = meterWidth * ratio;

  if (!cachedPowerGradient) {
    cachedPowerGradient = ctx.createLinearGradient(mx, 0, mx + meterWidth, 0);
    cachedPowerGradient.addColorStop(0, '#22c55e');
    cachedPowerGradient.addColorStop(0.5, COLORS.gold);
    cachedPowerGradient.addColorStop(1, '#ef4444');
  }
  ctx.fillStyle = cachedPowerGradient;
  ctx.fillRect(mx, my, fillWidth, meterHeight);

  ctx.strokeStyle = COLORS.woodDark;
  ctx.lineWidth = 1;
  ctx.strokeRect(mx, my, meterWidth, meterHeight);
}

function drawHUD(
  ctx: CanvasRenderingContext2D,
  holeName: string,
  par: number,
  strokes: number,
): void {
  ctx.fillStyle = 'rgba(26, 15, 8, 0.7)';
  ctx.fillRect(0, 0, CANVAS_W, 36);

  ctx.fillStyle = COLORS.skull;
  ctx.font = '14px Georgia, serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(holeName, 12, 18);

  ctx.fillStyle = COLORS.gold;
  ctx.font = '12px Georgia, serif';
  const parText = `Par ${par}`;
  ctx.fillText(parText, CANVAS_W / 2 - ctx.measureText(parText).width / 2, 18);

  ctx.fillStyle = COLORS.skull;
  ctx.font = '14px Georgia, serif';
  const strokeText = `Strokes: ${strokes}`;
  ctx.fillText(strokeText, CANVAS_W - ctx.measureText(strokeText).width - 12, 18);
}

function drawMessage(ctx: CanvasRenderingContext2D, message: string): void {
  ctx.fillStyle = 'rgba(26, 15, 8, 0.85)';
  const mw = Math.min(message.length * 10 + 40, 500);
  const mx = (CANVAS_W - mw) / 2;
  const my = CANVAS_H / 2 - 20;
  ctx.fillRect(mx, my, mw, 40);

  ctx.strokeStyle = COLORS.gold;
  ctx.lineWidth = 1;
  ctx.strokeRect(mx, my, mw, 40);

  ctx.fillStyle = COLORS.gold;
  ctx.font = 'italic 15px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(message, CANVAS_W / 2, CANVAS_H / 2);
  ctx.textAlign = 'start';
}

export function drawDecorations(ctx: CanvasRenderingContext2D, decorations: Decor[]): void {
  for (const d of decorations) {
    switch (d.type) {
      case 'coin':
        ctx.fillStyle = COLORS.gold;
        ctx.beginPath();
        ctx.arc(d.pos.x, d.pos.y, d.size / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = COLORS.goldDark;
        ctx.font = `${d.size - 4}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('$', d.pos.x, d.pos.y + 1);
        ctx.textAlign = 'start';
        break;
      case 'skull':
        ctx.fillStyle = COLORS.skull;
        ctx.font = `${d.size}px serif`;
        ctx.fillText('\u2620', d.pos.x - d.size / 2, d.pos.y + d.size / 3);
        break;
      case 'anchor':
        ctx.fillStyle = COLORS.woodDark;
        ctx.font = `${d.size}px serif`;
        ctx.fillText('\u2693', d.pos.x - d.size / 2, d.pos.y + d.size / 3);
        break;
      case 'starfish':
        ctx.fillStyle = COLORS.flag;
        ctx.font = `${d.size}px serif`;
        ctx.fillText('\u2605', d.pos.x - d.size / 2, d.pos.y + d.size / 3);
        break;
      case 'barrel':
        ctx.fillStyle = COLORS.wood;
        ctx.beginPath();
        ctx.ellipse(d.pos.x, d.pos.y, d.size / 2, d.size / 2.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = COLORS.woodDark;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(d.pos.x, d.pos.y - 2, d.size / 2.5, 2, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(d.pos.x, d.pos.y + 2, d.size / 2.5, 2, 0, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case 'palm':
        ctx.strokeStyle = COLORS.wood;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(d.pos.x, d.pos.y + d.size);
        ctx.quadraticCurveTo(d.pos.x - 3, d.pos.y + d.size / 2, d.pos.x + 2, d.pos.y);
        ctx.stroke();
        ctx.fillStyle = '#2d8a4e';
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
          ctx.beginPath();
          ctx.ellipse(
            d.pos.x + 2 + Math.cos(a) * 6,
            d.pos.y + Math.sin(a) * 4,
            8, 3, a, 0, Math.PI * 2,
          );
          ctx.fill();
        }
        break;
    }
  }
}

export function renderTitleScreen(ctx: CanvasRenderingContext2D): void {
  drawOceanBackground(ctx, 12, 40, 0.06);

  ctx.fillStyle = COLORS.gold;
  ctx.font = 'bold 48px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Pirate Putt', CANVAS_W / 2, 140);

  ctx.fillStyle = COLORS.skull;
  ctx.font = 'italic 16px Georgia, serif';
  ctx.fillText('"The real treasure be the strokes ye lost along the way."', CANVAS_W / 2, 195);

  ctx.fillStyle = COLORS.goldDark;
  ctx.font = '38px serif';
  ctx.fillText('\u2620', CANVAS_W / 2, 260);

  ctx.fillStyle = COLORS.sand;
  ctx.font = '18px Georgia, serif';
  ctx.fillText('Click anywhere to set sail', CANVAS_W / 2, 340);

  ctx.fillStyle = COLORS.woodDark;
  ctx.font = '12px Georgia, serif';
  ctx.fillText('Treasure Coast \u2022 3 holes \u2022 Solo voyage', CANVAS_W / 2, 380);

  ctx.textAlign = 'start';
}

export function renderResultsScreen(
  ctx: CanvasRenderingContext2D,
  scores: { holeName: string; par: number; strokes: number }[],
): void {
  drawOceanBackground(ctx, 12, 40, 0.06);

  ctx.fillStyle = COLORS.gold;
  ctx.font = 'bold 36px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('Drop anchor, the voyage be done.', CANVAS_W / 2, 70);

  const total = scores.reduce((s, h) => s + h.strokes, 0);
  const totalPar = scores.reduce((s, h) => s + h.par, 0);
  const diff = total - totalPar;
  const diffStr = diff === 0 ? 'Even par' : diff > 0 ? `+${diff}` : `${diff}`;

  ctx.fillStyle = COLORS.skull;
  ctx.font = '20px Georgia, serif';
  ctx.fillText(`Final score: ${total} (${diffStr})`, CANVAS_W / 2, 120);

  const tableTop = 160;
  const rowH = 40;
  ctx.font = '14px Georgia, serif';

  ctx.fillStyle = COLORS.gold;
  ctx.fillText('Hole', CANVAS_W / 2 - 160, tableTop);
  ctx.fillText('Par', CANVAS_W / 2, tableTop);
  ctx.fillText('Strokes', CANVAS_W / 2 + 120, tableTop);

  ctx.strokeStyle = COLORS.goldDark;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(CANVAS_W / 2 - 200, tableTop + 12);
  ctx.lineTo(CANVAS_W / 2 + 200, tableTop + 12);
  ctx.stroke();

  scores.forEach((s, i) => {
    const y = tableTop + (i + 1) * rowH;
    ctx.fillStyle = COLORS.skull;
    ctx.fillText(s.holeName, CANVAS_W / 2 - 160, y);
    ctx.fillText(`${s.par}`, CANVAS_W / 2, y);

    const holeDiff = s.strokes - s.par;
    if (holeDiff <= -2) ctx.fillStyle = '#fbbf24';
    else if (holeDiff <= 0) ctx.fillStyle = '#22c55e';
    else ctx.fillStyle = COLORS.flag;
    ctx.fillText(`${s.strokes}`, CANVAS_W / 2 + 120, y);
  });

  const guruQuotes = [
    '"Arr, ye putted with intention, not attachment."',
    '"Every missed putt be a lesson from the sea."',
    '"The ocean does not judge yer backswing."',
    '"Manifest yer birdies, captain."',
    '"Alignment be the key to both puttin\' and piratin\'."',
    '"Ye cannot rush the tide, nor the perfect stroke."',
  ];
  const quoteIdx = Math.floor(frameCount * 0.001) % guruQuotes.length;

  ctx.fillStyle = COLORS.goldDark;
  ctx.font = 'italic 14px Georgia, serif';
  ctx.fillText(guruQuotes[quoteIdx] ?? '', CANVAS_W / 2, tableTop + (scores.length + 2) * rowH);

  ctx.fillStyle = COLORS.sand;
  ctx.font = '16px Georgia, serif';
  ctx.fillText('Click to play again', CANVAS_W / 2, CANVAS_H - 50);
  ctx.textAlign = 'start';
}

export function drawPlayerBalls(
  ctx: CanvasRenderingContext2D,
  balls: { x: number; y: number; color: string; colorLight: string; name: string; isMe: boolean; sunk: boolean }[],
): void {
  // Draw "me" ball last so it's always on top
  const sorted = balls.filter(b => !b.isMe).concat(balls.filter(b => b.isMe));
  for (const b of sorted) {
    if (b.sunk) continue;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.arc(b.x + 1, b.y + 1, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    // Ball with player color
    const gradient = ctx.createRadialGradient(
      b.x - 2, b.y - 2, 1,
      b.x, b.y, BALL_RADIUS,
    );
    gradient.addColorStop(0, b.colorLight);
    gradient.addColorStop(1, b.color);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(b.x, b.y, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    // Outline
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.arc(b.x, b.y, BALL_RADIUS, 0, Math.PI * 2);
    ctx.stroke();

    // Name label above ball
    ctx.fillStyle = b.isMe ? COLORS.gold : COLORS.skull;
    ctx.font = '10px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(b.name, b.x, b.y - BALL_RADIUS - 3);
    ctx.textAlign = 'start';
  }
}

export function drawMultiplayerHUD(
  ctx: CanvasRenderingContext2D,
  timerSeconds: number,
  scores: { name: string; strokes: number; color: string; sunk: boolean }[],
): void {
  // Timer display (top center, over the existing HUD bar)
  const timerText = `${timerSeconds}s`;
  ctx.fillStyle = timerSeconds <= 5 ? COLORS.flag : COLORS.gold;
  ctx.font = 'bold 14px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(timerText, CANVAS_W / 2, 18);
  ctx.textAlign = 'start';

  // Scoreboard on right side
  const sbX = CANVAS_W - 110;
  const sbY = 44;
  const rowH = 16;
  const sbH = scores.length * rowH + 8;

  ctx.fillStyle = 'rgba(26, 15, 8, 0.7)';
  ctx.fillRect(sbX - 4, sbY - 4, 114, sbH);

  ctx.font = '10px Georgia, serif';
  scores.forEach((s, i) => {
    const y = sbY + i * rowH + 10;

    // Color dot
    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.arc(sbX + 6, y - 3, 4, 0, Math.PI * 2);
    ctx.fill();

    // Name
    ctx.fillStyle = s.sunk ? COLORS.gold : COLORS.skull;
    ctx.textBaseline = 'middle';
    ctx.fillText(truncName(s.name, 8), sbX + 16, y - 2);

    // Strokes
    ctx.fillText(`${s.strokes}`, sbX + 90, y - 2);
  });
}

export function renderMultiplayerResults(
  ctx: CanvasRenderingContext2D,
  finalScores: { playerId: string; total: number }[],
  awards: { name: string; playerId: string }[],
  playerNames: Map<string, { name: string; avatarId: number; color: string }>,
  frame: number = 999,
): void {
  drawOceanBackground(ctx, 12, 40, 0.06);

  // Title fades in over first 30 frames
  const titleAlpha = Math.min(1, frame / 30);
  ctx.globalAlpha = titleAlpha;
  ctx.fillStyle = COLORS.gold;
  ctx.font = 'bold 36px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('Drop anchor, the voyage be done.', CANVAS_W / 2, 60);

  // Header
  ctx.font = '14px Georgia, serif';
  ctx.fillStyle = COLORS.gold;
  ctx.fillText('Rank', CANVAS_W / 2 - 160, 110);
  ctx.fillText('Sailor', CANVAS_W / 2 - 60, 110);
  ctx.fillText('Total', CANVAS_W / 2 + 120, 110);

  ctx.strokeStyle = COLORS.goldDark;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(CANVAS_W / 2 - 200, 122);
  ctx.lineTo(CANVAS_W / 2 + 200, 122);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Each row fades in 18 frames apart (0.3s at 60fps)
  finalScores.forEach((s, i) => {
    const rowStart = 30 + i * 18;
    const rowAlpha = Math.min(1, Math.max(0, (frame - rowStart) / 15));
    if (rowAlpha <= 0) return;

    ctx.globalAlpha = rowAlpha;
    const y = 150 + i * 32;
    const info = playerNames.get(s.playerId);
    const name = info?.name ?? 'Unknown';
    const color = info?.color ?? '#888';

    // Winner pulse
    if (i === 0) {
      const pulse = 0.85 + Math.sin(frame * 0.08) * 0.15;
      ctx.globalAlpha = rowAlpha * pulse;
    }

    // Rank
    ctx.fillStyle = i === 0 ? COLORS.gold : COLORS.skull;
    ctx.font = i === 0 ? 'bold 16px Georgia, serif' : '14px Georgia, serif';
    ctx.fillText(`${i + 1}.`, CANVAS_W / 2 - 160, y);

    // Color dot
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(CANVAS_W / 2 - 80, y - 4, 5, 0, Math.PI * 2);
    ctx.fill();

    // Name
    ctx.fillStyle = i === 0 ? COLORS.gold : COLORS.skull;
    ctx.fillText(name, CANVAS_W / 2 - 60, y);

    // Score
    ctx.fillText(`${s.total}`, CANVAS_W / 2 + 120, y);
    ctx.globalAlpha = 1;
  });

  // Awards slide in after all scores revealed
  const awardsStart = 30 + finalScores.length * 18 + 20;
  if (awards.length > 0 && frame > awardsStart) {
    const awardsY = 160 + finalScores.length * 32 + 20;
    ctx.font = 'italic 12px Georgia, serif';

    awards.forEach((a, i) => {
      const aStart = awardsStart + i * 12;
      const aAlpha = Math.min(1, Math.max(0, (frame - aStart) / 15));
      if (aAlpha <= 0) return;
      ctx.globalAlpha = aAlpha;
      const slideY = (1 - aAlpha) * 15;
      const info = playerNames.get(a.playerId);
      const name = info?.name ?? 'Unknown';
      ctx.fillStyle = COLORS.goldDark;
      ctx.fillText(`${a.name}: ${name}`, CANVAS_W / 2, awardsY + i * 20 + slideY);
    });
    ctx.globalAlpha = 1;
  }

  ctx.textAlign = 'start';
}

export function lightenColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lr = Math.min(255, r + 80);
  const lg = Math.min(255, g + 80);
  const lb = Math.min(255, b + 80);
  return `rgb(${lr},${lg},${lb})`;
}

function truncName(name: string, maxLen: number): string {
  return name.length > maxLen ? name.slice(0, maxLen) + '..' : name;
}

export function tickFrame(): void {
  frameCount++;
}
