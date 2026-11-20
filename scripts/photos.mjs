// Adds Pag-IBIG's property photos to public/data/listings.json and makes small
// thumbnails for the map and list.
//
//   data/photo-cache.json     { "<propertyId>": { "urls": [...], "checked": ISO, "thumbOf": url, "big": bool } }
//   public/thumbs/<id>.webp   192 x 192, about 6 KB (originals are ~200 KB)
//
// Designed to be gentle on Pag-IBIG's servers and on visitors' phones:
//   - photo lists are fetched only for new properties, plus a few hundred older
//     ones re-checked per run (each property about weekly)
//   - thumbnails are made once per photo and reused on later runs
//   - thumbnails of properties that are no longer listed are deleted
//
// Usage: node scripts/photos.mjs [--max-lookups 1500] [--max-thumbs 1500]
//        [--recheck-days 7] [--thumb-filter "CEBU|MANDAUE"] [--minutes 30]
//
// --minutes stops starting new work after that long and saves what's done, so
// a big first run spreads over a few days instead of hitting a time limit.
//
// Photos belong to Pag-IBIG Fund; the app credits them on every photo.

import { readFile, writeFile, mkdir, readdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LISTINGS = join(ROOT, "public", "data", "listings.json");
const CACHE = join(ROOT, "data", "photo-cache.json");
const THUMBS = join(ROOT, "public", "thumbs");
const PHOTO_BASE = "https://aaonline.pagibigfund.gov.ph/HdmfGallery/opa/"; // + <id>/<file>; same in public/js/util.js
const IMAGE_API = "https://www.pagibigfundservices.com/OnlinePublicAuction/ListofProperties/LoadImageUrl";

const args = process.argv.slice(2);
const opt = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const MAX_LOOKUPS = Number(opt("--max-lookups", 1500));
const MAX_THUMBS = Number(opt("--max-thumbs", 1500));
const RECHECK_DAYS = Number(opt("--recheck-days", 7));
const MINUTES = Number(opt("--minutes", 0));
const DEADLINE = MINUTES > 0 ? Date.now() + MINUTES * 60_000 : Infinity;
const THUMB_FILTER = opt("--thumb-filter", null) ? new RegExp(opt("--thumb-filter"), "i") : null;
const THUMB_SIZE = 192;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Pag-IBIG lists photos as http://; the same files are served over https,
// which secure (https) pages require.
const toHttps = (u) => String(u).replace(/^http:\/\//i, "https://");

async function pool(items, size, pauseMs, worker) {
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length && Date.now() < DEADLINE) {
        const item = items[next++];
        await worker(item);
        await sleep(pauseMs);
      }
    }),
  );
}

async function fetchWithTimeout(url, init = {}, ms = 20000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function lookupPhotos(id) {
  const res = await fetchWithTimeout(IMAGE_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ flag: 4, acct_id: id }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const list = await res.json();
  return Array.isArray(list) ? list.filter((u) => /^https?:\/\/[^\s"']+\.(jpe?g|png|webp)$/i.test(u)).map(toHttps).slice(0, 8) : [];
}

// A photo is "big" if it would be slow to download or heavy to show on a cheap
// phone (some Pag-IBIG photos are 4 MB, 20-megapixel camera originals).
const BIG_BYTES = 800 * 1024;
const BIG_PIXELS = 12e6;

async function makeThumb(id, url) {
  const res = await fetchWithTimeout(url, { headers: { Referer: "https://pagmamahal-maps.pages.dev/" } }, 30000);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const input = Buffer.from(await res.arrayBuffer());
  const meta = await sharp(input).metadata();
  const big = input.length > BIG_BYTES || (meta.width || 0) * (meta.height || 0) > BIG_PIXELS;
  await sharp(input)
    .rotate() // respect phone-camera orientation
    .resize(THUMB_SIZE, THUMB_SIZE, { fit: "cover", position: "attention" })
    .webp({ quality: 55, effort: 4 })
    .toFile(join(THUMBS, `${id}.webp`));
  return { big, kb: Math.round(input.length / 1024) };
}

async function main() {
  const data = JSON.parse(await readFile(LISTINGS, "utf8"));
  const cache = existsSync(CACHE) ? JSON.parse(await readFile(CACHE, "utf8")) : {};
  await mkdir(THUMBS, { recursive: true });
  const ids = data.properties.map((p) => p.id);
  const now = Date.now();

  // 1. Which properties need their photo list (re)checked: new ones first, then the oldest.
  const stale = (e) => !e || now - Date.parse(e.checked) > RECHECK_DAYS * 864e5;
  const todo = ids
    .filter((id) => stale(cache[id]))
    .sort((a, b) => (cache[a] ? Date.parse(cache[a].checked) : 0) - (cache[b] ? Date.parse(cache[b].checked) : 0))
    .slice(0, MAX_LOOKUPS);
  console.log(`Photo lists: checking ${todo.length} properties (${ids.filter((id) => !cache[id]).length} never checked).`);
  let done = 0;
  let failed = 0;
  await pool(todo, 2, 250, async (id) => {
    try {
      const urls = await lookupPhotos(id);
      cache[id] = { ...(cache[id] ?? {}), urls, checked: new Date().toISOString() };
    } catch (err) {
      failed++;
    }
    if (++done % 250 === 0) {
      console.log(`  ${done}/${todo.length}`);
      await writeFile(CACHE, JSON.stringify(cache));
    }
  });
  // Forget properties that are no longer listed.
  const live = new Set(ids);
  for (const id of Object.keys(cache)) if (!live.has(id)) delete cache[id];
  await writeFile(CACHE, JSON.stringify(cache));
  if (failed) console.log(`  ${failed} lookups failed; they'll be retried next run.`);

  // 2. Thumbnails for the first photo of each property (only if missing or the photo changed).
  const byId = new Map(data.properties.map((p) => [p.id, p]));
  const needThumb = ids
    .filter((id) => cache[id]?.urls?.length)
    .filter((id) => !THUMB_FILTER || THUMB_FILTER.test(byId.get(id).city))
    .filter((id) => cache[id].thumbOf !== cache[id].urls[0] || cache[id].big == null || !existsSync(join(THUMBS, `${id}.webp`)))
    .slice(0, MAX_THUMBS);
  console.log(`Thumbnails: making ${needThumb.length}.`);
  let made = 0;
  await pool(needThumb, 3, 150, async (id) => {
    try {
      const { big, kb } = await makeThumb(id, cache[id].urls[0]);
      cache[id].thumbOf = cache[id].urls[0];
      cache[id].big = big;
      cache[id].kb = kb;
      made++;
    } catch {
      // Leave it for the next run.
    }
    if (made && made % 250 === 0) console.log(`  ${made}/${needThumb.length}`);
  });
  await writeFile(CACHE, JSON.stringify(cache));

  // 3. Delete thumbnails of properties no longer listed (keeps the site small).
  let removed = 0;
  for (const f of await readdir(THUMBS)) {
    const id = f.replace(/\.webp$/, "");
    if (!live.has(id)) {
      await unlink(join(THUMBS, f));
      removed++;
    }
  }

  // 4. Add photo info to the listings the app loads.
  let withPhotos = 0;
  let withThumbs = 0;
  for (const p of data.properties) {
    const urls = cache[p.id]?.urls ?? [];
    // Store just the file name when the photo is in the usual folder (the app adds
    // the rest); this keeps listings.json about 1 MB smaller for cheap phones.
    const base = `${PHOTO_BASE}${p.id}/`;
    p.photos = urls.map((u) => (u.startsWith(base) && !u.slice(base.length).includes("/") ? u.slice(base.length) : u));
    p.thumb = urls.length > 0 && cache[p.id]?.thumbOf === urls[0] && existsSync(join(THUMBS, `${p.id}.webp`));
    if (p.thumb && cache[p.id].big) p.bigPhotoKB = cache[p.id].kb; // first photo is heavy
    else delete p.bigPhotoKB;
    if (urls.length) withPhotos++;
    if (p.thumb) withThumbs++;
  }
  data.withPhotos = withPhotos;
  await writeFile(LISTINGS, JSON.stringify(data));
  console.log(`Done: ${withPhotos} of ${ids.length} listings have photos, ${withThumbs} have thumbnails; ${made} made, ${removed} old ones removed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
