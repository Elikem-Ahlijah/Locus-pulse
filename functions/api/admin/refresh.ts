/**
 * POST /api/admin/refresh?key=ADMIN_TOKEN
 *
 * Manually trigger the data refresh jobs (same logic as the cron handler).
 * Token-protected so we don't get hit by bots.
 *
 * Used to populate KV after deploy and during development.
 */

import { PULSE_SYSTEM_PROMPT } from '../../_lib/pulseTools';

interface Env {
  LOCUS_DATA: KVNamespace;
  MINIMAX_API_KEY: string;
  NEWSDATA_API_KEY?: string;
  APIFOOTBALL_KEY?: string;
  CURRENTS_API_KEY?: string;
  GUARDIAN_API_KEY?: string;
  TMDB_API_KEY?: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  // Simple auth gate
  const url = new URL(request.url);
  const token = url.searchParams.get('key');
  const expected = env.MINIMAX_API_KEY.slice(-16); // last 16 chars of MiniMax key as a shared secret
  if (!token || token !== expected) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const results: string[] = [];

  try {
    results.push('--- Daily ---');
    results.push(await runDailyRefresh(env));
  } catch (e: any) {
    results.push(`daily: ${e.message}`);
  }

  // Only run weekly + live if APIFOOTBALL_KEY is set
  if (env.APIFOOTBALL_KEY) {
    try {
      results.push('--- Weekly Sports ---');
      results.push(await runWeeklySports(env));
    } catch (e: any) {
      results.push(`weekly: ${e.message}`);
    }
    try {
      results.push('--- Live Sports ---');
      results.push(await runLiveSportsCheck(env));
    } catch (e: any) {
      results.push(`live: ${e.message}`);
    }
  }

  return new Response(
    JSON.stringify({
      triggered: true,
      results,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};

// Same logic as functions/scheduled.ts — extract to shared later if this grows
async function runDailyRefresh(env: Env): Promise<string> {
  const date = new Date().toISOString().slice(0, 10);
  const tasks: string[] = [];

  // 1. Ghana news from freenewsapi.ai
  try {
    const res = await fetch(`https://freenewsapi.ai/v1/search?country=gh&language=en&limit=20&freshness=day`);
    if (res.ok) {
      const data: any = await res.json();
      const articles = (data.articles ?? data.results ?? []).map((a: any, i: number) => ({
        id: `gh_${date}_${i}`,
        source: 'freenewsapi',
        category: 'ghana_news',
        title: a.title ?? '',
        description: a.description ?? a.summary ?? '',
        url: a.url ?? a.link ?? '',
        imageUrl: a.image ?? a.thumbnail ?? '',
        publishedAt: a.published_at ? new Date(a.published_at).getTime() : Date.now(),
        fetchedAt: Date.now(),
        keywords: (a.keywords ?? []).slice(0, 5),
      }));
      await env.LOCUS_DATA.put(`articles:ghana_news:${date}`, JSON.stringify(articles));
      tasks.push(`ghana_news: ${articles.length} articles`);
    } else {
      tasks.push(`ghana_news: fetch failed (${res.status})`);
    }
  } catch (e: any) {
    tasks.push(`ghana_news: error ${e.message}`);
  }

  // 2. World news from NewsData.io
  if (env.NEWSDATA_API_KEY) {
    try {
      const res = await fetch(
        `https://newsdata.io/api/1/latest?apikey=${env.NEWSDATA_API_KEY}&language=en&category=top&size=10`
      );
      if (res.ok) {
        const data: any = await res.json();
        const articles = (data.results ?? []).map((a: any, i: number) => ({
          id: `wd_${date}_${i}`,
          source: 'newsdata',
          category: 'world_news',
          title: a.title ?? '',
          description: a.description ?? '',
          url: a.link ?? '',
          imageUrl: a.image_url ?? '',
          publishedAt: a.pubDate ? new Date(a.pubDate).getTime() : Date.now(),
          fetchedAt: Date.now(),
          keywords: a.keywords ?? [],
        }));
        await env.LOCUS_DATA.put(`articles:world_news:${date}`, JSON.stringify(articles));
        tasks.push(`world_news: ${articles.length} articles`);
      } else {
        tasks.push(`world_news: fetch failed (${res.status})`);
      }
    } catch (e: any) {
      tasks.push(`world_news: error ${e.message}`);
    }
  } else {
    tasks.push(`world_news: skipped (no NEWSDATA_API_KEY)`);
  }

  // 3. Sports news
  try {
    const res = await fetch(`https://freenewsapi.ai/v1/search?q=Ghana+sports&language=en&limit=15&freshness=day`);
    if (res.ok) {
      const data: any = await res.json();
      const articles = (data.articles ?? data.results ?? []).map((a: any, i: number) => ({
        id: `sp_${date}_${i}`,
        source: a.source ?? 'freenewsapi',
        category: 'sports',
        title: a.title ?? '',
        description: a.description ?? a.summary ?? '',
        url: a.url ?? a.link ?? '',
        imageUrl: a.image ?? '',
        publishedAt: a.published_at ? new Date(a.published_at).getTime() : Date.now(),
        fetchedAt: Date.now(),
        keywords: (a.keywords ?? []).slice(0, 5),
      }));
      await env.LOCUS_DATA.put(`articles:sports:${date}`, JSON.stringify(articles));
      tasks.push(`sports_news: ${articles.length} articles`);
    }
  } catch (e: any) {
    tasks.push(`sports_news: error ${e.message}`);
  }

  // 4. Entertainment news
  try {
    const res = await fetch(`https://freenewsapi.ai/v1/search?q=Ghana+entertainment+music&language=en&limit=15&freshness=day`);
    if (res.ok) {
      const data: any = await res.json();
      const articles = (data.articles ?? data.results ?? []).map((a: any, i: number) => ({
        id: `en_${date}_${i}`,
        source: a.source ?? 'freenewsapi',
        category: 'entertainment',
        title: a.title ?? '',
        description: a.description ?? a.summary ?? '',
        url: a.url ?? a.link ?? '',
        imageUrl: a.image ?? '',
        publishedAt: a.published_at ? new Date(a.published_at).getTime() : Date.now(),
        fetchedAt: Date.now(),
        keywords: (a.keywords ?? []).slice(0, 5),
      }));
      await env.LOCUS_DATA.put(`articles:entertainment:${date}`, JSON.stringify(articles));
      tasks.push(`entertainment_news: ${articles.length} articles`);
    }
  } catch (e: any) {
    tasks.push(`entertainment_news: error ${e.message}`);
  }

  // 5. FX rates
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    if (res.ok) {
      const data: any = await res.json();
      const rates = data.rates ?? {};
      const ghsRate = rates.GHS;
      if (ghsRate) {
        const fx: any = {
          USD: 1,
          GHS: ghsRate,
          EUR: ghsRate / (rates.EUR ?? 1),
          GBP: ghsRate / (rates.GBP ?? 1),
          NGN: ghsRate / (rates.NGN ?? 1),
          CAD: ghsRate / (rates.CAD ?? 1),
        };
        await env.LOCUS_DATA.put(`fx:${date}`, JSON.stringify(fx));
        tasks.push(`fx: USD=1, GHS=${fx.GHS.toFixed(4)}`);
      }
    } else {
      tasks.push(`fx: fetch failed (${res.status})`);
    }
  } catch (e: any) {
    tasks.push(`fx: error ${e.message}`);
  }

  // 6. Fuel prices (placeholder until NPA scrape)
  const fuel = [
    { fuelType: 'petrol', priceGhs: 14.20, effectiveDate: date, source: 'NPA-pending' },
    { fuelType: 'diesel', priceGhs: 16.50, effectiveDate: date, source: 'NPA-pending' },
    { fuelType: 'lpg', priceGhs: 12.00, effectiveDate: date, source: 'NPA-pending' },
  ];
  await env.LOCUS_DATA.put(`fuel:${date}`, JSON.stringify(fuel));
  tasks.push(`fuel: 3 (placeholder)`);

  // 7. Movies — TMDB
  if (env.TMDB_API_KEY) {
    try {
      const res = await fetch(
        `https://api.themoviedb.org/3/movie/now_playing?api_key=${env.TMDB_API_KEY}&language=en-US&page=1&region=GH`
      );
      if (res.ok) {
        const data: any = await res.json();
        const movies = (data.results ?? []).slice(0, 10).map((m: any) => ({
          tmdbId: m.id,
          title: m.title ?? m.original_title,
          overview: m.overview,
          posterPath: m.poster_path,
          backdropPath: m.backdrop_path,
          releaseDate: m.release_date,
          voteAverage: m.vote_average,
          voteCount: m.vote_count,
          status: 'now_playing',
        }));
        await env.LOCUS_DATA.put(`movies:now_playing:${date}`, JSON.stringify(movies));
        tasks.push(`movies: ${movies.length}`);
      } else {
        tasks.push(`movies: fetch failed (${res.status})`);
      }
    } catch (e: any) {
      tasks.push(`movies: error ${e.message}`);
    }
  } else {
    tasks.push(`movies: skipped (no TMDB_API_KEY)`);
  }

  return tasks.join('\n');
}

async function runWeeklySports(env: Env): Promise<string> {
  if (!env.APIFOOTBALL_KEY) return 'skipped (no APIFOOTBALL_KEY)';
  const date = new Date().toISOString().slice(0, 10);
  const tasks: string[] = [];

  const leagues = [
    { id: 321, key: 'GPL' },
    { id: 39, key: 'EPL' },
    { id: 140, key: 'La Liga' },
    { id: 1, key: 'AFCON' },
  ];

  for (const lg of leagues) {
    try {
      const res = await fetch(
        `https://v3.football.api-sports.io/fixtures?league=${lg.id}&next=7`,
        { headers: { 'x-apisports-key': env.APIFOOTBALL_KEY } }
      );
      if (res.ok) {
        const data: any = await res.json();
        const fixtures = (data.response ?? []).map((f: any) => ({
          id: f.fixture.id,
          league: lg.key,
          sport: 'football',
          homeTeam: f.teams.home.name,
          awayTeam: f.teams.away.name,
          kickoffUtc: new Date(f.fixture.date).getTime(),
          status: f.fixture.status.short,
          homeScore: f.goals.home,
          awayScore: f.goals.away,
          venue: f.fixture.venue?.name,
          isLive: ['1H', '2H', 'HT', 'ET', 'P', 'LIVE'].includes(f.fixture.status.short),
        }));
        await env.LOCUS_DATA.put(`fixtures:${lg.key}:${date}`, JSON.stringify(fixtures));
        tasks.push(`fixtures:${lg.key} ${fixtures.length}`);
      }

      const season = new Date().getFullYear();
      const standingsRes = await fetch(
        `https://v3.football.api-sports.io/standings?league=${lg.id}&season=${season}`,
        { headers: { 'x-apisports-key': env.APIFOOTBALL_KEY } }
      );
      if (standingsRes.ok) {
        const data: any = await standingsRes.json();
        const table = data.response?.[0]?.league?.standings?.[0] ?? [];
        const standings = table.map((row: any, idx: number) => ({
          league: lg.key,
          season: `${season}-${season + 1}`,
          position: row.rank ?? idx + 1,
          team: row.team.name,
          played: row.all.played,
          won: row.all.win,
          drawn: row.all.draw,
          lost: row.all.lose,
          goalsFor: row.all.goals.for,
          goalsAgainst: row.all.goals.against,
          goalDifference: row.goalsDiff,
          points: row.points,
          form: row.form,
        }));
        await env.LOCUS_DATA.put(`standings:${lg.key}:${season}-${season + 1}`, JSON.stringify(standings));
        tasks.push(`standings:${lg.key} ${standings.length}`);
      }
    } catch (e: any) {
      tasks.push(`${lg.key}: error ${e.message}`);
    }
  }

  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  for (const lg of leagues) {
    try {
      const res = await fetch(
        `https://v3.football.api-sports.io/fixtures?league=${lg.id}&date=${yesterday}`,
        { headers: { 'x-apisports-key': env.APIFOOTBALL_KEY } }
      );
      if (res.ok) {
        const data: any = await res.json();
        const fixtures = (data.response ?? []).map((f: any) => ({
          id: f.fixture.id,
          league: lg.key,
          sport: 'football',
          homeTeam: f.teams.home.name,
          awayTeam: f.teams.away.name,
          kickoffUtc: new Date(f.fixture.date).getTime(),
          status: f.fixture.status.short,
          homeScore: f.goals.home,
          awayScore: f.goals.away,
          venue: f.fixture.venue?.name,
          isLive: false,
        }));
        await env.LOCUS_DATA.put(`fixtures:${lg.key}:${yesterday}`, JSON.stringify(fixtures));
        tasks.push(`yesterday:${lg.key} ${fixtures.length}`);
      }
    } catch (e: any) {
      tasks.push(`yesterday:${lg.key}: ${e.message}`);
    }
  }

  return tasks.join('\n');
}

async function runLiveSportsCheck(env: Env): Promise<string> {
  if (!env.APIFOOTBALL_KEY) return 'skipped (no APIFOOTBALL_KEY)';
  const date = new Date().toISOString().slice(0, 10);
  try {
    const res = await fetch(
      `https://v3.football.api-sports.io/fixtures?live=all`,
      { headers: { 'x-apisports-key': env.APIFOOTBALL_KEY } }
    );
    if (!res.ok) return `live check failed: ${res.status}`;
    const data: any = await res.json();
    const liveFixtures = (data.response ?? []).map((f: any) => ({
      id: f.fixture.id,
      league: f.league.name,
      sport: 'football',
      homeTeam: f.teams.home.name,
      awayTeam: f.teams.away.name,
      kickoffUtc: new Date(f.fixture.date).getTime(),
      status: f.fixture.status.short,
      homeScore: f.goals.home,
      awayScore: f.goals.away,
      isLive: true,
    }));
    const byLeague: { [k: string]: any[] } = {};
    for (const fx of liveFixtures) {
      const key = fx.league;
      if (!byLeague[key]) byLeague[key] = [];
      byLeague[key].push(fx);
    }
    for (const [lg, fixtures] of Object.entries(byLeague)) {
      await env.LOCUS_DATA.put(`fixtures:${lg}:${date}`, JSON.stringify(fixtures));
    }
    return `live: ${liveFixtures.length} fixtures in ${Object.keys(byLeague).length} leagues`;
  } catch (e: any) {
    return `live check error: ${e.message}`;
  }
}
