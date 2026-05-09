import type { BallState, Hole, GameScreen, HoleScore } from '../../../shared/types';
import { stepPhysics, launchBall } from './physics';
import { createAimState, setupInput } from './input';
import { renderFrame, renderTitleScreen, renderResultsScreen, tickFrame } from './render';

const PIRATE_COPY: Record<string, string> = {
  ace: 'A legendary shot, captain.',
  eagle: "By Davy Jones' locker, that was somethin'.",
  birdie: "Smooth sailin', ye sea dog.",
  par: 'Steady as she goes.',
  bogey: "Ye'll find yer sea legs yet.",
  worse: 'The kraken got ye that time.',
  water: 'Splashed into the briny deep.',
};

function getScoreCopy(strokes: number, par: number): string {
  const diff = strokes - par;
  if (strokes === 1) return PIRATE_COPY.ace ?? '';
  if (diff <= -2) return PIRATE_COPY.eagle ?? '';
  if (diff === -1) return PIRATE_COPY.birdie ?? '';
  if (diff === 0) return PIRATE_COPY.par ?? '';
  if (diff === 1) return PIRATE_COPY.bogey ?? '';
  return PIRATE_COPY.worse ?? '';
}

export function createGame(canvas: HTMLCanvasElement, holes: Hole[]): void {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas 2D context not available');

  let screen: GameScreen = 'title';
  let currentHoleIndex = 0;
  let strokes = 0;
  let message = '';
  let messageTimer = 0;
  let sinkPause = 0;
  let waterResetPos = { x: 0, y: 0 };
  const scores: HoleScore[] = [];

  const aim = createAimState();

  let ball: BallState = {
    x: 0, y: 0,
    vx: 0, vy: 0,
    sunk: false,
  };

  function currentHole(): Hole {
    return holes[currentHoleIndex]!;
  }

  function resetBall(): void {
    const h = currentHole();
    ball.x = h.ballStart.x;
    ball.y = h.ballStart.y;
    ball.vx = 0;
    ball.vy = 0;
    ball.sunk = false;
    waterResetPos = { x: h.ballStart.x, y: h.ballStart.y };
  }

  function startHole(): void {
    strokes = 0;
    message = '';
    messageTimer = 0;
    sinkPause = 0;
    resetBall();
  }

  function handleShoot(angle: number, power: number): void {
    if (screen !== 'playing') return;
    if (ball.sunk) return;
    if (ball.vx !== 0 || ball.vy !== 0) return;

    waterResetPos = { x: ball.x, y: ball.y };
    launchBall(ball, angle, power);
    strokes++;
  }

  setupInput(canvas, aim, () => ball, handleShoot);

  const onTitleClick = () => {
    if (screen === 'title') {
      screen = 'playing';
      currentHoleIndex = 0;
      scores.length = 0;
      startHole();
    }
  };

  const onResultsClick = () => {
    if (screen === 'results') {
      screen = 'title';
    }
  };

  canvas.addEventListener('pointerdown', (e) => {
    if (screen === 'title') {
      onTitleClick();
      e.preventDefault();
    } else if (screen === 'results') {
      onResultsClick();
      e.preventDefault();
    }
  });

  const resetBtn = document.getElementById('reset-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (screen === 'playing' && ball.vx === 0 && ball.vy === 0 && !ball.sunk) {
        resetBall();
      }
    });
  }

  function loop(): void {
    tickFrame();

    if (screen === 'title') {
      renderTitleScreen(ctx!);
      requestAnimationFrame(loop);
      return;
    }

    if (screen === 'results') {
      renderResultsScreen(ctx!, scores);
      requestAnimationFrame(loop);
      return;
    }

    if (sinkPause > 0) {
      sinkPause--;
      if (sinkPause === 0) {
        if (currentHoleIndex < holes.length - 1) {
          currentHoleIndex++;
          startHole();
        } else {
          screen = 'results';
        }
      }
      renderFrame(ctx!, currentHole(), ball, aim, strokes, message, messageTimer);
      requestAnimationFrame(loop);
      return;
    }

    const hole = currentHole();
    if (!ball.sunk && (ball.vx !== 0 || ball.vy !== 0)) {
      const result = stepPhysics(ball, hole.walls, hole.hazards, hole.holePos);

      if (result.waterReset) {
        ball.x = waterResetPos.x;
        ball.y = waterResetPos.y;
        ball.vx = 0;
        ball.vy = 0;
        strokes++;
        message = PIRATE_COPY.water ?? '';
        messageTimer = 90;
      }

      if (result.sunk) {
        scores.push({
          holeIndex: currentHoleIndex,
          holeName: hole.name,
          par: hole.par,
          strokes: strokes,
        });
        message = getScoreCopy(strokes, hole.par);
        messageTimer = 120;
        sinkPause = 120;
      }
    }

    if (messageTimer > 0) messageTimer--;

    renderFrame(ctx!, hole, ball, aim, strokes, message, messageTimer);
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}
