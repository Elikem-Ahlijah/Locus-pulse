/**
 * Shared KV helpers — used by all Pages Functions.
 * The frontend never touches KV directly; everything goes through /api/* routes.
 */

import type { Article, FxRate, FuelPrice, Movie, PowerOutage, SportsFixture, LeagueStanding, DailyBrief } from '../../src/types';

export const KV = {
  articles: (category: string, date: string) => `articles:${category}:${date}`,
  fixtures: (league: string, date: string) => `fixtures:${league}:${date}`,
  standings: (league: string, season: string) => `standings:${league}:${season}`,
  fx: (date: string) => `fx:${date}`,
  fuel: (date: string) => `fuel:${date}`,
  power: (date: string) => `power:${date}`,
  moviesNowPlaying: (date: string) => `movies:now_playing:${date}`,
  moviesUpcoming: (date: string) => `movies:upcoming:${date}`,
  brief: (date: string) => `brief:${date}`,
  quota: (userId: string, date: string) => `quota:${userId}:${date}`,
} as const;

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function yesterdayUtc(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export async function readJson<T>(kv: KVNamespace, key: string): Promise<T | null> {
  const raw = await kv.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writeJson<T>(kv: KVNamespace, key: string, value: T): Promise<void> {
  await kv.put(key, JSON.stringify(value));
}

/**
 * Quota check + increment. Returns the post-increment status.
 * If the daily limit is reached, returns null and caller should 429.
 */
export interface QuotaRecord {
  used: number;
  resetAtUtc: string;
}

export async function checkAndIncrementQuota(
  kv: KVNamespace,
  userId: string,
  dailyLimit: number
): Promise<QuotaRecord | null> {
  const today = todayUtc();
  const key = KV.quota(userId, today);
  const raw = await kv.get(key);
  const used = raw ? parseInt(raw, 10) : 0;
  if (used >= dailyLimit) {
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);
    return {
      used,
      resetAtUtc: tomorrow.toISOString(),
    };
  }
  const nextUsed = used + 1;
  // Expire at end of UTC day (with 1hr safety buffer)
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(1, 0, 0, 0);
  const ttlSeconds = Math.floor((tomorrow.getTime() - Date.now()) / 1000);
  await kv.put(key, String(nextUsed), { expirationTtl: Math.max(ttlSeconds, 60) });
  return {
    used: nextUsed,
    resetAtUtc: tomorrow.toISOString(),
  };
}

/** Read quota without incrementing (for the /api/quota endpoint) */
export async function readQuota(kv: KVNamespace, userId: string, dailyLimit: number) {
  const today = todayUtc();
  const key = KV.quota(userId, today);
  const raw = await kv.get(key);
  const used = raw ? parseInt(raw, 10) : 0;
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);
  return {
    userId,
    date: today,
    queriesUsed: used,
    queriesRemaining: Math.max(0, dailyLimit - used),
    dailyLimit,
    resetAtUtc: tomorrow.toISOString(),
  };
}
