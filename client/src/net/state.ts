import type { Player, ServerMessage } from '../../../shared/messages';

export interface LobbyState {
  code: string;
  players: Player[];
  hostId: string;
  myId: string;
}

export function createLobbyState(): LobbyState {
  return {
    code: '',
    players: [],
    hostId: '',
    myId: '',
  };
}

export function updateLobbyFromMessage(state: LobbyState, msg: ServerMessage): boolean {
  if (msg.type === 'welcome') {
    state.myId = msg.playerId;
    return true;
  }

  if (msg.type === 'lobbyState') {
    state.code = msg.code;
    state.players = msg.players;
    state.hostId = msg.hostId;
    return true;
  }

  return false;
}
