// Accuracy test: for subdivisions where Pag-IBIG's own GPS tells us the true
// location, pretend we don't know it and see where each method would put it.
// Usage: node --max-old-space-size=6000 scripts/eval-locations.mjs

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadOverture, matchSubdivision, km } from "./lib/overture-match.mjs";
import { loadAdminAreas, contains, interiorPoint } from "./lib/admin-areas.mjs";

const root = new URL("..", import.meta.url);
const path = (p) => fileURLToPath(new URL(p, root));
const data = JSON.parse(await readFile(path("public/data/listings.json"), "utf8"));
const cache = JSON.parse(await readFile(path("data/geocode-cache.json"), "utf8"));
const admin = loadAdminAreas(path("data/boundaries/src"));

const norm = (s) => String(s ?? "").toUpperCase().replace(/\s+/g, " ").trim();
const cleanPlace = (s) =>
  String(s ?? "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+[IVX]+(\/[IVX]+)+$/i, "")
    .replace(/\b(AS-IS|AS IS|PHASE\s*\w+)\b/gi, "")
    .replace(/^CITY OF\s+/i, "")
    .replace(/\s+CITY$/i, " City")
    .replace(/\s{2,}/g, " ")
    .trim();
const prov = (p) => (/^NCR/i.test(p) ? "Metro Manila" : p);
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[s.length >> 1] : NaN;
};
const pct = (xs, q) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * q))] : NaN;
};

// Ground truth: median GPS of a subdivision's listings, using only GPS that
// lies inside the town named in the address (bad Pag-IBIG GPS is dropped).
const groups = new Map();
let badGps = 0;
for (const p of data.properties) {
  if (p.approx || !p.coords || !p.subdivision || /^NON[- ]?SUBD/i.test(p.subdivision)) continue;
  const town = admin.findTown(p.city, p.province);
  if (town && !contains(town, p.coords, 0.3)) {
    badGps++;
    continue;
  }
  const k = `${norm(p.subdivision)}|${norm(p.city)}`;
  (groups.get(k) || groups.set(k, { p, town, pts: [] }).get(k)).pts.push(p.coords);
}
const truth = [...groups.values()].map(({ p, town, pts }) => ({
  p,
  town,
  coords: [median(pts.map((x) => x[0])), median(pts.map((x) => x[1]))],
}));
console.log(`Ground-truth subdivisions: ${truth.length} (dropped ${badGps} Pag-IBIG GPS points outside their town)`);

const ov = await loadOverture(path("data/overture/ph_places.parquet"));

const results = { overture: [], nominatimSub: [], barangayPolygon: [], nominatimBrgy: [], town: [] };
const misses = [];
for (const { p, town, coords } of truth) {
  const city = cleanPlace(p.city);
  const pr = prov(p.province);
  const center = cache[`city|${city}|${pr}`] || (town && interiorPoint(town));
  if (!center) continue;
  results.town.push(km(center, coords));

  const b = admin.findBarangay(town, p.barangay);
  const m = matchSubdivision(ov, p.subdivision, center, {
    within: town ? (pt) => contains(town, pt, 0.3) : null,
    prefer: b ? (pt) => contains(b, pt, 0.5) : null,
    townName: town?.name ?? p.city,
  });
  if (m) {
    const e = km(m.coords, coords);
    results.overture.push(e);
    if (e > 2) misses.push(`${e.toFixed(1)} km  ${p.subdivision.trim()} (${p.city.trim()}) <- ${m.names.join(" | ")}`);
  }
  const sub = cache[`sub|${cleanPlace(p.subdivision)}|${city}|${pr}`] ?? cache[`sub|${cleanPlace(p.subdivision)}|${city.replace(/\s+City$/i, "")}|`];
  if (sub && (!town || contains(town, sub, 0.3))) results.nominatimSub.push(km(sub, coords));

  if (b) results.barangayPolygon.push(km(interiorPoint(b), coords));
  const nb = cache[`brgyS|${cleanPlace(p.barangay)}|${city.replace(/\s+City$/i, "")}|`] ?? cache[`brgyS|${cleanPlace(p.barangay)}|${city}|`];
  if (nb) results.nominatimBrgy.push(km(nb, coords));
}

const n = truth.length;
for (const [name, errs] of Object.entries(results)) {
  console.log(
    `${name.padEnd(16)} found ${String(errs.length).padStart(4)}/${n}  median ${median(errs).toFixed(2)} km  ` +
      `p75 ${pct(errs, 0.75).toFixed(2)}  p90 ${pct(errs, 0.9).toFixed(2)}  within 1km ${errs.filter((e) => e <= 1).length}`,
  );
}
console.log("\nWorst Overture matches:");
misses.sort((a, b) => parseFloat(b) - parseFloat(a)).slice(0, 12).forEach((m) => console.log("  " + m));
