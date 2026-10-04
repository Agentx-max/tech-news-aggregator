// ─── TechPulse local dev server ─────────────────────────────────────────
// Run:  npm start  (or: node server.js)
// Serves the static frontend + GET /api/news from this same directory
// (same origin, no CORS issues, no API keys anywhere).
// RSS ingestion logic lives in lib/rss.js — shared with api/news.js
// (the Vercel production serverless function). Same behavior, both runtimes.

import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FEEDS, getDigest, getCacheAge } from "./lib/rss.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8000;

const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };

async function serveStatic(req, res) {
  let urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (urlPath === "/") urlPath = "/index.html";
  const file = path.normalize(path.join(ROOT, urlPath));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end("Forbidden"); return; }
  try {
    const data = await readFile(file);
    res.writeHead(200, { "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Cache-Control": urlPath === "/index.html" ? "no-cache" : "public, max-age=3600" });
    res.end(data);
  } catch {
    // SPA fallback: unknown non-API routes serve index.html
    if (!urlPath.startsWith("/api/")) {
      try {
        const data = await readFile(path.join(ROOT, "index.html"));
        res.writeHead(200, { "Content-Type": MIME[".html"], "Cache-Control": "no-cache" });
        res.end(data);
      } catch { res.writeHead(404); res.end("Not found"); }
    } else { res.writeHead(404, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Not found" })); }
  }
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  try {
    if (u.pathname === "/api/news" && req.method === "GET") {
      const payload = await getDigest({ force: u.searchParams.get("refresh") === "1" });
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify(payload));
      return;
    }
    if (u.pathname === "/api/health" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, sources: FEEDS.length, cacheAge: getCacheAge() }));
      return;
    }
    await serveStatic(req, res);
  } catch (e) {
    if (e.code === "ALL_FEEDS_DOWN") {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unable to load live news. RSS sources could not be reached.", sources: e.sources }));
    } else {
      console.error(e);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
  }
});

server.listen(PORT, () => {
  console.log(`TechPulse live on http://localhost:${PORT}`);
  console.log(`API: http://localhost:${PORT}/api/news  (${FEEDS.length} RSS sources)`);
});
