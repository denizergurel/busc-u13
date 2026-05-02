# BUSC U13 Standings PWA

Mobile-first standings app for Ballistic United FC U13 · NorCal Premier Bronze Region 3.

## Deploy to Vercel (5 minutes, free)

### Option A — GitHub (recommended)
1. Create a free account at github.com
2. Create a new repository called `busc-u13`
3. Upload all files from this folder
4. Go to vercel.com → "Add New Project" → import your GitHub repo
5. Click Deploy — done

### Option B — Vercel CLI (faster if you have Node.js)
```bash
npm i -g vercel
cd busc-pwa
vercel
```
Follow the prompts. Your app will be live at `https://busc-u13.vercel.app`.

### Add to iPhone Home Screen
1. Open the Vercel URL in Safari
2. Tap the Share button (box with arrow)
3. Tap "Add to Home Screen"
4. Name it "BUSC U13" → Add

It will appear as an app icon. One tap → live standings. No App Store needed.

## How it works

```
iPhone Safari
    ↓ calls
/api/standings  (Vercel serverless function)
    ↓ fetches
system.gotsport.com (with browser-like headers)
    ↓ returns parsed JSON
Beautiful mobile UI
```

The key: Vercel's servers have clean IP addresses that aren't flagged by
Cloudflare the way public CORS proxies are. The function also sends realistic
browser headers (iPhone Safari UA, Accept headers, Referer).

## Files

- `api/standings.js` — serverless function, fetches + parses GotSport HTML
- `public/index.html` — full PWA (standings + results tabs, expandable rows)
- `public/manifest.json` — PWA manifest (enables "Add to Home Screen")
- `public/sw.js` — service worker (offline support)
- `vercel.json` — routing config
