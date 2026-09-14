/**
 * GET /api/articles?category=...&query=...&limit=10
 * Returns news articles for a category from KV.
 */

import { KV, readJson } from '../_lib/kv';
import type { Article } from '../../src/types';

interface Env {
  LOCUS_DATA: KVNamespace;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const category = url.searchParams.get('category') ?? 'ghana_news';
  const query = url.searchParams.get('query')?.toLowerCase();
  const limit = parseInt(url.searchParams.get('limit') ?? '10', 10);

  const today = new Date().toISOString().slice(0, 10);
  let articles = (await readJson<Article[]>(env.LOCUS_DATA, KV.articles(category, today))) ?? [];

  if (query) {
    articles = articles.filter(
      (a) =>
        a.title.toLowerCase().includes(query) ||
        (a.description?.toLowerCase().includes(query) ?? false)
    );
  }

  return new Response(JSON.stringify({ articles: articles.slice(0, limit) }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
};
