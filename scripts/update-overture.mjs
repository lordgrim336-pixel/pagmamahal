// Downloads the Philippines subset of Overture Maps Places into
// data/overture/ph_places.parquet (about 90 MB). Free, no account needed.
// Overture releases monthly; refreshing every few months is plenty.
//
// Usage: node scripts/update-overture.mjs [--release 2026-11-18.0]
// Release names: https://docs.overturemaps.org/release-calendar/
//
// License: Overture Places is CDLA-Permissive-2.0 (Meta, Microsoft, ...),
// Apache-2.0 (Foursquare) or CC0 (AllThePlaces) per record. Credit
// "© Overture Maps Foundation" and its sources on the map.

import { DuckDBInstance } from "@duckdb/node-api";
import { mkdir, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Newest release unless one is given (Overture keeps only recent releases online).
async function latestRelease() {
  const res = await fetch("https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com/?list-type=2&prefix=release/&delimiter=/");
  const names = [...(await res.text()).matchAll(/<Prefix>release\/([^<]+)\/<\/Prefix>/g)].map((m) => m[1]).sort();
  if (!names.length) throw new Error("Could not list Overture releases");
  return names.at(-1);
}
const i = process.argv.indexOf("--release");
const release = i > 0 ? process.argv[i + 1] : await latestRelease();
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "overture", "ph_places.parquet");
const tmp = out + ".tmp";
await mkdir(dirname(out), { recursive: true });

console.log(`Downloading Overture places ${release} for the Philippines (about a minute)...`);
const db = await DuckDBInstance.create(":memory:");
const c = await db.connect();
await c.run("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';");
await c.run(`COPY (
  SELECT id, names.primary AS name, basic_category, taxonomy.primary AS tprim, confidence,
         sources[1].dataset AS src, addresses[1].locality AS loc, bbox.xmin AS lon, bbox.ymin AS lat
  FROM read_parquet('s3://overturemaps-us-west-2/release/${release}/theme=places/type=place/*', hive_partitioning=1)
  WHERE bbox.xmin BETWEEN 116.9 AND 126.7 AND bbox.ymin BETWEEN 4.5 AND 21.2 AND addresses[1].country = 'PH'
) TO '${tmp.replace(/\\/g, "/")}' (FORMAT PARQUET)`);
const n = await c.runAndReadAll(`SELECT count(*)::INT AS n FROM read_parquet('${tmp.replace(/\\/g, "/")}')`);
await rename(tmp, out);
console.log(`Saved ${n.getRowObjects()[0].n.toLocaleString()} places to ${out}`);
