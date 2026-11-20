// Decides where each property's pin goes, using the most accurate free source
// available. In order (first that works wins):
//
//   verified     - a manual correction in data/location-overrides.json
//   gps          - Pag-IBIG's own GPS reading, if it lies inside the stated town
//   nearby       - middle of other Pag-IBIG GPS readings in the same subdivision
//   subdivision  - the subdivision found on OpenStreetMap (Nominatim) or in
//                  Overture Maps Places, checked to lie inside the stated town
//   barangay     - inside the barangay named in the address (PSGC boundaries)
//   city         - town/city center
//
// Measured on subdivisions whose true location is known (scripts/eval-locations.mjs):
//   OSM subdivision   median 0.17 km, 90% within 0.5 km
//   Overture          median 0.21 km, 90% within 0.8 km
//   barangay          median 0.9 km,  90% within 2 km
//   town center       median 3.9 km,  90% within 8.4 km

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadAdminAreas, contains, interiorPoint } from "./admin-areas.mjs";
import { loadOverture, matchSubdivision, km } from "./overture-match.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s ?? "").toUpperCase().replace(/\s+/g, " ").trim();
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const isRealSubdivision = (s) => !!norm(s) && !/^(NON[- ]?SUBD|N\/A|NONE)/.test(norm(s));

export const cleanPlace = (s) =>
  String(s ?? "")
    .replace(/\([^)]*\)/g, "") // "DAET (CAPITAL)", "PEREZ (LUCBANAN)"
    .replace(/\s+[IVX]+(\/[IVX]+)+$/i, "") // "TONDO I/II"
    .replace(/\b(AS-IS|AS IS|PHASE\s*\w+)\b/gi, "")
    .replace(/^CITY OF\s+/i, "")
    .replace(/\s+CITY$/i, " City")
    .replace(/\s{2,}/g, " ")
    .trim();
const provinceForSearch = (p) => (/^NCR/i.test(p) ? "Metro Manila" : p);

// Address format: "<lot/unit> <SUBDIVISION> <BARANGAY>, <CITY>, <PROVINCE>, <ZIP>".
export function barangayOf(p) {
  const addr = norm(p.address);
  const city = norm(p.city);
  const cut = addr.lastIndexOf(", " + city);
  const head = cut > 0 ? addr.slice(0, cut) : addr.split(",")[0];
  const sub = norm(p.subdivision);
  const i = sub ? head.lastIndexOf(sub) : -1;
  if (i < 0) return null;
  const b = head.slice(i + sub.length).replace(/^[\s,.-]+/, "").trim();
  return b && !/^(N\/A|NA|NONE|0+)$/.test(b) ? b : null;
}

// Middle of a group of GPS points, but only if most of them agree.
function trustedCenter(points) {
  if (!points?.length) return null;
  const c = [median(points.map((p) => p[0])), median(points.map((p) => p[1]))];
  const close = points.filter((p) => km(p, c) <= 2);
  if (close.length < Math.max(1, points.length / 2)) return null;
  return [median(close.map((p) => p[0])), median(close.map((p) => p[1]))];
}

/**
 * Sets p.coords, p.approx (null for gps/verified), p.locSource and p.barangay on every property.
 * options: { root, save, nominatimBudget, log }
 */
export async function locateAll(properties, { root, save = async () => {}, nominatimBudget = 60, log = console.log } = {}) {
  const dataDir = join(root, "data");
  const cachePath = join(dataDir, "geocode-cache.json");
  const overridesPath = join(dataDir, "location-overrides.json");
  const overturePath = join(dataDir, "overture", "ph_places.parquet");
  await mkdir(dataDir, { recursive: true });

  const readJson = async (p, fallback) => {
    try {
      return JSON.parse(await readFile(p, "utf8"));
    } catch {
      return fallback;
    }
  };
  const cache = await readJson(cachePath, {});
  const overrides = await readJson(overridesPath, {});
  const admin = loadAdminAreas(join(dataDir, "boundaries", "src"));
  let ov = null;
  if (existsSync(overturePath)) {
    ov = await loadOverture(overturePath);
    log(`Loaded ${ov.places.length.toLocaleString()} Overture places.`);
  } else {
    log("! Overture extract missing (run: npm run update-overture). Skipping that source.");
  }

  // ---- Nominatim (OpenStreetMap): cached; new lookups limited by OSMF policy
  // (recurring scripts: max 4 requests/minute), so at most `nominatimBudget` per run.
  let budget = nominatimBudget;
  let lastCall = 0;
  async function nominatim(key, query) {
    if (key in cache) return cache[key];
    if (budget <= 0) return undefined; // not looked up yet; try on a later run
    budget--;
    const wait = lastCall + 15_000 - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    try {
      const q = new URLSearchParams({ q: query, format: "json", limit: 1, countrycodes: "ph" });
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${q}`, {
        headers: { "User-Agent": "pagmamahal-property-map/0.2 (Pag-IBIG listings map; daily, cached)" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const [hit] = await res.json();
      cache[key] = hit ? [Number(hit.lat), Number(hit.lon)] : null;
      await writeFile(cachePath, JSON.stringify(cache));
      return cache[key];
    } catch (err) {
      log(`  ! Nominatim "${query}": ${err.message}`);
      return undefined;
    }
  }

  // ---- 1. Resolve towns/barangays; validate Pag-IBIG GPS.
  let rejected = 0;
  for (const p of properties) {
    p.barangay = barangayOf(p);
    p._town = admin.findTown(p.city, p.province);
    p._brgy = admin.findBarangay(p._town, p.barangay);
    p.approx = null;
    p.locSource = null;
    if (p.coords) {
      if (p._town && !contains(p._town, p.coords, 0.3)) {
        p.gpsRejected = p.coords; // kept for transparency, not used
        p.coords = null;
        rejected++;
      } else {
        p.locSource = "pagibig-gps";
      }
    }
  }
  log(`Pag-IBIG GPS: ${properties.filter((p) => p.locSource).length} kept, ${rejected} rejected (outside the stated town).`);

  // ---- 2. Manual corrections (by property ID, or by subdivision for every unit in it).
  const subKey = (p) => `${norm(p.subdivision)}|${norm(p.city)}`;
  for (const p of properties) {
    const o = overrides[p.id] ?? overrides[`sub:${subKey(p)}`];
    if (o?.coords) Object.assign(p, { coords: o.coords, approx: null, locSource: "verified" });
  }

  // ---- 3. Neighbors: GPS of other listings in the same subdivision.
  const groups = new Map();
  const add = (k, c) => (groups.get(k) || groups.set(k, []).get(k)).push(c);
  for (const p of properties) {
    if (!p.coords || !isRealSubdivision(p.subdivision)) continue;
    add(`${subKey(p)}|${norm(p.barangay)}`, p.coords);
    add(subKey(p), p.coords);
  }
  for (const p of properties) {
    if (p.coords || !isRealSubdivision(p.subdivision)) continue;
    const c = trustedCenter(groups.get(`${subKey(p)}|${norm(p.barangay)}`)) || trustedCenter(groups.get(subKey(p)));
    if (c) Object.assign(p, { coords: c, approx: "nearby", locSource: "pagibig-neighbors" });
  }

  // ---- 4-7. Everything else, once per distinct (subdivision, barangay, town).
  const rest = properties.filter((p) => !p.coords);
  const targets = new Map();
  for (const p of rest) {
    const k = `${norm(p.subdivision)}|${norm(p.barangay)}|${norm(p.city)}|${norm(p.province)}`;
    (targets.get(k) || targets.set(k, []).get(k)).push(p);
  }
  log(`Locating ${rest.length} properties in ${targets.size} distinct places...`);

  let done = 0;
  for (const props of targets.values()) {
    const p = props[0];
    const town = p._town;
    const brgy = p._brgy;
    const city = cleanPlace(p.city);
    const prov = provinceForSearch(p.province);
    const inTown = (pt) => !town || contains(town, pt, 0.3);
    let hit = null;
    let approx = null;
    let source = null;

    if (isRealSubdivision(p.subdivision)) {
      // 4a. OpenStreetMap: try cached variants first, then (budget permitting) a new lookup.
      const sub = cleanPlace(p.subdivision);
      const variants = [...new Set([city, city.replace(/\s+City$/i, "")])];
      const keys = [
        ...variants.map((t) => [`sub|${sub}|${t}|${prov}`, `${sub}, ${t}, ${prov}, Philippines`]),
        ...variants.map((t) => [`sub|${sub}|${t}|`, `${sub}, ${t}, Philippines`]),
      ];
      for (const [key, query] of keys) {
        const h = await nominatim(key, query);
        if (h && inTown(h)) {
          [hit, approx, source] = [h, "subdivision", "osm"];
          break;
        }
        if (h === undefined) break; // out of budget: don't burn more on variants
      }
      // 4b. Overture Maps Places.
      if (!hit && ov) {
        const center = cache[`city|${city}|${prov}`] ?? (town ? interiorPoint(town) : null);
        const m = matchSubdivision(ov, p.subdivision, center, {
          within: town ? inTown : null,
          prefer: brgy ? (pt) => contains(brgy, pt, 0.5) : null,
          townName: town?.name ?? p.city,
        });
        if (m) [hit, approx, source] = [m.coords, "subdivision", "overture"];
      }
    }
    // 5. Inside the barangay named in the address.
    if (!hit && brgy) [hit, approx, source] = [interiorPoint(brgy), "barangay", "psgc"];
    // 6. Town center (OSM's town point if it lies in the town, else a point inside the boundary).
    if (!hit) {
      const c = cache[`city|${city}|${prov}`];
      if (c && inTown(c)) [hit, approx, source] = [c, "city", "osm"];
      else if (town) [hit, approx, source] = [interiorPoint(town), "city", "psgc"];
    }
    if (hit) for (const q of props) Object.assign(q, { coords: hit, approx, locSource: source });
    if (++done % 200 === 0) log(`  ${done}/${targets.size}`);
  }

  for (const p of properties) {
    delete p._town;
    delete p._brgy;
  }
  await writeFile(cachePath, JSON.stringify(cache));

  const tally = {};
  for (const p of properties) {
    const k = p.locSource === "verified" ? "verified" : p.approx ? `${p.approx}:${p.locSource}` : p.coords ? "gps" : "none";
    tally[k] = (tally[k] || 0) + 1;
  }
  log("Pin sources:", tally, `| new OpenStreetMap lookups used: ${nominatimBudget - budget}`);
}
