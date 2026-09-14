/**
 * Scheduled handler — runs daily + weekly cron triggers to refresh KV data.
 *
 * Single Pages Function dispatched by current UTC hour.
 * The crons in wrangler.toml are:
 *   "0 6 star star star"       — daily news + FX + fuel + power + entertainment refresh
 *   "0 3 star star 0"          — weekly sports fixtures (Sunday 03:00 UTC)
 *   "0 star/6 star star star"  — sports live scores (every 6h, smart)
 *   "0 0 star star star"       — daily quota reset (just clears stale entries — TTL handles it)
 *
 * This function reads the current UTC hour to decide which job to run.
 */

interface Env {
  LOCUS_DATA: KVNamespace;
  NEWSDATA_API_KEY?: string;
  APIFOOTBALL_KEY?: string;
  CURRENTS_API_KEY?: string;
  GUARDIAN_API_KEY?: string;
  TMDB_API_KEY?: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  // Only respond to scheduled triggers (POST from Cloudflare's scheduler)
  if (context.request.method !== 'POST') {
    return new Response('Use POST for scheduled triggers only', { status: 405 });
  }

  const now = new Date();
  const utcHour = now.getUTCHours();
  const utcDay = now.getUTCDay(); // 0=Sunday
  const results: string[] = [];

  // 06:00 UTC daily — main data refresh
  if (utcHour === 6) {
    results.push('--- Daily refresh ---');
    results.push(await runDailyRefresh(context.env));
  }

  // 03:00 UTC Sunday — weekly sports fixtures
  if (utcHour === 3 && utcDay === 0) {
    results.push('--- Weekly sports ---');
    results.push(await runWeeklySports(context.env));
  }

  // Every 6 hours — sports live check (only fires API calls if games are live)
  if (utcHour % 6 === 0) {
    results.push(`--- Sports live check (hour ${utcHour}) ---`);
    results.push(await runLiveSportsCheck(context.env));
  }

  return new Response(
    JSON.stringify({
      triggered: results.length > 0,
      utcHour,
      utcDay,
      results,
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
};

// ============================================
// Job runners
// ============================================

async function runDailyRefresh(env: Env): Promise<string> {
  const date = new Date().toISOString().slice(0, 10);
  const tasks: string[] = [];

  // 1. Ghana news from freenewsapi.ai (no key, no quota)
  try {
    const res = await fetch(
      `https://freenewsapi.ai/v1/search?country=gh&language=en&limit=20&freshness=day`
    );
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

  // 2. World news from NewsData.io (200 credits/day, commercial OK)
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
  }

  // 3. Sports news from freenewsapi.ai
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

  // 4. Entertainment news from freenewsapi.ai
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

  // 5. FX rates (Bank of Ghana + fallback)
  try {
    // Try ExchangeRate-API as fallback (it has GHS)
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    if (res.ok) {
      const data: any = await res.json();
      const rates = data.rates ?? {};
      // Take USD-base rates and convert to GHS-base for our storage
      const ghsRate = rates.GHS;
      if (ghsRate) {
        const fx = {
          USD: 1,
          GHS: ghsRate,
          EUR: ghsRate / (rates.EUR ?? 1),
          GBP: ghsRate / (rates.GBP ?? 1),
          NGN: ghsRate / (rates.NGN ?? 1),
          CAD: ghsRate / (rates.CAD ?? 1),
          EUR_per_USD: rates.EUR,
          GBP_per_USD: rates.GBP,
        };
        await env.LOCUS_DATA.put(`fx:${date}`, JSON.stringify(fx));
        tasks.push(`fx: USD=${fx.GHS.toFixed(4)} GHS`);
      }
    }
  } catch (e: any) {
    tasks.push(`fx: error ${e.message}`);
  }

  // 6. Fuel prices (placeholder — replace with NPA scrape when URL known)
  // TODO: scrape https://npa.gov.gh/petroleum-prices/ or weekly-published PDF
  // For now seed with current known values (these will be refreshed weekly)
  const fuel = [
    { fuelType: 'petrol', priceGhs: 14.20, effectiveDate: date, source: 'NPA-pending' },
    { fuelType: 'diesel', priceGhs: 16.50, effectiveDate: date, source: 'NPA-pending' },
    { fuelType: 'lpg', priceGhs: 12.00, effectiveDate: date, source: 'NPA-pending' },
  ];
  await env.LOCUS_DATA.put(`fuel:${date}`, JSON.stringify(fuel));
  tasks.push(`fuel: 3 entries (placeholder)`);

  // 7. Movies — now playing (TMDB)
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
        tasks.push(`movies: ${movies.length} now playing`);
      }
    } catch (e: any) {
      tasks.push(`movies: error ${e.message}`);
    }
  }

  return tasks.join('\n');
}

async function runWeeklySports(env: Env): Promise<string> {
  if (!env.APIFOOTBALL_KEY) return 'skipped (no APIFOOTBALL_KEY)';
  const date = new Date().toISOString().slice(0, 10);
  const tasks: string[] = [];

  // Fetch GPL (Ghana Premier League) fixtures + standings
  // API-Football league IDs: GPL = 321, EPL = 39, La Liga = 140
  const leagues: { id: number; key: string }[] = [
    { id: 321, key: 'GPL' },
    { id: 39, key: 'EPL' },
    { id: 140, key: 'La Liga' },
    { id: 1, key: 'AFCON' },
  ];

  for (const lg of leagues) {
    try {
      // Fixtures for next 7 days
      const fixturesRes = await fetch(
        `https://v3.football.api-sports.io/fixtures?league=${lg.id}&next=7`,
        { headers: { 'x-apisports-key': env.APIFOOTBALL_KEY } }
      );
      if (fixturesRes.ok) {
        const data: any = await fixturesRes.json();
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

      // Standings
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
        await env.LOCUS_DATA.put(
          `standings:${lg.key}:${season}-${season + 1}`,
          JSON.stringify(standings)
        );
        tasks.push(`standings:${lg.key} ${standings.length} teams`);
      }
    } catch (e: any) {
      tasks.push(`${lg.key}: error ${e.message}`);
    }
  }

  // Also fetch yesterday's results (for "recent result" queries)
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

    // Bucket by league for the per-day storage key
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
