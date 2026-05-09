import { LobbyDO } from './lobby-do';
import { generateDailyHole, getTodayDateString } from '../../shared/daily';

export { LobbyDO };

interface Env {
  LOBBY: DurableObjectNamespace;
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
  DAILY_SCORES?: KVNamespace;
  GUILD_DATA?: KVNamespace;
}

const LOBBY_CODES = [
  'KRKN', 'SWAB', 'PLNK', 'GOLD', 'ARRR', 'AHOY', 'YARR',
  'CRWN', 'DBLN', 'MAST', 'HELM', 'GROG', 'REEF', 'HULL',
  'SAIL', 'BOWR', 'ANCH', 'COVE', 'TIDE', 'BLCK',
];

function generateLobbyCode(): string {
  const word = LOBBY_CODES[Math.floor(Math.random() * LOBBY_CODES.length)]!;
  const num = Math.floor(Math.random() * 100).toString().padStart(2, '0');
  return word + num;
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

// Validate a Discord access token and return the user
async function validateDiscordToken(token: string): Promise<{ id: string; username: string } | null> {
  const res = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const user = (await res.json()) as { id: string; username: string };
  return user;
}

// Extract and validate Discord user from Authorization header
async function authenticateRequest(request: Request): Promise<{ id: string; username: string } | Response> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Missing authorization' }, 401);
  }
  const token = authHeader.replace('Bearer ', '');
  const user = await validateDiscordToken(token);
  if (!user) {
    return jsonResponse({ error: 'Invalid token' }, 401);
  }
  return user;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // === Existing endpoints ===

    if (url.pathname === '/api/create') {
      const code = generateLobbyCode();
      return jsonResponse({ code });
    }

    if (url.pathname === '/api/ws') {
      const code = url.searchParams.get('code');
      if (!code) {
        return new Response('Missing lobby code', { status: 400, headers: CORS_HEADERS });
      }

      const id = env.LOBBY.idFromName(code.toUpperCase());
      const stub = env.LOBBY.get(id);
      return stub.fetch(request);
    }

    // === Phase A: Discord OAuth2 token exchange ===

    if (url.pathname === '/api/token' && request.method === 'POST') {
      if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET) {
        return jsonResponse({ error: 'Discord not configured' }, 500);
      }

      const body = (await request.json()) as { code?: string };
      if (!body.code) {
        return jsonResponse({ error: 'Missing authorization code' }, 400);
      }

      const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: env.DISCORD_CLIENT_ID,
          client_secret: env.DISCORD_CLIENT_SECRET,
          grant_type: 'authorization_code',
          code: body.code,
        }),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        return jsonResponse({ error: 'Token exchange failed', detail: errText }, 400);
      }

      const tokenData = (await tokenRes.json()) as { access_token: string };
      return jsonResponse({ access_token: tokenData.access_token });
    }

    // === Phase B: Daily Putt endpoints ===

    if (url.pathname === '/api/daily/hole') {
      const dateStr = url.searchParams.get('date') || getTodayDateString();
      const hole = generateDailyHole(dateStr);
      return jsonResponse({ date: dateStr, hole });
    }

    if (url.pathname === '/api/daily/submit' && request.method === 'POST') {
      const authResult = await authenticateRequest(request);
      if (authResult instanceof Response) return authResult;
      const user = authResult;

      const body = (await request.json()) as {
        guildId?: string;
        strokes?: number;
        date?: string;
      };

      const dateStr = body.date || getTodayDateString();
      const guildId = body.guildId || 'dm';
      const strokes = body.strokes;

      if (typeof strokes !== 'number' || strokes < 1 || strokes > 20) {
        return jsonResponse({ error: 'Invalid strokes' }, 400);
      }

      if (!env.DAILY_SCORES) {
        return jsonResponse({ error: 'Daily scores not configured' }, 500);
      }

      // Check for duplicate submission
      const scoreKey = `daily:${dateStr}:${guildId}`;
      const existing = await env.DAILY_SCORES.get(scoreKey);
      const scores: Record<string, { userId: string; username: string; strokes: number }> =
        existing ? JSON.parse(existing) : {};

      if (scores[user.id]) {
        return jsonResponse({ error: 'Already submitted today', existing: scores[user.id] }, 409);
      }

      scores[user.id] = { userId: user.id, username: user.username, strokes };
      await env.DAILY_SCORES.put(scoreKey, JSON.stringify(scores), {
        expirationTtl: 60 * 60 * 48, // 48 hours
      });

      // Award doubloons for daily completion
      if (env.GUILD_DATA && guildId !== 'dm') {
        await addDoubloons(env.GUILD_DATA, guildId, 5);
      }

      // Build embed data for the channel
      const hole = generateDailyHole(dateStr);
      const diff = strokes - hole.par;
      const parLabel = diff === 0 ? 'par' : diff < 0 ? `${Math.abs(diff)} under par` : `${diff} over par`;

      return jsonResponse({
        success: true,
        strokes,
        embed: {
          title: `${user.username} completed the Daily Putt`,
          description: `**${hole.name}** (par ${hole.par})\n${strokes} strokes (${parLabel})`,
          color: 0xd4af37,
        },
      });
    }

    if (url.pathname === '/api/daily/leaderboard') {
      const dateStr = url.searchParams.get('date') || getTodayDateString();
      const guildId = url.searchParams.get('guildId') || 'dm';

      if (!env.DAILY_SCORES) {
        return jsonResponse({ scores: [] });
      }

      const scoreKey = `daily:${dateStr}:${guildId}`;
      const existing = await env.DAILY_SCORES.get(scoreKey);
      const scores: Record<string, { userId: string; username: string; strokes: number }> =
        existing ? JSON.parse(existing) : {};

      const leaderboard = Object.values(scores).sort((a, b) => a.strokes - b.strokes);
      return jsonResponse({ date: dateStr, scores: leaderboard });
    }

    // === Phase C: Progression endpoints ===

    if (url.pathname === '/api/guild/progress') {
      const guildId = url.searchParams.get('guildId');
      if (!guildId) {
        return jsonResponse({ error: 'Missing guildId' }, 400);
      }

      if (!env.GUILD_DATA) {
        return jsonResponse({ doubloons: 0, milestones: [], unlockedSkins: [] });
      }

      const data = await getGuildProgress(env.GUILD_DATA, guildId);
      return jsonResponse(data);
    }

    if (url.pathname === '/api/user/stats') {
      const authResult = await authenticateRequest(request);
      if (authResult instanceof Response) return authResult;
      const user = authResult;

      if (!env.GUILD_DATA) {
        return jsonResponse({ userId: user.id, username: user.username, titles: [], gamesPlayed: 0 });
      }

      const stats = await getUserStats(env.GUILD_DATA, user.id);
      return jsonResponse({ userId: user.id, username: user.username, ...stats });
    }

    // === Phase C: Multiplayer game completion doubloon reward ===

    if (url.pathname === '/api/game/complete' && request.method === 'POST') {
      const authResult = await authenticateRequest(request);
      if (authResult instanceof Response) return authResult;
      const user = authResult;

      const body = (await request.json()) as { guildId?: string };
      const guildId = body.guildId;

      if (guildId && env.GUILD_DATA) {
        await addDoubloons(env.GUILD_DATA, guildId, 10);

        // Update user stats
        const userKey = `user:${user.id}`;
        const existing = await env.GUILD_DATA.get(userKey);
        const stats = existing
          ? JSON.parse(existing)
          : { gamesPlayed: 0, dailiesPlayed: 0, totalStrokes: 0, holesInOne: 0 };
        stats.gamesPlayed++;
        await env.GUILD_DATA.put(userKey, JSON.stringify(stats));
      }

      return jsonResponse({ success: true });
    }

    // === Discord Interactions (slash commands) ===

    if (url.pathname === '/api/interactions' && request.method === 'POST') {
      return handleDiscordInteraction(request, env);
    }

    return new Response('Not found', { status: 404, headers: CORS_HEADERS });
  },
};

// === Progression helpers ===

interface GuildProgress {
  doubloons: number;
  milestones: number[];
  unlockedSkins: string[];
}

const MILESTONES = [
  { threshold: 100, skin: 'golden' },
  { threshold: 500, skin: 'ghostly' },
  { threshold: 1000, skin: 'kraken' },
  { threshold: 5000, skin: 'legendary' },
];

async function addDoubloons(kv: KVNamespace, guildId: string, amount: number): Promise<void> {
  const key = `guild:${guildId}`;
  const existing = await kv.get(key);
  const data: { doubloons: number } = existing ? JSON.parse(existing) : { doubloons: 0 };
  data.doubloons += amount;
  await kv.put(key, JSON.stringify(data));
}

async function getGuildProgress(kv: KVNamespace, guildId: string): Promise<GuildProgress> {
  const key = `guild:${guildId}`;
  const existing = await kv.get(key);
  const data: { doubloons: number } = existing ? JSON.parse(existing) : { doubloons: 0 };

  const reached = MILESTONES.filter(m => data.doubloons >= m.threshold);
  return {
    doubloons: data.doubloons,
    milestones: reached.map(m => m.threshold),
    unlockedSkins: reached.map(m => m.skin),
  };
}

// === User stats helpers ===

interface UserStats {
  titles: string[];
  gamesPlayed: number;
  dailiesPlayed: number;
  totalStrokes: number;
  holesInOne: number;
}

const PIRATE_TITLES: Array<{ name: string; check: (s: UserStats) => boolean }> = [
  { name: 'Deck Swabber', check: (s) => s.gamesPlayed >= 1 },
  { name: 'Sea Dog', check: (s) => s.gamesPlayed >= 10 },
  { name: 'Sharpshooter', check: (s) => s.holesInOne >= 1 },
  { name: 'Captain of the Green', check: (s) => s.dailiesPlayed >= 7 },
  { name: 'Pirate Legend', check: (s) => s.gamesPlayed >= 50 },
];

function checkTitles(stats: UserStats): string[] {
  return PIRATE_TITLES.filter((t) => t.check(stats)).map((t) => t.name);
}

async function getUserStats(kv: KVNamespace, userId: string): Promise<UserStats & { titles: string[] }> {
  const key = `user:${userId}`;
  const existing = await kv.get(key);
  const stats: UserStats = existing
    ? JSON.parse(existing)
    : { titles: [], gamesPlayed: 0, dailiesPlayed: 0, totalStrokes: 0, holesInOne: 0 };

  return { ...stats, titles: checkTitles(stats) };
}

// === Discord Interactions handler ===

async function handleDiscordInteraction(request: Request, env: Env): Promise<Response> {
  const body = (await request.json()) as {
    type: number;
    data?: { name: string };
    guild_id?: string;
    channel_id?: string;
  };

  // Type 1 = PING
  if (body.type === 1) {
    return jsonResponse({ type: 1 });
  }

  // Type 2 = APPLICATION_COMMAND
  if (body.type === 2 && body.data?.name === 'putt') {
    const dateStr = getTodayDateString();
    const hole = generateDailyHole(dateStr);

    let leaderboardText = 'No scores yet today.';
    if (env.DAILY_SCORES && body.guild_id) {
      const scoreKey = `daily:${dateStr}:${body.guild_id}`;
      const existing = await env.DAILY_SCORES.get(scoreKey);
      if (existing) {
        const scores: Record<string, { username: string; strokes: number }> = JSON.parse(existing);
        const sorted = Object.values(scores).sort((a, b) => a.strokes - b.strokes);
        leaderboardText = sorted
          .slice(0, 10)
          .map((s, i) => `${i + 1}. **${s.username}** - ${s.strokes} strokes`)
          .join('\n');
      }
    }

    return jsonResponse({
      type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
      data: {
        embeds: [
          {
            title: `Daily Putt: ${hole.name}`,
            description: `Par ${hole.par} | ${hole.walls.length} walls | ${hole.hazards.length} hazards\n\nLaunch the Activity to play today's hole.`,
            color: 0xd4af37,
            fields: [
              {
                name: 'Leaderboard',
                value: leaderboardText,
              },
            ],
          },
        ],
      },
    });
  }

  return jsonResponse({ type: 1 });
}
