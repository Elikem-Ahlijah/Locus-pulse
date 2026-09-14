/**
 * Locus Pulse — shared type definitions
 */

// ============================================
// Data models (mirror what's in Cloudflare KV)
// ============================================

export interface Article {
  id: string;
  source: string;            // 'ghanaweb', 'myjoyonline', 'newsdata', 'guardian'
  category: ArticleCategory;
  title: string;
  description?: string;
  url: string;
  imageUrl?: string;
  author?: string;
  publishedAt: number;       // unix ms
  fetchedAt: number;
  keywords?: string[];
}

export type ArticleCategory = 'ghana_news' | 'world_news' | 'sports' | 'entertainment';

export interface SportsFixture {
  id: number;
  league: string;            // 'GPL', 'EPL', 'AFCON', 'La Liga'
  sport: string;             // 'football', 'basketball', 'nba'
  homeTeam: string;
  awayTeam: string;
  kickoffUtc: number;
  status: 'scheduled' | 'live' | 'finished' | 'postponed';
  homeScore?: number;
  awayScore?: number;
  venue?: string;
  isLive: boolean;
}

export interface LeagueStanding {
  league: string;
  season: string;
  position: number;
  team: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  form?: string;             // last 5: 'WWDLL'
}

export interface FxRate {
  base: string;              // 'USD'
  target: string;            // 'GHS'
  rate: number;
  effectiveDate: string;     // 'YYYY-MM-DD'
  source: string;            // 'BoG', 'ExchangeRate-API'
}

export interface FuelPrice {
  fuelType: 'petrol' | 'diesel' | 'lpg';
  priceGhs: number;
  effectiveDate: string;
  source: string;            // 'NPA'
}

export interface PowerOutage {
  region: string;
  area: string;
  outageStartUtc: number;
  outageEndUtc: number;
  reason?: string;
}

export interface Movie {
  tmdbId: number;
  title: string;
  overview?: string;
  posterPath?: string;
  backdropPath?: string;
  releaseDate?: string;
  voteAverage?: number;
  voteCount?: number;
  runtime?: number;
  status: 'now_playing' | 'upcoming';
}

export interface DailyBrief {
  date: string;
  sections: BriefSection[];
  generatedAt: number;
}

export interface BriefSection {
  id: string;
  type: 'news' | 'sports' | 'fx' | 'fuel' | 'power' | 'entertainment';
  title: string;
  summary: string;           // 1-2 sentence spoken summary
  data: unknown;             // the underlying data (article, fixture, etc.)
}

// ============================================
// User quota (no auth, browser-id based)
// ============================================

export interface QuotaStatus {
  userId: string;
  date: string;
  queriesUsed: number;
  queriesRemaining: number;
  dailyLimit: number;
  resetAtUtc: string;        // ISO timestamp of next reset
}

// ============================================
// API request/response shapes
// ============================================

export interface LlmRequest {
  userId: string;
  query: string;
  context?: {
    recentQueries?: string[];
  };
}

export interface LlmToolCall {
  name: string;
  arguments: Record<string, unknown>;
  result?: unknown;
}

export interface LlmResponse {
  text: string;              // what the agent says back
  toolCalls: LlmToolCall[];
  quota: QuotaStatus;
}

// ============================================
// Constants
// ============================================

export const QUOTA_DAILY_LIMIT = 5;
export const QUOTA_RESET_HOUR_UTC = 0;

export const STORAGE_KEY_USER_ID = 'locus_pulse_user_id';
export const STORAGE_KEY_RECENT_QUERIES = 'locus_pulse_recent';
