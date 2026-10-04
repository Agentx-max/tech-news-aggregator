// ─── GET /api/news (Vercel serverless function) ─────────────────────────
// Production equivalent of the /api/news route in server.js (local dev).
// Same shared ingestion core (lib/rss.js): real publisher RSS feeds →
// parse → normalize → dedupe → categorize → cluster → JSON.
// The frontend calls this same relative path in every environment, so no
// frontend changes are needed between local dev and Vercel production.

import { getDigest } from "../lib/rss.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const force = req.query?.refresh === "1";
    const payload = await getDigest({ force });
    // CDN cache: 10 min fresh, serve stale while revalidating in background.
    // `refresh=1` bypasses automatically (distinct cache key per query string).
    res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=120");
    return res.status(200).json(payload);
  } catch (e) {
    if (e.code === "ALL_FEEDS_DOWN") {
      return res.status(502).json({
        error: "Unable to load live news. RSS sources could not be reached.",
        sources: e.sources,
      });
    }
    console.error(e);
    return res.status(500).json({ error: "Internal server error" });
  }
}
