// Downloads Philippine town and barangay boundaries (PSGC) into
// data/boundaries/src/medres. Source: github.com/faeldon/philippines-json-maps
// (medium resolution, ~14 MB zip). Checks the file against the published SHA-256.
// Boundaries change only a few times a year (new barangays, transfers).
//
// License: code MIT; boundary data CC BY-IGO from OCHA COD-AB (NAMRIA, PSA).
//
// Usage: node scripts/update-boundaries.mjs

import { createHash } from "node:crypto";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "boundaries", "src");
const ASSET = "geojson-medres.zip";
const headers = { "User-Agent": "pagmamahal-property-map" };

const rel = await (await fetch("https://api.github.com/repos/faeldon/philippines-json-maps/releases/latest", { headers })).json();
const asset = rel.assets?.find((a) => a.name === ASSET);
const sums = rel.assets?.find((a) => a.name === "SHA256SUMS");
if (!asset || !sums) throw new Error("Release files not found");
console.log(`Boundaries release ${rel.tag_name} (${rel.published_at.slice(0, 10)})`);

const zip = Buffer.from(await (await fetch(asset.browser_download_url, { headers })).arrayBuffer());
const expected = (await (await fetch(sums.browser_download_url, { headers })).text())
  .split("\n")
  .find((l) => l.includes(ASSET))
  ?.split(/\s+/)[0];
const actual = createHash("sha256").update(zip).digest("hex");
if (!expected || expected !== actual) throw new Error(`Checksum mismatch for ${ASSET}`);

await mkdir(dir, { recursive: true });
const zipPath = join(dir, ASSET);
await writeFile(zipPath, zip);
await rm(join(dir, "medres"), { recursive: true, force: true });
try {
  execFileSync("unzip", ["-q", "-o", zipPath, "-d", join(dir, "medres")], { stdio: "inherit" });
} catch {
  await mkdir(join(dir, "medres"), { recursive: true });
  execFileSync("tar", ["-xf", zipPath, "-C", join(dir, "medres")], { stdio: "inherit" }); // Windows 10+/macOS
}
await writeFile(join(dir, "VERSION.txt"), `${rel.tag_name}\n`);
console.log(`Saved to ${join(dir, "medres")}`);
