/**
 * GET /api/convert?amount=100&from=USD&to=GHS
 * Currency conversion using today's Bank of Ghana rates.
 */

import { KV, readJson } from '../_lib/kv';

interface Env {
  LOCUS_DATA: KVNamespace;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const amount = parseFloat(url.searchParams.get('amount') ?? '0');
  const from = (url.searchParams.get('from') ?? 'USD').toUpperCase();
  const to = (url.searchParams.get('to') ?? 'GHS').toUpperCase();

  if (isNaN(amount) || amount <= 0) {
    return new Response(JSON.stringify({ error: 'amount must be a positive number' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const date = new Date().toISOString().slice(0, 10);
  const fx = await readJson<{ [k: string]: number }>(env.LOCUS_DATA, KV.fx(date));
  if (!fx) {
    return new Response(JSON.stringify({ error: 'FX data not available today' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const fromRate = fx[from];
  if (!fromRate) {
    return new Response(JSON.stringify({ error: `Rate for ${from} not available` }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let converted: number;
  if (to === 'GHS') {
    converted = amount * fromRate;
  } else if (to === from) {
    converted = amount;
  } else if (fx[to]) {
    converted = (amount * fromRate) / fx[to];
  } else {
    return new Response(JSON.stringify({ error: `Cannot convert to ${to}` }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(
    JSON.stringify({
      amount,
      from,
      to,
      rate: fromRate,
      converted: Math.round(converted * 100) / 100,
      effective_date: date,
      source: 'Bank of Ghana',
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    }
  );
};
