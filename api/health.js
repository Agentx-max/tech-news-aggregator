// ─── GET /api/health (Vercel serverless function) ───────────────────────
import { FEEDS, getCacheAge } from "../lib/rss.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  return res.status(200).json({ ok: true, sources: FEEDS.length, cacheAge: getCacheAge() });
}
