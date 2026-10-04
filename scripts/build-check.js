// ─── TechPulse production build check ─────────────────────────────────
// Run:  npm run build   (also used as the Vercel Build Command)
// This project is dependency-free static + serverless functions, so the
// "build" validates everything Vercel needs to render production correctly:
//   1. every stylesheet/script/asset referenced by index.html exists on disk
//      with EXACT case-sensitive filename match (Windows is case-insensitive,
//      Vercel/Linux is not — a mismatch 404s the CSS in production)
//   2. every JS module import resolves (same exact-case rule)
//   3. every JS file parses (node --check)
//   4. api/* serverless functions exist, export a default handler, and import
//      the shared lib/rss.js core
//   5. vercel.json is valid and its rewrite/function targets exist
//   6. no dev-machine-only references (C:\ paths, http://localhost) in the
//      shipped frontend
//   7. .gitignore does not exclude any required source file
// Any failure exits non-zero with a precise error (fails the Vercel build).

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const errors = [];
const ok = (msg) => console.log(`  ✓ ${msg}`);
const fail = (msg) => { errors.push(msg); console.log(`  ✗ ${msg}`); };

/** Exact case-sensitive existence check (defeats Windows case-insensitivity). */
function existsExactCase(absPath) {
  const rel = path.relative(ROOT, absPath);
  const parts = rel.split(path.sep);
  let dir = ROOT;
  for (const part of parts) {
    let entries;
    try { entries = readdirSync(dir); } catch { return false; }
    if (!entries.includes(part)) return false; // exact match required
    dir = path.join(dir, part);
  }
  return true;
}

function resolveRef(fromFile, ref) {
  if (!ref || ref.startsWith("#") || ref.startsWith("data:") || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(ref)) return null; // external/anchor/inline
  const clean = ref.split("?")[0].split("#")[0];
  if (!clean) return null;
  return path.normalize(path.join(path.dirname(fromFile), clean));
}

// ── 1+2. asset + import graph from index.html ──────────────────────────
console.log("Checking asset graph (exact case-sensitive paths)...");
const seen = new Set();
const queue = [path.join(ROOT, "index.html")];
const jsFiles = [];
while (queue.length) {
  const file = queue.pop();
  if (seen.has(file)) continue;
  seen.add(file);
  if (!existsExactCase(file)) { fail(`missing file (exact case): ${path.relative(ROOT, file)}`); continue; }
  const text = readFileSync(file, "utf8");
  const refs = [];
  if (file.endsWith(".html")) {
    for (const m of text.matchAll(/(?:href|src)\s*=\s*["']([^"']+)["']/gi)) refs.push(m[1]);
  }
  if (file.endsWith(".js")) {
    jsFiles.push(file);
    for (const m of text.matchAll(/(?:import|export)[^'"]*?from\s*["']([^"']+)["']/g)) refs.push(m[1]);
    for (const m of text.matchAll(/import\s*\(\s*["']([^"']+)["']\s*\)/g)) refs.push(m[1]);
  }
  for (const ref of refs) {
    const abs = resolveRef(file, ref);
    if (!abs) continue;
    if (!existsExactCase(abs)) {
      fail(`${path.relative(ROOT, file)} references "${ref}" → NOT FOUND with exact case (404 on Vercel/Linux)`);
    } else if ((abs.endsWith(".html") || abs.endsWith(".js")) && !seen.has(abs)) {
      queue.push(abs);
    }
  }
}
if (!errors.length) ok(`asset graph resolves: ${seen.size} files reachable from index.html`);

// ── 3. syntax check every JS file ──────────────────────────────────────
console.log("Syntax-checking JavaScript...");
const allJs = [...new Set([...jsFiles,
  path.join(ROOT, "server.js"),
  path.join(ROOT, "api", "news.js"),
  path.join(ROOT, "api", "health.js"),
  path.join(ROOT, "lib", "rss.js"),
  path.join(ROOT, "scripts", "build-check.js"),
])].filter((f) => existsSync(f));
for (const f of allJs) {
  try { execFileSync(process.execPath, ["--check", f], { stdio: "pipe" }); }
  catch { fail(`syntax error: ${path.relative(ROOT, f)}`); }
}
if (!errors.length) ok(`${allJs.length} JS files parse cleanly`);

// ── 4. serverless function wiring ───────────────────────────────────────
console.log("Checking serverless functions...");
for (const fn of ["api/news.js", "api/health.js"]) {
  const abs = path.join(ROOT, fn);
  if (!existsExactCase(abs)) { fail(`missing function: ${fn}`); continue; }
  const text = readFileSync(abs, "utf8");
  if (!/export\s+default\s+(async\s+)?function\s+handler/.test(text)) fail(`${fn}: no "export default function handler"`);
  if (!/\.\.\/lib\/rss\.js/.test(text)) fail(`${fn}: does not import shared ../lib/rss.js`);
}
const libAbs = path.join(ROOT, "lib", "rss.js");
if (!existsExactCase(libAbs)) fail("missing shared core: lib/rss.js");
else {
  const text = readFileSync(libAbs, "utf8");
  for (const name of ["export const FEEDS", "export async function getDigest", "export function sourceStatuses"]) {
    if (!text.includes(name)) fail(`lib/rss.js: missing "${name}"`);
  }
}
if (!errors.length) ok("api/* functions wired to shared lib/rss.js core");

// ── 5. vercel.json ─────────────────────────────────────────────────────
console.log("Checking vercel.json...");
try {
  const vc = JSON.parse(readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
  for (const [pattern, cfg] of Object.entries(vc.functions || {})) {
    const target = path.join(ROOT, pattern);
    if (!existsExactCase(target)) fail(`vercel.json function target missing: ${pattern}`);
    else if (cfg.maxDuration && (cfg.maxDuration < 1 || cfg.maxDuration > 300)) fail(`vercel.json: suspicious maxDuration for ${pattern}`);
  }
  for (const rw of vc.rewrites || []) {
    if (rw.destination && rw.destination.startsWith("/") && !rw.destination.includes(":")) {
      if (!existsExactCase(path.join(ROOT, rw.destination))) fail(`vercel.json rewrite destination missing: ${rw.destination}`);
    }
  }
  if (!errors.length) ok("vercel.json valid; all targets exist");
} catch (e) { fail(`vercel.json invalid: ${e.message}`); }

// ── 6. no dev-machine-only references in shipped frontend ──────────────
console.log("Scanning for dev-only paths...");
const banned = [/C:\\/i, /C:\//, /http:\/\/localhost/i, /http:\/\/127\.0\.0\.1/i];
for (const f of seen) {
  if (!/\.(html|js|css)$/.test(f) || f.includes(`${path.sep}server.js`)) continue;
  const text = readFileSync(f, "utf8");
  for (const rx of banned) {
    if (rx.test(text)) fail(`${path.relative(ROOT, f)} contains dev-only reference matching ${rx}`);
  }
}
if (!errors.length) ok("no dev-only paths in shipped frontend");

// ── 7. .gitignore must not exclude sources ─────────────────────────────
console.log("Checking .gitignore...");
const required = ["index.html", "styles.css", "package.json", "server.js", "vercel.json",
  "lib/rss.js", "api/news.js", "api/health.js", ...jsFiles.map((f) => path.relative(ROOT, f))];
try {
  const out = execFileSync("git", ["check-ignore", "-v", ...required], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  fail(`.gitignore excludes required files:\n${out}`);
} catch (e) {
  // git check-ignore exits 1 when NOTHING is ignored — that is the pass case.
  if (e.status === 1) ok(".gitignore excludes no required source files");
  else if (!existsSync(path.join(ROOT, ".gitignore"))) fail("missing .gitignore");
  else ok(".gitignore check skipped (git unavailable), file present");
}

// ── verdict ────────────────────────────────────────────────────────────
console.log("");
if (errors.length) {
  console.log(`BUILD FAILED — ${errors.length} problem(s):`);
  for (const m of errors) console.log(`  • ${m}`);
  process.exit(1);
}
console.log("BUILD OK — production asset graph, functions, and config verified.");
