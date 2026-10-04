// localStorage-backed personalization (prototype; replace with auth later)
const BKEY = "techpulse_saved_v1", RKEY = "techpulse_recent_v1";
const read = (k, f) => { try { return JSON.parse(localStorage.getItem(k)) ?? f; } catch { return f; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
export const store = {
  saved: () => read(BKEY, []),
  isSaved: (id) => read(BKEY, []).includes(String(id)),
  toggle: (id) => {
    id = String(id);
    let s = read(BKEY, []);
    s = s.includes(id) ? s.filter(x => x !== id) : [id, ...s];
    write(BKEY, s); return s;
  },
  pushRecent: (id) => {
    id = String(id);
    let r = [id, ...read(RKEY, []).filter(x => x !== id)].slice(0, 5);
    write(RKEY, r); return r;
  },
  recent: () => read(RKEY, []),
};
