import type { Player, ClientMessage, ServerMessage } from '../../shared/messages';
import type { BallState, Hole, Vec2 } from '../../shared/types';
import { stepPhysics, launchBall } from '../../shared/physics';
import { treasureCoast } from '../../shared/courses';

interface PlayerState {
  id: string;
  name: string;
  avatarId: number;
  ws: WebSocket;
}

interface PlayerGameData {
  ball: BallState;
  strokes: number;
  waterResetPos: Vec2;
  sunkThisHole: boolean;
}

type GamePhase = 'lobby' | 'playing' | 'betweenHoles' | 'ended';

interface GameState {
  phase: GamePhase;
  holes: Hole[];
  currentHoleIndex: number;
  timerTicks: number;
  tickCount: number;
  sunkOrder: number;
  playerData: Map<string, PlayerGameData>;
  holeScores: Map<string, number[]>;
  intervalId: ReturnType<typeof setInterval> | null;
}

const TIMER_SECONDS = 30;
const TICKS_PER_SECOND = 60;
const BROADCAST_INTERVAL = 3; // every 3 ticks = 20Hz
const BETWEEN_HOLES_MS = 3000;
const PAR_PENALTY = 3;

function getCourseById(_courseId: string): Hole[] {
  return treasureCoast;
}

export class LobbyDO implements DurableObject {
  private players: Map<WebSocket, PlayerState> = new Map();
  private lobbyCode: string = '';
  private hostId: string = '';
  private state: DurableObjectState;
  private game: GameState | null = null;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const upgradeHeader = request.headers.get('Upgrade');

    if (upgradeHeader !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }

    if (!this.lobbyCode) {
      const code = url.searchParams.get('code');
      if (code) {
        this.lobbyCode = code.toUpperCase();
      }
    }

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    this.state.acceptWebSocket(server);

    const playerId = crypto.randomUUID();

    server.serializeAttachment({ playerId, joined: false });

    const welcome: ServerMessage = { type: 'welcome', playerId };
    server.send(JSON.stringify(welcome));

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, rawMessage: string | ArrayBuffer): Promise<void> {
    const text = typeof rawMessage === 'string' ? rawMessage : new TextDecoder().decode(rawMessage);

    if (text.length > 1024) {
      this.sendTo(ws, { type: 'error', code: 'MSG_TOO_LARGE', message: 'Message too large, captain.' });
      return;
    }

    let msg: ClientMessage;
    try {
      msg = JSON.parse(text) as ClientMessage;
    } catch {
      this.sendTo(ws, { type: 'error', code: 'PARSE_ERROR', message: 'Invalid JSON' });
      return;
    }

    const attachment = ws.deserializeAttachment() as { playerId: string; joined: boolean } | null;
    if (!attachment) return;

    if (msg.type === 'create' || msg.type === 'join') {
      const player: PlayerState = {
        id: attachment.playerId,
        name: msg.playerName.slice(0, 20) || 'Pirate',
        avatarId: Math.max(0, Math.min(7, msg.avatarId)),
        ws,
      };

      this.players.set(ws, player);
      ws.serializeAttachment({ playerId: attachment.playerId, joined: true });

      if (this.players.size === 1) {
        this.hostId = player.id;
      }

      this.broadcastLobbyState();
      return;
    }

    if (msg.type === 'startGame') {
      if (attachment.playerId !== this.hostId) {
        this.sendTo(ws, { type: 'error', code: 'NOT_HOST', message: "Only the host can start the game, captain." });
        return;
      }
      if (this.game) {
        this.sendTo(ws, { type: 'error', code: 'ALREADY_STARTED', message: "Game already underway, captain." });
        return;
      }
      this.startGame(msg.courseId);
      return;
    }

    if (msg.type === 'shoot') {
      if (!this.game || this.game.phase !== 'playing') return;
      this.handleShoot(attachment.playerId, msg.angle, msg.power);
      return;
    }

    if (msg.type === 'emote') {
      if (!this.game) return;
      const emoteMsg: ServerMessage = {
        type: 'emote',
        playerId: attachment.playerId,
        key: msg.key,
      };
      this.broadcast(emoteMsg);
      return;
    }
  }

  async webSocketClose(ws: WebSocket, _code: number, _reason: string): Promise<void> {
    this.handleDisconnect(ws);
  }

  async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
    this.handleDisconnect(ws);
  }

  private handleDisconnect(ws: WebSocket): void {
    const player = this.players.get(ws);
    this.players.delete(ws);

    if (player && player.id === this.hostId && this.players.size > 0) {
      const firstPlayer = this.players.values().next().value;
      if (firstPlayer) {
        this.hostId = firstPlayer.id;
      }
    }

    if (this.players.size > 0) {
      this.broadcastLobbyState();
    }

    if (this.game && this.players.size === 0) {
      this.stopGameLoop();
      this.game = null;
    }
  }

  private startGame(courseId: string): void {
    const holes = getCourseById(courseId);
    const playerData = new Map<string, PlayerGameData>();
    const holeScores = new Map<string, number[]>();

    for (const p of this.players.values()) {
      playerData.set(p.id, {
        ball: { x: 0, y: 0, vx: 0, vy: 0, sunk: false },
        strokes: 0,
        waterResetPos: { x: 0, y: 0 },
        sunkThisHole: false,
      });
      holeScores.set(p.id, []);
    }

    this.game = {
      phase: 'playing',
      holes,
      currentHoleIndex: 0,
      timerTicks: TIMER_SECONDS * TICKS_PER_SECOND,
      tickCount: 0,
      sunkOrder: 0,
      playerData,
      holeScores,
      intervalId: null,
    };

    const gameStartMsg: ServerMessage = {
      type: 'gameStart',
      courseId,
      holeIndex: 0,
    };
    this.broadcast(gameStartMsg);

    this.initHole(0);
    this.startGameLoop();
  }

  private initHole(holeIndex: number): void {
    if (!this.game) return;

    const hole = this.game.holes[holeIndex];
    if (!hole) return;

    this.game.currentHoleIndex = holeIndex;
    this.game.timerTicks = TIMER_SECONDS * TICKS_PER_SECOND;
    this.game.tickCount = 0;
    this.game.sunkOrder = 0;
    this.game.phase = 'playing';

    let playerIdx = 0;
    const playerCount = this.game.playerData.size;
    for (const data of this.game.playerData.values()) {
      const offset = playerCount > 1
        ? (playerIdx - (playerCount - 1) / 2) * 14
        : 0;
      data.ball = {
        x: hole.ballStart.x,
        y: hole.ballStart.y + offset,
        vx: 0,
        vy: 0,
        sunk: false,
      };
      data.strokes = 0;
      data.waterResetPos = { x: hole.ballStart.x, y: hole.ballStart.y + offset };
      data.sunkThisHole = false;
      playerIdx++;
    }

    const holeStartMsg: ServerMessage = {
      type: 'holeStart',
      holeIndex,
      timerSeconds: TIMER_SECONDS,
    };
    this.broadcast(holeStartMsg);
  }

  private startGameLoop(): void {
    if (this.game?.intervalId) return;
    if (!this.game) return;

    this.game.intervalId = setInterval(() => {
      this.gameTick();
    }, 1000 / TICKS_PER_SECOND);
  }

  private stopGameLoop(): void {
    if (this.game?.intervalId) {
      clearInterval(this.game.intervalId);
      this.game.intervalId = null;
    }
  }

  private gameTick(): void {
    if (!this.game || this.game.phase !== 'playing') return;

    const hole = this.game.holes[this.game.currentHoleIndex];
    if (!hole) return;

    let anyProcessed = false;
    for (const [playerId, data] of this.game.playerData) {
      if (data.sunkThisHole) continue;
      if (data.ball.vx === 0 && data.ball.vy === 0) continue;

      anyProcessed = true;
      const result = stepPhysics(data.ball, hole.walls, hole.hazards, hole.holePos);

      if (result.waterReset) {
        data.ball.x = data.waterResetPos.x;
        data.ball.y = data.waterResetPos.y;
        data.ball.vx = 0;
        data.ball.vy = 0;
        data.strokes++;
      }

      if (result.sunk) {
        data.sunkThisHole = true;
        this.game.sunkOrder++;
        const sunkMsg: ServerMessage = {
          type: 'sunk',
          playerId,
          strokes: data.strokes,
          place: this.game.sunkOrder,
        };
        this.broadcast(sunkMsg);
      }
    }

    this.game.tickCount++;
    let anyMoved = false;
    for (const data of this.game.playerData.values()) {
      if (!data.sunkThisHole && (data.ball.vx !== 0 || data.ball.vy !== 0)) {
        anyMoved = true;
        break;
      }
    }
    if (anyMoved && this.game.tickCount % BROADCAST_INTERVAL === 0) {
      this.broadcastBallUpdate();
    } else if (anyProcessed && !anyMoved) {
      this.broadcastBallUpdate();
    }

    this.game.timerTicks--;
    if (this.game.timerTicks <= 0) {
      this.handleTimerExpiry();
      return;
    }

    let allSunk = true;
    for (const data of this.game.playerData.values()) {
      if (!data.sunkThisHole) {
        allSunk = false;
        break;
      }
    }
    if (allSunk) {
      this.finishHole();
    }
  }

  private handleShoot(playerId: string, angle: number, power: number): void {
    if (!this.game) return;
    const data = this.game.playerData.get(playerId);
    if (!data) return;
    if (data.sunkThisHole) return;
    if (data.ball.vx !== 0 || data.ball.vy !== 0) return;

    data.waterResetPos = { x: data.ball.x, y: data.ball.y };
    launchBall(data.ball, angle, power);
    data.strokes++;
  }

  private handleTimerExpiry(): void {
    if (!this.game) return;

    const hole = this.game.holes[this.game.currentHoleIndex];
    if (!hole) return;

    for (const data of this.game.playerData.values()) {
      if (!data.sunkThisHole) {
        data.strokes = hole.par + PAR_PENALTY;
        data.sunkThisHole = true;
      }
    }

    this.finishHole();
  }

  private finishHole(): void {
    if (!this.game) return;

    this.game.phase = 'betweenHoles';

    const scores: { playerId: string; strokes: number }[] = [];
    for (const [playerId, data] of this.game.playerData) {
      const playerScores = this.game.holeScores.get(playerId);
      if (playerScores) {
        playerScores.push(data.strokes);
      }
      scores.push({ playerId, strokes: data.strokes });
    }

    const isLastHole = this.game.currentHoleIndex >= this.game.holes.length - 1;
    const nextStartsIn = isLastHole ? 0 : BETWEEN_HOLES_MS / 1000;

    this.broadcastBallUpdate();

    const holeEndMsg: ServerMessage = {
      type: 'holeEnd',
      scores,
      nextStartsIn,
    };
    this.broadcast(holeEndMsg);

    if (isLastHole) {
      this.endGame();
    } else {
      setTimeout(() => {
        if (!this.game) return;
        this.initHole(this.game.currentHoleIndex + 1);
      }, BETWEEN_HOLES_MS);
    }
  }

  private endGame(): void {
    if (!this.game) return;

    this.stopGameLoop();

    const finalScores: { playerId: string; total: number }[] = [];
    for (const [playerId, scores] of this.game.holeScores) {
      const total = scores.reduce((sum, s) => sum + s, 0);
      finalScores.push({ playerId, total });
    }
    finalScores.sort((a, b) => a.total - b.total);

    const awards: { name: string; playerId: string }[] = [];

    if (finalScores.length > 0) {
      awards.push({ name: 'Treasure hunter', playerId: finalScores[0]!.playerId });
    }
    if (finalScores.length > 1) {
      awards.push({ name: 'Scallywag', playerId: finalScores[finalScores.length - 1]!.playerId });
    }

    // Check for hole-in-ones
    for (const [playerId, scores] of this.game.holeScores) {
      if (scores.some(s => s === 1)) {
        awards.push({ name: 'Hole-in-one club', playerId });
      }
    }

    const gameEndMsg: ServerMessage = {
      type: 'gameEnd',
      finalScores,
      awards,
    };
    this.broadcast(gameEndMsg);

    this.game.phase = 'ended';
    this.game = null;
  }

  private broadcastBallUpdate(): void {
    if (!this.game) return;

    const states: { playerId: string; x: number; y: number; vx: number; vy: number; sunk: boolean }[] = [];
    for (const [playerId, data] of this.game.playerData) {
      states.push({
        playerId,
        x: Math.round(data.ball.x * 100) / 100,
        y: Math.round(data.ball.y * 100) / 100,
        vx: Math.round(data.ball.vx * 100) / 100,
        vy: Math.round(data.ball.vy * 100) / 100,
        sunk: data.ball.sunk,
      });
    }

    const msg: ServerMessage = { type: 'ballUpdate', states };
    this.broadcast(msg);
  }

  private broadcastLobbyState(): void {
    const players: Player[] = [];
    for (const p of this.players.values()) {
      players.push({
        id: p.id,
        name: p.name,
        avatarId: p.avatarId,
        connected: true,
      });
    }

    const msg: ServerMessage = {
      type: 'lobbyState',
      code: this.lobbyCode,
      players,
      hostId: this.hostId,
    };

    this.broadcast(msg);
  }

  private broadcast(msg: ServerMessage): void {
    const text = JSON.stringify(msg);
    for (const ws of this.state.getWebSockets()) {
      try {
        ws.send(text);
      } catch {
        // connection dead, will be cleaned up on close
      }
    }
  }

  private sendTo(ws: WebSocket, msg: ServerMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // connection dead
    }
  }
}
