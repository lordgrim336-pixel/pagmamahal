import { test } from "node:test";
import assert from "node:assert/strict";
import { decideAnonymous, RULES } from "../scripts/process-inbox.mjs";
import { parseForm, parseCoords } from "../scripts/review-report.mjs";
import { barangayOf } from "../scripts/lib/locate.mjs";

// A fake town and barangay: simple squares (longitude/latitude), so the tests
// don't need the real boundary files.
const square = (lng0, lat0, size) => ({
  geom: { type: "Polygon", coordinates: [[[lng0, lat0], [lng0 + size, lat0], [lng0 + size, lat0 + size], [lng0, lat0 + size], [lng0, lat0]]] },
  bbox: [lng0, lat0, lng0 + size, lat0 + size],
});
const town = { name: "Test City", ...square(123.80, 10.20, 0.20) };
const brgy = { name: "Guadalupe", ...square(123.87, 10.30, 0.03) };
const admin = { findTown: () => town, findBarangay: () => brgy };

const prop = (extra = {}) => ({
  id: "864202607150003", city: "CEBU CITY", province: "CEBU", barangay: "GUADALUPE",
  subdivision: "SYMFONI AT NICHOLS", coords: [10.3166, 123.8833], locSource: "overture", ...extra,
});
const ctx = (p, log = []) => ({ byId: new Map([[p.id, p]]), admin, log });
const insideBrgy = [10.3160, 123.8840];

test("a spot inside the property's barangay is applied automatically", () => {
  const d = decideAnonymous({ propertyId: "864202607150003", coords: insideBrgy }, ctx(prop()));
  assert.equal(d.status, "applied");
});

test("a spot outside the barangay waits for review", () => {
  const d = decideAnonymous({ propertyId: "864202607150003", coords: [10.25, 123.85] }, ctx(prop()));
  assert.equal(d.status, "pending");
  assert.match(d.reasons.join(" "), /Outside Barangay/);
});

test("a spot outside the town waits for review", () => {
  const d = decideAnonymous({ propertyId: "864202607150003", coords: [11.0, 124.5] }, ctx(prop()));
  assert.equal(d.status, "pending");
  assert.match(d.reasons.join(" "), /Outside Test City/);
});

test("Pag-IBIG GPS pins are never changed automatically", () => {
  const d = decideAnonymous({ propertyId: "864202607150003", coords: insideBrgy }, ctx(prop({ locSource: "pagibig-gps" })));
  assert.equal(d.status, "pending");
});

test("whole-building requests always go to review", () => {
  const d = decideAnonymous({ propertyId: "864202607150003", coords: insideBrgy, wholeSubdivision: true }, ctx(prop()));
  assert.equal(d.status, "pending");
});

test("a property fixed in the last 30 days goes to review", () => {
  const log = [{ propertyId: "864202607150003", status: "applied", at: new Date().toISOString() }];
  const d = decideAnonymous({ propertyId: "864202607150003", coords: insideBrgy }, ctx(prop(), log));
  assert.equal(d.status, "pending");
});

test("the daily limit of automatic fixes is enforced", () => {
  const today = new Date().toISOString();
  const log = Array.from({ length: RULES.maxAutoPerDay }, (_, i) => ({ propertyId: `x${i}`, source: "app", status: "applied", at: today }));
  const d = decideAnonymous({ propertyId: "864202607150003", coords: insideBrgy }, ctx(prop(), log));
  assert.equal(d.status, "pending");
});

test("unknown properties and impossible locations are rejected", () => {
  assert.equal(decideAnonymous({ propertyId: "123", coords: insideBrgy }, ctx(prop())).status, "invalid");
  assert.equal(decideAnonymous({ propertyId: "864202607150003", coords: [40, -73] }, ctx(prop())).status, "invalid");
  assert.equal(decideAnonymous({ propertyId: "864202607150003", coords: ["x", 5] }, ctx(prop())).status, "invalid");
});

test("a repeat of a pending report is marked duplicate", () => {
  const log = [{ propertyId: "864202607150003", status: "pending", coords: [10.25, 123.85] }];
  const d = decideAnonymous({ propertyId: "864202607150003", coords: [10.2501, 123.8501] }, ctx(prop(), log));
  assert.equal(d.status, "duplicate");
});

test("GitHub report form fields are read correctly", () => {
  const body = "### Property ID\n\n864202607150003\n\n### Correct location (latitude, longitude)\n\n10.31602, 123.884175\n\n" +
    "### Does this fix only this unit, or the whole building or subdivision?\n\nThe whole building / subdivision\n\n### Anything else? (optional)\n\n_No response_";
  const f = parseForm(body);
  assert.equal(f.propertyId, "864202607150003");
  assert.equal(f.wholeSubdivision, true);
  assert.deepEqual(parseCoords(f.location), [10.31602, 123.884175]);
});

test("locations are read from OpenStreetMap links and rejected outside the Philippines", () => {
  assert.deepEqual(parseCoords("https://www.openstreetmap.org/?mlat=10.3162&mlon=123.8845#map=18/10.3162/123.8845"), [10.3162, 123.8845]);
  assert.equal(parseCoords("near the 7-eleven"), null);
  assert.equal(parseCoords("40.7128, -74.0060"), null);
});

test("the barangay is read from Pag-IBIG addresses", () => {
  const p = (address, subdivision, city) => ({ address, subdivision, city });
  assert.equal(barangayOf(p("Unit 35 9th Flr. TOWER 01 SYMFONI AT NICHOLS GUADALUPE, CEBU CITY, CEBU, 6000", "SYMFONI AT NICHOLS", "CEBU CITY")), "GUADALUPE");
  assert.equal(barangayOf(p("Lot 32 Blk. 26 EMPRESA HOMES, MARIVELES CABCABEN, MARIVELES, BATAAN, 2105", "EMPRESA HOMES, MARIVELES", "MARIVELES")), "CABCABEN");
  assert.equal(barangayOf(p("Lot 15 Blk. 41 FIESTA-HANJIN VILLAGE N/A, CASTILLEJOS, ZAMBALES, 0000", "FIESTA-HANJIN VILLAGE", "CASTILLEJOS")), null);
});
