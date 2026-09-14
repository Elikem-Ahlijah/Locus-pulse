/**
 * GET /api/quota?userId=...
 *
 * Returns the user's current quota status without incrementing.
 */

import { readQuota } from '../_lib/kv';

interface Env {
  LOCUS_DATA: KVNamespace;
  QUOTA_DAILY_LIMIT?: string;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId');
  if (!userId) {
    return new Response(JSON.stringify({ error: 'userId required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const dailyLimit = parseInt(env.QUOTA_DAILY_LIMIT || '5', 10);
  const quota = await readQuota(env.LOCUS_DATA, userId, dailyLimit);
  return new Response(JSON.stringify({ quota }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
};
