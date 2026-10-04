// ─── TechPulse RSS ingestion core (shared) ────────────────────────────
// Used by BOTH:
//   - server.js        (local dev: long-running Node HTTP server)
//   - api/news.js      (Vercel production: serverless function)
// Zero dependencies (Node 18+). No API keys — ingestion needs no secrets.
//
// Flow:
//   RSS FEEDS → fetcher → XML parser → normalize → dedupe →
//   categorize → cluster → JSON digest → frontend

import crypto from "node:crypto";

export const CACHE_TTL_MS = 10 * 60 * 1000; // refresh upstream at most every 10 min
const PER_SOURCE_LIMIT = 20;
const FETCH_TIMEOUT_MS = 15000;
const UA = "TechPulse/1.0 (live news aggregator; contact: hello@techpulse.news)";

// ─── Source registry: real RSS feed URLs ──────────────────────────────
export const FEEDS = [
  { name: "TechCrunch",        rss: "https://techcrunch.com/feed/",                    site: "https://techcrunch.com",            color: "#22c55e", initials: "TC", fallback: "Startups" },
  { name: "The Verge",         rss: "https://www.theverge.com/rss/index.xml",          site: "https://www.theverge.com",          color: "#e11d48", initials: "V",  fallback: "Internet" },
  { name: "Ars Technica",      rss: "https://feeds.arstechnica.com/arstechnica/index", site: "https://arstechnica.com",           color: "#f97316", initials: "ar", fallback: "Science" },
  { name: "Engadget",          rss: "https://www.engadget.com/rss.xml",                site: "https://www.engadget.com",          color: "#3b82f6", initials: "E",  fallback: "Hardware" },
  { name: "Wired",             rss: "https://www.wired.com/feed/rss",                   site: "https://www.wired.com",             color: "#eab308", initials: "W",  fallback: "Internet" },
  { name: "Android Authority", rss: "https://www.androidauthority.com/feed",           site: "https://www.androidauthority.com",  color: "#4ade80", initials: "AA", fallback: "Mobile" },
  { name: "9to5Google",        rss: "https://9to5google.com/feed/",                    site: "https://9to5google.com",            color: "#22d3ee", initials: "9G", fallback: "Google" },
  { name: "9to5Mac",           rss: "https://9to5mac.com/feed/",                       site: "https://9to5mac.com",                color: "#a78bfa", initials: "9M", fallback: "Apple" },
  { name: "MacRumors",         rss: "https://feeds.macrumors.com/MacRumors-All",       site: "https://www.macrumors.com",         color: "#94a3b8", initials: "MR", fallback: "Apple" },
  { name: "Tom's Hardware",    rss: "https://www.tomshardware.com/feeds/all",          site: "https://www.tomshardware.com",      color: "#60a5fa", initials: "TH", fallback: "Hardware" },
  { name: "ZDNET",             rss: "https://www.zdnet.com/news/rss.xml",               site: "https://www.zdnet.com",             color: "#f43f5e", initials: "ZD", fallback: "Software" },
  { name: "PC Gamer",          rss: "https://www.pcgamer.com/rss/",                    site: "https://www.pcgamer.com",           color: "#fb7185", initials: "PC", fallback: "Gaming" },
  { name: "Gizmodo",           rss: "https://gizmodo.com/rss",                          site: "https://gizmodo.com",                color: "#c084fc", initials: "G",  fallback: "Internet" },
];

// ─── Tiny XML helpers (no dependency RSS parsing) ─────────────────────
const decodeEntities = (s) => String(s ?? "")
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&")
  .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCharCode(Number(n)); } catch { return ""; } })
  .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => { try { return String.fromCharCode(parseInt(n, 16)); } catch { return ""; } });

const stripTags = (s) => decodeEntities(String(s ?? "").replace(/<[^>]*>/g, " "))
  .replace(/\s+/g, " ").trim();

function getTag(block, localNames) {
  for (const n of localNames) {
    const m = block.match(new RegExp(`<(?:[A-Za-z0-9_]+:)?${n}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_]+:)?${n}\\s*>`, "i"));
    if (m) return decodeEntities(m[1]).trim();
  }
  return "";
}

function getAttr(block, tagPattern, attr) {
  const tags = block.match(new RegExp(`<${tagPattern}(?:\\s[^>]*)?\\/?>`, "gi")) || [];
  for (const t of tags) {
    const m = t.match(new RegExp(`${attr}\\s*=\\s*["']([^"']+)["']`, "i"));
    if (m) return decodeEntities(m[1]).trim();
  }
  return "";
}

const firstImg = (html) => {
  const m = String(html || "").match(/<img[^>]+src\s*=\s*["']([^"']+)["']/i);
  return m ? decodeEntities(m[1]).trim() : "";
};

const isJunkImg = (u) => !u || !/^https?:\/\//i.test(u) ||
  /pixel|spacer|transparent|blank\.|clear\.gif|1x1|feedburner.*\/~\!/i.test(u);

function extractImage(itemXml) {
  // 1) <media:content>/<media:thumbnail>
  const medias = itemXml.match(/<media:(?:content|thumbnail)(?:\s[^>]*)?\/?>/gi) || [];
  for (const t of medias) {
    const url = (t.match(/url\s*=\s*["']([^"']+)["']/i) || [])[1];
    const medium = (t.match(/medium\s*=\s*["']([^"']+)["']/i) || [])[1] || "";
    const type = (t.match(/type\s*=\s*["']([^"']+)["']/i) || [])[1] || "";
    if (url && !isJunkImg(url) && (medium === "image" || /^image\//.test(type) || /\.(jpe?g|png|webp|gif)(\?|$)/i.test(url)))
      return url;
  }
  // 2) <enclosure type="image/*">
  const encs = itemXml.match(/<enclosure(?:\s[^>]*)?\/?>/gi) || [];
  for (const t of encs) {
    const url = (t.match(/url\s*=\s*["']([^"']+)["']/i) || [])[1];
    const type = (t.match(/type\s*=\s*["']([^"']+)["']/i) || [])[1] || "";
    if (url && !isJunkImg(url) && (/^image\//.test(type) || /\.(jpe?g|png|webp|gif)(\?|$)/i.test(url))) return url;
  }
  // 3) first <img> inside content/description HTML
  const html = getTag(itemXml, ["encoded", "content"]) || getTag(itemXml, ["description", "summary"]);
  const img = firstImg(html);
  return img && !isJunkImg(img) ? img : null;
}

function extractLink(itemXml, isAtom) {
  if (isAtom) {
    const links = itemXml.match(/<link(?:\s[^>]*)?\/?>/gi) || [];
    for (const t of links) {
      const rel = (t.match(/rel\s*=\s*["']([^"']+)["']/i) || [])[1] || "alternate";
      const href = (t.match(/href\s*=\s*["']([^"']+)["']/i) || [])[1];
      if (href && rel === "alternate" && /^https?:\/\//i.test(href)) return href;
    }
    for (const t of links) {
      const href = (t.match(/href\s*=\s*["']([^"']+)["']/i) || [])[1];
      if (href && /^https?:\/\//i.test(href)) return href;
    }
  }
  const link = getTag(itemXml, ["link"]);
  if (/^https?:\/\//i.test(link)) return link;
  const guid = getTag(itemXml, ["guid", "id"]);
  if (/^https?:\/\//i.test(guid)) return guid;
  return "";
}

function parseFeed(xml) {
  const items = xml.match(/<item[\s>][\s\S]*?<\/item\s*>/gi) ||
                xml.match(/<entry[\s>][\s\S]*?<\/entry\s*>/gi) || [];
  const isAtom = /<feed[\s>]/i.test(xml.slice(0, 2000)) && !/<rss[\s>]/i.test(xml.slice(0, 2000));
  return items.map((x) => {
    const title = stripTags(getTag(x, ["title"]));
    const url = extractLink(x, isAtom || /<entry[\s>]/i.test(x.slice(0, 20)));
    const htmlForText = getTag(x, ["description", "summary"]) ||
      getTag(x, ["encoded", "content"]);
    const description = stripTags(htmlForText).slice(0, 600);
    const dateRaw = getTag(x, ["pubDate", "published", "updated", "date"]);
    const ts = Date.parse(dateRaw);
    let author = getTag(getTag(x, ["author"]), ["name"]) || getTag(x, ["author", "creator", "name"]);
    author = stripTags(author).replace(/\s*\(.*?\)\s*/g, "").trim().slice(0, 80);
    const cats = [...x.matchAll(/<(?:[A-Za-z0-9_]+:)?category(?:\s[^>]*)?>([\s\S]*?)<\/(?:[A-Za-z0-9_]+:)?category\s*>/gi)]
      .map((m) => stripTags(m[1])).filter(Boolean).slice(0, 6);
    // Atom <category term="..."/>
    for (const m of x.matchAll(/<category\s[^>]*term\s*=\s*["']([^"']+)["'][^>]*\/?>/gi))
      if (cats.length < 6) cats.push(decodeEntities(m[1]).trim());
    return { title, url, description, publishedAt: Number.isFinite(ts) ? new Date(ts).toISOString() : null,
             author: author || null, tags: cats, image: extractImage(x) };
  }).filter((a) => a.title && a.url);
}

// ─── Categorization (keyword signals from real feed content) ──────────
const RULES = [
  ["AI",           ["openai", "chatgpt", "gemini", "claude", "anthropic", "deepmind", "copilot ai", "llm", "generative ai", "machine learning", "diffusion model", "reasoning model", "ai agent", "artificial intelligence", "midjourney", "sora", "llama"]],
  ["Apple",        ["apple", "iphone", "ipad", "macbook", "imac", "mac mini", "macos", "ios ", "ios26", "ipados", "watchos", "vision pro", "airpods", "tim cook", "apple intelligence", "app store", "macrumors"]],
  ["Google",       ["google", "pixel", "gemini", "deepmind", "chromebook", "chromeos", "nest ", "google home", "play store", "sundar pichai"]],
  ["Microsoft",    ["microsoft", "windows", "xbox", "copilot", "azure", "surface", "satya nadella", "github", "office 365", "microsoft 365", "teams"]],
  ["Gaming",       ["gaming", "gamer", "playstation", "ps5", "xbox", "nintendo", "switch 2", "steam", "valve", "epic games", "gta", "fortnite", "half-life", "elden ring", "esports", "gpu driver"]],
  ["Cybersecurity",["hack", "breach", "ransomware", "malware", "vulnerability", "cve-", "phishing", "zero-day", "zero day", "spyware", "ddos", "cyberattack", "cisa", "openssl", "encryption backdoor", "infostealer", "botnet", "data leak"]],
  ["Space",        ["nasa", "spacex", "starship", "falcon", "artemis", "esa ", "rocket", "astronaut", "space station", "mars", "lunar", "europa", "jwst", "telescope", "satellite", "starlink"]],
  ["Science",      ["study finds", "researchers", "quantum", "physics", "biology", "dna", "fossil", "climate", "exoplanet", "alphafold", "peer-reviewed", "scientists"]],
  ["EV",           ["tesla", "rivian", "electric vehicle", "ev battery", "solid-state battery", "charging network", "lucid", "ev ", " f-150 lightning"]],
  ["Hardware",     ["nvidia", "rtx", "gpu", "cpu", "intel", "amd", "chip", "semiconductor", "tsmc", "ram", "ssd", "motherboard", "laptop", "framework", "raspberry pi", "overclock"]],
  ["Mobile",       ["samsung", "galaxy", "oneplus", "xiaomi", "nothing phone", "foldable", "smartphone", "android", "pixel", "motorola", "qi2"]],
  ["Startups",     ["startup", "funding", "series a", "series b", "series c", "seed round", "venture", "ipo", "acquisition", "y combinator", "unicorn"]],
  ["Software",     ["linux", "open source", "github", "app update", "software", "firefox", "chrome ", "safari", "windows update", "kernel", "api "]],
];
function categorize(title, description, feedTags, fallback) {
  const hay = `${title} ${description} ${feedTags.join(" ")}`.toLowerCase();
  for (const [cat, keys] of RULES) {
    if (keys.some((k) => hay.includes(k))) return cat;
  }
  return fallback;
}

// ─── Normalize / dedupe / cluster / score ─────────────────────────────
function canonicalUrl(u) {
  try {
    const p = new URL(u.trim());
    const host = p.hostname.toLowerCase();
    let pathname = p.pathname.replace(/\/+$/, "");
    return `${p.protocol}//${host}${pathname || "/"}`;
  } catch { return u.trim(); }
}

const tokens = (s) => new Set(String(s).toLowerCase().replace(/[^a-z0-9 ]/g, " ")
  .split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));
const STOP = new Set(["the", "and", "for", "with", "from", "that", "this", "will", "over", "about", "after", "says", "new", "her", "his", "are", "has", "have", "more", "what", "when", "your", "its"]);
function similarity(a, b) {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  const inter = [...A].filter((x) => B.has(x)).length;
  return inter / Math.max(A.size, B.size);
}

function buildDigest(feedResults, fetchedAt) {
  const seen = new Set();
  const all = [];
  for (const r of feedResults) {
    if (!r.articles) continue;
    const sorted = [...r.articles].sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
    let kept = 0;
    for (const raw of sorted) {
      if (kept >= PER_SOURCE_LIMIT) break;
      const canon = canonicalUrl(raw.url);
      const id = crypto.createHash("sha1").update(canon).digest("hex").slice(0, 16);
      if (seen.has(id)) continue; // exact duplicate URL → drop
      seen.add(id);
      const feed = FEEDS.find((f) => f.name === r.name);
      const category = categorize(raw.title, raw.description, raw.tags, feed.fallback);
      const words = raw.description.split(/\s+/).filter(Boolean).length;
      all.push({
        id, title: raw.title, description: raw.description, url: raw.url,
        image: raw.image, source: r.name, sourceLogo: feed.initials,
        category, publishedAt: raw.publishedAt || fetchedAt,
        author: raw.author || r.name, tags: raw.tags,
        readingTime: Math.max(1, Math.round(words / 200)),
        clusterId: null, trendScore: 0, isTrending: false, isFeatured: false,
      });
      kept++;
    }
  }
  all.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

  // Headline-similarity clustering → "Covered by N sources"
  const clusters = [];
  for (const a of all) {
    let placed = false;
    for (const c of clusters) {
      if (similarity(a.title, c.rep) >= 0.5) {
        c.members.push(a); a.clusterId = c.id; placed = true; break;
      }
    }
    if (!placed) clusters.push({ id: `k-${clusters.length + 1}`, rep: a.title, members: [a] });
  }
  const multi = clusters.filter((c) => c.members.length > 1);

  // Internal trending score: recency decay (36h half-life-ish) + coverage bonus.
  // This is NOT view counts — it is computed from available signals only.
  const now = Date.now();
  for (const a of all) {
    const ageH = Math.max(0, (now - new Date(a.publishedAt).getTime()) / 3600000);
    const clusterSize = a.clusterId ? multi.find((c) => c.id === a.clusterId).members.length : 1;
    a.trendScore = Math.round((Math.exp(-ageH / 36) * 10 + (clusterSize - 1) * 2.5 + (a.image ? 0.3 : 0)) * 10) / 10;
  }
  const ranked = [...all].sort((a, b) => b.trendScore - a.trendScore);
  ranked.slice(0, 10).forEach((a) => (a.isTrending = true));
  if (ranked[0]) ranked[0].isFeatured = true;

  return {
    articles: all,
    clusters: multi.map((c) => ({
      id: c.id, title: [...c.members].sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))[0].title,
      count: c.members.length,
      sources: [...new Set(c.members.map((m) => m.source))],
      articleIds: c.members.map((m) => m.id),
    })).sort((a, b) => b.count - a.count),
  };
}

// ─── Ingestion state ──────────────────────────────────────────────────
// NOTE: on Vercel serverless this cache is best-effort (warm invocations
// reuse it; cold starts re-ingest). The CDN layer (s-maxage, set by the
// function handler) is the primary production cache.
const feedState = new Map(FEEDS.map((f) => [f.name, { lastFetchedAt: null, lastOkAt: null, lastError: null, articleCount: 0 }]));
let cache = null; // { at, payload }

async function fetchOne(feed) {
  const st = feedState.get(feed.name);
  st.lastFetchedAt = new Date().toISOString();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(feed.rss, { signal: ctrl.signal, headers: { "User-Agent": UA, Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    if (!/<(rss|feed|item|entry)[\s>]/i.test(xml)) throw new Error("Not a valid RSS/Atom feed");
    const articles = parseFeed(xml);
    if (!articles.length) throw new Error("Feed returned zero parseable articles");
    st.lastOkAt = new Date().toISOString();
    st.lastError = null;
    st.articleCount = articles.length;
    return { name: feed.name, articles };
  } catch (e) {
    st.lastError = e.name === "AbortError" ? "Fetch timed out" : (e.cause?.message || e.message);
    // articleCount stays at last known good value
    return { name: feed.name, articles: null, error: st.lastError };
  } finally {
    clearTimeout(t);
  }
}

async function ingest() {
  const fetchedAt = new Date().toISOString();
  const results = await Promise.all(FEEDS.map(fetchOne));
  const okCount = results.filter((r) => r.articles).length;
  if (okCount === 0 && !cache) {
    const err = new Error("RSS sources could not be reached.");
    err.code = "ALL_FEEDS_DOWN";
    err.sources = sourceStatuses();
    throw err;
  }
  if (okCount === 0 && cache) {
    return { ...cache.payload, stale: true, fromCache: true };
  }
  const { articles, clusters } = buildDigest(results, fetchedAt);
  const payload = {
    articles, clusters,
    sources: sourceStatuses(),
    updatedAt: fetchedAt,
    totalSources: FEEDS.length,
    connectedSources: okCount,
    fromCache: false, stale: false,
  };
  cache = { at: Date.now(), payload };
  return payload;
}

export function sourceStatuses() {
  return FEEDS.map((f) => {
    const st = feedState.get(f.name);
    return {
      name: f.name, site: f.site, rss: f.rss, color: f.color, initials: f.initials,
      status: st.lastOkAt && !st.lastError ? "connected" : st.lastOkAt ? "degraded" : st.lastFetchedAt ? "offline" : "pending",
      articleCount: st.articleCount,
      lastFetchedAt: st.lastFetchedAt, lastOkAt: st.lastOkAt, error: st.lastError,
    };
  });
}

/** Main entry for both runtimes. Honors the 10-minute upstream cache. */
export async function getDigest({ force = false } = {}) {
  if (cache && !force && Date.now() - cache.at < CACHE_TTL_MS) {
    return { ...cache.payload, fromCache: true };
  }
  return ingest();
}

/** Age of the in-memory cache in ms (null when empty). */
export function getCacheAge() {
  return cache ? Date.now() - cache.at : null;
}
