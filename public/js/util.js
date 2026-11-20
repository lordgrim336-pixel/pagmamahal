// Small shared helpers for Pagmamahal Maps.

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const peso = (n, digits = 0) =>
  n == null || Number.isNaN(n)
    ? "—"
    : "₱" + Number(n).toLocaleString("en-PH", { minimumFractionDigits: digits, maximumFractionDigits: digits });

// Short price for map tags: ₱302K, ₱1.27M
export const pesoShort = (n) => {
  if (n == null) return "—";
  if (n >= 999_500) {
    const m = (n / 1e6).toFixed(n >= 9_995_000 ? 0 : 2);
    return `₱${m.includes(".") ? m.replace(/\.?0+$/, "") : m}M`;
  }
  return `₱${Math.round(n / 1000)}K`;
};

const SMALL_WORDS = new Set(["of", "and", "in", "de", "del", "la", "ng", "sa"]);
export const title = (s) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/\b([a-z])([a-z]*)/g, (w, a, rest, i) => (i > 0 && SMALL_WORDS.has(w) ? w : a.toUpperCase() + rest));

export const area = (v) => (v ? `${v} m²` : "—");

// Pag-IBIG times are Philippine time (UTC+8) without an offset.
export const phTime = (s) => (s ? new Date(s.length <= 19 ? s + "+08:00" : s) : null);
export const fmtDate = (d, withTime = true) =>
  d
    ? d.toLocaleString("en-PH", {
        month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila",
        ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
      })
    : "—";
const fmtDay = (d) => d.toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: "Asia/Manila" });

// Bidding status with a friendly countdown: "Closes in 2 days", "Opens Nov 23".
export function bidStatus(p, now = new Date()) {
  const start = phTime(p.bidStart);
  const end = phTime(p.bidEnd);
  if (start && now < start) return { key: "soon", cls: "soon", label: `Opens ${fmtDay(start)}` };
  if (end && now > end) return { key: "closed", cls: "closed", label: "Bidding closed" };
  if (start && end) {
    const hours = (end - now) / 36e5;
    const label = hours < 24 ? "Closes today" : hours < 48 ? "Closes tomorrow" : `Closes in ${Math.floor(hours / 24)} days`;
    return { key: "open", cls: hours < 48 ? "urgent" : "open", label };
  }
  return { key: "none", cls: "", label: "Dates not posted" };
}

// Simple property-type groups for filters.
export const TYPE_GROUPS = [
  { key: "house", label: "House", icon: "home", test: (t) => /SINGLE|DOUBLE|DUPLEX|QUADRUPLEX/i.test(t) },
  { key: "town", label: "Townhouse / row house", icon: "building-community", test: (t) => /TOWN ?HOUSE|ROW HOUSE/i.test(t) },
  { key: "condo", label: "Condo", icon: "building", test: (t) => /CONDOMINIUM/i.test(t) && !/PARKING/i.test(t) },
  { key: "lot", label: "Lot only", icon: "map-pin", test: (t) => /LOT ONLY/i.test(t) },
];
export const typeGroup = (t) => TYPE_GROUPS.find((g) => g.test(t || ""))?.key ?? "other";

export const PRICE_BANDS = [
  { key: "lt500", label: "Under ₱500K", min: 0, max: 500e3 },
  { key: "500-1m", label: "₱500K–1M", min: 500e3, max: 1e6 },
  { key: "1-2m", label: "₱1–2M", min: 1e6, max: 2e6 },
  { key: "2-5m", label: "₱2–5M", min: 2e6, max: 5e6 },
  { key: "gt5m", label: "Over ₱5M", min: 5e6, max: Infinity },
];

// Photos are stored as file names in Pag-IBIG's usual folder (see scripts/photos.mjs).
const PHOTO_BASE = "https://aaonline.pagibigfund.gov.ph/HdmfGallery/opa/";
export const photoUrls = (p) =>
  (p.photos || []).map((f) => (f.startsWith("https://") ? f : `${PHOTO_BASE}${encodeURIComponent(p.id)}/${encodeURIComponent(f)}`));

export const isOccupied = (p) => /^Occupied/i.test(p.occupancy || "");

// How precise each pin is (75% of pins fall within this distance; see scripts/eval-locations.mjs).
export function precisionOf(p) {
  if (!p.approx) {
    return p.locSource === "verified"
      ? { km: 0, short: "Verified", text: "This location was checked and corrected." }
      : { km: 0, short: "Exact", text: "" };
  }
  const sub = esc(title(p.subdivision));
  return {
    nearby: { km: 0.3, short: "≈ 0.3 km", text: `placed using the GPS of other Pag-IBIG listings in ${sub}, so it should be inside the subdivision` },
    subdivision:
      p.locSource === "overture"
        ? { km: 0.45, short: "≈ 0.5 km", text: `placed at ${sub} as listed in Overture Maps. It's usually within about 0.5 km` }
        : { km: 0.3, short: "≈ 0.3 km", text: `placed at ${sub} as found on OpenStreetMap. It's usually within about 0.3 km` },
    barangay: { km: 1.4, short: "≈ 1–2 km", text: `placed inside Barangay ${esc(title(p.barangay))} because the subdivision couldn't be found. It could be 1–2 km off` },
    city: { km: 5.8, short: "Town only", text: `placed at the center of ${esc(title(p.city))}. It may be several kilometers off` },
  }[p.approx];
}

// Device profile: go easy on low-end phones and slow or metered connections.
const nav = globalThis.navigator || {};
const conn = nav.connection || {};
export const device = {
  lowEnd: Boolean((nav.deviceMemory && nav.deviceMemory <= 2) || (nav.hardwareConcurrency && nav.hardwareConcurrency <= 4)),
  slowNet: Boolean(conn.saveData || /(^|-)2g$/.test(conn.effectiveType || "")),
  reducedMotion: Boolean(globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches),
};

// localStorage that never throws (private mode, full storage, blocked).
export const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // storage full or blocked: the feature just won't remember
    }
  },
};

// Tiny toast message at the bottom of the screen.
let toastTimer;
export function toast(msg) {
  let el = $("#toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.setAttribute("role", "status");
    document.body.append(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}
