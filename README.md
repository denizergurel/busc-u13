# BUSC U13

A tiny mobile PWA that shows live league standings for my son's youth soccer team — Ballistic United Soccer Club U13, NorCal Premier Bronze Region 3.

One tap from the iPhone home screen → standings load in under a second.

## The story

My son plays for BUSC U13. Every weekend after games, he asks how the standings look. The league publishes results on GotSport — a serviceable but clunky desktop-first system that hides standings behind tabs and forces a fresh page load every time.

I wanted: open phone → tap icon → see standings. That's it.

So I built it in an evening. A Vercel serverless function that fetches GotSport, parses the table, and serves clean JSON. A static PWA that consumes the JSON, renders a mobile-first standings view, and installs to the iPhone home screen like a native app.

It's stupidly small. It also gets used every single weekend.

## Architecture

```
iPhone home screen
       ↓ tap
PWA (public/index.html) — mobile-first standings + results UI
       ↓ fetch
/api/standings — Vercel edge function
       ↓ reads
Upstash KV (cached)  ← refreshed nightly by /api/cron
       ↓ misses fall back to
GotSport PDF / HTML (live fetch with realistic browser headers)
       ↓ further fallback
Hardcoded last-known-good standings
```

A nightly cron (6am UTC) pulls fresh data from GotSport and caches it in Upstash. Day-of fetches hit the cache first, which keeps the iPhone tap → render time under 500ms. If the cache is cold, the function falls back to live fetch. If GotSport is unreachable (it occasionally is), there's a baked-in fallback so the app never shows an empty screen.

## Why these tech choices

| Decision | Why |
|---|---|
| **Vercel edge functions** | Free, fast cold starts, serverless cron built in. No infra to babysit. |
| **Upstash KV** | Serverless Redis. Free tier. Stores the nightly snapshot so the iPhone request never waits on GotSport. |
| **Realistic browser headers** | Public CORS proxies get flagged by Cloudflare. Vercel server IPs + iPhone Safari UA + Accept headers + Referer pass through clean. |
| **PWA, not native app** | No App Store dance. Add to Home Screen, full-screen, offline-capable via service worker. |
| **Single HTML file UI** | Total code size is small enough that a single file is the right unit. No build step, no bundler, no framework. |

## Files

```
busc-u13/
├── api/
│   ├── standings.js   # serverless function: KV → live PDF → live HTML → fallback
│   └── cron.js        # nightly job: refresh GotSport snapshot into KV
├── public/
│   ├── index.html     # the PWA (standings + results tabs, expandable rows)
│   ├── manifest.json  # PWA manifest (Add to Home Screen)
│   └── sw.js          # service worker (offline support)
└── vercel.json        # routing + cron schedule
```

## Deploy your own

For a different team in a different league, fork and:
1. Update `PDF_URL` and `HTML_URL` in `api/standings.js` and `api/cron.js` (GotSport URLs are league-specific)
2. Update `FALLBACK_TEAMS` with your team's league
3. Set environment variables: `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `KV_REST_API_READ_ONLY_TOKEN`
4. `vercel deploy`

## Why this is here

It's the smallest project on my GitHub and also one of my favorites. Reminder that not every tool needs to be ambitious — sometimes the right scope is "thing I'll use every Saturday morning for one season." Same shipping discipline as a larger build, applied to a real need that doesn't have a big audience but does have a real one (me, my son, occasionally my wife).

## License

MIT.
