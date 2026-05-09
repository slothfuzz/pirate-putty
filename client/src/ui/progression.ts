/**
 * Progression display - shows guild doubloons, unlocked skins, and pirate titles.
 */
import { getDiscordContext } from '../discord/sdk';

export interface GuildProgress {
  doubloons: number;
  milestones: number[];
  unlockedSkins: string[];
}

export interface UserStats {
  userId: string;
  username: string;
  titles: string[];
  gamesPlayed: number;
  dailiesPlayed: number;
  totalStrokes: number;
  holesInOne: number;
}

export async function fetchGuildProgress(): Promise<GuildProgress | null> {
  const ctx = getDiscordContext();
  if (!ctx?.guildId) return null;

  try {
    const res = await fetch(`/.proxy/api/guild/progress?guildId=${ctx.guildId}`);
    if (!res.ok) return null;
    return (await res.json()) as GuildProgress;
  } catch {
    return null;
  }
}

export async function fetchUserStats(): Promise<UserStats | null> {
  const ctx = getDiscordContext();
  if (!ctx) return null;

  try {
    const res = await fetch('/.proxy/api/user/stats', {
      headers: { Authorization: `Bearer ${ctx.accessToken}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as UserStats;
  } catch {
    return null;
  }
}

const SKIN_COLORS: Record<string, { fill: string; light: string; label: string }> = {
  golden: { fill: '#d4af37', light: '#e0c050', label: 'Golden Ball' },
  ghostly: { fill: '#a0c4e8', light: '#d0e8f8', label: 'Ghost Ship Ball' },
  kraken: { fill: '#5b2d8e', light: '#8b5fbf', label: 'Kraken Ball' },
  legendary: { fill: '#ff4444', light: '#ff8888', label: 'Legendary Ball' },
};

/**
 * Get ball colors for a given skin name.
 * Returns default colors if no skin or unknown skin.
 */
export function getBallSkinColors(
  skinName: string | null,
  defaultColor: string,
  defaultLight: string,
): { fill: string; light: string } {
  if (!skinName || !SKIN_COLORS[skinName]) {
    return { fill: defaultColor, light: defaultLight };
  }
  return { fill: SKIN_COLORS[skinName]!.fill, light: SKIN_COLORS[skinName]!.light };
}

/**
 * Get display info for all available skins.
 */
export function getAllSkins(): Array<{ id: string; label: string; fill: string; light: string; threshold: number }> {
  const thresholds: Record<string, number> = {
    golden: 100,
    ghostly: 500,
    kraken: 1000,
    legendary: 5000,
  };

  return Object.entries(SKIN_COLORS).map(([id, skin]) => ({
    id,
    label: skin.label,
    fill: skin.fill,
    light: skin.light,
    threshold: thresholds[id] ?? 0,
  }));
}
