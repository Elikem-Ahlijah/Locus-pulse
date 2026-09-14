import { useEffect, useState } from 'react';
import EntertainmentCard from '../components/EntertainmentCard';
import type { Movie } from '../types';

export default function EntertainmentPage() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/movies?limit=20');
      if (res.ok) {
        const data = (await res.json()) as { movies: Movie[] };
        setMovies(data.movies ?? []);
      } else {
        setMovies([]);
      }
    } catch {
      setMovies([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="hero-text">
        <h1>In cinemas</h1>
        <p>What's playing now in Ghana.</p>
      </div>

      {loading ? (
        <div className="empty-state"><div className="icon">⏳</div>Loading…</div>
      ) : movies.length === 0 ? (
        <div className="empty-state">
          <div className="icon">🎬</div>
          No movies cached yet.
          <br />
          <small>TMDB refresh every 4 hours.</small>
        </div>
      ) : (
        movies.map((m) => <EntertainmentCard key={m.tmdbId} movie={m} />)
      )}
    </>
  );
}
