/**
 * GET /api/fixtures?league=...&limit=20
 * Returns fixtures (today + yesterday) from KV.
 */

import { KV, readJson } from '../_lib/kv';
import type { SportsFixture } from '../../src/types';

interface Env {
  LOCUS_DATA: KVNamespace;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const league = url.searchParams.get('league');
  const limit = parseInt(url.searchParams.get('limit') ?? '20', 10);

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  const leagues = league && league !== 'all'
    ? [league]
    : ['GPL', 'EPL', 'La Liga', 'AFCON', 'NBA'];

  const all: SportsFixture[] = [];
  for (const lg of leagues) {
    const [t, y] = await Promise.all([
      readJson<SportsFixture[]>(env.LOCUS_DATA, KV.fixtures(lg, today)),
      readJson<SportsFixture[]>(env.LOCUS_DATA, KV.fixtures(lg, yesterday)),
    ]);
    if (t) all.push(...t);
    if (y) all.push(...y);
  }

  // Sort: live first, then upcoming, then most recent finished
  all.sort((a, b) => {
    if (a.isLive && !b.isLive) return -1;
    if (!a.isLive && b.isLive) return 1;
    if (a.status === 'scheduled' && b.status !== 'scheduled') return -1;
    if (a.status !== 'scheduled' && b.status === 'scheduled') return 1;
    return b.kickoffUtc - a.kickoffUtc;
  });

  return new Response(JSON.stringify({ fixtures: all.slice(0, limit) }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
};
