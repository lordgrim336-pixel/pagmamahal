// Checks a "Pin in the wrong place" report (a GitHub issue from
// .github/ISSUE_TEMPLATE/wrong-pin.yml) and decides what to do with it:
//
//   apply        -> add the fix to data/location-overrides.json, thank the reporter, close
//   needs-review -> label it; you or the weekly Claude review decides
//   needs-info   -> ask the reporter to fix the form
//   invalid      -> property not found; close
//
// Safety rules (the report text is untrusted: it is only parsed for an ID and
// two numbers, never executed or interpreted):
//   - the new spot must be inside the town in the property's address
//   - it must be inside the property's barangay or within 1.5 km of the current pin
//   - pins from Pag-IBIG's own GPS or earlier verified fixes are never changed automatically
//   - GitHub accounts younger than 7 days and very busy reporters go to review
//   - a fix for a whole building/subdivision needs 2 different people agreeing
//     (points within 300 m); until then only the reported unit is fixed
//   - a maintainer adding the "approved" label applies a report regardless
//
// Usage (in GitHub Actions): node scripts/review-report.mjs
// Local test:  node scripts/review-report.mjs --event test-event.json --listings public/data/listings.json --dry-run

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadAdminAreas, contains } from "./lib/admin-areas.mjs";
import { km } from "./lib/overture-match.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OVERRIDES = join(ROOT, "data", "location-overrides.json");
const LOG = join(ROOT, "data", "pin-reports.json");

const args = process.argv.slice(2);
const arg = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const dryRun = args.includes("--dry-run");
const eventPath = arg("--event") ?? process.env.GITHUB_EVENT_PATH;
const token = process.env.GITHUB_TOKEN;
const repo = process.env.GITHUB_REPOSITORY;

const LIMITS = { nearKm: 1.5, townTolKm: 0.3, brgyTolKm: 0.5, agreeKm: 0.3, minAccountDays: 7, maxPerDay: 10 };

// ---------------------------------------------------------------- parsing
// Issue forms render as "### <Label>\n\n<value>" sections.
export function parseForm(body) {
  const fields = {};
  const parts = String(body ?? "").split(/^###\s+/m).slice(1);
  for (const part of parts) {
    const nl = part.indexOf("\n");
    const label = part.slice(0, nl).trim().toLowerCase();
    let value = part.slice(nl + 1).trim();
    if (value === "_No response_") value = "";
    if (label.startsWith("property id")) fields.propertyId = value.replace(/[^0-9]/g, "");
    else if (label.startsWith("correct location")) fields.location = value;
    else if (label.startsWith("does this fix")) fields.wholeSubdivision = /whole/i.test(value);
    else if (label.startsWith("anything else")) fields.details = value.slice(0, 1000);
  }
  return fields;
}

// "10.31602, 123.884175", "10.31602 123.884175", or an OpenStreetMap link (mlat/mlon or #map=z/lat/lng).
export function parseCoords(text) {
  const s = String(text ?? "");
  const m =
    s.match(/mlat=(-?\d+\.\d+).*?mlon=(-?\d+\.\d+)/) ||
    s.match(/#map=\d+\/(-?\d+\.\d+)\/(-?\d+\.\d+)/) ||
    s.match(/(-?\d{1,2}\.\d{3,})\s*[, ]\s*(-?\d{2,3}\.\d{3,})/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (lat < 4 || lat > 22 || lng < 116 || lng > 127.5) return null; // not in the Philippines
  return [Number(lat.toFixed(6)), Number(lng.toFixed(6))];
}

const norm = (s) => String(s ?? "").toUpperCase().replace(/\s+/g, " ").trim();
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// ---------------------------------------------------------------- GitHub API
async function gh(method, path, body) {
  if (dryRun || !token) return null;
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "pagmamahal-pin-review",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`GitHub ${method} ${path}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

async function loadListings() {
  const src = arg("--listings") ?? process.env.LISTINGS_URL;
  if (src && !/^https?:/.test(src)) return JSON.parse(await readFile(src, "utf8"));
  const url = src ?? `https://${repo.split("/")[0].toLowerCase()}.github.io/${repo.split("/")[1]}/data/listings.json`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Couldn't load listings from ${url}: ${res.status}`);
  return res.json();
}

const readJson = async (p, fallback) => (existsSync(p) ? JSON.parse(await readFile(p, "utf8")) : fallback);

// ---------------------------------------------------------------- decision
export async function decide({ issue, sender, labelAdded, listings, admin, log, accountAgeDays }) {
  const f = parseForm(issue.body);
  const author = issue.user?.login ?? "unknown";
  const approvedByMaintainer = labelAdded === "approved";
  const reasons = [];

  const p = listings.properties.find((x) => x.id === f.propertyId);
  if (!f.propertyId || !p) {
    return { action: "invalid", f, reasons: [`No property with ID "${f.propertyId || "(empty)"}" is in the current listings.`] };
  }
  const coords = parseCoords(f.location);
  if (!coords) {
    return { action: "needs-info", f, p, reasons: ["The location must be two numbers, latitude and longitude (e.g. 10.31602, 123.884175), inside the Philippines."] };
  }
  const town = admin.findTown(p.city, p.province);
  const brgy = admin.findBarangay(town, p.barangay);
  const result = { f, p, coords, author, town: town?.name, barangay: brgy?.name };

  if (approvedByMaintainer) {
    return { ...result, action: "apply", reasons: [`Approved by @${sender}.`], scope: f.wholeSubdivision ? "subdivision" : "property" };
  }

  if (town && !contains(town, coords, LIMITS.townTolKm)) reasons.push(`The new spot is outside ${town.name}, the town in the property's address.`);
  if (p.locSource === "pagibig-gps" || p.locSource === "verified")
    reasons.push(`The current pin comes from ${p.locSource === "verified" ? "an earlier verified fix" : "Pag-IBIG's own GPS"}, so a person should confirm the change.`);
  const inBrgy = brgy ? contains(brgy, coords, LIMITS.brgyTolKm) : false;
  const dist = p.coords ? km(p.coords, coords) : Infinity;
  if (!inBrgy && dist > LIMITS.nearKm)
    reasons.push(`The new spot is ${dist.toFixed(1)} km from the current pin and not inside Barangay ${brgy?.name ?? p.barangay ?? "(unknown)"}.`);
  if (accountAgeDays != null && accountAgeDays < LIMITS.minAccountDays) reasons.push("The reporting GitHub account is less than a week old.");
  const dayAgo = Date.now() - 864e5;
  const recent = log.filter((r) => r.author === author && r.decision === "apply" && Date.parse(r.at) > dayAgo).length;
  if (recent >= LIMITS.maxPerDay) reasons.push(`@${author} already had ${recent} fixes applied today.`);

  if (reasons.length) return { ...result, action: "needs-review", reasons };
  return {
    ...result,
    action: "apply",
    reasons: [inBrgy ? `Inside Barangay ${brgy.name}, ${town?.name}.` : `Within ${dist.toFixed(1)} km of the current pin.`],
    scope: "property",
  };
}

// Whole-subdivision fix once 2+ different people agree (points within 300 m).
export function subdivisionConsensus(log, p) {
  const key = `${norm(p.subdivision)}|${norm(p.city)}`;
  const pts = new Map(); // latest point per author
  for (const r of log) if (r.decision === "apply" && r.subKey === key && r.wholeSubdivision) pts.set(r.author, r.coords);
  if (pts.size < 2) return null;
  const all = [...pts.values()];
  const c = [median(all.map((x) => x[0])), median(all.map((x) => x[1]))];
  const agree = all.filter((x) => km(x, c) <= LIMITS.agreeKm);
  if (agree.length < 2) return null;
  return { key: `sub:${key}`, coords: [Number(median(agree.map((x) => x[0])).toFixed(6)), Number(median(agree.map((x) => x[1])).toFixed(6))], people: agree.length };
}

// ---------------------------------------------------------------- main
async function main() {
  const event = JSON.parse(await readFile(eventPath, "utf8"));
  const issue = event.issue;
  if (!issue || !(issue.labels ?? []).some((l) => (l.name ?? l) === "wrong-pin")) {
    console.log("Not a wrong-pin report; nothing to do.");
    return;
  }
  if (issue.state === "closed" && event.action !== "labeled") return;
  const labelAdded = event.action === "labeled" ? event.label?.name : null;
  if (event.action === "labeled" && labelAdded !== "approved") return;

  const listings = await loadListings();
  const admin = loadAdminAreas(join(ROOT, "data", "boundaries", "src"));
  const log = await readJson(LOG, []);
  const overrides = await readJson(OVERRIDES, {});

  let accountAgeDays = null;
  if (!dryRun && token && issue.user?.login) {
    const u = await gh("GET", `/users/${issue.user.login}`);
    accountAgeDays = (Date.now() - Date.parse(u.created_at)) / 864e5;
  }

  const d = await decide({ issue, sender: event.sender?.login, labelAdded, listings, admin, log, accountAgeDays });
  console.log(JSON.stringify({ issue: issue.number, action: d.action, reasons: d.reasons }, null, 2));

  const n = issue.number;
  const mapLink = d.coords ? `https://www.openstreetmap.org/?mlat=${d.coords[0]}&mlon=${d.coords[1]}#map=18/${d.coords[0]}/${d.coords[1]}` : "";
  let comment = "";
  let changed = false;

  if (d.action === "apply") {
    overrides[d.p.id] = { coords: d.coords, note: `#${n} by @${d.author}${labelAdded ? `, approved by @${event.sender?.login}` : ""}` };
    log.push({
      issue: n, author: d.author, propertyId: d.p.id, subKey: `${norm(d.p.subdivision)}|${norm(d.p.city)}`,
      wholeSubdivision: !!d.f.wholeSubdivision, coords: d.coords, decision: "apply", at: new Date().toISOString(),
    });
    let subNote = "";
    if (d.f.wholeSubdivision) {
      const c = labelAdded ? { key: `sub:${norm(d.p.subdivision)}|${norm(d.p.city)}`, coords: d.coords, people: 1 } : subdivisionConsensus(log, d.p);
      if (c) {
        overrides[c.key] = { coords: c.coords, note: `${labelAdded ? `#${n}, approved` : `${c.people} matching reports`}, latest #${n}` };
        subNote = `\n\nThe whole of **${d.p.subdivision.trim()}** now uses this location too${labelAdded ? "" : ` (${c.people} people agreed)`}.`;
      } else {
        subNote = `\n\nThis fixes this property now. To move every unit in **${d.p.subdivision.trim()}**, one more person needs to report the same spot (within 300 m).`;
      }
    }
    changed = true;
    comment = `✅ Thanks! The pin for property **${d.p.id}** will move to [${d.coords.join(", ")}](${mapLink}) on the map within the hour.\n\n${d.reasons.join(" ")}${subNote}`;
  } else if (d.action === "needs-review") {
    log.push({ issue: n, author: d.author, propertyId: d.p.id, coords: d.coords, decision: "needs-review", reasons: d.reasons, at: new Date().toISOString() });
    changed = true;
    comment = `🔎 Thanks! This report needs a quick human check before the pin moves (usually within a week):\n\n${d.reasons.map((r) => `- ${r}`).join("\n")}\n\nReported spot: [${d.coords.join(", ")}](${mapLink})`;
  } else if (d.action === "needs-info") {
    comment = `⚠️ ${d.reasons.join(" ")} Please edit the report and fix the **Correct location** field; it'll be checked again automatically.`;
  } else {
    comment = `❌ ${d.reasons.join(" ")} It may have been sold or removed. Closing this report.`;
  }

  if (changed && !dryRun) {
    await writeFile(OVERRIDES, JSON.stringify(overrides, null, 2) + "\n");
    await writeFile(LOG, JSON.stringify(log, null, 2) + "\n");
  }
  if (dryRun) {
    console.log("\n--- would comment ---\n" + comment);
    if (changed) console.log("\n--- would set ---\n" + JSON.stringify(Object.fromEntries(Object.entries(overrides).filter(([k]) => k !== "_help").slice(-3)), null, 2));
    return;
  }

  await gh("POST", `/repos/${repo}/issues/${n}/comments`, { body: comment });
  const label = { apply: "fixed", "needs-review": "needs-review", "needs-info": "needs-info", invalid: "invalid" }[d.action];
  await gh("POST", `/repos/${repo}/issues/${n}/labels`, { labels: [label] });
  if (d.action === "apply" || d.action === "invalid") {
    if (d.action === "apply") await gh("DELETE", `/repos/${repo}/issues/${n}/labels/needs-review`).catch(() => {});
    await gh("PATCH", `/repos/${repo}/issues/${n}`, { state: "closed", state_reason: d.action === "apply" ? "completed" : "not_planned" });
  }
  // Tell the workflow whether to commit and republish.
  if (process.env.GITHUB_OUTPUT) await writeFile(process.env.GITHUB_OUTPUT, `changed=${changed}\naction=${d.action}\n`, { flag: "a" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
