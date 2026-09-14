/**
 * GET /api/brief
 *
 * Returns today's curated brief composition. Used by HomePage on load.
 */

import { KV, readJson } from '../_lib/kv';
import type { Article, DailyBrief, FxRate, FuelPrice, Movie, PowerOutage } from '../../src/types';

interface Env {
  LOCUS_DATA: KVNamespace;
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const today = new Date().toISOString().slice(0, 10);

  const [ghanaNews, sports, fx, fuel, power, movies] = await Promise.all([
    readJson<Article[]>(env.LOCUS_DATA, KV.articles('ghana_news', today)),
    readJson<Article[]>(env.LOCUS_DATA, KV.articles('sports', today)),
    readJson<FxRate[]>(env.LOCUS_DATA, KV.fx(today)),
    readJson<FuelPrice[]>(env.LOCUS_DATA, KV.fuel(today)),
    readJson<PowerOutage[]>(env.LOCUS_DATA, KV.power(today)),
    readJson<Movie[]>(env.LOCUS_DATA, KV.moviesNowPlaying(today)),
  ]);

  return new Response(
    JSON.stringify({
      date: today,
      sections: {
        ghana_news: (ghanaNews ?? []).slice(0, 5),
        sports: (sports ?? []).slice(0, 5),
        fx: fx ?? null,
        fuel: fuel ?? [],
        power: (power ?? []).slice(0, 10),
        movies: (movies ?? []).slice(0, 5),
      },
      hasData: {
        ghana_news: (ghanaNews ?? []).length > 0,
        sports: (sports ?? []).length > 0,
        fx: !!fx,
        fuel: (fuel ?? []).length > 0,
        power: (power ?? []).length > 0,
        movies: (movies ?? []).length > 0,
      },
      generatedAt: Date.now(),
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    }
  );
};
