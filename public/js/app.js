import { LOAN_RULES, calculate } from "./loan-rules.js";
import { REPORT } from "./config.js";

const OPA_URL = "https://www.pagibigfundservices.com/OnlinePublicAuction/";
const PAGE_SIZE = 60;

const $ = (s, el = document) => el.querySelector(s);
const peso = (n, digits = 0) =>
  n == null || Number.isNaN(n)
    ? "—"
    : "₱" + Number(n).toLocaleString("en-PH", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const SMALL_WORDS = new Set(["of", "and", "in", "de", "del", "la", "ng", "sa"]);
const title = (s) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/\b([a-z])([a-z]*)/g, (w, a, rest, i) => (i > 0 && SMALL_WORDS.has(w) ? w : a.toUpperCase() + rest));
const area = (v) => (v ? `${v} m²` : "—");

// Pag-IBIG times are Philippine time (UTC+8) without an offset.
const phTime = (s) => (s ? new Date(s.length <= 19 ? s + "+08:00" : s) : null);
const fmtDate = (d) =>
  d ? d.toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" }) : "—";

function bidStatus(p, now = new Date()) {
  const start = phTime(p.bidStart);
  const end = phTime(p.bidEnd);
  if (start && now < start) return { cls: "soon", label: `Bidding opens ${fmtDate(start).split(",").slice(0, 2).join(",")}` };
  if (end && now > end) return { cls: "closed", label: "Bidding closed" };
  if (start && end) return { cls: "open", label: `Open until ${fmtDate(end)}` };
  return { cls: "", label: "Dates not posted" };
}

// ---------------------------------------------------------------- state
const state = { all: [], filtered: [], shown: PAGE_SIZE, byId: new Map() };

// ---------------------------------------------------------------- views
const layout = $(".layout");
function setView(view) {
  layout.dataset.view = view;
  document.querySelectorAll(".tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.view === view)));
  if (view !== "calc") setTimeout(() => map.invalidateSize(), 50);
  history.replaceState(null, "", view === "map" ? location.pathname : `#${view}`);
}
document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));

// ---------------------------------------------------------------- map
const map = L.map("map", { zoomControl: true, preferCanvas: false }).setView([12.5, 122], 6);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · ' +
    '<a href="https://docs.overturemaps.org/attribution/" title="Overture Maps Foundation; data from Meta, Microsoft, Foursquare and others">© Overture Maps</a> · ' +
    '<span title="Barangay boundaries: NAMRIA, PSA, OCHA (CC BY-IGO)">NAMRIA/PSA/OCHA</span>',
}).addTo(map);
const cluster = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 50, chunkedLoading: true });
map.addLayer(cluster);
const markers = new Map();

const pinIcon = (approx) =>
  L.divIcon({ className: "", html: `<div class="pin ${approx ? "approx" : "exact"}"></div>`, iconSize: [18, 18], iconAnchor: [9, 9] });

// Approximate pins share one point per subdivision/town, so spread them a little.
function jitter([lat, lng], id, approx) {
  if (!approx) return [lat, lng];
  let h = 0;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const r = { city: 0.006, barangay: 0.0025 }[approx] ?? 0.0012;
  const a = (h % 360) * (Math.PI / 180);
  const d = r * (0.3 + ((h >> 9) % 70) / 100);
  return [lat + Math.sin(a) * d, lng + Math.cos(a) * d];
}

function popupHtml(p) {
  return `<div class="popup">
    <b>${peso(p.minPrice)}</b> <span class="muted">minimum bid</span><br>
    ${esc(title(p.type))} · ${esc(title(p.city))}<br>
    <span class="muted small">${esc(p.saleType)}</span><br>
    <button class="btn primary" data-open="${esc(p.id)}">View details</button>
  </div>`;
}

function renderMarkers() {
  cluster.clearLayers();
  markers.clear();
  const layers = [];
  for (const p of state.filtered) {
    if (!p.coords) continue;
    const m = L.marker(jitter(p.coords, p.id, p.approx), { icon: pinIcon(p.approx), title: `${p.type} ${p.city}` });
    m.bindPopup(() => popupHtml(p));
    markers.set(p.id, m);
    layers.push(m);
  }
  cluster.addLayers(layers);
}

map.on("popupopen", (e) => {
  const btn = e.popup.getElement()?.querySelector("[data-open]");
  btn?.addEventListener("click", () => openDetail(btn.dataset.open));
  const p = btn && state.byId.get(btn.dataset.open);
  if (p) showAccuracy(p);
});

// ---------------------------------------------------------------- list
const results = $("#results");
function cardHtml(p) {
  const st = bidStatus(p);
  const sizes = [p.floorArea ? `${p.floorArea} m² floor` : "", p.lotArea ? `${p.lotArea} m² lot` : ""].filter(Boolean).join(" · ");
  return `<li><button class="card" data-open="${esc(p.id)}">
    <div class="top"><span class="price">${peso(p.minPrice)} <small>min. bid</small></span><span class="tag">${esc(p.saleType?.replace(" Public Auction", " auction"))}</span></div>
    <div><strong>${esc(title(p.type))}</strong>${sizes ? ` · <span class="muted">${sizes}</span>` : ""}</div>
    <div class="addr">${esc(title(p.address))}</div>
    <div class="meta">
      <span class="tag ${st.cls}">${esc(st.label)}</span>
      <span class="tag">${esc(p.occupancy || "Occupancy n/a")}</span>
      ${p.approx ? `<span class="tag">≈ ${precisionOf(p).short} location</span>` : ""}
    </div>
  </button></li>`;
}

function renderList() {
  const items = state.filtered.slice(0, state.shown);
  results.innerHTML =
    items.map(cardHtml).join("") +
    (state.filtered.length > state.shown
      ? `<li class="more"><button class="btn" id="moreBtn">Show more (${state.filtered.length - state.shown} left)</button></li>`
      : "") +
    (state.filtered.length === 0 ? `<li class="more muted">No properties match these filters.</li>` : "");
  $("#moreBtn")?.addEventListener("click", () => {
    state.shown += PAGE_SIZE;
    renderList();
  });
}
results.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-open]");
  if (btn) openDetail(btn.dataset.open, { fly: true });
});

// ---------------------------------------------------------------- filters
const f = {
  q: $("#q"), region: $("#region"), province: $("#province"), city: $("#city"), type: $("#type"), occ: $("#occ"), maxPrice: $("#maxPrice"), openNow: $("#openNow"), sort: $("#sort"),
  sale: () => [...document.querySelectorAll("#saleChips input:checked")].map((i) => Number(i.value)),
};

function applyFilters({ refit = false } = {}) {
  const q = f.q.value.trim().toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);
  const sale = new Set(f.sale());
  const maxPrice = Number(f.maxPrice.value) || Infinity;
  const now = new Date();

  state.filtered = state.all.filter((p) => {
    if (f.region.value && p.region !== f.region.value) return false;
    if (f.province.value && p.province !== f.province.value) return false;
    if (f.city.value && p.city !== f.city.value) return false;
    if (!sale.has(p.saleFlag)) return false;
    if (f.type.value && p.type !== f.type.value) return false;
    if (f.occ.value && p.occupancy !== f.occ.value) return false;
    if ((p.minPrice ?? 0) > maxPrice) return false;
    if (f.openNow.checked && bidStatus(p, now).cls !== "open") return false;
    if (words.length) {
      const hay = p._hay;
      if (!words.every((w) => hay.includes(w))) return false;
    }
    return true;
  });

  const s = f.sort.value;
  const end = (p) => phTime(p.bidEnd)?.getTime() ?? Infinity;
  const cmp = {
    price: (a, b) => (a.minPrice ?? 0) - (b.minPrice ?? 0),
    "-price": (a, b) => (b.minPrice ?? 0) - (a.minPrice ?? 0),
    end: (a, b) => end(a) - end(b),
    area: (a, b) => (b.floorArea ?? 0) - (a.floorArea ?? 0),
  }[s];
  state.filtered.sort(cmp);
  state.shown = PAGE_SIZE;

  $("#count").textContent = `${state.filtered.length.toLocaleString()} of ${state.all.length.toLocaleString()}`;
  renderList();
  renderMarkers();
  if (refit && markers.size) map.fitBounds(cluster.getBounds(), { padding: [30, 30], maxZoom: 14 });
}

// ---------------------------------------------------------------- location dropdowns
// Region → Province → City. Each level is optional: pick only a region, or a
// region and province, and the list/map narrow to that area.

// "REGION 4-A (CALABARZON)" → "Region 4-A (CALABARZON)"; "REGION 1 (ILOCOS REGION)" → "Region 1 (Ilocos Region)"
const regionLabel = (r) =>
  r.replace(/^([^(]*)(\((.*)\))?/, (_, head, _p, inner) =>
    title(head) + (inner ? `(${/\s/.test(inner) ? title(inner) : inner})` : ""),
  );
// Pag-IBIG's own order: NCR, CAR, Region 1 … 13, then BARMM/ARMM.
const regionOrder = (r) => {
  if (/NCR|NATIONAL CAPITAL/.test(r)) return 0;
  if (/CORDILLERA|\(CAR\)/.test(r)) return 0.5;
  const m = r.match(/REGION\s+(\d+)(?:-([AB]))?/);
  if (m) return Number(m[1]) + (m[2] === "A" ? 0.1 : m[2] === "B" ? 0.2 : 0);
  return 99;
};

function countBy(items, key) {
  const m = new Map();
  for (const p of items) if (p[key]) m.set(p[key], (m.get(p[key]) || 0) + 1);
  return m;
}

function fillSelect(sel, allLabel, counts, { label = title, order } = {}) {
  const names = [...counts.keys()].sort(order ? (a, b) => order(a) - order(b) || a.localeCompare(b) : (a, b) => a.localeCompare(b));
  sel.innerHTML =
    `<option value="">${allLabel}</option>` +
    names.map((n) => `<option value="${esc(n)}">${esc(label(n))} (${counts.get(n).toLocaleString()})</option>`).join("");
}

function resetSelect(sel, allLabel) {
  sel.innerHTML = `<option value="">${allLabel}</option>`;
  sel.disabled = true;
}

function fillRegions() {
  fillSelect(f.region, "All regions", countBy(state.all, "region"), { label: regionLabel, order: regionOrder });
}

f.region.addEventListener("change", () => {
  resetSelect(f.city, "All cities");
  if (!f.region.value) return resetSelect(f.province, "All provinces");
  fillSelect(f.province, "All provinces", countBy(state.all.filter((p) => p.region === f.region.value), "province"));
  f.province.disabled = false;
});

f.province.addEventListener("change", () => {
  if (!f.province.value) return resetSelect(f.city, "All cities");
  fillSelect(
    f.city,
    "All cities",
    countBy(state.all.filter((p) => p.region === f.region.value && p.province === f.province.value), "city"),
  );
  f.city.disabled = false;
});

let debounce;
f.q.addEventListener("input", () => {
  clearTimeout(debounce);
  debounce = setTimeout(() => applyFilters({ refit: true }), 200);
});
$("#filters").addEventListener("change", (e) => applyFilters({ refit: e.target !== f.sort }));
$("#filters").addEventListener("submit", (e) => e.preventDefault());

// ---------------------------------------------------------------- detail
const sheet = $("#sheet");
const sheetBody = $("#sheetBody");
function closeSheet() {
  sheet.hidden = true; // the accuracy circle stays, so the area is visible on the map
}
$("#sheetClose").addEventListener("click", closeSheet);
sheet.addEventListener("click", (e) => e.target === sheet && closeSheet());
document.addEventListener("keydown", (e) => e.key === "Escape" && closeSheet());

// How precise each pin is, from scripts/eval-locations.mjs (75% of pins fall
// within this distance of the true location).
function precisionOf(p) {
  if (!p.approx) {
    return p.locSource === "verified"
      ? { km: 0, short: "verified", text: "This location was checked and corrected by hand." }
      : { km: 0, short: "exact", text: "" };
  }
  const sub = esc(title(p.subdivision));
  return {
    nearby: { km: 0.3, short: "subdivision", text: `placed using the GPS of other Pag-IBIG listings in ${sub}, so it should be inside the subdivision` },
    subdivision:
      p.locSource === "overture"
        ? { km: 0.45, short: "subdivision", text: `placed at ${sub} as listed in Overture Maps (map data from Meta, Microsoft and others). It is usually within about 0.5 km` }
        : { km: 0.3, short: "subdivision", text: `placed at ${sub} as found on OpenStreetMap. It is usually within about 0.3 km` },
    barangay: { km: 1.4, short: "barangay", text: `placed inside Barangay ${esc(title(p.barangay))} because the subdivision couldn't be found. It could be off by 1–2 km` },
    city: { km: 5.8, short: "town", text: `placed at the center of ${esc(title(p.city))} because neither the subdivision nor the barangay could be found. It may be several kilometers off` },
  }[p.approx];
}

// Shaded circle showing where an approximate property could be.
let accuracyCircle = null;
function showAccuracy(p) {
  hideAccuracy();
  const pr = precisionOf(p);
  if (!pr?.km || !p.coords) return;
  accuracyCircle = L.circle(p.coords, {
    radius: pr.km * 1000,
    color: getComputedStyle(document.documentElement).getPropertyValue("--approx").trim() || "#d9622b",
    weight: 1,
    fillOpacity: 0.12,
    interactive: false,
  }).addTo(map);
}
function hideAccuracy() {
  accuracyCircle?.remove();
  accuracyCircle = null;
}
map.on("popupclose", hideAccuracy);

function openDetail(id, { fly = false } = {}) {
  const p = state.byId.get(id);
  if (!p) return;
  map.closePopup();
  const st = bidStatus(p);
  const pr = precisionOf(p);
  // For approximate pins, Google Maps' own search of the full address is often
  // more precise than our pin (opening a link is free and needs no API).
  const gmaps = p.coords && !p.approx
    ? `https://www.google.com/maps?q=${p.coords[0]},${p.coords[1]}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(title(p.address))}`;
  const gpsNote = p.gpsRejected ? " Pag-IBIG's GPS reading for it pointed outside the town, so it wasn't used." : "";
  const approxNote = p.approx
    ? `<div class="note">📍 <b>Approximate location.</b> Pag-IBIG didn't post a usable GPS reading for this property.${gpsNote} The pin is ${pr.text}.
        <div class="actions"><a class="btn primary" href="${gmaps}" target="_blank" rel="noopener">See address on Google Maps ↗</a></div></div>`
    : p.locSource === "verified"
      ? `<div class="note">✅ ${pr.text}</div>`
      : "";
  sheetBody.innerHTML = `<div class="detail">
    <h2 id="sheetTitle">${esc(title(p.type))} in ${esc(title(p.city))}</h2>
    <p class="muted">${esc(title(p.address))}</p>
    <p class="big">${peso(p.minPrice)}</p>
    <p class="muted small">Minimum bid price. Pag-IBIG bids are sealed, so other people's offers aren't public until the bids are opened${p.opening ? ` on ${fmtDate(phTime(p.opening))}` : ""}.</p>
    <div class="meta"><span class="tag ${st.cls}">${esc(st.label)}</span><span class="tag">${esc(p.saleType)}</span></div>
    ${approxNote}
    <dl class="kv">
      <dt>Barangay</dt><dd>${esc(title(p.barangay) || "—")}</dd>
      <dt>Floor area</dt><dd>${area(p.floorArea)}</dd>
      <dt>Lot area</dt><dd>${area(p.lotArea)}</dd>
      <dt>Occupancy</dt><dd>${esc(p.occupancy || "—")}</dd>
      <dt>Remarks</dt><dd>${esc(p.remarks || "—")}</dd>
      <dt>Bidding</dt><dd>${fmtDate(phTime(p.bidStart))} – ${fmtDate(phTime(p.bidEnd))}</dd>
      <dt>Property ID</dt><dd>${esc(p.id)}</dd>
      <dt>Batch no.</dt><dd>${esc(p.batch)}</dd>
      <dt>Title (TCT/CCT)</dt><dd>${esc(p.titleNo || "—")}</dd>
      <dt>Handled by</dt><dd>${esc(p.hub || "—")}<br><span class="small">${esc(p.contact || "")}</span></dd>
    </dl>
    <div class="note small">On the Pag-IBIG site, choose <b>${esc(title(p.region))} → ${esc(title(p.province))} → ${esc(title(p.city))}</b>, then look for property ID <b>${esc(p.id)}</b>. Their site has no direct link to a single property.</div>
    <div class="actions">
      <a class="btn primary" href="${OPA_URL}" target="_blank" rel="noopener" data-copy="${esc(p.id)}">Open on Pag-IBIG ↗</a>
      <button class="btn" data-calc="${esc(p.id)}">Compute loan</button>
      ${p.approx ? "" : `<a class="btn" href="${gmaps}" target="_blank" rel="noopener">Google Maps ↗</a>`}
      <button class="btn" data-report="${esc(p.id)}">Pin in the wrong place?</button>
    </div>
  </div>`;
  sheet.hidden = false;

  // Copy the property ID on the way out, so it can be pasted into Pag-IBIG's search.
  sheetBody.querySelector("[data-copy]").addEventListener("click", (e) => {
    navigator.clipboard?.writeText(e.currentTarget.dataset.copy).catch(() => {});
  });
  sheetBody.querySelector("[data-calc]").addEventListener("click", () => {
    closeSheet();
    loadIntoCalculator(p);
  });
  sheetBody.querySelector("[data-report]").addEventListener("click", () => {
    closeSheet();
    startReport(p);
  });

  if (fly && p.coords) {
    const m = markers.get(p.id);
    if (m) cluster.zoomToShowLayer(m, () => {});
  }
  showAccuracy(p);
}

// ---------------------------------------------------------------- report a wrong pin
// The user taps the correct spot and presses Send. With the relay configured
// (REPORT.endpoint), the report is sent silently: no sign-in, no new page.
// Otherwise it falls back to a GitHub form, email, or copying the details.
const reportBar = $("#reportBar");
let reporting = null;
function startReport(p) {
  reporting = { p, marker: null };
  setView("map");
  map.closePopup();
  if (p.coords) map.setView(p.coords, Math.max(map.getZoom(), 16));
  showAccuracy(p);
  const sub = p.subdivision?.trim();
  reportBar.innerHTML = `<span class="report-msg">Tap where <b>${esc(title(sub) || "the property")}</b> really is, then press Send.</span>
    ${sub ? `<label class="report-whole"><input type="checkbox" id="reportWhole"> Same fix for the whole building / subdivision</label>` : ""}
    <input type="text" id="reportWebsite" name="website" tabindex="-1" autocomplete="off" class="hp" aria-hidden="true">
    <div id="reportCheck"></div>
    <span class="report-actions"><button class="btn" id="reportCancel">Cancel</button><button class="btn primary" id="reportSend" disabled>Send</button></span>`;
  reportBar.hidden = false;
  map.getContainer().classList.add("picking");
  $("#reportCancel").addEventListener("click", endReport);
  $("#reportSend").addEventListener("click", sendReport);
  if (REPORT.endpoint) loadTurnstile().catch(() => {}); // warm up the bot check
}
function endReport() {
  reporting?.marker?.remove();
  if (reporting?.widget != null) window.turnstile?.remove(reporting.widget);
  reporting = null;
  reportBar.hidden = true;
  map.getContainer().classList.remove("picking");
  hideAccuracy();
}
map.on("click", (e) => {
  if (!reporting || reporting.sending) return;
  const ll = [e.latlng.lat, e.latlng.lng];
  if (reporting.marker) reporting.marker.setLatLng(ll);
  else reporting.marker = L.marker(ll, { draggable: true, title: "Correct location" }).addTo(map);
  $("#reportSend").disabled = false;
});

// Cloudflare Turnstile: an invisible bot check that only shows a checkbox if it's unsure.
let turnstileLoading = null;
function loadTurnstile() {
  if (window.turnstile) return Promise.resolve();
  turnstileLoading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error("Couldn't load the bot check"));
    document.head.append(s);
  });
  return turnstileLoading;
}
async function botCheckToken() {
  await loadTurnstile();
  return new Promise((resolve, reject) => {
    reporting.widget = window.turnstile.render("#reportCheck", {
      sitekey: REPORT.turnstileSiteKey,
      appearance: "interaction-only",
      callback: resolve,
      "error-callback": () => reject(new Error("The bot check failed. Please try again.")),
    });
  });
}

function reportMessage(html, done = false) {
  reportBar.querySelector(".report-msg").innerHTML = html;
  if (done) {
    reportBar.querySelector(".report-actions").innerHTML = `<button class="btn primary" id="reportClose">Close</button>`;
    $("#reportClose").addEventListener("click", endReport);
    reportBar.querySelector(".report-whole")?.remove();
  }
}

async function sendReport() {
  const { p, marker } = reporting;
  const ll = marker.getLatLng();
  const coords = [Number(ll.lat.toFixed(6)), Number(ll.lng.toFixed(6))];
  const whole = !!$("#reportWhole")?.checked;

  if (REPORT.endpoint) {
    reporting.sending = true;
    $("#reportSend").disabled = true;
    reportMessage("Sending…");
    try {
      const token = await botCheckToken();
      const res = await fetch(REPORT.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId: p.id,
          lat: coords[0],
          lng: coords[1],
          wholeSubdivision: whole,
          website: $("#reportWebsite")?.value ?? "",
          token,
        }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out.ok) throw new Error(out.error || `Error ${res.status}`);
      reportMessage("✅ <b>Thanks!</b> We'll check it. Clear fixes show up on the map within about 15 minutes; others are reviewed within a day.", true);
    } catch (err) {
      reporting.sending = false;
      $("#reportSend") && ($("#reportSend").disabled = false);
      reportMessage(`⚠️ ${esc(err.message)}`);
    }
    return;
  }

  const subject = `Wrong pin: ${p.subdivision?.trim() || p.id} (${title(p.city)})`;
  const text =
    `Property ${p.id}\n${p.address}\nCurrent pin: ${p.coords?.join(", ")} (${p.approx || "gps"})\n` +
    `Correct location: ${coords.join(", ")}${whole ? " (whole building/subdivision)" : ""}\n` +
    `https://www.openstreetmap.org/?mlat=${coords[0]}&mlon=${coords[1]}#map=18/${coords[0]}/${coords[1]}`;
  if (REPORT.githubRepo) {
    // The "Pin in the wrong place" form (.github/ISSUE_TEMPLATE/wrong-pin.yml), pre-filled. Needs a GitHub account.
    const q = new URLSearchParams({ template: "wrong-pin.yml", title: subject, property_id: p.id, location: coords.join(", ") });
    window.open(`https://github.com/${REPORT.githubRepo}/issues/new?${q}`, "_blank", "noopener");
  } else if (REPORT.email) {
    location.href = `mailto:${REPORT.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
  } else {
    navigator.clipboard?.writeText(text).catch(() => {});
    alert("Thanks! The correction was copied. Send it to the site owner so they can fix the pin.");
  }
  endReport();
}

// ---------------------------------------------------------------- calculator
const c = {
  price: $("#cPrice"), down: $("#cDown"), income: $("#cIncome"), age: $("#cAge"), term: $("#cTerm"),
  plan: $("#cPlan"), after: $("#cAfter"), share: $("#cShare"), ltv: $("#cLtv"),
};
$("#rulesLink").href = LOAN_RULES.sourceUrl;
$("#ratesUntil").textContent = new Date(LOAN_RULES.ratesValidUntil).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" });
c.share.value = LOAN_RULES.assumptions.incomeShareForPayment;
c.ltv.value = LOAN_RULES.assumptions.loanToValue;

c.plan.innerHTML =
  `<option value="promo">Promo: ${LOAN_RULES.promo.tiers.map((t) => t.rate + "%").join(" / ")} fixed for first ${LOAN_RULES.promo.years} years</option>` +
  LOAN_RULES.regularRates.map((r) => `<option value="${r.years}">${r.rate}% fixed for ${r.years} years</option>`).join("");
c.after.innerHTML = LOAN_RULES.regularRates.map((r) => `<option value="${r.rate}">${r.rate}% (current ${r.years}-yr rate)</option>`).join("");

function readCalc() {
  return {
    price: Math.max(0, Number(c.price.value) || 0),
    downPct: Number(c.down.value),
    income: Math.max(0, Number(c.income.value) || 0),
    sharePct: Number(c.share.value),
    ltvPct: Number(c.ltv.value),
    age: Math.min(80, Math.max(18, Number(c.age.value) || 30)),
    termYears: Number(c.term.value),
    plan: c.plan.value,
    afterPromoRate: Number(c.after.value),
  };
}

function renderCalc() {
  const input = readCalc();
  const maxTerm = Math.max(1, Math.min(LOAN_RULES.maxTermYears, LOAN_RULES.maxAgeAtMaturity - input.age));
  c.term.max = maxTerm;
  if (Number(c.term.value) > maxTerm) c.term.value = maxTerm;
  input.termYears = Number(c.term.value);

  // A rate can't be fixed for longer than the loan itself.
  [...c.plan.options].forEach((o) => (o.disabled = o.value !== "promo" && Number(o.value) > input.termYears));
  if (c.plan.selectedOptions[0]?.disabled) {
    c.plan.value = "promo";
    input.plan = "promo";
  }
  $("#afterPromoWrap").style.display = input.plan === "promo" ? "" : "none";

  $("#oDown").textContent = `${input.downPct}% · ${peso(input.price * input.downPct / 100)}`;
  $("#oTerm").textContent = `${input.termYears} years`;
  $("#oShare").textContent = `${input.sharePct}%`;
  $("#oLtv").textContent = `${input.ltvPct}%`;

  const r = calculate(input);
  const warnings = [];
  if (r.ageTooHigh) warnings.push(`Applicants must be ${LOAN_RULES.maxAgeAtApplication} or younger.`);
  if (r.termCappedByAge) warnings.push(`Term shortened so the loan ends by age ${LOAN_RULES.maxAgeAtMaturity}.`);
  if (r.binding === "capacity" && r.loan < r.limits[0].value)
    warnings.push(`Your income limits the loan. To borrow the full ${peso(Math.min(r.limits[0].value, r.limits[1].value))}, you'd need about ${peso(r.incomeNeededForFullLoan)} a month in gross income.`);

  $("#calcOut").innerHTML = `
    <div class="stat hero"><div class="k">Monthly amortization</div><div class="v">${peso(r.monthly, 2)}</div>
      <div class="s">at ${r.rate}% ${input.plan === "promo" ? `for the first ${LOAN_RULES.promo.years} years` : `fixed for ${input.plan} years`}</div></div>
    <div class="stat"><div class="k">Loan amount</div><div class="v">${peso(r.loan)}</div><div class="s">${r.termYears}-year term</div></div>
    <div class="stat"><div class="k">Cash you need</div><div class="v">${peso(r.cashNeeded)}</div><div class="s">price minus loan, before fees</div></div>
    ${r.afterPromo ? `<div class="stat"><div class="k">After year ${LOAN_RULES.promo.years}</div><div class="v">${peso(r.afterPromo.monthly, 2)}</div><div class="s">if repriced to ${r.afterPromo.rate}%</div></div>` : ""}
    <div class="stat"><div class="k">Total interest</div><div class="v">${peso(r.totalInterest)}</div><div class="s">${input.plan === "promo" || Number(input.plan) >= r.termYears ? "over the full term" : "if the rate never changes"}</div></div>
    <div class="stat"><div class="k">Reserve payment</div><div class="v">${peso(r.reserve, 2)}</div><div class="s">1 month's amortization, set aside from your loan when it's released</div></div>
    <div class="limits">
      <strong>How the loan amount was decided:</strong> Pag-IBIG lends the <em>lowest</em> of these.
      <ul>${r.limits.map((l) => `<li class="${l.key === r.binding ? "bind" : ""}">${esc(l.label)}: ${peso(l.value)}${l.key === r.binding ? " ← lowest" : ""}</li>`).join("")}</ul>
      ${warnings.map((w) => `<p class="warn">${esc(w)}</p>`).join("")}
    </div>`;

  // Comparison table across plans.
  const plans = ["promo", ...LOAN_RULES.regularRates.map((x) => String(x.years))].filter(
    (pl) => pl === "promo" || Number(pl) <= input.termYears,
  );
  $("#compare").innerHTML =
    `<thead><tr><th>Plan</th><th>Rate</th><th>Loan</th><th>Monthly</th><th>Total interest*</th></tr></thead><tbody>` +
    plans
      .map((pl) => {
        const x = calculate({ ...input, plan: pl });
        const name = pl === "promo" ? `Promo, first ${LOAN_RULES.promo.years} yrs` : `Fixed ${pl} yrs`;
        return `<tr class="${pl === input.plan ? "sel" : ""}"><td>${name}</td><td>${x.rate}%</td><td>${peso(x.loan)}</td><td>${peso(x.monthly, 2)}</td><td>${peso(x.totalInterest)}</td></tr>`;
      })
      .join("") +
    `</tbody><caption class="small muted" style="caption-side:bottom;text-align:left;padding-top:6px">*Assumes the rate stays the same after it reprices (for the promo, it switches to the rate chosen above). Real future rates may differ.</caption>`;
}

function loadIntoCalculator(p) {
  c.price.value = Math.round(p.minPrice || 0);
  $("#calcFor").innerHTML = `Calculating for <strong>${esc(title(p.type))} in ${esc(title(p.city))}</strong> at its minimum bid of ${peso(p.minPrice)}. If you bid higher, change the price.`;
  setView("calc");
  renderCalc();
  window.scrollTo({ top: 0 });
}

$("#calcForm").addEventListener("input", renderCalc);
$("#calcForm").addEventListener("change", renderCalc);
renderCalc();

// ---------------------------------------------------------------- data
async function load() {
  try {
    const res = await fetch("data/listings.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.all = data.properties.filter((p) => p.id);
    for (const p of state.all) {
      p._hay = [p.address, p.barangay, p.city, p.province, p.region, p.subdivision, p.type, p.id, p.batch].join(" ").toLowerCase();
      state.byId.set(p.id, p);
    }
    const types = [...new Set(state.all.map((p) => p.type).filter(Boolean))].sort();
    f.type.insertAdjacentHTML("beforeend", types.map((t) => `<option>${esc(t)}</option>`).join(""));
    fillRegions();
    $("#updated").textContent = new Date(data.generatedAt).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
    applyFilters({ refit: true });
  } catch (err) {
    $("#count").textContent = "";
    results.innerHTML = `<li class="more">Couldn't load listings (${esc(err.message)}). Run <code>npm run fetch</code> to collect them.</li>`;
  }
}

if (location.hash === "#calc") setView("calc");
else if (location.hash === "#list") setView("list");
load();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
