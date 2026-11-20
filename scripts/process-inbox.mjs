// Processes anonymous "Pin in the wrong place?" reports sent from the app.
// The relay (relay/worker.js) saves each one as data/inbox/<id>.json:
//   { "id": "...", "propertyId": "...", "coords": [lat, lng],
//     "wholeSubdivision": false, "note": "...", "receivedAt": "ISO time" }
//
// Each report is checked and moved into data/pin-reports.json:
//   applied   - clear-cut fix, added to data/location-overrides.json right away
//   pending   - needs Claude (the daily review, docs/daily-pin-review.md)
//   duplicate - same as a report already waiting
//   invalid   - unknown property or unusable location
//
// Anonymous reports can't be told apart by person, so the rules are stricter
// than for signed-in GitHub reports. Applied automatically only if ALL hold:
//   - the spot is inside the property's town AND its barangay (PSGC boundaries)
//   - the current pin isn't Pag-IBIG's own GPS or an earlier verified fix
//   - the property hasn't had a fix in the last 30 days
//   - it's for one property (whole building/subdivision fixes always go to Claude)
//   - fewer than 30 anonymous fixes were applied automatically today
//
// Usage: node scripts/process-inbox.mjs [--listings path-or-url] [--dry-run]

import { readFile, writeFile, readdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadAdminAreas, contains } from "./lib/admin-areas.mjs";
import { km } from "./lib/overture-match.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const INBOX = join(ROOT, "data", "inbox");
const OVERRIDES = join(ROOT, "data", "location-overrides.json");
const LOG = join(ROOT, "data", "pin-reports.json");

const args = process.argv.slice(2);
const arg = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const dryRun = args.includes("--dry-run");
const repo = process.env.GITHUB_REPOSITORY ?? "lordgrim336-pixel/pagmamahal";

export const RULES = { townTolKm: 0.3, brgyTolKm: 0.3, cooldownDays: 30, maxAutoPerDay: 30, duplicateKm: 0.05 };

const norm = (s) => String(s ?? "").toUpperCase().replace(/\s+/g, " ").trim();
const readJson = async (p, fallback) => (existsSync(p) ? JSON.parse(await readFile(p, "utf8")) : fallback);

async function loadListings() {
  const src = arg("--listings") ?? process.env.LISTINGS_URL;
  if (src && !/^https?:/.test(src)) return JSON.parse(await readFile(src, "utf8"));
  const [owner, name] = repo.split("/");
  const url = src ?? `https://${owner.toLowerCase()}.github.io/${name}/data/listings.json`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Couldn't load listings from ${url}: ${res.status}`);
  return res.json();
}

function validCoords(c) {
  if (!Array.isArray(c) || c.length !== 2) return null;
  const [lat, lng] = c.map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < 4 || lat > 22 || lng < 116 || lng > 127.5) return null;
  return [Number(lat.toFixed(6)), Number(lng.toFixed(6))];
}

export function decideAnonymous(report, { byId, admin, log, now = Date.now() }) {
  const p = byId.get(String(report.propertyId ?? "").replace(/[^0-9]/g, ""));
  if (!p) return { status: "invalid", reasons: ["No property with that ID is in the current listings."] };
  const coords = validCoords(report.coords);
  if (!coords) return { status: "invalid", p, reasons: ["The location isn't a valid point in the Philippines."] };

  const base = { p, coords };
  // Same spot already waiting for this property?
  if (log.some((r) => r.propertyId === p.id && r.status === "pending" && km(r.coords, coords) <= RULES.duplicateKm))
    return { ...base, status: "duplicate", reasons: ["Same as a report already waiting for review."] };

  const town = admin.findTown(p.city, p.province);
  const brgy = admin.findBarangay(town, p.barangay);
  const reasons = [];
  if (town && !contains(town, coords, RULES.townTolKm)) reasons.push(`Outside ${town.name}, the town in the address.`);
  if (!brgy) reasons.push(`The barangay in the address ("${p.barangay ?? "none"}") couldn't be matched to a boundary.`);
  else if (!contains(brgy, coords, RULES.brgyTolKm)) reasons.push(`Outside Barangay ${brgy.name}, the barangay in the address.`);
  if (p.locSource === "pagibig-gps") reasons.push("The current pin is Pag-IBIG's own GPS reading.");
  if (p.locSource === "verified") reasons.push("The current pin is an earlier verified fix.");
  const since = now - RULES.cooldownDays * 864e5;
  if (log.some((r) => r.propertyId === p.id && ["applied", "approved"].includes(r.status) && Date.parse(r.at) > since))
    reasons.push(`This property already had a fix in the last ${RULES.cooldownDays} days.`);
  if (report.wholeSubdivision) reasons.push("Asks to move the whole building/subdivision.");
  const today = new Date(now).toISOString().slice(0, 10);
  const autoToday = log.filter((r) => r.source === "app" && r.status === "applied" && String(r.at).startsWith(today)).length;
  if (autoToday >= RULES.maxAutoPerDay) reasons.push(`Daily limit of ${RULES.maxAutoPerDay} automatic fixes reached.`);

  if (reasons.length) return { ...base, status: "pending", reasons };
  return { ...base, status: "applied", reasons: [`Inside Barangay ${brgy.name}, ${town?.name ?? p.city}.`] };
}

async function main() {
  const files = existsSync(INBOX) ? (await readdir(INBOX)).filter((f) => f.endsWith(".json")).sort() : [];
  if (!files.length) {
    console.log("Inbox is empty.");
    return;
  }
  const listings = await loadListings();
  const byId = new Map(listings.properties.map((p) => [p.id, p]));
  const admin = loadAdminAreas(join(ROOT, "data", "boundaries", "src"));
  const log = await readJson(LOG, []);
  const overrides = await readJson(OVERRIDES, {});
  let applied = 0;

  for (const f of files) {
    let report;
    try {
      report = JSON.parse(await readFile(join(INBOX, f), "utf8"));
    } catch {
      report = {};
    }
    const d = decideAnonymous(report, { byId, admin, log });
    const entry = {
      id: String(report.id ?? f.replace(/\.json$/, "")).slice(0, 64),
      source: "app",
      propertyId: d.p?.id ?? String(report.propertyId ?? "").slice(0, 32),
      subdivision: d.p?.subdivision?.trim(),
      city: d.p?.city?.trim(),
      address: d.p?.address,
      currentPin: d.p?.coords,
      currentSource: d.p?.locSource,
      coords: d.coords ?? null,
      wholeSubdivision: !!report.wholeSubdivision,
      note: String(report.note ?? "").slice(0, 500),
      status: d.status,
      reasons: d.reasons,
      at: report.receivedAt && !Number.isNaN(Date.parse(report.receivedAt)) ? report.receivedAt : new Date().toISOString(),
    };
    log.push(entry);
    if (d.status === "applied") {
      overrides[d.p.id] = { coords: d.coords, note: `App report ${entry.id} (anonymous), auto-applied` };
      applied++;
    }
    console.log(`${f}: ${d.status} - ${d.reasons.join(" ")}`);
    if (!dryRun) await unlink(join(INBOX, f));
  }

  if (!dryRun) {
    await writeFile(LOG, JSON.stringify(log, null, 2) + "\n");
    await writeFile(OVERRIDES, JSON.stringify(overrides, null, 2) + "\n");
  }
  if (process.env.GITHUB_OUTPUT) await writeFile(process.env.GITHUB_OUTPUT, `changed=true\napplied=${applied}\n`, { flag: "a" });
  console.log(`Processed ${files.length} report(s); ${applied} applied.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
