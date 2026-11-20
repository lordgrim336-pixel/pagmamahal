import { test } from "node:test";
import assert from "node:assert/strict";
import * as util from "../public/js/util.js";
const { pesoShort, bidStatus, typeGroup, isOccupied, esc, title, phTime } = util;

test("short prices for map tags", () => {
  assert.equal(pesoShort(302_400), "₱302K");
  assert.equal(pesoShort(999_600), "₱1M"); // not "₱1000K"
  assert.equal(pesoShort(1_270_000), "₱1.27M");
  assert.equal(pesoShort(2_000_000), "₱2M");
  assert.equal(pesoShort(2_500_000), "₱2.5M");
  assert.equal(pesoShort(10_000_000), "₱10M"); // not "₱1M"
  assert.equal(pesoShort(12_400_000), "₱12M");
  assert.equal(pesoShort(null), "—");
});

test("bidding status and countdown (Philippine time)", () => {
  const p = { bidStart: "2026-11-23 08:00:00", bidEnd: "2026-11-27 17:00:00" };
  assert.equal(bidStatus(p, phTime("2026-11-20 12:00:00")).label, "Opens Nov 23");
  assert.equal(bidStatus(p, phTime("2026-11-23 09:00:00")).label, "Closes in 4 days");
  assert.equal(bidStatus(p, phTime("2026-11-26 09:00:00")).label, "Closes tomorrow");
  assert.equal(bidStatus(p, phTime("2026-11-27 09:00:00")).label, "Closes today");
  assert.equal(bidStatus(p, phTime("2026-11-27 09:00:00")).cls, "urgent");
  assert.equal(bidStatus(p, phTime("2026-11-28 09:00:00")).key, "closed");
  assert.equal(bidStatus({}, new Date()).key, "none");
});

test("property types group into simple filters", () => {
  assert.equal(typeGroup("SINGLE ATTACHED"), "house");
  assert.equal(typeGroup("DUPLEX WITH EAVES"), "house");
  assert.equal(typeGroup("TOWNHOUSE"), "town");
  assert.equal(typeGroup("ROW HOUSE"), "town");
  assert.equal(typeGroup("CONDOMINIUM"), "condo");
  assert.equal(typeGroup("CONDOMINIUM - PARKING SLOT"), "other");
  assert.equal(typeGroup("LOT ONLY"), "lot");
  assert.equal(typeGroup(undefined), "other");
});

test("occupancy and text helpers", () => {
  assert.equal(isOccupied({ occupancy: "Occupied by informal settler" }), true);
  assert.equal(isOccupied({ occupancy: "Unoccupied" }), false);
  assert.equal(esc(`<img src=x onerror="a">`), "&lt;img src=x onerror=&quot;a&quot;&gt;");
  assert.equal(title("CITY OF GENERAL TRIAS"), "City of General Trias");
});

test("photo addresses are rebuilt from file names", () => {
  const { photoUrls } = util;
  assert.deepEqual(photoUrls({ id: "807620070700004", photos: ["FIL1.jpg", "https://example.org/x.jpg"] }), [
    "https://aaonline.pagibigfund.gov.ph/HdmfGallery/opa/807620070700004/FIL1.jpg",
    "https://example.org/x.jpg",
  ]);
  assert.deepEqual(photoUrls({ id: "1" }), []);
});
