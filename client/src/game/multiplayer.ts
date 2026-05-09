import type { BallState, Hole, Vec2 } from '../../../shared/types';
import { CANVAS_W, CANVAS_H } from '../../../shared/types';
import type { Player, ServerMessage } from '../../../shared/messages';
import { AVATARS } from '../../../shared/avatars';
import { treasureCoast } from '../../../shared/courses';
import { stepPhysics, POWER_SCALE } from './physics';
import { createAimState, setupInput } from './input';
import {
  renderFrame,
  tickFrame,
  drawPlayerBalls,
  drawMultiplayerHUD,
  renderMultiplayerResults,
  lightenColor,
} from './render';
import { initAudio, playPutt, playBounce, playSink, playSplash, playTimerWarning } from './audio';
import { createEmoteBar, getEmoteText } from '../ui/emotes';
import type { EmoteKey } from '../ui/emotes';
import type { GameSocket } from '../net/socket';

interface PlayerBallState {
  playerId: string;
  name: string;
  avatarId: number;
  color: string;
  colorLight: string;
  ball: BallState;
  strokes: number;
}

interface SunkEvent {
  text: string;
  timer: number;
}

interface EmoteBubble {
  playerId: string;
  text: string;
  timer: number;
  maxTimer: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
}

interface SinkAnim {
  playerId: string;
  x: number;
  y: number;
  holeX: number;
  holeY: number;
  color: string;
  colorLight: string;
  frame: number;
  maxFrames: number;
}

interface HoleOverlay {
  alpha: number;
  fadingIn: boolean;
  holeName: string;
  scores: { name: string; strokes: number; color: string }[];
  isFinal: boolean;
}

type MultiplayerPhase = 'playing' | 'betweenHoles' | 'results';

interface MultiplayerState {
  phase: MultiplayerPhase;
  myId: string;
  holes: Hole[];
  currentHoleIndex: number;
  timer: number;
  timerStart: number;
  playerBalls: Map<string, PlayerBallState>;
  sunkEvents: SunkEvent[];
  holeScores: Map<string, number[]>;
  finalScores: { playerId: string; total: number }[];
  awards: { name: string; playerId: string }[];
  resultsPlayerNames: Map<string, { name: string; avatarId: number; color: string }>;
  message: string;
  messageTimer: number;
  emoteBubbles: EmoteBubble[];
  particles: Particle[];
  sinkAnims: SinkAnim[];
  holeOverlay: HoleOverlay | null;
  resultsFrame: number;
  timerWarningPlayed: boolean;
}

const DUMMY_BALL: BallState = { x: -100, y: -100, vx: 0, vy: 0, sunk: true };
const EMOTE_DURATION = 120; // 2 seconds at 60fps
const SINK_ANIM_FRAMES = 20;
const PARTICLE_LIFE = 40;

function getCourseHoles(_courseId: string): Hole[] {
  return treasureCoast;
}

export function createMultiplayerGame(
  canvas: HTMLCanvasElement,
  socket: GameSocket,
  myId: string,
  players: Player[],
  courseId: string,
  initialHoleIndex: number,
  onReturnToLobby: () => void,
): { destroy: () => void; handleMessage: (msg: ServerMessage) => void } {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas 2D context not available');

  initAudio();

  const holes = getCourseHoles(courseId);
  const aim = createAimState();

  const mpState: MultiplayerState = {
    phase: 'playing',
    myId,
    holes,
    currentHoleIndex: initialHoleIndex,
    timer: 30,
    timerStart: Date.now(),
    playerBalls: new Map(),
    sunkEvents: [],
    holeScores: new Map(),
    finalScores: [],
    awards: [],
    resultsPlayerNames: new Map(),
    message: '',
    messageTimer: 0,
    emoteBubbles: [],
    particles: [],
    sinkAnims: [],
    holeOverlay: null,
    resultsFrame: 0,
    timerWarningPlayed: false,
  };

  // Pre-allocated arrays reused each frame
  const allBalls: { x: number; y: number; color: string; colorLight: string; name: string; isMe: boolean; sunk: boolean }[] = [];
  const scoreEntries: { name: string; strokes: number; color: string; sunk: boolean }[] = [];

  for (const p of players) {
    const avatar = AVATARS.find(a => a.id === p.avatarId);
    const color = avatar?.color ?? '#888888';
    mpState.playerBalls.set(p.id, {
      playerId: p.id,
      name: p.name,
      avatarId: p.avatarId,
      color,
      colorLight: lightenColor(color),
      ball: { x: 0, y: 0, vx: 0, vy: 0, sunk: false },
      strokes: 0,
    });
    mpState.holeScores.set(p.id, []);
  }

  // Emote bar
  const emoteBar = createEmoteBar(canvas.parentElement!, (key: EmoteKey) => {
    socket.send({ type: 'emote', key });
  });

  function getMyBall(): BallState {
    const p = mpState.playerBalls.get(myId);
    if (p) return p.ball;
    return DUMMY_BALL;
  }

  function handleShoot(angle: number, power: number): void {
    if (mpState.phase !== 'playing') return;
    const myBall = mpState.playerBalls.get(myId);
    if (!myBall || myBall.ball.sunk) return;
    if (myBall.ball.vx !== 0 || myBall.ball.vy !== 0) return;

    playPutt();
    socket.send({ type: 'shoot', angle, power });
  }

  const cleanupInput = setupInput(canvas, aim, getMyBall, handleShoot);

  // "Play again" button click detection
  function handleCanvasClick(e: MouseEvent): void {
    if (mpState.phase !== 'results') return;

    const btnStart = 30 + mpState.finalScores.length * 18 + mpState.awards.length * 12 + 60;
    if (mpState.resultsFrame <= btnStart) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    const cx = (e.clientX - rect.left) * scaleX;
    const cy = (e.clientY - rect.top) * scaleY;

    const bx = CANVAS_W / 2 - 70;
    const by = 380;
    if (cx >= bx && cx <= bx + 140 && cy >= by && cy <= by + 36) {
      onReturnToLobby();
    }
  }
  canvas.addEventListener('click', handleCanvasClick);

  function spawnSinkParticles(x: number, y: number): void {
    for (let i = 0; i < 12; i++) {
      const angle = (Math.PI * 2 * i) / 12 + Math.random() * 0.3;
      const speed = 1.5 + Math.random() * 2;
      mpState.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: PARTICLE_LIFE,
        maxLife: PARTICLE_LIFE,
        color: Math.random() > 0.5 ? '#d4af37' : '#e0c050',
      });
    }
  }

  function handleMessage(msg: ServerMessage): void {
    if (msg.type === 'holeStart') {
      mpState.phase = 'playing';
      mpState.currentHoleIndex = msg.holeIndex;
      mpState.timer = msg.timerSeconds;
      mpState.timerStart = Date.now();
      mpState.sunkEvents.length = 0;
      mpState.message = '';
      mpState.messageTimer = 0;
      mpState.sinkAnims.length = 0;
      mpState.particles.length = 0;
      mpState.timerWarningPlayed = false;

      // Fade out hole overlay
      if (mpState.holeOverlay) {
        mpState.holeOverlay.fadingIn = false;
      }

      const hole = holes[msg.holeIndex];
      if (hole) {
        let idx = 0;
        const count = mpState.playerBalls.size;
        for (const pb of mpState.playerBalls.values()) {
          const offset = count > 1
            ? (idx - (count - 1) / 2) * 14
            : 0;
          pb.ball = {
            x: hole.ballStart.x,
            y: hole.ballStart.y + offset,
            vx: 0,
            vy: 0,
            sunk: false,
          };
          pb.strokes = 0;
          idx++;
        }
      }
    }

    if (msg.type === 'ballUpdate') {
      for (const s of msg.states) {
        const pb = mpState.playerBalls.get(s.playerId);
        if (pb) {
          // Detect wall bounce (velocity direction changed)
          if (!pb.ball.sunk && (
            (pb.ball.vx !== 0 && Math.sign(pb.ball.vx) !== Math.sign(s.vx) && s.vx !== 0) ||
            (pb.ball.vy !== 0 && Math.sign(pb.ball.vy) !== Math.sign(s.vy) && s.vy !== 0)
          )) {
            playBounce();
          }

          pb.ball.x = s.x;
          pb.ball.y = s.y;
          pb.ball.vx = s.vx;
          pb.ball.vy = s.vy;
          pb.ball.sunk = s.sunk;
        }
      }
    }

    if (msg.type === 'sunk') {
      const pb = mpState.playerBalls.get(msg.playerId);
      if (pb) {
        pb.strokes = msg.strokes;
        const text = `${pb.name} sunk it! (${msg.strokes} strokes, ${ordinal(msg.place)})`;
        mpState.sunkEvents.push({ text, timer: 180 });

        // Start sink animation instead of immediately hiding
        const hole = holes[mpState.currentHoleIndex];
        if (hole) {
          mpState.sinkAnims.push({
            playerId: msg.playerId,
            x: pb.ball.x,
            y: pb.ball.y,
            holeX: hole.holePos.x,
            holeY: hole.holePos.y,
            color: pb.color,
            colorLight: pb.colorLight,
            frame: 0,
            maxFrames: SINK_ANIM_FRAMES,
          });
        }

        playSink();
        pb.ball.sunk = true;
      }
    }

    if (msg.type === 'holeEnd') {
      mpState.phase = 'betweenHoles';
      const overlayScores: { name: string; strokes: number; color: string }[] = [];
      for (const score of msg.scores) {
        const pb = mpState.playerBalls.get(score.playerId);
        if (pb) {
          pb.strokes = score.strokes;
          overlayScores.push({ name: pb.name, strokes: score.strokes, color: pb.color });
        }
        const scoreList = mpState.holeScores.get(score.playerId);
        if (scoreList) {
          scoreList.push(score.strokes);
        }
      }

      const hole = holes[mpState.currentHoleIndex];
      const isFinal = msg.nextStartsIn === 0;
      mpState.holeOverlay = {
        alpha: 0,
        fadingIn: true,
        holeName: hole?.name ?? '',
        scores: overlayScores,
        isFinal,
      };
    }

    if (msg.type === 'gameEnd') {
      mpState.phase = 'results';
      mpState.finalScores = msg.finalScores;
      mpState.awards = msg.awards;
      mpState.resultsFrame = 0;
      mpState.resultsPlayerNames.clear();
      for (const pb of mpState.playerBalls.values()) {
        mpState.resultsPlayerNames.set(pb.playerId, {
          name: pb.name,
          avatarId: pb.avatarId,
          color: pb.color,
        });
      }
    }

    if (msg.type === 'emote') {
      const pb = mpState.playerBalls.get(msg.playerId);
      if (pb) {
        // Remove existing bubble for this player
        mpState.emoteBubbles = mpState.emoteBubbles.filter(b => b.playerId !== msg.playerId);
        mpState.emoteBubbles.push({
          playerId: msg.playerId,
          text: getEmoteText(msg.key),
          timer: EMOTE_DURATION,
          maxTimer: EMOTE_DURATION,
        });
      }
    }
  }

  let animFrameId = 0;

  function loop(): void {
    tickFrame();

    if (mpState.phase === 'results') {
      mpState.resultsFrame++;
      renderMultiplayerResults(
        ctx!, mpState.finalScores, mpState.awards, mpState.resultsPlayerNames,
        mpState.resultsFrame,
      );

      // Draw "Play again" button after animation settles
      const btnStart = 30 + mpState.finalScores.length * 18 + mpState.awards.length * 12 + 60;
      if (mpState.resultsFrame > btnStart) {
        const btnAlpha = Math.min(1, (mpState.resultsFrame - btnStart) / 20);
        ctx!.globalAlpha = btnAlpha;
        const bx = CANVAS_W / 2 - 70;
        const by = 380;
        ctx!.fillStyle = '#d4af37';
        ctx!.fillRect(bx, by, 140, 36);
        ctx!.fillStyle = '#1a0f08';
        ctx!.font = 'bold 15px Georgia, serif';
        ctx!.textAlign = 'center';
        ctx!.textBaseline = 'middle';
        ctx!.fillText('Play again', CANVAS_W / 2, by + 18);
        ctx!.textAlign = 'start';
        ctx!.textBaseline = 'alphabetic';
        ctx!.globalAlpha = 1;
      }

      animFrameId = requestAnimationFrame(loop);
      return;
    }

    const hole = holes[mpState.currentHoleIndex];
    if (!hole) {
      animFrameId = requestAnimationFrame(loop);
      return;
    }

    // Update timer display from elapsed time
    const elapsed = (Date.now() - mpState.timerStart) / 1000;
    mpState.timer = Math.max(0, 30 - elapsed);

    // Timer warning
    if (mpState.timer <= 5 && !mpState.timerWarningPlayed && mpState.phase === 'playing') {
      mpState.timerWarningPlayed = true;
      mpState.message = "The tide be turnin', captain.";
      mpState.messageTimer = 120;
      playTimerWarning();
    }

    // Decay sunk events in-place
    for (let i = mpState.sunkEvents.length - 1; i >= 0; i--) {
      mpState.sunkEvents[i]!.timer--;
      if (mpState.sunkEvents[i]!.timer <= 0) {
        mpState.sunkEvents.splice(i, 1);
      }
    }

    // Decay emote bubbles
    for (let i = mpState.emoteBubbles.length - 1; i >= 0; i--) {
      mpState.emoteBubbles[i]!.timer--;
      if (mpState.emoteBubbles[i]!.timer <= 0) {
        mpState.emoteBubbles.splice(i, 1);
      }
    }

    // Tick sink animations
    for (let i = mpState.sinkAnims.length - 1; i >= 0; i--) {
      const sa = mpState.sinkAnims[i]!;
      sa.frame++;
      if (sa.frame >= sa.maxFrames) {
        spawnSinkParticles(sa.holeX, sa.holeY);
        mpState.sinkAnims.splice(i, 1);
      }
    }

    // Tick particles
    for (let i = mpState.particles.length - 1; i >= 0; i--) {
      const p = mpState.particles[i]!;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05; // gravity
      p.life--;
      if (p.life <= 0) {
        mpState.particles.splice(i, 1);
      }
    }

    if (mpState.messageTimer > 0) mpState.messageTimer--;

    const myBallState = mpState.playerBalls.get(myId);

    const displayMsg = mpState.messageTimer > 0 ? mpState.message : '';
    const latestSunk = mpState.sunkEvents.length > 0
      ? mpState.sunkEvents[mpState.sunkEvents.length - 1]!.text
      : '';
    const msgToShow = displayMsg || latestSunk;

    renderFrame(
      ctx!,
      hole,
      DUMMY_BALL,
      aim,
      myBallState?.strokes ?? 0,
      msgToShow,
      msgToShow ? 1 : 0,
    );

    // Draw trajectory preview when aiming
    if (aim.aiming && aim.power > 5 && myBallState && !myBallState.ball.sunk) {
      drawTrajectoryPreview(ctx!, myBallState.ball, aim.angle, aim.power, myBallState.color, hole);
    }

    // Reuse pre-allocated arrays
    allBalls.length = 0;
    scoreEntries.length = 0;
    for (const pb of mpState.playerBalls.values()) {
      // Skip balls in sink animation (they're drawn separately)
      const inSinkAnim = mpState.sinkAnims.some(sa => sa.playerId === pb.playerId);
      allBalls.push({
        x: pb.ball.x,
        y: pb.ball.y,
        color: pb.color,
        colorLight: pb.colorLight,
        name: pb.name,
        isMe: pb.playerId === myId,
        sunk: pb.ball.sunk && !inSinkAnim,
      });
      scoreEntries.push({
        name: pb.name,
        strokes: pb.strokes,
        color: pb.color,
        sunk: pb.ball.sunk,
      });
    }
    drawPlayerBalls(ctx!, allBalls);

    // Draw sink animations
    for (const sa of mpState.sinkAnims) {
      const t = sa.frame / sa.maxFrames;
      const spiralAngle = t * Math.PI * 3;
      const radius = (1 - t) * 12;
      const cx = sa.holeX + Math.cos(spiralAngle) * radius;
      const cy = sa.holeY + Math.sin(spiralAngle) * radius;
      const scale = 1 - t * 0.6;

      ctx!.globalAlpha = 1 - t * 0.5;
      const grad = ctx!.createRadialGradient(cx - 1, cy - 1, 0.5, cx, cy, 8 * scale);
      grad.addColorStop(0, sa.colorLight);
      grad.addColorStop(1, sa.color);
      ctx!.fillStyle = grad;
      ctx!.beginPath();
      ctx!.arc(cx, cy, 8 * scale, 0, Math.PI * 2);
      ctx!.fill();
      ctx!.globalAlpha = 1;
    }

    // Draw particles
    for (const p of mpState.particles) {
      const alpha = p.life / p.maxLife;
      ctx!.globalAlpha = alpha;
      ctx!.fillStyle = p.color;
      ctx!.beginPath();
      ctx!.arc(p.x, p.y, 2.5 * alpha, 0, Math.PI * 2);
      ctx!.fill();
    }
    ctx!.globalAlpha = 1;

    // Draw emote bubbles
    for (const eb of mpState.emoteBubbles) {
      const pb = mpState.playerBalls.get(eb.playerId);
      if (!pb || pb.ball.sunk) continue;
      const alpha = Math.min(1, eb.timer / 30); // fade out in last 0.5s
      const rise = (1 - eb.timer / eb.maxTimer) * 20;
      ctx!.globalAlpha = alpha;
      ctx!.fillStyle = 'rgba(26, 15, 8, 0.8)';
      const textWidth = ctx!.measureText(eb.text).width;
      const bx = pb.ball.x - textWidth / 2 - 6;
      const by = pb.ball.y - 30 - rise;
      ctx!.fillRect(bx, by - 10, textWidth + 12, 18);
      ctx!.fillStyle = '#fff8e0';
      ctx!.font = '10px Georgia, serif';
      ctx!.textAlign = 'center';
      ctx!.textBaseline = 'middle';
      ctx!.fillText(eb.text, pb.ball.x, by - 1);
      ctx!.textAlign = 'start';
      ctx!.globalAlpha = 1;
    }

    drawMultiplayerHUD(ctx!, Math.ceil(mpState.timer), scoreEntries);

    // Draw hole overlay (between holes transition)
    if (mpState.holeOverlay) {
      const ov = mpState.holeOverlay;
      if (ov.fadingIn && ov.alpha < 1) {
        ov.alpha = Math.min(1, ov.alpha + 0.03);
      } else if (!ov.fadingIn && ov.alpha > 0) {
        ov.alpha = Math.max(0, ov.alpha - 0.05);
        if (ov.alpha <= 0) {
          mpState.holeOverlay = null;
        }
      }

      if (mpState.holeOverlay) {
        ctx!.globalAlpha = ov.alpha * 0.85;
        ctx!.fillStyle = '#1a0f08';
        ctx!.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx!.globalAlpha = ov.alpha;

        ctx!.fillStyle = '#d4af37';
        ctx!.font = 'bold 24px Georgia, serif';
        ctx!.textAlign = 'center';
        ctx!.fillText(ov.holeName + ' complete', CANVAS_W / 2, 160);

        ctx!.font = '14px Georgia, serif';
        ov.scores.forEach((s, i) => {
          const y = 200 + i * 28;
          ctx!.fillStyle = s.color;
          ctx!.beginPath();
          ctx!.arc(CANVAS_W / 2 - 80, y - 3, 5, 0, Math.PI * 2);
          ctx!.fill();
          ctx!.fillStyle = '#fff8e0';
          ctx!.fillText(s.name, CANVAS_W / 2 - 60, y);
          ctx!.fillText(`${s.strokes}`, CANVAS_W / 2 + 80, y);
        });

        if (ov.isFinal) {
          ctx!.fillStyle = '#c9a876';
          ctx!.font = 'italic 14px Georgia, serif';
          ctx!.fillText('All hands to results...', CANVAS_W / 2, 200 + ov.scores.length * 28 + 30);
        }

        ctx!.textAlign = 'start';
        ctx!.globalAlpha = 1;
      }
    }

    animFrameId = requestAnimationFrame(loop);
  }

  animFrameId = requestAnimationFrame(loop);

  function destroy(): void {
    cancelAnimationFrame(animFrameId);
    cleanupInput();
    emoteBar.destroy();
    canvas.removeEventListener('click', handleCanvasClick);
  }

  return { destroy, handleMessage };
}

function drawTrajectoryPreview(
  ctx: CanvasRenderingContext2D,
  ball: BallState,
  angle: number,
  power: number,
  color: string,
  hole: Hole,
): void {
  // Simulate a few steps of physics to show predicted path
  const simBall: BallState = {
    x: ball.x,
    y: ball.y,
    vx: Math.cos(angle) * Math.min(power, 200) * POWER_SCALE,
    vy: Math.sin(angle) * Math.min(power, 200) * POWER_SCALE,
    sunk: false,
  };

  ctx.globalAlpha = 0.35;
  ctx.fillStyle = color;

  for (let i = 0; i < 7; i++) {
    // Step physics multiple times per dot for spacing
    for (let s = 0; s < 4; s++) {
      stepPhysics(simBall, hole.walls, hole.hazards, hole.holePos);
      if (simBall.sunk) break;
    }
    if (simBall.sunk) break;

    ctx.beginPath();
    ctx.arc(simBall.x, simBall.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!);
}
