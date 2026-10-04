import { CATEGORIES, sourceColor, sourceInitials } from "./config/sources.js";
import { NewsAPI, CONFIG } from "./services/api.js";
import { store } from "./services/storage.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  if (!Number.isFinite(diff) || diff < 0) return "just now";
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "yesterday" : `${d}d ago`;
}
const fmtDate = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/* External-link helpers — every card opens the publisher's ORIGINAL url.
   Articles without a valid http(s) URL are rendered non-clickable. */
const isLiveUrl = (u) => /^https?:\/\//i.test(String(u || "").trim());
const extLink = (a) => `href="${esc(a.url)}" target="_blank" rel="noopener noreferrer"`;
const headLink = (a) => isLiveUrl(a.url)
  ? `<a class="card-link" ${extLink(a)}>${esc(a.title)}</a>`
  : esc(a.title);

/* ---------- Reusable components (all render LIVE data props) ---------- */
const SourceBadge = (a) => `<span class="src-dot" style="background:${sourceColor(a.source)}"></span><span>${esc(a.source)}</span>`;

// Real image when the feed supplied one; otherwise a generated
// source/category placeholder — never a fabricated article image.
const thumb = (a, eager = false) => a.image
  ? `<img src="${esc(a.image)}" alt="${esc(a.title)}" loading="${eager ? "eager" : "lazy"}" onerror="this.closest('.card-img,.thumb').classList.add('noimg');this.remove()">`
  : `<div class="img-fallback" aria-hidden="true"><span style="background:${sourceColor(a.source)}">${esc(a.sourceLogo || sourceInitials(a.source))}</span><em>${esc(a.source)}</em></div>`;

// Wraps a thumbnail so image clicks open the original article in a new tab.
const thumbLink = (a, eager = false) => isLiveUrl(a.url)
  ? `<a ${extLink(a)} aria-label="${esc(a.title)}" tabindex="-1">${thumb(a, eager)}</a>`
  : thumb(a, eager);

function bookmarkBtn(a, mini = false) {
  const saved = store.isSaved(a.id);
  if (mini) {
    return `<button data-bookmark="${a.id}" aria-label="${saved ? "Remove bookmark" : "Save article"}" aria-pressed="${saved}" style="margin-left:auto;background:none;border:0;color:${saved ? "#22d3ee" : "var(--muted)"};cursor:pointer;font-size:17px">${saved ? "★" : "☆"}</button>`;
  }
  return `<button class="bookmark ${saved ? "saved" : ""}" data-bookmark="${a.id}" aria-label="${saved ? "Remove bookmark" : "Save article"}" aria-pressed="${saved}">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="${saved ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg></button>`;
}
const coverageTag = (a) => {
  const n = NewsAPI.getCoverage(a).length;
  return n ? `<span class="coverage-tag">Covered by ${n + 1} sources</span>` : "";
};

export const FeaturedArticle = (a, i = 0) => {
  const ok = isLiveUrl(a.url);
  return `
  <article class="card card-featured${ok ? "" : " is-disabled"}" style="animation-delay:${i * 70}ms"${ok ? ` data-url="${esc(a.url)}" data-id="${a.id}" tabindex="0" role="link"` : ""} aria-label="${esc(a.title)}">
    ${bookmarkBtn(a)}
    <div class="card-img">${thumbLink(a, true)}</div>
    <div class="card-body"><span class="badge ${esc(a.category.toLowerCase())}">${esc(a.category)}</span>
      <h3>${headLink(a)}</h3><p>${esc(a.description)}</p>
      <div class="card-meta">${SourceBadge(a)}<span>·</span><span>${timeAgo(a.publishedAt)}</span><span>·</span><span>${a.readingTime} min read</span></div>
    </div><span class="card-arrow">→</span>${coverageTag(a)}
  </article>`;
};

export const ArticleCard = (a, i = 0) => {
  const ok = isLiveUrl(a.url);
  return `
  <article class="card${ok ? "" : " is-disabled"}" style="animation-delay:${(i % 6) * 70}ms"${ok ? ` data-url="${esc(a.url)}" data-id="${a.id}" tabindex="0" role="link"` : ""} aria-label="${esc(a.title)}">
    ${bookmarkBtn(a)}
    <div class="card-img">${thumbLink(a)}</div>
    <div class="card-body"><span class="badge ${esc(a.category.toLowerCase())}">${esc(a.category)}</span>
      <h3>${headLink(a)}</h3>
      <div class="card-meta">${SourceBadge(a)}<span>·</span><span>${timeAgo(a.publishedAt)}</span></div>
    </div><span class="card-arrow">→</span>${coverageTag(a)}
  </article>`;
};

export const NewsRow = (a, i = 0) => {
  const ok = isLiveUrl(a.url);
  return `
  <article class="row-card${ok ? "" : " is-disabled"}" style="animation-delay:${(i % 8) * 50}ms"${ok ? ` data-url="${esc(a.url)}" data-id="${a.id}" tabindex="0" role="link"` : ""} aria-label="${esc(a.title)}">
    <div class="thumb">${thumbLink(a)}</div>
    <div class="row-body">
      <div style="display:flex;gap:8px;align-items:center"><span class="badge ${esc(a.category.toLowerCase())}">${esc(a.category)}</span>${bookmarkBtn(a, true)}</div>
      <h3>${headLink(a)}</h3><p>${esc(a.description)}</p>
      <div class="card-meta">${SourceBadge(a)}<span>·</span><span>${timeAgo(a.publishedAt)}</span><span>·</span><span>${a.readingTime} min read</span></div>
    </div>
  </article>`;
};

export const LoadingSkeleton = {
  top: `<div class="skel skel-hero"></div><div class="skel"></div><div class="skel"></div><div class="skel"></div><div class="skel"></div>`,
  rows: (n = 4) => Array.from({ length: n }, () => `<div class="skel skel-row"></div>`).join(""),
};
const EmptyState = (cat) => `<div class="state-box"><div class="big">🛰</div><h3>No stories found</h3><p>Nothing in ${esc(cat)} in the current live pull. New stories land as feeds update.</p><br><button class="btn btn-primary" data-goto-latest>Browse Latest News</button></div>`;
const ErrorState = (msg) => `<div class="state-box"><div class="big">⚠</div><h3>Unable to load live news.</h3><p>${esc(msg || "RSS sources could not be reached.")}</p><br><button class="btn btn-primary" data-retry>Retry</button></div>`;

/* ---------- State ---------- */
const state = { category: "All", visible: CONFIG.pageSize, booted: false };
let knownIds = new Set();
let pendingFresh = [];

/* ---------- Renderers ---------- */
function renderTop() {
  const grid = $("#topGrid");
  const feat = NewsAPI.getFeatured();
  const rest = NewsAPI.getAll().filter((a) => !feat.some((f) => f.id === a.id)).slice(0, 4);
  const items = [...feat.slice(0, 1), ...rest];
  grid.innerHTML = items.length ? items.map((a, i) => (i === 0 ? FeaturedArticle(a, i) : ArticleCard(a, i))).join("")
    : `<div class="state-box" style="grid-column:1/-1"><h3>No live stories yet</h3></div>`;
}

function renderFeed(reset = true) {
  if (reset) state.visible = CONFIG.pageSize;
  const list = NewsAPI.filterByCategory(state.category);
  $("#feedTitle").textContent = state.category === "All" ? "Latest News" : state.category;
  $("#feedCount").textContent = `${list.length} stories`;
  const slice = list.slice(0, state.visible);
  $("#newsList").innerHTML = slice.map(NewsRow).join("");
  const empty = $("#feedEmpty");
  empty.hidden = slice.length > 0;
  if (!slice.length) empty.innerHTML = EmptyState(state.category);
  $("#loadMoreBtn").style.display = state.visible >= list.length ? "none" : "";
}

function renderTrending() {
  const t = NewsAPI.getTrending();
  $("#trendList").innerHTML = t.length ? t.map((a, i) => {
    const cov = NewsAPI.getCoverage(a).length;
    const ok = isLiveUrl(a.url);
    return `
    <li${ok ? ` data-url="${esc(a.url)}" data-id="${a.id}" tabindex="0" role="link"` : ""}>
      <span class="trend-num">0${i + 1}</span>
      <div><h4>${headLink(a)}</h4>
      <div class="trend-sub">${SourceBadge(a)}<span>·</span><span>${timeAgo(a.publishedAt)}</span></div>
      <div class="trend-sub"><span class="trend-score" title="Internal trending score: recency + multi-source coverage. Not view counts.">score ${a.trendScore}</span>${cov ? `<span>·</span><span>covered by ${cov + 1}</span>` : ""}</div></div>
    </li>`;
  }).join("") : `<p class="muted small" style="padding:8px 4px">Not enough live signal yet.</p>`;
}

function renderCoverage() {
  const clusters = NewsAPI.getClusters().slice(0, 3);
  $("#coverageGrid").innerHTML = clusters.length ? clusters.map((c) => {
    const main = [...c.members].sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))[0];
    const ok = isLiveUrl(main.url);
    return `<div class="coverage-card${ok ? "" : " is-disabled"}"${ok ? ` data-url="${esc(main.url)}" data-id="${main.id}" tabindex="0" role="link"` : ""}>
      <span class="covered-by">Covered by ${c.count} sources</span>
      <h3>${headLink(main)}</h3>
      <div class="src-stack">${c.members.slice(0, 6).map((s) => `<span class="src-avatar" title="${esc(s.source)}" style="background:${sourceColor(s.source)}">${esc(s.sourceLogo || sourceInitials(s.source))}</span>`).join("")}</div>
      <div class="card-meta">${c.sources.map(esc).join(" · ")}</div></div>`;
  }).join("") : `<div class="state-box" style="grid-column:1/-1"><h3>No multi-source clusters right now</h3><p class="small">Coverage groups appear when several outlets report the same story.</p></div>`;
}

function renderCats() {
  $("#catRow").innerHTML = CATEGORIES.map((c) =>
    `<button class="cat-btn ${c === state.category ? "active" : ""}" data-cat="${c}" role="tab" aria-selected="${c === state.category}">${c}</button>`).join("");
}

function renderRecent() {
  const ids = store.recent();
  const box = $("#recentlyViewed");
  if (!ids.length) { box.innerHTML = `<p class="muted small">Nothing yet — open a story to see it here.</p>`; return; }
  box.innerHTML = ids.map((id) => {
    const a = NewsAPI.getById(id);
    if (!a) return "";
    return isLiveUrl(a.url)
      ? `<a ${extLink(a)}>${esc(a.title)}</a>`
      : `<a aria-disabled="true" style="opacity:.55;cursor:default">${esc(a.title)}</a>`;
  }).join("") || `<p class="muted small">Nothing yet.</p>`;
}

function renderSaved() {
  const ids = store.saved();
  const arts = ids.map(NewsAPI.getById).filter(Boolean);
  $("#savedList").innerHTML = arts.length ? arts.map(NewsRow).join("")
    : `<div class="state-box"><div class="big">🔖</div><h3>No saved stories yet</h3><p>Tap the bookmark icon on any story to keep it here.</p><br><button class="btn btn-primary" data-goto-latest>Browse Latest News</button></div>`;
  $("#savedCount").hidden = !ids.length;
  $("#savedCount").textContent = ids.length;
}

function renderSources() {
  const list = NewsAPI.getSources();
  const grid = $("#sourcesGrid");
  if (!grid) return;
  grid.innerHTML = list.length ? list.map((s) => {
    const on = s.status === "connected";
    const dot = on ? "on" : s.status === "degraded" ? "warn" : "off";
    const label = on ? "Connected" : s.status === "degraded" ? "Degraded" : s.status === "pending" ? "Pending" : "Offline";
    return `<div class="source-card">
      <span class="src-avatar" style="background:${sourceColor(s.name)}">${esc(s.initials || sourceInitials(s.name))}</span>
      <div class="source-info"><a href="${esc(s.site)}" target="_blank" rel="noopener"><strong>${esc(s.name)}</strong></a>
        <span class="source-sub">${s.articleCount} articles${s.lastOkAt ? ` · fetched ${timeAgo(s.lastOkAt)}` : ""}${s.error && !on ? ` · ${esc(s.error)}` : ""}</span></div>
      <span class="status-pill ${dot}"><span class="status-dot"></span>${label}</span>
    </div>`;
  }).join("") : `<div class="state-box" style="grid-column:1/-1"><h3>Source status unavailable</h3></div>`;
}

/* ---------- Live status bar ---------- */
function renderStatus() {
  const { total, connected, totalSources } = NewsAPI.stats();
  const pill = $("#livePill");
  const label = connected === 0 ? "OFFLINE" : connected < totalSources ? "DEGRADED" : "LIVE";
  pill.className = `live-pill ${label.toLowerCase()}`;
  pill.innerHTML = `<span class="live-dot"></span> ${label}`;
  $("#heroSourceCount").textContent = connected;
  $("#statSources").textContent = connected;
  $("#statStories").textContent = total;
  $("#liveUpdated").textContent = `Last updated: ${timeAgo(NewsAPI.lastUpdated())}`;
  const hb = $("#heroEyebrowState");
  if (hb) hb.textContent = label === "LIVE" ? "LIVE FEED" : label === "DEGRADED" ? "PARTIAL FEED" : "FEED OFFLINE";
}

/* ---------- Router (hash) ---------- */
function showView(name) {
  $("#view-home").hidden = name !== "home";
  $("#view-saved").hidden = name !== "saved";
  $$("[data-bnav]").forEach((a) => a.classList.toggle("active", a.dataset.bnav === name));
}
function scrollToId(id) {
  showView("home");
  setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }), 60);
}
function route() {
  const h = location.hash || "#/";
  if (h.startsWith("#/saved")) { renderSaved(); showView("saved"); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
  if (h.startsWith("#/sources")) return scrollToId("sourcesSection");
  if (h.startsWith("#/trending")) return scrollToId("trendingSection");
  if (h.startsWith("#/latest")) return scrollToId("latestSection");
  if (h.startsWith("#/category/")) {
    const slug = decodeURIComponent(h.split("/")[2] || "all");
    const found = CATEGORIES.find((c) => c.toLowerCase() === slug.toLowerCase());
    state.category = found || "All";
    showView("home"); renderCats(); renderFeed();
    setTimeout(() => $("#latestSection").scrollIntoView({ behavior: "smooth" }), 60);
    return;
  }
  showView("home");
}

/* ---------- Full render + error handling ---------- */
function renderAll() {
  renderTop(); renderFeed(); renderTrending(); renderCoverage(); renderRecent(); renderSaved(); renderSources(); renderStatus();
}

function showFatal(msg) {
  // Never fall back to invented content — show the outage state everywhere.
  $("#topGrid").innerHTML = ErrorState(msg);
  $("#newsList").innerHTML = "";
  $("#feedCount").textContent = "";
  const empty = $("#feedEmpty");
  empty.hidden = false;
  empty.innerHTML = ErrorState(msg);
  $("#trendList").innerHTML = `<p class="muted small" style="padding:8px 4px">Live feed unavailable.</p>`;
  $("#coverageGrid").innerHTML = "";
  renderStatus();
}

async function initialLoad() {
  $("#topGrid").innerHTML = LoadingSkeleton.top;
  $("#newsList").innerHTML = LoadingSkeleton.rows(4);
  try {
    await NewsAPI.fetchArticles();
    knownIds = new Set(NewsAPI.getAll().map((a) => a.id));
    renderAll();
  } catch (e) {
    showFatal(e.message);
  }
}

/* ---------- Refresh: manual + every 10 min ---------- */
async function refreshFeed({ manual = false } = {}) {
  const btn = $("#refreshBtn");
  if (manual) btn.style.opacity = ".5";
  try {
    await NewsAPI.fetchArticles({ force: true });
    const fresh = NewsAPI.getAll().filter((a) => !knownIds.has(a.id));
    if (!manual && fresh.length > 0) {
      // Hold new arrivals behind the "N new stories" gate — no full reload.
      pendingFresh = fresh;
      $("#newStoriesCount").textContent = fresh.length;
      $("#newStoriesToast").hidden = false;
    } else {
      knownIds = new Set(NewsAPI.getAll().map((a) => a.id));
      pendingFresh = [];
      $("#newStoriesToast").hidden = true;
      renderAll();
      route();
      if (manual) toast(`Feed refreshed — ${NewsAPI.stats().total} live stories`);
    }
  } catch (e) {
    if (!NewsAPI.getAll().length) showFatal(e.message);
    else toast("Refresh failed — showing last live pull");
  } finally {
    if (manual) btn.style.opacity = "";
  }
}

/* ---------- Events (delegation) ---------- */
document.addEventListener("click", (e) => {
  const bm = e.target.closest("[data-bookmark]");
  if (bm) {
    e.stopPropagation();
    store.toggle(bm.dataset.bookmark);
    toast(store.isSaved(bm.dataset.bookmark) ? "Saved to your library" : "Removed from saved");
    renderSaved();
    if (!$("#view-home").hidden) { renderTop(); renderFeed(false); }
    if (!$("#view-saved").hidden) renderSaved();
    if (!$("#view-article").hidden) renderSaved();
    return;
  }
  if (e.target.closest("[data-retry]")) { initialLoad(); return; }
  const cat = e.target.closest("[data-cat]");
  if (cat) {
    state.category = cat.dataset.cat;
    renderCats(); renderFeed();
    $("#newsList").animate(
      [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }],
      { duration: 350, easing: "ease-out" });
    return;
  }
  if (e.target.closest("[data-goto-latest]")) { state.category = "All"; location.hash = "#/latest"; renderCats(); renderFeed(); scrollToId("latestSection"); return; }
  if (e.target.closest("[data-close-search]")) return closeSearch();
  const q = e.target.closest("[data-q]");
  if (q) { $("#searchInput").value = q.dataset.q; doSearch(q.dataset.q); return; }
  // Native links (headline / thumbnail anchors) open the original article.
  // Record the visit for "Recently Viewed", then let the browser navigate.
  const native = e.target.closest("a[href]");
  if (native) {
    const host = native.closest("[data-id]") || e.target.closest("[data-id]");
    if (host) { store.pushRecent(host.dataset.id); renderRecent(); }
    if (native.closest("#searchOverlay")) closeSearch();
    return;
  }
  // Clicks anywhere else on a live card open the publisher's original URL.
  const hit = e.target.closest("[data-url]");
  if (hit) {
    if (hit.dataset.id) { store.pushRecent(hit.dataset.id); renderRecent(); }
    window.open(hit.dataset.url, "_blank", "noopener");
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.matches?.("[data-url]")) {
    if (e.target.dataset.id) { store.pushRecent(e.target.dataset.id); renderRecent(); }
    window.open(e.target.dataset.url, "_blank", "noopener");
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openSearch(); }
  if (e.key === "Escape") closeSearch();
});

/* ---------- Search (live dataset) ---------- */
function openSearch() {
  $("#searchOverlay").hidden = false;
  document.body.style.overflow = "hidden";
  setTimeout(() => $("#searchInput").focus(), 40);
  renderSearch([], "");
}
function closeSearch() { $("#searchOverlay").hidden = true; document.body.style.overflow = ""; }
function doSearch(q) { renderSearch(NewsAPI.search(q), q); }
function renderSearch(res, q = "") {
  const box = $("#searchResults");
  if (!q) { box.innerHTML = `<p class="muted small" style="padding:14px">Start typing to search ${NewsAPI.stats().total} live stories.</p>`; return; }
  box.innerHTML = res.length ? res.map((a) => {
    const ok = isLiveUrl(a.url);
    return `
    <div class="search-item"${ok ? ` data-url="${esc(a.url)}" data-id="${a.id}" tabindex="0" role="link"` : ""}>
      ${a.image ? `<a ${ok ? extLink(a) : ""} tabindex="-1" aria-hidden="true"><img src="${esc(a.image)}" alt="" loading="lazy" onerror="this.remove()"></a>`
                : `<span class="src-avatar" style="background:${sourceColor(a.source)};flex-shrink:0">${esc(a.sourceLogo || sourceInitials(a.source))}</span>`}
      <div><h4>${headLink(a)}</h4><div class="meta">${esc(a.source)} · ${esc(a.category)} · ${fmtDate(a.publishedAt)}</div></div>
    </div>`;
  }).join("")
    : `<p class="muted" style="padding:20px;text-align:center">No live results for “${esc(q)}”.</p>`;
}

/* ---------- Misc UI ---------- */
let toastT;
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 2400);
}
function heroCanvas() {
  const cv = $("#heroCanvas"), ctx = cv.getContext("2d");
  let pts = [], w, h;
  const resize = () => {
    const r = cv.parentElement.getBoundingClientRect();
    w = cv.width = r.width; h = cv.height = r.height;
    pts = Array.from({ length: Math.min(70, w / 16) }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35, r: Math.random() * 1.8 + 0.6,
    }));
  };
  resize(); addEventListener("resize", resize);
  (function tick() {
    ctx.clearRect(0, 0, w, h);
    for (const p of pts) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7);
      ctx.fillStyle = "rgba(120,170,255,.5)"; ctx.fill();
    }
    ctx.strokeStyle = "rgba(120,170,255,.09)";
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
      if (dx * dx + dy * dy < 110 * 110) { ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y); ctx.stroke(); }
    }
    requestAnimationFrame(tick);
  })();
}

/* ---------- Boot ---------- */
async function boot() {
  $("#year").textContent = "© " + new Date().getFullYear();
  heroCanvas(); renderCats();
  await initialLoad();
  state.booted = true;
  route();

  $("#loadMoreBtn").onclick = () => { state.visible += CONFIG.pageSize; renderFeed(false); };
  $("#refreshBtn").onclick = () => refreshFeed({ manual: true });
  $("#showNewBtn").onclick = () => {
    knownIds = new Set(NewsAPI.getAll().map((a) => a.id));
    pendingFresh = [];
    $("#newStoriesToast").hidden = true;
    renderAll();
    toast("Feed updated with new stories");
  };
  $("#searchBtn").onclick = openSearch;
  $("#searchInput").addEventListener("input", (e) => doSearch(e.target.value));
  $("#menuBtn").onclick = () => {
    const m = $("#mobileMenu"), open = m.classList.toggle("open");
    $("#menuBtn").setAttribute("aria-expanded", open);
    m.setAttribute("aria-hidden", !open);
  };
  $$("#mobileMenu a").forEach((a) => (a.onclick = () => $("#mobileMenu").classList.remove("open")));
  $("#themeBtn").onclick = () => {
    const html = document.documentElement;
    const light = html.dataset.theme !== "light";
    html.dataset.theme = light ? "light" : "dark";
    $("#themeIconMoon").style.display = light ? "none" : "";
    $("#themeIconSun").style.display = light ? "" : "none";
  };
  addEventListener("scroll", () => $("#siteHeader").classList.toggle("scrolled", scrollY > 8), { passive: true });
  addEventListener("hashchange", route);

  // Keep "Last updated" honest without refetching.
  setInterval(() => { if (state.booted && NewsAPI.getAll().length) renderStatus(); }, 30000);
  // Automatic live re-check every 10 minutes.
  setInterval(() => { if (state.booted) refreshFeed(); }, CONFIG.refreshIntervalMs);
}
boot();
