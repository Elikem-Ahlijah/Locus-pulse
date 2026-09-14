/**
 * GET /api/movies?limit=20
 * Returns movies now playing from KV.
 */

import { KV, readJson } from '../_lib/kv';
import type { Movie } from '../../src/types';

interface Env {
  LOCUS_DATA: KVNamespace;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get('limit') ?? '20', 10);
  const today = new Date().toISOString().slice(0, 10);

  const movies = (await readJson<Movie[]>(env.LOCUS_DATA, KV.moviesNowPlaying(today))) ?? [];

  return new Response(JSON.stringify({ movies: movies.slice(0, limit) }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
};
