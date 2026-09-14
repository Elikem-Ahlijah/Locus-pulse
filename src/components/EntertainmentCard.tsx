import type { Movie } from '../types';

export default function EntertainmentCard({ movie }: { movie: Movie }) {
  const poster = movie.posterPath ? `https://image.tmdb.org/t/p/w185${movie.posterPath}` : '';
  return (
    <div className="card" style={{ display: 'flex', gap: 12 }}>
      {poster && (
        <img
          src={poster}
          alt={movie.title}
          style={{
            width: 70,
            height: 'auto',
            borderRadius: 6,
            objectFit: 'cover',
            flexShrink: 0,
          }}
          loading="lazy"
        />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="title">{movie.title}</div>
        {movie.releaseDate && (
          <div className="meta">
            <span>{movie.releaseDate}</span>
            {movie.voteAverage ? <span>★ {movie.voteAverage.toFixed(1)}</span> : null}
          </div>
        )}
        {movie.overview && <div className="desc">{truncate(movie.overview, 120)}</div>}
      </div>
    </div>
  );
}

function truncate(s: string, n: number) {
  if (s.length <= n) return s;
  return s.slice(0, n).replace(/\s+\S*$/, '') + '…';
}
