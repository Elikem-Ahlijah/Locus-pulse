# API Keys — how to get them (manual, ~10 min total)

Locus Pulse works without ANY of these. They're optional upgrades.

## Current state — all working with free / no-key sources

| Data | Source | Status |
|---|---|---|
| Ghana news | freenewsapi.ai (no key) | ✅ 20 articles/day |
| Sports news | freenewsapi.ai (no key) | ✅ 20 articles/day |
| Entertainment news | freenewsapi.ai (no key) | ✅ 20 articles/day |
| FX rates | open.er-api.com (no key) | ✅ USD, EUR, GBP, NGN, CAD vs GHS |
| Fuel prices | pumply.co scrape (no key) | ✅ Petrol, Diesel, LPG from NPA floor |
| Power outages | ECG region pages + pulse.com.gh (no key) | ✅ Daily schedule per region |
| Weather | OpenWeather One Call (needs key) | ⏸️ Optional |
| World news | (no key source yet) | ⏸️ Optional |
| Sports fixtures + standings | (no key source yet) | ⏸️ Optional |
| Movies now playing | (no key source yet) | ⏸️ Optional |

## Optional upgrades (sign up yourself, takes ~10 min total)

### 1. NewsData.io — World news
- Sign up: https://newsdata.io/register
- Free: 200 credits/day, commercial OK
- After signup: dashboard → "API Key" — copy the key
- Set in Cloudflare: `wrangler pages secret put NEWSDATA_API_KEY --project-name=locus-pulse`
- Unlocks: World news section on HomePage

### 2. API-Football (API-Sports) — Sports fixtures + standings
- Sign up: https://dashboard.api-football.com/register
- Free: 100 requests/day, 1200+ leagues including Ghana Premier League
- After signup: dashboard → "API" → "My Account" → "API Key"
- Set: `wrangler pages secret put APIFOOTBALL_KEY --project-name=locus-pulse`
- Unlocks: Live fixtures, league standings, score updates every 6h

### 3. TMDB — Movies now playing in Ghana
- Sign up: https://www.themoviedb.org/signup
- After signup: settings → API → "Create" → "Developer" → fill form → copy "API Key (v3 auth)"
- Set: `wrangler pages secret put TMDB_API_KEY --project-name=locus-pulse`
- Unlocks: Movies page (now playing in Ghana)

### 4. OpenWeather — Weather context (optional)
- Sign up: https://openweathermap.org/api
- Free: 1,000 calls/day, commercial-safe
- After signup: API keys → copy default
- Set: `wrangler pages secret put OPENWEATHER_API_KEY --project-name=locus-pulse`
- Unlocks: Weather queries ("how's the weather in Accra?")

## What to do once you have keys

```bash
cd /workspace/locus-pulse
echo "your_key_value" | npx wrangler pages secret put KEY_NAME --project-name=locus-pulse
```

Then trigger a refresh:
```bash
TOKEN="${MINIMAX_API_KEY: -16}"  # last 16 chars of your MiniMax key
curl -X POST "https://locus-pulse.pages.dev/api/refresh?key=$TOKEN"
```

The app will pick up the new keys on the next refresh cycle (or the cron trigger if set up).
