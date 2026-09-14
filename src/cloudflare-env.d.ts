/**
 * Cloudflare Pages env types — used by wrangler.toml bindings
 */
declare global {
  interface CloudflareEnv {
    LOCUS_DATA: KVNamespace;
    MINIMAX_API_KEY: string;
    QUOTA_DAILY_LIMIT?: string;
    NEWSDATA_API_KEY?: string;
    APIFOOTBALL_KEY?: string;
    CURRENTS_API_KEY?: string;
    GUARDIAN_API_KEY?: string;
    TMDB_API_KEY?: string;
    OPENWEATHER_API_KEY?: string;
  }
}

export {};
