/**
 * Daily Putt game mode - single hole, submit score on completion.
 * Works in both Discord Activity and standalone modes.
 */
import type { Hole, BallState } from '../../../shared/types';
import { CANVAS_W, CANVAS_H } from '../../../shared/types';
import { stepPhysics, launchBall } from './physics';
import { createAimState, setupInput } from './input';
import { renderFrame, tickFrame } from './render';
import { initAudio, playPutt, playSink, playSplash } from './audio';
import { getDiscordContext } from '../discord/sdk';

interface DailyState {
  hole: Hole;
  ball: BallState;
  strokes: number;
  sunk: boolean;
  waterResetPos: { x: number; y: number };
  submitted: boolean;
  message: string;
  messageTimer: number;
  dateString: string;
}

export async function createDailyGame(
  canvas: HTMLCanvasElement,
  onComplete: (strokes: number) => void,
): Promise<{ destroy: () => void }> {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas 2D context not available');

  initAudio();

  // Fetch today's daily hole from the server
  const apiBase = getDiscordContext() ? '/.proxy' : '';
  const res = await fetch(`${apiBase}/api/daily/hole`);
  const data = (await res.json()) as { date: string; hole: Hole };

  const aim = createAimState();
  const state: DailyState = {
    hole: data.hole,
    ball: {
      x: data.hole.ballStart.x,
      y: data.hole.ballStart.y,
      vx: 0,
      vy: 0,
      sunk: false,
    },
    strokes: 0,
    sunk: false,
    waterResetPos: { x: data.hole.ballStart.x, y: data.hole.ballStart.y },
    submitted: false,
    message: `Daily Putt: ${data.hole.name}`,
    messageTimer: 180,
    dateString: data.date,
  };

  function getMyBall(): BallState {
    return state.ball;
  }

  function handleShoot(angle: number, power: number): void {
    if (state.sunk) return;
    if (state.ball.vx !== 0 || state.ball.vy !== 0) return;

    playPutt();
    state.waterResetPos = { x: state.ball.x, y: state.ball.y };
    launchBall(state.ball, angle, power);
    state.strokes++;
  }

  const cleanupInput = setupInput(canvas, aim, getMyBall, handleShoot);

  let animFrameId = 0;

  function loop(): void {
    tickFrame();

    // Step physics locally
    if (!state.sunk && (state.ball.vx !== 0 || state.ball.vy !== 0)) {
      const result = stepPhysics(state.ball, state.hole.walls, state.hole.hazards, state.hole.holePos);

      if (result.waterReset) {
        state.ball.x = state.waterResetPos.x;
        state.ball.y = state.waterResetPos.y;
        state.ball.vx = 0;
        state.ball.vy = 0;
        state.strokes++;
        playSplash();
      }

      if (result.sunk) {
        state.sunk = true;
        state.ball.sunk = true;
        playSink();
        submitScore();
      }
    }

    if (state.messageTimer > 0) state.messageTimer--;

    const displayMsg = state.messageTimer > 0 ? state.message : '';

    renderFrame(
      ctx!,
      state.hole,
      state.ball,
      aim,
      state.strokes,
      displayMsg,
      displayMsg ? 1 : 0,
    );

    // Show completion message
    if (state.sunk) {
      ctx!.fillStyle = 'rgba(26, 15, 8, 0.7)';
      ctx!.fillRect(CANVAS_W / 2 - 120, 180, 240, 80);
      ctx!.fillStyle = '#d4af37';
      ctx!.font = 'bold 22px Georgia, serif';
      ctx!.textAlign = 'center';
      ctx!.fillText('Hole sunk!', CANVAS_W / 2, 210);
      ctx!.fillStyle = '#fff8e0';
      ctx!.font = '16px Georgia, serif';
      ctx!.fillText(`${state.strokes} strokes (par ${state.hole.par})`, CANVAS_W / 2, 240);
      ctx!.textAlign = 'start';
    }

    if (!state.sunk) {
      animFrameId = requestAnimationFrame(loop);
    } else {
      // Final frame rendered; stop the loop
      animFrameId = 0;
    }
  }

  async function submitScore(): Promise<void> {
    if (state.submitted) return;
    state.submitted = true;

    const discordCtx = getDiscordContext();
    if (!discordCtx) {
      onComplete(state.strokes);
      return;
    }

    try {
      const apiBase = '/.proxy';
      await fetch(`${apiBase}/api/daily/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${discordCtx.accessToken}`,
        },
        body: JSON.stringify({
          guildId: discordCtx.guildId,
          strokes: state.strokes,
          date: state.dateString,
        }),
      });
    } catch (err) {
      console.error('Failed to submit daily score:', err);
    }

    onComplete(state.strokes);
  }

  animFrameId = requestAnimationFrame(loop);

  return {
    destroy: () => {
      cancelAnimationFrame(animFrameId);
      cleanupInput();
    },
  };
}
