import { useEffect, useState } from 'react';
import NewsCard from '../components/NewsCard';
import type { Article, ArticleCategory } from '../types';

const TABS: { key: ArticleCategory; label: string }[] = [
  { key: 'ghana_news', label: 'Ghana' },
  { key: 'world_news', label: 'World' },
  { key: 'sports', label: 'Sports' },
  { key: 'entertainment', label: 'Entertainment' },
];

export default function NewsPage() {
  const [tab, setTab] = useState<ArticleCategory>('ghana_news');
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    load(tab);
  }, [tab]);

  async function load(category: ArticleCategory) {
    setLoading(true);
    try {
      const res = await fetch(`/api/articles?category=${category}&limit=30`);
      if (res.ok) {
        const data = (await res.json()) as { articles: Article[] };
        setArticles(data.articles ?? []);
      } else {
        setArticles([]);
      }
    } catch {
      setArticles([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="hero-text">
        <h1>News</h1>
        <p>Today's stories, Ghana + world.</p>
      </div>

      <div className="nav-tabs" style={{ padding: '0 0 12px 0', borderBottom: 'none' }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`nav-tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="empty-state"><div className="icon">⏳</div>Loading…</div>
      ) : articles.length === 0 ? (
        <div className="empty-state">
          <div className="icon">📰</div>
          No {labelFor(tab)} stories cached yet.
          <br />
          <small>Try again after 06:00 UTC when the daily refresh runs.</small>
        </div>
      ) : (
        articles.map((a) => <NewsCard key={a.id} article={a} />)
      )}
    </>
  );
}

function labelFor(c: ArticleCategory): string {
  return c.replace('_', ' ');
}
