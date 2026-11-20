// Philippine town (municipality/city) and barangay boundaries, used to
//  - check that a found location really lies in the town/barangay of the address
//  - place a pin inside the right barangay when nothing more precise is known.
// Data: faeldon/philippines-json-maps v1.1.1 (PSGC 3Q 2026), medium resolution,
// derived from OCHA COD-AB (NAMRIA, PSA). License CC BY-IGO: credit
// "Boundaries: NAMRIA, PSA, OCHA (via faeldon/philippines-json-maps)".

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const norm = (s) =>
  String(s ?? "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\(NOT A PROVINCE\)/g, "")
    .replace(/[^A-Z0-9()]+/g, " ")
    .trim();

// "CITY OF GENERAL TRIAS" / "General Trias City" / "LAPU-LAPU CITY (OPON)" -> "GENERAL TRIAS" / "LAPU LAPU"
const townKey = (s) =>
  norm(s)
    .replace(/\([^)]*\)/g, " ")
    .replace(/\bCITY OF\b|\bCITY\b|\bMUNICIPALITY OF\b/g, " ")
    .replace(/\bSTO\b/g, "SANTO")
    .replace(/\bSTA\b/g, "SANTA")
    .replace(/\s+/g, " ")
    .trim();

const provKey = (s) => norm(s).replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();

// Barangay names: "POBLACION I", "MALAGASANG II-A", "PEREZ (LUCBANAN)", "BRGY. 12"
const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
const brgyKeys = (s) => {
  const n = norm(s)
    .replace(/\b(BARANGAY|BRGY|BGY)\b/g, " ")
    .replace(/\b([1-9]|10)\b/g, (d) => ROMAN[Number(d)]) // "ALAPAN 2 -C" -> "ALAPAN II C"
    .replace(/\s+/g, " ");
  const main = n.replace(/\([^)]*\)/g, " ").replace(/\bPOB\b/g, "POBLACION").replace(/\s+/g, " ").trim();
  const alias = [...n.matchAll(/\(([^)]*)\)/g)].map((m) => m[1].trim()).filter(Boolean);
  return [main, ...alias];
};

function bboxOf(geom) {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  for (const poly of polys)
    for (const [x, y] of poly[0]) {
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  return [x0, y0, x1, y1];
}

function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Is [lat, lng] inside the area? `toleranceKm` also accepts points just outside the edge. */
export function contains(area, [lat, lng], toleranceKm = 0) {
  const test = (la, ln) => {
    const [x0, y0, x1, y1] = area.bbox;
    if (ln < x0 || ln > x1 || la < y0 || la > y1) return false;
    const polys = area.geom.type === "Polygon" ? [area.geom.coordinates] : area.geom.coordinates;
    return polys.some((poly) => inRing(ln, la, poly[0]) && !poly.slice(1).some((h) => inRing(ln, la, h)));
  };
  if (test(lat, lng)) return true;
  if (!toleranceKm) return false;
  const d = toleranceKm / 111;
  for (let a = 0; a < 360; a += 45) {
    const r = (a * Math.PI) / 180;
    if (test(lat + Math.sin(r) * d, lng + (Math.cos(r) * d) / Math.cos((lat * Math.PI) / 180))) return true;
  }
  return false;
}

/** A point guaranteed to be inside the area, near its middle. */
export function interiorPoint(area) {
  const polys = area.geom.type === "Polygon" ? [area.geom.coordinates] : area.geom.coordinates;
  // Use the largest polygon part.
  const ringArea = (r) => Math.abs(r.reduce((s, [x, y], i) => s + x * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * y, 0) / 2);
  const poly = polys.reduce((a, b) => (ringArea(b[0]) > ringArea(a[0]) ? b : a));
  const ring = poly[0];
  let cx = 0;
  let cy = 0;
  for (const [x, y] of ring) {
    cx += x;
    cy += y;
  }
  cx /= ring.length;
  cy /= ring.length;
  const part = { geom: { type: "Polygon", coordinates: poly }, bbox: bboxOf({ type: "Polygon", coordinates: poly }) };
  if (contains(part, [cy, cx])) return [cy, cx];
  // Otherwise: midpoint of the widest inside stretch along a few horizontal lines.
  const [x0, y0, x1, y1] = part.bbox;
  let best = null;
  for (let k = 1; k < 10; k++) {
    const y = y0 + ((y1 - y0) * k) / 10;
    const xs = [];
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y) xs.push(((xj - xi) * (y - yi)) / (yj - yi) + xi);
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const w = xs[i + 1] - xs[i];
      if (!best || w > best.w) best = { w, pt: [y, (xs[i] + xs[i + 1]) / 2] };
    }
  }
  return best ? best.pt : [(y0 + y1) / 2, (x0 + x1) / 2];
}

export function loadAdminAreas(dir) {
  const base = join(dir, "medres", "geojson");
  if (!existsSync(base)) throw new Error(`Boundary data not found in ${base}. See README for the download step.`);
  const read = (p) => JSON.parse(readFileSync(p, "utf8"));

  const provName = new Map();
  for (const f of readdirSync(join(base, "regions", "medres")).filter((f) => f.startsWith("provdists-region")))
    for (const ft of read(join(base, "regions", "medres", f)).features)
      provName.set(ft.properties.adm2_psgc, ft.properties.adm2_en);

  const towns = [];
  for (const f of readdirSync(join(base, "provdists", "medres")))
    for (const ft of read(join(base, "provdists", "medres", f)).features) {
      if (!ft.geometry) continue;
      const p = ft.properties;
      const prov = provName.get(p.adm2_psgc) ?? "";
      towns.push({
        code: p.adm3_psgc,
        name: p.adm3_en,
        province: prov,
        key: townKey(p.adm3_en),
        provKey: provKey(prov),
        geom: ft.geometry,
        bbox: bboxOf(ft.geometry),
      });
    }

  const brgyCache = new Map();
  function barangaysOf(town) {
    if (!brgyCache.has(town.code)) {
      const file = join(base, "municities", "medres", `bgysubmuns-municity-${town.code}.0.01.json`);
      const list = existsSync(file)
        ? read(file)
            .features.filter((ft) => ft.geometry)
            .map((ft) => ({
              code: ft.properties.adm4_psgc,
              name: ft.properties.adm4_en,
              keys: brgyKeys(ft.properties.adm4_en),
              geom: ft.geometry,
              bbox: bboxOf(ft.geometry),
            }))
        : [];
      brgyCache.set(town.code, list);
    }
    return brgyCache.get(town.code);
  }

  const townCache = new Map();
  /** Town polygon for Pag-IBIG's city + province names (null if not found). */
  function findTown(city, province) {
    const ck = `${city}|${province}`;
    if (townCache.has(ck)) return townCache.get(ck);
    const tk = townKey(city);
    let pk = provKey(province);
    // Pag-IBIG still writes "MAGUINDANAO"; it is now del Norte / del Sur.
    const inProv = (t) => t.provKey === pk || t.provKey.startsWith(pk + " ");
    let hit =
      towns.find((t) => inProv(t) && t.key === tk) ||
      towns.find((t) => inProv(t) && (t.key.startsWith(tk + " ") || tk.startsWith(t.key + " ")));
    // Manila districts (Tondo, Sampaloc, Malate...) are listed as towns by Pag-IBIG.
    if (!hit && /CITY OF MANILA/.test(pk)) hit = towns.find((t) => t.key === "MANILA");
    townCache.set(ck, hit ?? null);
    return hit ?? null;
  }

  /** Barangay polygon by name within a town (null if not found). */
  function findBarangay(town, barangay) {
    if (!town || !barangay) return null;
    const want = brgyKeys(barangay);
    const list = barangaysOf(town);
    return (
      list.find((b) => b.keys[0] === want[0]) ||
      list.find((b) => want.some((w) => b.keys.includes(w))) ||
      list.find((b) => b.keys[0].replace(/\s/g, "") === want[0].replace(/\s/g, "")) ||
      null
    );
  }

  return { towns, findTown, findBarangay, barangaysOf };
}
