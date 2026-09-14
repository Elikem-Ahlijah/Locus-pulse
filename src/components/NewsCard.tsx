import type { Article } from '../types';

export default function NewsCard({ article }: { article: Article }) {
  const sourceLabel = article.source.replace(/_/g, ' ');
  const timeAgo = formatTimeAgo(article.publishedAt);
  return (
    <a className="card" href={article.url} target="_blank" rel="noopener noreferrer">
      <div className="title">{article.title}</div>
      {article.description && <div className="desc">{truncate(article.description, 140)}</div>}
      <div className="meta">
        <span className="tag">{sourceLabel}</span>
        <span>{timeAgo}</span>
      </div>
    </a>
  );
}

function truncate(s: string, n: number) {
  if (s.length <= n) return s;
  return s.slice(0, n).replace(/\s+\S*$/, '') + '…';
}

function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}
