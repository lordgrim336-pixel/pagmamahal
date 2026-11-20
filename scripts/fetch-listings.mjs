// Collects Pag-IBIG Online Public Auction listings into public/data/listings.json.
//
// Usage:
//   node scripts/fetch-listings.mjs                 # whole country
//   node scripts/fetch-listings.mjs --region "4-A"  # only regions whose name contains "4-A"
//   node scripts/fetch-listings.mjs --limit 5       # only the first 5 cities (quick test)
//
// The Pag-IBIG site does not allow browsers on other websites to read its data
// (no CORS header), so the app reads this pre-built file instead. Run it on a
// schedule (e.g. once a day) to keep listings fresh. It deliberately goes slowly
// (a few requests at a time with pauses) to be gentle on Pag-IBIG's servers.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { locateAll } from "./lib/locate.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const BASE = "https://www.pagibigfundservices.com/OnlinePublicAuction/ListofProperties";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "data", "listings.json");
const CONCURRENCY = 3;
const PAUSE_MS = 400;

const args = process.argv.slice(2);
const argVal = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const regionFilter = argVal("--region");
const cityLimit = argVal("--limit") ? Number(argVal("--limit")) : Infinity;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, tries = 3) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt >= tries) throw new Error(`${url}: ${err.message}`);
      await sleep(1500 * attempt);
    }
  }
}

const rows = (json) => (Array.isArray(json) ? json : json?.data ?? []);

async function locations(grpid, regionid = "", provinceid = "") {
  const q = new URLSearchParams({ grpid, regionid, provinceid, cityid: "", brgyid: "" });
  return rows(await getJson(`${BASE}/LoadLocations?${q}`)).map((r) => ({
    id: r.result_column0,
    name: r.result_column1,
  }));
}

function parseCoords(text) {
  const m = String(text ?? "").match(/(-?\d{1,2}\.\d+)\s*[, ]\s*(-?\d{2,3}\.\d+)/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  // Rough Philippines bounding box, to drop typos.
  if (lat < 4 || lat > 22 || lng < 116 || lng > 127.5) return null;
  return [lat, lng];
}

function normalize(p, region, province) {
  const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
  return {
    id: p.ropa_id,
    batch: p.batch_no,
    address: p.prop_location?.trim(),
    subdivision: p.subdivision,
    city: p.city_muni,
    province: province.name,
    region: region.name,
    type: p.prop_type,
    lotArea: num(p.lot_area),
    floorArea: num(p.floor_area),
    minPrice: num(p.min_sellprice),
    saleType: p.disposal_type, // "1st Public Auction" | "2nd Public Auction" | "Negotiated Sale"
    saleFlag: num(p.disposal_flag),
    occupancy: p.occupancy,
    remarks: p.remarks,
    bidStart: p.start_datetime,
    bidEnd: p.end_datetime,
    opening: p.opening_datetime,
    titleNo: p.tct_cct_no,
    hub: p.handling_hbc,
    contact: p.contact_hbc,
    email: p.email_hbc,
    online: p.is_online === "1",
    coords: parseCoords(p.ins_remarks),
  };
}

async function runPool(items, worker) {
  let next = 0;
  const lanes = Array.from({ length: CONCURRENCY }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await worker(item);
      await sleep(PAUSE_MS);
    }
  });
  await Promise.all(lanes);
}

async function main() {
  const started = Date.now();
  let regions = await locations(1);
  if (regionFilter) regions = regions.filter((r) => r.name.includes(regionFilter));

  // Build the full list of cities first.
  const cities = [];
  for (const region of regions) {
    for (const province of await locations(2, region.id)) {
      for (const city of await locations(3, region.id, province.id)) {
        cities.push({ region, province, city });
      }
      await sleep(PAUSE_MS);
    }
  }
  const work = cities.slice(0, cityLimit);
  console.log(`Searching ${work.length} cities/municipalities in ${regions.length} region(s)...`);

  const byId = new Map();
  let done = 0;
  let failed = 0;
  await runPool(work, async ({ region, province, city }) => {
    const q = new URLSearchParams({
      flag: 1,
      region: region.id,
      province: province.id,
      city_muni: city.name,
    });
    try {
      const list = rows(await getJson(`${BASE}/Load_SearchListProperties_COPA?${q}`));
      for (const p of list) byId.set(p.ropa_id, normalize(p, region, province));
    } catch (err) {
      failed++;
      console.warn(`  ! ${city.name}: ${err.message}`);
    }
    done++;
    if (done % 25 === 0 || done === work.length) {
      console.log(`  ${done}/${work.length} cities, ${byId.size} properties so far`);
    }
  });

  const properties = [...byId.values()];
  const save = async () => {
    const out = {
      generatedAt: new Date().toISOString(),
      source: "https://www.pagibigfundservices.com/OnlinePublicAuction/",
      count: properties.length,
      withCoords: properties.filter((p) => p.coords).length,
      exactCoords: properties.filter((p) => p.coords && !p.approx).length,
      citiesSearched: work.length,
      citiesFailed: failed,
      properties,
    };
    await mkdir(dirname(OUT), { recursive: true });
    await writeFile(OUT, JSON.stringify(out));
    return out;
  };

  // Save right away (exact GPS pins only), so a slow or interrupted
  // location lookup never loses the freshly collected listings.
  await save();
  if (!args.includes("--no-geocode")) {
    const budget = argVal("--osm-budget") ? Number(argVal("--osm-budget")) : 60;
    await locateAll(properties, { root: ROOT, save, nominatimBudget: budget });
  }
  const out = await save();
  const secs = Math.round((Date.now() - started) / 1000);
  console.log(`Saved ${out.count} properties (${out.withCoords} with map location) to ${OUT} in ${secs}s.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
