export interface Player {
  id: string;
  name: string;
  avatarId: number;
  connected: boolean;
}

export type ClientMessage =
  | { type: 'create'; playerName: string; avatarId: number }
  | { type: 'join'; lobbyCode: string; playerName: string; avatarId: number }
  | { type: 'startGame'; courseId: string }
  | { type: 'shoot'; angle: number; power: number }
  | { type: 'emote'; key: 'arr' | 'yoho' | 'plank' | 'aye' | 'kraken' }
  | { type: 'ready' };

export type ServerMessage =
  | { type: 'lobbyState'; code: string; players: Player[]; hostId: string }
  | { type: 'gameStart'; courseId: string; holeIndex: number }
  | { type: 'holeStart'; holeIndex: number; timerSeconds: number }
  | { type: 'ballUpdate'; states: { playerId: string; x: number; y: number; vx: number; vy: number; sunk: boolean }[] }
  | { type: 'sunk'; playerId: string; strokes: number; place: number }
  | { type: 'holeEnd'; scores: { playerId: string; strokes: number }[]; nextStartsIn: number }
  | { type: 'gameEnd'; finalScores: { playerId: string; total: number }[]; awards: { name: string; playerId: string }[] }
  | { type: 'emote'; playerId: string; key: string }
  | { type: 'error'; code: string; message: string }
  | { type: 'welcome'; playerId: string };
