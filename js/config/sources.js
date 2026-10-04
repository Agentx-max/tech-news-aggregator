// ─── Display registry for known sources (colors/initials/site links) ──
// Live feed contents + statuses come from GET /api/news (server.js).
// This file holds no articles — only presentation metadata.
export const SOURCES = [
  { name: "TechCrunch", color: "#22c55e", logo: "TC", site: "https://techcrunch.com" },
  { name: "The Verge", color: "#e11d48", logo: "V", site: "https://www.theverge.com" },
  { name: "Ars Technica", color: "#f97316", logo: "ar", site: "https://arstechnica.com" },
  { name: "Engadget", color: "#3b82f6", logo: "E", site: "https://www.engadget.com" },
  { name: "Wired", color: "#eab308", logo: "W", site: "https://www.wired.com" },
  { name: "Android Authority", color: "#4ade80", logo: "AA", site: "https://www.androidauthority.com" },
  { name: "9to5Google", color: "#22d3ee", logo: "9G", site: "https://9to5google.com" },
  { name: "9to5Mac", color: "#a78bfa", logo: "9M", site: "https://9to5mac.com" },
  { name: "MacRumors", color: "#94a3b8", logo: "MR", site: "https://www.macrumors.com" },
  { name: "Tom's Hardware", color: "#60a5fa", logo: "TH", site: "https://www.tomshardware.com" },
  { name: "ZDNET", color: "#f43f5e", logo: "ZD", site: "https://www.zdnet.com" },
  { name: "PC Gamer", color: "#fb7185", logo: "PC", site: "https://www.pcgamer.com" },
  { name: "Gizmodo", color: "#c084fc", logo: "G", site: "https://gizmodo.com" },
];

export const CATEGORIES = ["All", "AI", "Mobile", "Apple", "Google", "Microsoft", "Hardware", "Gaming", "Cybersecurity", "Science", "Space", "Software", "Startups", "EV", "Internet"];

const byName = (name) => SOURCES.find((s) => s.name === name);
export const sourceColor = (name) => byName(name)?.color || "#3b82f6";
export const sourceInitials = (name) => byName(name)?.logo || String(name || "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
export const sourceSite = (name) => byName(name)?.site || "#";
