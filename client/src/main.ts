import { createGame } from './game/engine';
import { createMultiplayerGame } from './game/multiplayer';
import { treasureCoast } from '../../shared/courses';
import { CANVAS_W, CANVAS_H } from '../../shared/types';
import { GameSocket } from './net/socket';
import { createLobbyState, updateLobbyFromMessage } from './net/state';
import { createHomeScreen } from './ui/home';
import type { HomeResult } from './ui/home';
import { createLobbyScreen } from './ui/lobby';
import {
  isDiscordActivity,
  initDiscord,
  getDiscordWebSocketUrl,
  getParticipants,
  onParticipantsUpdate,
  onActivityResize,
  onLayoutModeUpdate,
} from './discord/sdk';
import type { ServerMessage } from '../../shared/messages';
import './style.css';

// Discord Client ID - set via VITE_DISCORD_CLIENT_ID env variable
const DISCORD_CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID ?? '';

type AppScreen = 'home' | 'lobby' | 'solo' | 'game';

function init(): void {
  const app = document.getElementById('app')!;
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const controls = document.getElementById('controls') as HTMLElement;

  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;

  function resize(): void {
    const maxWidth = Math.min(window.innerWidth - 16, CANVAS_W);
    const scale = maxWidth / CANVAS_W;
    canvas.style.width = `${CANVAS_W * scale}px`;
    canvas.style.height = `${CANVAS_H * scale}px`;
  }

  resize();
  window.addEventListener('resize', resize);

  let currentScreen: AppScreen = 'home';
  let homeUI: ReturnType<typeof createHomeScreen> | null = null;
  let lobbyUI: ReturnType<typeof createLobbyScreen> | null = null;
  let socket: GameSocket | null = null;
  let multiplayerEngine: ReturnType<typeof createMultiplayerGame> | null = null;
  const lobbyState = createLobbyState();

  function resetLobbyState(): void {
    lobbyState.code = '';
    lobbyState.players = [];
    lobbyState.hostId = '';
    lobbyState.myId = '';
  }

  function showScreen(screen: AppScreen): void {
    homeUI?.destroy();
    homeUI = null;
    lobbyUI?.destroy();
    lobbyUI = null;
    multiplayerEngine?.destroy();
    multiplayerEngine = null;

    canvas.style.display = 'none';
    controls.style.display = 'none';

    if (screen === 'home') {
      socket?.disconnect();
      socket = null;
      resetLobbyState();
    }

    currentScreen = screen;

    if (screen === 'home') {
      homeUI = createHomeScreen(app, handleHomeSubmit);
    } else if (screen === 'lobby') {
      lobbyUI = createLobbyScreen(app, handleSetSail);
      lobbyUI.update(lobbyState);
    } else if (screen === 'solo') {
      canvas.style.display = 'block';
      controls.style.display = 'flex';
      createGame(canvas, treasureCoast);
    } else if (screen === 'game') {
      canvas.style.display = 'block';
      controls.style.display = 'none';
    }
  }

  // === Discord Activity flow ===

  if (isDiscordActivity() && DISCORD_CLIENT_ID) {
    initDiscordFlow();
    return;
  }

  // === Standalone flow (existing behavior) ===
  showScreen('home');

  function handleHomeSubmit(result: HomeResult): void {
    if (result.action === 'create') {
      fetch('/api/create')
        .then((r) => r.json())
        .then((data: { code: string }) => {
          connectToLobby(data.code, result.playerName, result.avatarId, 'create');
        })
        .catch(() => {
          startSoloFallback();
        });
    } else {
      connectToLobby(result.lobbyCode, result.playerName, result.avatarId, 'join');
    }
  }

  // === Shared functions ===

  async function initDiscordFlow(): Promise<void> {
    try {
      const ctx = await initDiscord(DISCORD_CLIENT_ID);

      // Use channel ID as the room key
      const channelId = ctx.channelId;
      if (!channelId) {
        console.error('No channel ID from Discord SDK');
        showScreen('home');
        return;
      }

      // Set up resize for Activity panel (reuses the existing resize function)
      onActivityResize(() => resize());

      // Handle layout mode changes (pause on PiP)
      onLayoutModeUpdate((mode) => {
        if (mode === 'pip') {
          // Could pause game loop here in future
          console.log('Activity entered PiP mode');
        }
      });

      // Populate lobby with Discord participants
      const participants = await getParticipants();
      if (participants.length > 0) {
        lobbyState.players = participants;
      }

      // Subscribe to participant updates
      onParticipantsUpdate((players) => {
        lobbyState.players = players;
        if (currentScreen === 'lobby') {
          lobbyUI?.update(lobbyState);
        }
      });

      // Connect directly to lobby using channel ID as code
      connectToLobby(channelId, ctx.userName, 0, 'create');
    } catch (err) {
      console.error('Discord init failed, falling back to standalone:', err);
      showScreen('home');
    }
  }

  function connectToLobby(
    code: string,
    playerName: string,
    avatarId: number,
    action: 'create' | 'join',
  ): void {
    resetLobbyState();
    lobbyState.code = code;

    socket = new GameSocket(
      (msg: ServerMessage) => {
        const changed = updateLobbyFromMessage(lobbyState, msg);

        if (msg.type === 'welcome') {
          if (action === 'create') {
            socket!.send({ type: 'create', playerName, avatarId });
          } else {
            socket!.send({ type: 'join', lobbyCode: code, playerName, avatarId });
          }
        }

        if (msg.type === 'error') {
          console.error('Server error:', msg.message);
        }

        if (msg.type === 'gameStart') {
          startMultiplayerGame(msg.courseId, msg.holeIndex);
          return;
        }

        // Forward game messages to multiplayer engine
        if (multiplayerEngine) {
          multiplayerEngine.handleMessage(msg);
          return;
        }

        if (changed && currentScreen === 'lobby') {
          lobbyUI?.update(lobbyState);
        }
      },
      (status) => {
        if (status === 'disconnected' && currentScreen === 'lobby') {
          lobbyUI?.addEvent("Lost in the fog. Reconnectin'...");
        }
      },
    );

    // In Discord mode, connect through the proxy
    if (isDiscordActivity()) {
      socket.connectWithUrl(getDiscordWebSocketUrl(code));
    } else {
      socket.connect(code);
    }

    showScreen('lobby');
  }

  function startMultiplayerGame(courseId: string, holeIndex: number): void {
    showScreen('game');

    if (!socket) return;

    multiplayerEngine = createMultiplayerGame(
      canvas,
      socket,
      lobbyState.myId,
      lobbyState.players,
      courseId,
      holeIndex,
      () => {
        showScreen('lobby');
      },
    );
  }

  function startSoloFallback(): void {
    showScreen('solo');
  }

  function handleSetSail(): void {
    if (!socket) return;
    socket.send({ type: 'startGame', courseId: 'treasureCoast' });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
