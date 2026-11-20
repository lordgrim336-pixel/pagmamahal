// Finds a subdivision/condo by name in the Overture Places extract
// (data/overture/ph_places.parquet). Overture data: CDLA-Permissive-2.0 /
// Apache-2.0 / CC0 by source; attribution "© Overture Maps Foundation" + sources.

import { DuckDBInstance } from "@duckdb/node-api";

// Words that don't identify a development by themselves.
const GENERIC = new Set(
  ("SUBDIVISION SUBD SUBDV SUBDIV VILLAGE VILL HOMES HOME HOUSE ESTATES ESTATE RESIDENCES RESIDENCE RESIDENCIA " +
    "TOWER TOWERS BLDG BUILDING PHASE PH CONDOMINIUM CONDOMINIUMS CONDO CONDOS THE AT OF AND DE DEL LA LAS LOS " +
    "SOCIALIZED ECONOMIC HOUSING PROJECT COMPLEX COMMUNITY COMMUNITIES PARK PLACE CITY OFFICIAL INC CORP").split(" "),
);
const ROMAN = /^(I|II|III|IV|V|VI|VII|VIII|IX|X|[0-9]+[A-Z]?)$/;
// Names that are usually an agent's page, not the development itself.
const AGENTISH =
  /\b(FOR SALE|FOR RENT|RENT|RENTAL|AGENT|REALTY|REALTOR|BROKER|SELLER|SALES|STAYCATION|TRANSIENT|PAD|AIRBNB|CONDOTEL|ROOM|ROOMS|BED|SPACE|UNIT FOR|LOTS FOR|HOUSE AND LOT|PRE-?SELLING|MODEL HOUSE|BY [A-Z]+)\b/;

// Evidence a place is housing (or inside a housing development).
const HOUSING_WORD =
  /\b(SUBD|SUBDV|SUBDIVISION|HOMES|VILLAGE|VILL|RESIDENCES?|RESIDENCIA|ESTATES?|VILLAS?|CONDO|CONDOMINIUMS?|TOWERS?|HEIGHTS|PHASE|HOA|HOMEOWNERS?|TOWNHOMES?|TOWNHOUSES?|COMMUNITIES|PARKHOMES)\b/;
const HOUSING_CAT = new Set([
  "home_developer", "real_estate_service", "condominium", "apartment", "residential", "housing",
  "homeowner_association", "real_estate_developer", "community_and_government", "basketball_court", "park",
]);
const housingEvidence = (pl) => HOUSING_WORD.test(pl.name.toUpperCase()) || HOUSING_CAT.has(pl.cat);

export const tokens = (s) =>
  String(s ?? "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

export const distinctive = (s) => tokens(s).filter((t) => !GENERIC.has(t) && !ROMAN.test(t) && t.length > 1);

export function km([a, b], [c, d]) {
  const r = Math.PI / 180;
  return Math.hypot((d - b) * r * Math.cos(((a + c) / 2) * r), (c - a) * r) * 6371;
}
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export async function loadOverture(parquetPath) {
  const db = await DuckDBInstance.create(":memory:");
  const c = await db.connect();
  const p = parquetPath.replace(/\\/g, "/").replace(/'/g, "''");
  const res = await c.runAndReadAll(
    `SELECT name, tprim, src, lat, lon FROM read_parquet('${p}') WHERE name IS NOT NULL`,
  );
  const rows = res.getRowObjects();
  const places = rows.map((r) => ({ name: r.name, cat: r.tprim, src: r.src, lat: Number(r.lat), lon: Number(r.lon) }));
  // Inverted index: distinctive token -> place indexes.
  const index = new Map();
  places.forEach((pl, i) => {
    pl.tok = new Set(tokens(pl.name));
    for (const t of pl.tok) {
      if (GENERIC.has(t) || t.length < 3) continue;
      (index.get(t) || index.set(t, []).get(t)).push(i);
    }
  });
  return { places, index };
}

/**
 * Best Overture location for a subdivision name near an anchor point (town
 * center). Returns { coords, n, names } or null.
 */
export function matchSubdivision(ov, subdivision, anchor, { maxKm = 12, clusterKm = 1, within = null, prefer = null, townName = "" } = {}) {
  // The town's own name isn't distinctive ("XEVERA BACOLOR" in Bacolor), unless it's all there is.
  const townTok = new Set(tokens(townName));
  let want = [...new Set(distinctive(subdivision))];
  if (want.some((t) => !townTok.has(t))) want = want.filter((t) => !townTok.has(t));
  else if (townTok.size) return null; // name is just the town's name: too vague
  if (!want.length || !anchor) return null;
  // Rarest token first keeps the candidate list small.
  const lists = want.map((t) => ov.index.get(t) || []);
  if (lists.some((l) => !l.length)) return null;
  lists.sort((a, b) => a.length - b.length);
  const cands = [];
  for (const i of lists[0]) {
    const pl = ov.places[i];
    if (!want.every((t) => pl.tok.has(t))) continue;
    if (AGENTISH.test(pl.name.toUpperCase())) continue;
    // One-word names ("Dream", "Prime", "Acacia") match too much: require housing evidence.
    if (want.length === 1 && !housingEvidence(pl)) continue;
    const pt = [pl.lat, pl.lon];
    if (km(pt, anchor) > maxKm) continue;
    if (within && !within(pt)) continue; // must lie in the town named in the address
    cands.push({ pl, pt });
  }
  if (!cands.length) return null;

  // Prefer matches inside the barangay named in the address. Matches elsewhere
  // in the town are used only when at least two agree.
  let strict = false;
  if (prefer) {
    const inside = cands.filter((c) => prefer(c.pt));
    if (inside.length) cands.splice(0, cands.length, ...inside);
    else strict = true;
  }

  // Densest cluster: the candidate with the most neighbors within clusterKm.
  let best = null;
  for (const a of cands) {
    const group = cands.filter((b) => km(a.pt, b.pt) <= clusterKm);
    if (!best || group.length > best.length) best = group;
  }
  // Two candidates that disagree, with no cluster: too ambiguous.
  if (best.length === 1 && cands.length > 1) return null;
  // A lone match counts only if it looks like housing.
  if (best.length === 1 && !housingEvidence(best[0].pl)) return null;
  if (strict && best.length < 2) return null;
  return {
    inBarangay: !!prefer && !strict,
    coords: [median(best.map((g) => g.pt[0])), median(best.map((g) => g.pt[1]))],
    n: best.length,
    names: best.slice(0, 3).map((g) => g.pl.name),
  };
}
