# Locus Pulse

**Voice-first daily brief for Ghana.** News, sports, entertainment, FX, fuel, power. Speak, and Locus speaks back.

## Stack
- Frontend: Vite + React 18 + TypeScript 5
- Hosting: Cloudflare Pages
- Storage: Cloudflare KV (hydrated via cron — no per-query API calls)
- LLM: MiniMax (tool-calling)
- Voice: Web Speech API (browser-native STT + TTS fallback)
- Payments: **Deferred to Phase 2** (Hubtel + Africa's Talking integration)

## Architecture

```
User voice → Web Speech API (STT)
  → /api/llm (Cloudflare Pages Function)
    → MiniMax (with MCP-style tool definitions)
      → Tool execution: read from Cloudflare KV
  → Response text → MiniMax T2A / Web Speech API (TTS)
  → User hears it

Cron Workers (06:00 UTC daily, every 6h sports, Sun 03:00 weekly):
  External APIs → write to KV → agent queries KV only
```

The **hydrate-DB-via-cron pattern** keeps us off per-user rate limits. Free tiers like API-Football (100/day) and NewsData.io (200/day) are exhausted by cron once, not by every user query.

## Local dev

```bash
npm install
npm run dev          # starts Vite at :5173
npm run typecheck    # tsc check
npm run build        # builds to dist/
```

## Deploy

Set the Cloudflare API token (already in this sandbox as `CLOUDFLARE_API_TOKEN`):

```bash
export CLOUDFLARE_API_TOKEN=...
wrangler pages deploy dist --project-name=locus-pulse --commit-dirty=true
```

**First-time setup (already done in this account):**
- Cloudflare Pages project: `locus-pulse` (will be created on first deploy)
- Cloudflare KV namespace: `locus-pulse-data` (id: `e3abd79ac7a14a25abb289d9b35e42d3`)
- Cron triggers registered in `wrangler.toml`

## API keys (set via Cloudflare dashboard or .dev.vars for local)

| Variable | Required? | Purpose |
|---|---|---|
| `MINIMAX_API_KEY` | Yes | LLM (tool-calling) |
| `OPENWEATHER_API_KEY` | Recommended | Weather tool |
| `NEWSDATA_API_KEY` | Optional | World news (200/day free) |
| `APIFOOTBALL_KEY` | Recommended | Football fixtures + standings (100/day free) |
| `CURRENTS_API_KEY` | Optional | Realtime news backup |
| `GUARDIAN_API_KEY` | Optional | Quality world news |
| `TMDB_API_KEY` | Recommended | Movies now playing |

Without keys, the relevant tool returns a graceful "data not available" — the rest of the app still works.

## Cron schedule

| Cron | Job |
|---|---|
| `0 6 * * *` | Daily news + FX + fuel + power + entertainment refresh |
| `0 3 * * 0` | Weekly sports fixtures (Sunday 03:00 UTC) |
| `0 */6 * * *` | Live sports score check (smart — only calls API if matches in play) |
| `0 0 * * *` | (KV TTL handles quota reset automatically) |

## Repo conventions (from Locus universal rules)

1. No code without explicit user consent
2. Roadmap before implementation (see `/workspace/locus-pulse-roadmap.md`)
3. Feature branch only, tested, then merge, then deploy
4. No throwaway fixes

## Phase 2 (deferred)

- Hubtel MoMo subscription (GHS 10/mo Plus, GHS 30/mo Pro)
- Hubtel Airtime API (1-3% commission on airtime top-ups)
- Africa's Talking premium SMS daily brief
- Twi/Pidgin voice (Khaya AI TTS + Intron Sahara v2 STT)
