/**
 * KV key conventions for Locus Pulse.
 * All keys are prefixed with their category for fast scanning.
 *
 * Article keys (one JSON blob per category per day):
 *   articles:ghana_news:<YYYY-MM-DD>     → Article[]
 *   articles:world_news:<YYYY-MM-DD>     → Article[]
 *   articles:sports:<YYYY-MM-DD>         → Article[]
 *   articles:entertainment:<YYYY-MM-DD>  → Article[]
 *
 * Sports keys:
 *   fixtures:<league>:<YYYY-MM-DD>       → SportsFixture[]
 *   standings:<league>:<season>          → LeagueStanding[]
 *
 * Utility keys:
 *   fx:<YYYY-MM-DD>                      → { USD: 11.71, EUR: 12.85, GBP: 14.95 }
 *   fuel:<YYYY-MM-DD>                    → FuelPrice[]
 *   power:<YYYY-MM-DD>                   → PowerOutage[]
 *   movies:now_playing:<YYYY-MM-DD>      → Movie[]
 *   movies:upcoming:<YYYY-MM-DD>         → Movie[]
 *   brief:<YYYY-MM-DD>                   → DailyBrief
 *
 * User quota keys:
 *   quota:<userId>:<YYYY-MM-DD>          → { used: number }
 *
 * All datetime keys are in UTC to avoid timezone bugs.
 */

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

/** Today's date in YYYY-MM-DD UTC */
export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Yesterday in YYYY-MM-DD UTC */
export function yesterdayUtc(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
