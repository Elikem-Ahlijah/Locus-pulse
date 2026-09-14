/**
 * POST /api/refresh?key=ADMIN_TOKEN
 * Manually trigger all data refresh jobs. Token-protected.
 */

import { scrapeNpaFuelPrices } from '../_lib/npaScraper';
import { scrapeEcgOutages } from '../_lib/ecgScraper';

interface Env {
  LOCUS_DATA: KVNamespace;
  MINIMAX_API_KEY: string;
  NEWSDATA_API_KEY?: string;
  APIFOOTBALL_KEY?: string;
  CURRENTS_API_KEY?: string;
  GUARDIAN_API_KEY?: string;
  TMDB_API_KEY?: string;
  OPENWEATHER_API_KEY?: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get('key');
    const expected = env.MINIMAX_API_KEY.slice(-16);
    if (!token || token !== expected) {
      return json({ error: 'unauthorized' }, 401);
    }

    const tasks: string[] = [];

    // 1. Ghana news (freenewsapi.ai — no key needed)
    tasks.push(await refreshGhanaNews(env));

    // 2. World news (NewsData.io if available, else skip)
    tasks.push(await refreshWorldNews(env));

    // 3. Sports news (freenewsapi)
    tasks.push(await refreshCategoryNews(env, 'Ghana sports', 'sports', env.LOCUS_DATA));

    // 4. Entertainment news (freenewsapi)
    tasks.push(await refreshCategoryNews(env, 'Ghana entertainment music', 'entertainment', env.LOCUS_DATA));

    // 5. FX rates (ExchangeRate-API — no key)
    tasks.push(await refreshFx(env));

    // 6. Fuel prices (real NPA scrape)
    tasks.push(await refreshFuel(env));

    // 7. Power outages (real ECG scrape)
    tasks.push(await refreshPower(env));

    // 8. Sports fixtures (API-Football if available)
    if (env.APIFOOTBALL_KEY) {
      tasks.push(await refreshWeeklySports(env));
      tasks.push(await refreshLiveSports(env));
    } else {
      tasks.push('sports: skipped (no APIFOOTBALL_KEY)');
    }

    // 9. Movies (TMDB if available)
    if (env.TMDB_API_KEY) {
      tasks.push(await refreshMovies(env));
    } else {
      tasks.push('movies: skipped (no TMDB_API_KEY)');
    }

    return json({ triggered: true, tasks }, 200);
  } catch (e: any) {
    return json({ error: e?.message ?? String(e), stack: e?.stack }, 500);
  }
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

// ============================================
// Refresh jobs
// ============================================

async function refreshGhanaNews(env: Env): Promise<string> {
  try {
    const res = await fetch('https://freenewsapi.ai/v1/search?country=gh&language=en&limit=20&freshness=day');
    if (!res.ok) return `ghana_news: fetch ${res.status}`;
    const data: any = await res.json();
    const articles = (data.articles ?? data.results ?? []).map((a: any, i: number) => ({
      id: `gh_${Date.now()}_${i}`,
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
    const date = todayUtc();
    await env.LOCUS_DATA.put(`articles:ghana_news:${date}`, JSON.stringify(articles));
    return `ghana_news: ${articles.length}`;
  } catch (e: any) {
    return `ghana_news: ${e.message}`;
  }
}

async function refreshWorldNews(env: Env): Promise<string> {
  if (!env.NEWSDATA_API_KEY) return 'world_news: skipped (no NEWSDATA_API_KEY)';
  try {
    const res = await fetch(
      `https://newsdata.io/api/1/latest?apikey=${env.NEWSDATA_API_KEY}&language=en&category=top&size=10`
    );
    if (!res.ok) return `world_news: fetch ${res.status}`;
    const data: any = await res.json();
    const articles = (data.results ?? []).map((a: any, i: number) => ({
      id: `wd_${Date.now()}_${i}`,
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
    const date = todayUtc();
    await env.LOCUS_DATA.put(`articles:world_news:${date}`, JSON.stringify(articles));
    return `world_news: ${articles.length}`;
  } catch (e: any) {
    return `world_news: ${e.message}`;
  }
}

async function refreshCategoryNews(env: Env, query: string, category: string, kv: KVNamespace): Promise<string> {
  try {
    const res = await fetch(`https://freenewsapi.ai/v1/search?q=${encodeURIComponent(query)}&language=en&limit=15&freshness=day`);
    if (!res.ok) return `${category}: fetch ${res.status}`;
    const data: any = await res.json();
    const articles = (data.articles ?? data.results ?? []).map((a: any, i: number) => ({
      id: `${category}_${Date.now()}_${i}`,
      source: a.source ?? 'freenewsapi',
      category,
      title: a.title ?? '',
      description: a.description ?? a.summary ?? '',
      url: a.url ?? a.link ?? '',
      imageUrl: a.image ?? '',
      publishedAt: a.published_at ? new Date(a.published_at).getTime() : Date.now(),
      fetchedAt: Date.now(),
      keywords: (a.keywords ?? []).slice(0, 5),
    }));
    const date = todayUtc();
    await kv.put(`articles:${category}:${date}`, JSON.stringify(articles));
    return `${category}: ${articles.length}`;
  } catch (e: any) {
    return `${category}: ${e.message}`;
  }
}

async function refreshFx(env: Env): Promise<string> {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    if (!res.ok) return `fx: fetch ${res.status}`;
    const data: any = await res.json();
    const ghsRate = data.rates?.GHS;
    if (!ghsRate) return 'fx: no GHS in response';
    const date = todayUtc();
    const fx: any = {
      USD: ghsRate,
      GHS: 1,
      EUR: ghsRate / (data.rates.EUR ?? 1),
      GBP: ghsRate / (data.rates.GBP ?? 1),
      NGN: ghsRate / (data.rates.NGN ?? 1),
      CAD: ghsRate / (data.rates.CAD ?? 1),
    };
    await env.LOCUS_DATA.put(`fx:${date}`, JSON.stringify(fx));
    return `fx: 1 USD = ${fx.USD.toFixed(2)} GHS`;
  } catch (e: any) {
    return `fx: ${e.message}`;
  }
}

async function refreshFuel(env: Env): Promise<string> {
  try {
    const fuel = await scrapeNpaFuelPrices();
    const date = todayUtc();
    if (fuel.length > 0) {
      await env.LOCUS_DATA.put(`fuel:${date}`, JSON.stringify(fuel));
      const petrol = fuel.find((f) => f.fuelType === 'petrol');
      const diesel = fuel.find((f) => f.fuelType === 'diesel');
      return `fuel: ${fuel.length} from ${fuel[0].source} (petrol ${petrol?.priceGhs.toFixed(2)}, diesel ${diesel?.priceGhs.toFixed(2)})`;
    }
    return 'fuel: 0 (NPA scrape empty)';
  } catch (e: any) {
    return `fuel: error ${e.message}`;
  }
}

async function refreshPower(env: Env): Promise<string> {
  try {
    const outages = await scrapeEcgOutages();
    const date = todayUtc();
    if (outages.length > 0) {
      await env.LOCUS_DATA.put(`power:${date}`, JSON.stringify(outages));
      const regions = [...new Set(outages.map((o) => o.region))].join(', ');
      return `power: ${outages.length} outages in ${regions}`;
    }
    return 'power: 0 (ECG scrape empty)';
  } catch (e: any) {
    return `power: error ${e.message}`;
  }
}

async function refreshWeeklySports(env: Env): Promise<string> {
  const date = todayUtc();
  const leagues = [
    { id: 321, key: 'GPL' },
    { id: 39, key: 'EPL' },
    { id: 140, key: 'La Liga' },
    { id: 1, key: 'AFCON' },
  ];
  const tasks: string[] = [];

  for (const lg of leagues) {
    try {
      const res = await fetch(
        `https://v3.football.api-sports.io/fixtures?league=${lg.id}&next=7`,
        { headers: { 'x-apisports-key': env.APIFOOTBALL_KEY! } }
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
        tasks.push(`${lg.key} ${fixtures.length}`);
      }

      const season = new Date().getFullYear();
      const standingsRes = await fetch(
        `https://v3.football.api-sports.io/standings?league=${lg.id}&season=${season}`,
        { headers: { 'x-apisports-key': env.APIFOOTBALL_KEY! } }
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
      }
    } catch (e: any) {
      tasks.push(`${lg.key}: ${e.message}`);
    }
  }

  // Yesterday's results
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  for (const lg of leagues) {
    try {
      const res = await fetch(
        `https://v3.football.api-sports.io/fixtures?league=${lg.id}&date=${yesterday}`,
        { headers: { 'x-apisports-key': env.APIFOOTBALL_KEY! } }
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
      }
    } catch {
      // ignore
    }
  }

  return `sports: ${tasks.join(', ')}`;
}

async function refreshLiveSports(env: Env): Promise<string> {
  const date = todayUtc();
  try {
    const res = await fetch(
      `https://v3.football.api-sports.io/fixtures?live=all`,
      { headers: { 'x-apisports-key': env.APIFOOTBALL_KEY! } }
    );
    if (!res.ok) return `live: fetch ${res.status}`;
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
      if (!byLeague[fx.league]) byLeague[fx.league] = [];
      byLeague[fx.league].push(fx);
    }
    for (const [lg, fixtures] of Object.entries(byLeague)) {
      await env.LOCUS_DATA.put(`fixtures:${lg}:${date}`, JSON.stringify(fixtures));
    }
    return `live: ${liveFixtures.length}`;
  } catch (e: any) {
    return `live: ${e.message}`;
  }
}

async function refreshMovies(env: Env): Promise<string> {
  if (!env.TMDB_API_KEY) return 'movies: skipped (no TMDB_API_KEY)';
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/movie/now_playing?api_key=${env.TMDB_API_KEY}&language=en-US&page=1&region=GH`
    );
    if (!res.ok) return `movies: fetch ${res.status}`;
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
    const date = todayUtc();
    await env.LOCUS_DATA.put(`movies:now_playing:${date}`, JSON.stringify(movies));
    return `movies: ${movies.length}`;
  } catch (e: any) {
    return `movies: ${e.message}`;
  }
}
