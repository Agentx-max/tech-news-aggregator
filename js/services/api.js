// ─── TechPulse data layer — LIVE RSS ONLY ─────────────────────────────
// The ONLY data source is GET /api/news served by server.js, which fetches
// real publisher RSS feeds server-side, parses the XML, normalizes, dedupes,
// categorizes and clusters. There is no mock data, no hardcoded article array,
// and no fallback content anywhere in this file. If the feeds are unreachable
// the fetch throws and the UI shows the live error state.
import { sourceColor, sourceInitials } from "../config/sources.js";

export const CONFIG = {
  endpoint: "/api/news",
  refreshIntervalMs: 10 * 60 * 1000, // auto re-check every 10 minutes
  pageSize: 8,
};

let articles = [];   // normalized live articles, newest first
let clusters = [];   // server-side similarity clusters
let sources = [];    // per-feed live status
let updatedAt = 0;
let connectedSources = 0;
let totalSources = 0;

const coerce = (a) => ({
  id: String(a.id), title: a.title ?? "", description: a.description ?? "",
  image: a.image || null, url: a.url ?? "#", source: a.source ?? "Unknown",
  sourceLogo: a.sourceLogo || sourceInitials(a.source ?? "?"),
  category: a.category ?? "Internet", publishedAt: a.publishedAt ?? new Date().toISOString(),
  author: a.author ?? a.source ?? "Staff", tags: a.tags ?? [], readingTime: a.readingTime ?? 3,
  clusterId: a.clusterId ?? null, trendScore: a.trendScore ?? 0,
  isTrending: !!a.isTrending, isFeatured: !!a.isFeatured,
});

const tokens = (s) => new Set(String(s).toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2));
export function similarity(a, b) {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  const inter = [...A].filter((x) => B.has(x)).length;
  return inter / Math.max(A.size, B.size);
}

export const NewsAPI = {
  /** Fetch the live digest. Throws on failure — callers show the error state. */
  async fetchArticles({ force = false } = {}) {
    const res = await fetch(`${CONFIG.endpoint}${force ? "?refresh=1" : ""}`, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      let detail = "";
      try { detail = (await res.json()).error || ""; } catch {}
      throw new Error(detail || `Live feed request failed (HTTP ${res.status})`);
    }
    const json = await res.json();
    if (!Array.isArray(json.articles) || json.articles.length === 0) {
      // No parseable articles at all → treat as outage, never invent content.
      throw new Error("RSS sources could not be reached.");
    }
    articles = json.articles.map(coerce);
    clusters = Array.isArray(json.clusters) ? json.clusters : [];
    sources = Array.isArray(json.sources) ? json.sources : [];
    updatedAt = new Date(json.updatedAt || Date.now()).getTime();
    connectedSources = json.connectedSources ?? sources.filter((s) => s.status === "connected").length;
    totalSources = json.totalSources ?? sources.length;
    return { articles, updatedAt, sources, connectedSources, totalSources, fromCache: !!json.fromCache, stale: !!json.stale };
  },

  getAll: () => [...articles].sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt)),
  getById: (id) => articles.find((a) => String(a.id) === String(id)),
  getFeatured: () => articles.filter((a) => a.isFeatured),
  /** Trending = internal score from recency + multi-source coverage. NOT view counts. */
  getTrending: () => [...articles].sort((a, b) => b.trendScore - a.trendScore).slice(0, 5),
  filterByCategory: (cat) =>
    (!cat || cat === "All" ? NewsAPI.getAll()
      : articles.filter((a) => a.category.toLowerCase() === cat.toLowerCase())
          .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))),
  /** Search runs against the live fetched dataset only. */
  search: (q) => {
    q = (q || "").trim().toLowerCase();
    if (!q) return [];
    return articles
      .filter((a) => [a.title, a.description, a.source, a.category, a.author, (a.tags || []).join(" ")]
        .join(" ").toLowerCase().includes(q))
      .slice(0, 12);
  },
  /** Coverage group for one story: server cluster first, headline-similarity fallback. */
  getCoverage: (article) => {
    if (article.clusterId) {
      const hit = articles.filter((a) => a.clusterId === article.clusterId && a.id !== article.id);
      if (hit.length) return hit;
    }
    return articles.filter((a) => a.id !== article.id && similarity(a.title, article.title) >= 0.5).slice(0, 4);
  },
  getClusters: () => clusters
    .map((c) => ({ ...c, members: (c.articleIds || []).map((id) => NewsAPI.getById(id)).filter(Boolean) }))
    .filter((c) => c.members.length > 1),
  related: (article, n = 3) => articles
    .filter((a) => a.id !== article.id)
    .map((a) => ({ a, s: (a.category === article.category ? 2 : 0) + similarity(a.title, article.title) }))
    .sort((x, y) => y.s - x.s).slice(0, n).map((x) => x.a),

  getSources: () => sources,
  lastUpdated: () => updatedAt,
  stats: () => ({ total: articles.length, connected: connectedSources, totalSources }),
};

export { sourceColor, sourceInitials };
