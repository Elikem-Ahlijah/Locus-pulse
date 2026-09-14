/**
 * POST /api/refresh?key=ADMIN_TOKEN
 * Simplified version for testing.
 */

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
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get('key');
    const expected = env.MINIMAX_API_KEY.slice(-16);
    if (!token || token !== expected) {
      return json({ error: 'unauthorized' }, 401);
    }

    const tasks: string[] = [];

    // News from freenewsapi
    try {
      const res = await fetch('https://freenewsapi.ai/v1/search?country=gh&language=en&limit=10&freshness=day');
      if (res.ok) {
        const data: any = await res.json();
        const articles = (data.articles ?? data.results ?? []).map((a: any, i: number) => ({
          id: `gh_${Date.now()}_${i}`,
          source: 'freenewsapi',
          category: 'ghana_news',
          title: a.title ?? '',
          description: a.description ?? a.summary ?? '',
          url: a.url ?? a.link ?? '',
          imageUrl: a.image ?? '',
          publishedAt: a.published_at ? new Date(a.published_at).getTime() : Date.now(),
          fetchedAt: Date.now(),
          keywords: (a.keywords ?? []).slice(0, 5),
        }));
        const date = new Date().toISOString().slice(0, 10);
        await env.LOCUS_DATA.put(`articles:ghana_news:${date}`, JSON.stringify(articles));
        tasks.push(`ghana_news: ${articles.length}`);
      } else {
        tasks.push(`ghana_news: fetch ${res.status}`);
      }
    } catch (e: any) {
      tasks.push(`ghana_news: ${e.message}`);
    }

    // FX
    try {
      const res = await fetch('https://open.er-api.com/v6/latest/USD');
      if (res.ok) {
        const data: any = await res.json();
        const ghsRate = data.rates?.GHS;
        if (ghsRate) {
          const date = new Date().toISOString().slice(0, 10);
          // fx[from] = how many GHS for 1 unit of `from`
          const fx: any = {
            USD: ghsRate,                  // 1 USD = ghsRate GHS
            GHS: 1,                        // 1 GHS = 1 GHS
            EUR: ghsRate / (data.rates.EUR ?? 1),
            GBP: ghsRate / (data.rates.GBP ?? 1),
            NGN: ghsRate / (data.rates.NGN ?? 1),
            CAD: ghsRate / (data.rates.CAD ?? 1),
          };
          await env.LOCUS_DATA.put(`fx:${date}`, JSON.stringify(fx));
          tasks.push(`fx: 1 USD = ${fx.USD.toFixed(2)} GHS`);
        }
      }
    } catch (e: any) {
      tasks.push(`fx: ${e.message}`);
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
