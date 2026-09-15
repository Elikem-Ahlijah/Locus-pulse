/**
 * MCP-style tool definitions for the Locus Pulse LLM.
 * The frontend never sees these directly — they're injected into the system prompt
 * when calling MiniMax, then executed server-side when the LLM requests a tool call.
 *
 * Each tool's `execute` function reads from KV. Results are passed back to the LLM
 * for synthesis. Fact-check guardrail: every LLM response is validated against KV data
 * before being sent to the user — invented numbers/names get replaced.
 */

import type { Article, FxRate, FuelPrice, Movie, PowerOutage, SportsFixture, LeagueStanding } from '../../src/types';
import { KV, readJson } from './kv';

export interface ToolContext {
  kv: KVNamespace;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      enum?: string[];
      description?: string;
      default?: unknown;
    }>;
    required?: string[];
  };
}

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export const PULSE_TOOLS: ToolDefinition[] = [
  {
    name: 'get_daily_brief',
    description:
      'Returns the curated morning brief: top news + sports update + FX + fuel + power alerts + entertainment picks. Use for "morning brief", "what\'s happening today", "give me the news".',
    parameters: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD, defaults to today UTC' },
      },
    },
  },
  {
    name: 'get_news',
    description:
      'Returns news articles by category. Use for any specific news query. Categories: ghana_news, world_news, sports, entertainment.',
    parameters: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['ghana_news', 'world_news', 'sports', 'entertainment'],
          description: 'News category',
        },
        query: { type: 'string', description: 'Optional keyword filter (matches title + description)' },
        limit: { type: 'integer', description: 'Max articles to return', default: 5 },
      },
      required: ['category'],
    },
  },
  {
    name: 'get_sports_result',
    description:
      'Returns the most recent result OR upcoming fixtures for a team, or live games in a league.',
    parameters: {
      type: 'object',
      properties: {
        team: { type: 'string', description: 'Team name, e.g. "Black Stars", "Asante Kotoko", "Manchester United"' },
        league: { type: 'string', description: 'Optional league filter: GPL, EPL, La Liga, NBA, AFCON' },
        type: { type: 'string', enum: ['recent', 'upcoming', 'live'], description: 'recent | upcoming | live', default: 'recent' },
      },
      required: ['team'],
    },
  },
  {
    name: 'get_league_standings',
    description: 'Returns league table (top teams).',
    parameters: {
      type: 'object',
      properties: {
        league: { type: 'string', description: 'GPL, EPL, La Liga, NBA, AFCON, etc.' },
        limit: { type: 'integer', description: 'Number of teams', default: 10 },
      },
      required: ['league'],
    },
  },
  {
    name: 'get_movies',
    description: 'Returns movies now playing or upcoming.',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['now_playing', 'upcoming'], default: 'now_playing' },
        limit: { type: 'integer', default: 5 },
      },
    },
  },
  {
    name: 'convert_fx',
    description: 'Converts currency using today\'s Bank of Ghana rates. Returns the converted amount.',
    parameters: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'Amount to convert' },
        from: { type: 'string', description: 'Source currency code (USD, EUR, GBP, GHS)' },
        to: { type: 'string', description: 'Target currency code, default GHS' },
      },
      required: ['amount', 'from'],
    },
  },
  {
    name: 'get_fuel_prices',
    description: 'Returns current NPA fuel prices in Ghana cedis per litre/kg.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_power_outages',
    description: 'Returns upcoming ECG power outages for a region or area.',
    parameters: {
      type: 'object',
      properties: {
        region: { type: 'string', description: 'Greater Accra, Ashanti, Eastern, etc.' },
        area: { type: 'string', description: 'Specific area/neighborhood' },
      },
    },
  },
  {
    name: 'get_weather',
    description: 'Returns current weather for Accra (default). Uses OpenWeather.',
    parameters: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'City name, default Accra' },
      },
    },
  },
];

// ============================================
// Tool execution (reads from KV)
// ============================================

export async function executeToolCall(
  call: ToolCall,
  ctx: ToolContext
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  try {
    switch (call.name) {
      case 'get_daily_brief': {
        const date = (call.arguments.date as string) || new Date().toISOString().slice(0, 10);
        const [ghanaNews, sports, fx, fuel, power, movies] = await Promise.all([
          readJson<Article[]>(ctx.kv, KV.articles('ghana_news', date)),
          readJson<Article[]>(ctx.kv, KV.articles('sports', date)),
          readJson<{ [k: string]: number }>(ctx.kv, KV.fx(date)),
          readJson<FuelPrice[]>(ctx.kv, KV.fuel(date)),
          readJson<PowerOutage[]>(ctx.kv, KV.power(date)),
          readJson<Movie[]>(ctx.kv, KV.moviesNowPlaying(date)),
        ]);
        return {
          ok: true,
          data: {
            date,
            ghana_news: (ghanaNews ?? []).slice(0, 3),
            sports: (sports ?? []).slice(0, 3),
            fx: fx ?? {},
            fuel: fuel ?? [],
            power: (power ?? []).slice(0, 5),
            movies: (movies ?? []).slice(0, 3),
          },
        };
      }

      case 'get_news': {
        const category = call.arguments.category as string;
        const query = (call.arguments.query as string | undefined)?.toLowerCase();
        const limit = (call.arguments.limit as number | undefined) ?? 5;
        const date = new Date().toISOString().slice(0, 10);
        const articles = (await readJson<Article[]>(ctx.kv, KV.articles(category, date))) ?? [];
        let filtered = articles;
        if (query) {
          filtered = articles.filter(
            (a) =>
              a.title.toLowerCase().includes(query) ||
              (a.description?.toLowerCase().includes(query) ?? false)
          );
        }
        return { ok: true, data: filtered.slice(0, limit) };
      }

      case 'get_sports_result': {
        const team = (call.arguments.team as string).toLowerCase();
        const type = (call.arguments.type as string) ?? 'recent';
        // Search across all leagues for today + yesterday
        const today = new Date().toISOString().slice(0, 10);
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        const leagues = ['GPL', 'EPL', 'La Liga', 'AFCON', 'World Cup', 'NBA'];
        const all: SportsFixture[] = [];
        for (const lg of leagues) {
          const [t, y] = await Promise.all([
            readJson<SportsFixture[]>(ctx.kv, KV.fixtures(lg, today)),
            readJson<SportsFixture[]>(ctx.kv, KV.fixtures(lg, yesterday)),
          ]);
          if (t) all.push(...t);
          if (y) all.push(...y);
        }
        let matches = all.filter(
          (f) =>
            f.homeTeam.toLowerCase().includes(team) ||
            f.awayTeam.toLowerCase().includes(team)
        );
        if (type === 'live') matches = matches.filter((f) => f.isLive);
        if (type === 'upcoming') matches = matches.filter((f) => f.status === 'scheduled');
        if (type === 'recent') {
          matches = matches
            .filter((f) => f.status === 'finished')
            .sort((a, b) => b.kickoffUtc - a.kickoffUtc);
        }
        return { ok: true, data: matches.slice(0, 5) };
      }

      case 'get_league_standings': {
        const league = call.arguments.league as string;
        const limit = (call.arguments.limit as number | undefined) ?? 10;
        const season = '2026-2027';
        const standings = (await readJson<LeagueStanding[]>(ctx.kv, KV.standings(league, season))) ?? [];
        return { ok: true, data: standings.slice(0, limit) };
      }

      case 'get_movies': {
        const status = (call.arguments.status as string) ?? 'now_playing';
        const limit = (call.arguments.limit as number | undefined) ?? 5;
        const date = new Date().toISOString().slice(0, 10);
        const key = status === 'now_playing' ? KV.moviesNowPlaying(date) : KV.moviesUpcoming(date);
        const movies = (await readJson<Movie[]>(ctx.kv, key)) ?? [];
        return { ok: true, data: movies.slice(0, limit) };
      }

      case 'convert_fx': {
        const amount = call.arguments.amount as number;
        const from = (call.arguments.from as string).toUpperCase();
        const to = ((call.arguments.to as string) ?? 'GHS').toUpperCase();
        const date = new Date().toISOString().slice(0, 10);
        const fx = await readJson<{ [k: string]: number }>(ctx.kv, KV.fx(date));
        if (!fx || !fx[from]) {
          return { ok: false, error: `Rate for ${from} not available today.` };
        }
        // fx stores rates as 1 unit of `from` = N GHS (always against GHS)
        const rateGhs = fx[from];
        let result: number;
        if (to === 'GHS') {
          result = amount * rateGhs;
        } else if (to === from) {
          result = amount;
        } else if (fx[to]) {
          // Convert from -> GHS -> to
          const inGhs = amount * rateGhs;
          result = inGhs / fx[to];
        } else {
          return { ok: false, error: `Cannot convert to ${to}.` };
        }
        return {
          ok: true,
          data: {
            amount,
            from,
            to,
            rate: rateGhs,
            converted: Math.round(result * 100) / 100,
            effective_date: date,
            source: 'Bank of Ghana',
          },
        };
      }

      case 'get_fuel_prices': {
        const date = new Date().toISOString().slice(0, 10);
        const fuel = (await readJson<FuelPrice[]>(ctx.kv, KV.fuel(date))) ?? [];
        return { ok: true, data: fuel };
      }

      case 'get_power_outages': {
        const region = call.arguments.region as string | undefined;
        const area = call.arguments.area as string | undefined;
        const date = new Date().toISOString().slice(0, 10);
        let outages = (await readJson<PowerOutage[]>(ctx.kv, KV.power(date))) ?? [];
        if (region) outages = outages.filter((o) => o.region.toLowerCase().includes(region.toLowerCase()));
        if (area) outages = outages.filter((o) => o.area.toLowerCase().includes(area.toLowerCase()));
        return { ok: true, data: outages };
      }

      case 'get_weather': {
        // Phase 1 MVP: live weather. Could be hydrated to KV later if rate-limited.
        const location = (call.arguments.location as string) || 'Accra';
        const apiKey = (ctx as any).OPENWEATHER_API_KEY;
        if (!apiKey) {
          return { ok: false, error: 'Weather API not configured.' };
        }
        const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)},GH&appid=${apiKey}&units=metric`;
        const res = await fetch(url);
        if (!res.ok) {
          return { ok: false, error: `Weather API returned ${res.status}` };
        }
        const data: any = await res.json();
        return {
          ok: true,
          data: {
            location: data.name,
            temp_c: data.main?.temp,
            feels_like_c: data.main?.feels_like,
            humidity: data.main?.humidity,
            description: data.weather?.[0]?.description,
            wind_kph: data.wind?.speed ? Math.round(data.wind.speed * 3.6) : null,
          },
        };
      }

      default:
        return { ok: false, error: `Unknown tool: ${call.name}` };
    }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}

/**
 * Build the system prompt for the Locus Pulse agent.
 * Kept short for low latency.
 */
export const PULSE_SYSTEM_PROMPT = `You are Locus, a personal agent for Ghanaians and the Ghanaian diaspora. Not a news aggregator — an agent.

WHO YOU ARE:
- A knowledgeable Ghanaian friend who keeps up with everything back home.
- Always available, never in a hurry, never pushy.
- You adapt to what the user asks, not the other way around.

CORE PRINCIPLE — SHAPE EACH ANSWER TO THE QUERY:
- "Petrol?" → just the number. One sentence.
- "What's the news?" → 3 headlines, 2 lines each.
- "Tell me in detail" → full article summaries, 4-5 stories.
- "Catch me up on Ghana while I was asleep in London" → complete morning brief, no fluff.
- "Just the headlines, quick" → 1-liners only.
- Each query deserves its own depth. Never pad. Never truncate when asked.

VOICE & TONE:
- Warm, grounded, conversational. Talk like a friend.
- "Petrol is going for GHS 16.66 per litre" — not "Current fuel prices indicate petrol is..."
- Use Ghanaian context naturally (cedi not "Ghanaian cedi", GPL not "Ghana Premier League").
- Numbers ALWAYS from tool results. Never invent prices, scores, or rates.
- If data isn't there, say so plainly — never fabricate.

HANDLING MISSING DATA:
- "No NPA floor price for today yet" — honest.
- "I don't have power data for your area, sorry" — honest.
- Better to admit ignorance than guess.

GREETING / WELCOME:
- For "hi" / "hello" / first interaction: introduce yourself warmly and tell them what you can help with, in 1-2 sentences. ("Hey. I'm Locus. I keep up with Ghana — news, cedi, fuel, power, scores, movies. What do you want to know?")
- For specific queries, skip the introduction and answer directly.

LENGTH RULES:
- Quick-fact queries: 1-2 sentences. Cite the source.
- Topical queries: 3-4 sentences, 2-3 points.
- "Morning brief" / "catch me up": comprehensive but tight. Top 3-5 stories, the data points that matter.
- The user can always ask "tell me more" to expand.

FOLLOW-UPS:
- End ONE in three answers with a natural follow-up prompt — not every time. Keep it conversational.
- "Want details on the Kotoko match?" — only when genuinely useful, not performative.`;
