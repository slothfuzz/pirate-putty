/**
 * Discord Activity SDK wrapper.
 * Isolates all Discord-specific logic so the game code stays untouched.
 */

import { DiscordSDK } from '@discord/embedded-app-sdk';
import type { Player } from '../../../shared/messages';
import { AVATARS } from '../../../shared/avatars';

export interface DiscordContext {
  sdk: DiscordSDK;
  userId: string;
  userName: string;
  channelId: string;
  guildId: string | null;
  accessToken: string;
}

let discordContext: DiscordContext | null = null;

/** True if running inside a Discord Activity iframe */
export function isDiscordActivity(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    // Activities run in an iframe on discordsays.com
    return window.self !== window.top;
  } catch {
    // Cross-origin iframe access throws; that means we're in an iframe
    return true;
  }
}

/**
 * Initialize the Discord SDK, authorize the user, and exchange the code
 * for an access token via the server.
 */
export async function initDiscord(clientId: string): Promise<DiscordContext> {
  const sdk = new DiscordSDK(clientId);
  await sdk.ready();

  // Step 1: Authorize - get an authorization code
  const { code } = await sdk.commands.authorize({
    client_id: clientId,
    response_type: 'code',
    state: '',
    prompt: 'none',
    scope: ['identify', 'guilds'],
  });

  // Step 2: Exchange code for token via our server
  const tokenRes = await fetch('/.proxy/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });

  if (!tokenRes.ok) {
    throw new Error(`Token exchange failed: ${tokenRes.status}`);
  }

  const { access_token } = (await tokenRes.json()) as { access_token: string };

  // Step 3: Authenticate with the token
  const auth = await sdk.commands.authenticate({ access_token });

  if (!auth.user) {
    throw new Error('Discord authentication returned no user');
  }

  const channelId = sdk.channelId ?? '';
  const guildId = sdk.guildId ?? null;

  discordContext = {
    sdk,
    userId: auth.user.id,
    userName: auth.user.username,
    channelId,
    guildId,
    accessToken: access_token,
  };

  return discordContext;
}

/** Get the current Discord context (null if not initialized) */
export function getDiscordContext(): DiscordContext | null {
  return discordContext;
}

/**
 * Convert Discord participants to the game's Player model.
 * Assigns avatar IDs deterministically from Discord user IDs.
 */
export function discordParticipantsToPlayers(
  participants: Array<{ id: string; username: string }>,
): Player[] {
  return participants.map((p, idx) => ({
    id: p.id,
    name: p.username.slice(0, 20),
    avatarId: idx % AVATARS.length,
    connected: true,
  }));
}

/**
 * Build the WebSocket URL for Discord Activity mode.
 * Routes through the Discord proxy to reach our Cloudflare backend.
 */
export function getDiscordWebSocketUrl(channelId: string): string {
  // In Discord Activity, use the proxy path
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.host}/.proxy/api/ws?code=${encodeURIComponent(channelId)}`;
}

/**
 * Get the list of participants currently connected to this Activity instance.
 */
export async function getParticipants(): Promise<Player[]> {
  if (!discordContext) return [];

  try {
    const result = await discordContext.sdk.commands.getInstanceConnectedParticipants();
    return discordParticipantsToPlayers(
      result.participants.map((p: { id: string; username: string }) => ({
        id: p.id,
        username: p.username,
      })),
    );
  } catch {
    return [];
  }
}

/**
 * Subscribe to participant changes (joins/leaves).
 * Returns an unsubscribe function.
 */
export function onParticipantsUpdate(
  callback: (players: Player[]) => void,
): () => void {
  if (!discordContext) return () => {};

  const handler = (event: { participants: Array<{ id: string; username: string }> }) => {
    callback(discordParticipantsToPlayers(event.participants));
  };

  discordContext.sdk.subscribe(
    'ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE',
    handler,
  );

  return () => {
    discordContext?.sdk.unsubscribe(
      'ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE',
      handler,
    );
  };
}

/**
 * Subscribe to Activity layout changes for resize handling.
 * Returns an unsubscribe function.
 */
export function onActivityResize(
  callback: (width: number, height: number) => void,
): () => void {
  if (!discordContext) return () => {};

  const handler = () => {
    callback(window.innerWidth, window.innerHeight);
  };

  window.addEventListener('resize', handler);
  handler();

  return () => window.removeEventListener('resize', handler);
}

/**
 * Subscribe to Activity layout mode changes (e.g., picture-in-picture).
 * Returns an unsubscribe function.
 */
export function onLayoutModeUpdate(
  callback: (mode: string) => void,
): () => void {
  if (!discordContext) return () => {};

  const handler = (event: { layout_mode: number }) => {
    // 0 = focused, 1 = pip, 2 = grid
    const modes = ['focused', 'pip', 'grid'];
    callback(modes[event.layout_mode] ?? 'focused');
  };

  discordContext.sdk.subscribe('ACTIVITY_LAYOUT_MODE_UPDATE', handler);

  return () => {
    discordContext?.sdk.unsubscribe('ACTIVITY_LAYOUT_MODE_UPDATE', handler);
  };
}
