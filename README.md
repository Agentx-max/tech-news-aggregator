# TechPulse — All Tech News. One Place.

Live tech-news aggregator. Real publisher RSS feeds → server-side ingest →
normalized JSON → static frontend. Zero dependencies, no API keys.

## Run locally

```bash
npm start        # http://localhost:8000
```

## Validate production readiness

```bash
npm run build    # asset-graph, case-sensitivity, functions + config check
```

## Deploy to Vercel

1. Push this repo to GitHub and import it in Vercel.
2. Framework Preset: **Other**. Root Directory: repo root.
3. **Build Command: `npm run build`** (validates assets, Linux path case, functions).
4. Output Directory: leave empty (default static).
5. Deploy. No environment variables needed.

How it works on Vercel:

- `index.html`, `styles.css`, `js/*` are served as static files.
- `api/news.js` / `api/health.js` deploy as serverless functions sharing
  the `lib/rss.js` ingestion core (same code as local `server.js`).
- `vercel.json` pins the function timeout and SPA fallback routing.
- The frontend calls the relative path `/api/news`, so it works unchanged
  in local dev and in Vercel production.
