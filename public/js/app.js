// Pagmamahal Maps: map, list, details, filters, saved properties, loan calculator
// and "Pin in the wrong place?" reports.
//
// Low-end and low-storage phones: photo thumbnails (~10 KB) load only for what's
// on screen, full photos only when a property is opened, the map shows photos
// only when zoomed in close, "Data saver" turns photos off, and nothing large is
// stored on the phone (only the app and today's listings, for offline use).

import { LOAN_RULES, calculate } from "./loan-rules.js";
import { REPORT, MAP, SITE } from "./config.js";
import {
  $, $$, esc, peso, pesoShort, title, area, phTime, fmtDate, bidStatus, TYPE_GROUPS, typeGroup, PRICE_BANDS,
  isOccupied, precisionOf, device, store, toast, photoUrls,
} from "./util.js";

const OPA_URL = "https://www.pagibigfundservices.com/OnlinePublicAuction/";
const PAGE = device.lowEnd ? 30 : 40;
const PHOTO_PIN_ZOOM = 15;
const PHOTO_PIN_LIMIT = device.lowEnd ? 20 : 30; // more than this on screen -> price tags
const wide = () => matchMedia("(min-width: 900px)").matches;

// ---------------------------------------------------------------- state
const state = { all: [], byId: new Map(), filtered: [], shown: PAGE, view: "map", area: null, selected: null };
const emptyFilters = () => ({ q: "", region: "", province: "", city: "", price: null, types: new Set(), status: new Set(), sale: new Set(), occ: "" });
let filters = emptyFilters();
const APP_VERSION = "2.0";
const LOAN_DEFAULTS = { income: 40000, downPct: 10, age: 30 };
const settings = {
  dataSaver: store.get("pm.dataSaver", !!device.slowNet), // no photos unless asked
  photoPins: store.get("pm.photoPins", true), // round photo pins when zoomed in
  liteMap: store.get("pm.liteMap", false), // plain image map instead of the drawn one
  rememberMap: store.get("pm.rememberMap", true), // reopen where you left the map
  loan: { ...LOAN_DEFAULTS, ...store.get("pm.loan", {}) }, // for estimates and the calculator
};
const photosOn = () => !settings.dataSaver;

// ---------------------------------------------------------------- saved properties (on this phone only)
let saved = store.get("pm.saved", []); // [{ id, label, price, at }]
const isSaved = (id) => saved.some((s) => s.id === id);
function toggleSave(p) {
  if (isSaved(p.id)) {
    saved = saved.filter((s) => s.id !== p.id);
    toast("Removed from Saved");
  } else {
    saved = [{ id: p.id, label: `${title(p.type)} in ${title(p.city)}`, price: p.minPrice, at: Date.now() }, ...saved].slice(0, 200);
    toast("Saved on this phone");
  }
  store.set("pm.saved", saved);
  updateSavedBadge();
  $$(`[data-save="${p.id}"]`).forEach((b) => b.setAttribute("aria-pressed", String(isSaved(p.id))));
  if (state.view === "saved") renderSaved();
}
function updateSavedBadge() {
  const b = $("#savedCount");
  b.hidden = !saved.length;
  b.textContent = saved.length;
}
const heart = (p) =>
  `<button class="save-btn" data-save="${esc(p.id)}" aria-pressed="${isSaved(p.id)}" aria-label="Save this property"><svg class="ic"><use href="#i-heart"/></svg></button>`;

// ---------------------------------------------------------------- views
const layout = $(".layout");
function setView(view) {
  if (view === "list" && wide()) view = "map"; // wide screens always show the list beside the map
  state.view = view;
  layout.dataset.view = view;
  $$(".tabbar button, .tabs-desktop button").forEach((b) =>
    b.dataset.view === view ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current"),
  );
  $("#chiprow").hidden = view === "calc" || view === "saved" || view === "settings";
  if (view === "map" || view === "list") setTimeout(() => map.invalidateSize(), 60);
  if (view === "saved") renderSaved();
  if (view === "settings") renderSettings();
  history.replaceState(history.state, "", view === "map" ? location.pathname + location.search : `#${view}`);
}
$$(".tabbar button, .tabs-desktop button").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));

// ---------------------------------------------------------------- map
const map = L.map("map", { zoomControl: true, maxZoom: 19, minZoom: 5, zoomSnap: 0.5 }).setView([12.5, 122], 6);
map.zoomControl.setPosition("bottomright");
const lastMap = settings.rememberMap && !new URLSearchParams(location.search).has("p") ? store.get("pm.mapPos", null) : null;
if (Array.isArray(lastMap) && lastMap.length === 3 && lastMap.every(Number.isFinite)) map.setView([lastMap[0], lastMap[1]], lastMap[2]);
let mapPosTimer;
map.on("moveend", () => {
  if (!settings.rememberMap) return;
  clearTimeout(mapPosTimer);
  mapPosTimer = setTimeout(() => {
    const ctr = map.getCenter();
    store.set("pm.mapPos", [+ctr.lat.toFixed(5), +ctr.lng.toFixed(5), map.getZoom()]);
  }, 800);
});
const hasWebGL = () => {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
};
try {
  if (settings.liteMap || !L.maplibreGL || !window.maplibregl || !hasWebGL()) throw new Error("lite map");
  // pixelRatio 1 on low-end phones: 2-4x less drawing work for the map background.
  L.maplibreGL({ style: MAP.style, attribution: MAP.attribution, pixelRatio: device.lowEnd ? 1 : Math.min(devicePixelRatio || 1, 2) }).addTo(map);
} catch {
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: MAP.attribution }).addTo(map);
}

const cluster = L.markerClusterGroup({
  showCoverageOnHover: false,
  chunkedLoading: true,
  animate: !(device.lowEnd || device.reducedMotion),
  maxClusterRadius: (z) => (z >= 14 ? 45 : 55),
  zoomToBoundsOnClick: false, // handled below: buildings open as a list instead
  spiderfyOnMaxZoom: false,
  iconCreateFunction: (c) => {
    const n = c.getChildCount();
    const size = n < 10 ? 34 : n < 100 ? 40 : n < 1000 ? 46 : 52;
    const label = n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K` : n;
    return L.divIcon({ className: "pin-host", html: `<div class="grp" style="width:${size}px;height:${size}px">${label}</div>`, iconSize: [size, size] });
  },
});
map.addLayer(cluster);
const markers = new Map(); // id -> marker, created once and reused
if (location.hostname === "localhost") window.__pm = { map, cluster, state }; // for local testing only

// Tapping a group zooms in, except when its properties are all in one building or
// a few houses apart (condo towers can list dozens of units at one spot): then
// they open as a list, which is far easier to browse than stacked pins.
cluster.on("clusterclick", (e) => {
  const b = e.layer.getBounds();
  const span = map.distance(b.getSouthWest(), b.getNorthEast()); // metres
  const z = map.getZoom();
  if (span < 300 || z >= 17) {
    state.area = b.pad(0.2);
    applyFilters();
    if (!wide()) setView("list");
    $("#count").textContent = `${state.filtered.length} properties here`;
  } else if (map.getBoundsZoom(b, false, L.point(40, 40)) > z) {
    e.layer.zoomToBounds({ padding: [40, 40] });
  } else {
    // Already fits on screen but still grouped: zoom in on it so the group splits.
    map.setView(e.layer.getLatLng(), Math.min(z + 2, 18));
  }
});

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

const homeIcon = `<svg class="ic"><use href="#i-home"/></svg>`;
const photoIcon = `<svg class="ic"><use href="#i-photo"/></svg>`;
function pinIcon(p, mode, sel) {
  const cls = `${p.approx ? "approx" : ""} ${sel ? "sel" : ""}`;
  const html =
    mode === "photo"
      ? `<div class="ppin ${cls}"><div class="ring">${p.thumb ? `<img src="thumbs/${esc(p.id)}.webp" alt="" width="46" height="46" decoding="async">` : homeIcon}</div><span class="pr">${pesoShort(p.minPrice)}</span></div>`
      : `<span class="ptag ${cls}">${pesoShort(p.minPrice)}</span>`;
  return L.divIcon({ className: "pin-host", html, iconSize: [0, 0] });
}
function markerFor(p) {
  let m = markers.get(p.id);
  if (!m) {
    m = L.marker(jitter(p.coords, p.id, p.approx), { icon: pinIcon(p, "price", false), keyboard: true, title: `${pesoShort(p.minPrice)} ${title(p.type)}` });
    m._pid = p.id;
    m._mode = "price";
    m.on("click", () => selectProperty(p.id));
    markers.set(p.id, m);
  }
  return m;
}
function renderMarkers() {
  cluster.clearLayers();
  const layers = [];
  for (const p of state.filtered) if (p.coords) layers.push(markerFor(p));
  cluster.addLayers(layers);
  refreshPinModes();
}

// Photo pins only when zoomed in close and few properties are on screen.
let pinTimer;
function refreshPinModes() {
  clearTimeout(pinTimer);
  pinTimer = setTimeout(() => {
    const z = map.getZoom();
    const view = map.getBounds().pad(0.15);
    const visible = [];
    for (const m of cluster.getLayers()) {
      if (view.contains(m.getLatLng()) && cluster.getVisibleParent(m) === m) visible.push(m);
    }
    const mode = photosOn() && settings.photoPins && z >= PHOTO_PIN_ZOOM && visible.length <= PHOTO_PIN_LIMIT ? "photo" : "price";
    for (const m of visible) {
      const sel = m._pid === state.selected;
      if (m._mode !== mode || m._sel !== sel) {
        m.setIcon(pinIcon(state.byId.get(m._pid), mode, sel));
        m._mode = mode;
        m._sel = sel;
        m.setZIndexOffset(sel ? 1000 : 0);
      }
    }
    updateListHere(visible.length);
  }, 120);
}
map.on("zoomend moveend", refreshPinModes);
cluster.on("animationend", refreshPinModes);

// "List N here": show only what's in the map area.
function updateListHere() {
  const btn = $("#listHere");
  if (state.area || map.getZoom() < 10) return (btn.hidden = true);
  const b = map.getBounds();
  const n = state.filtered.filter((p) => p.coords && b.contains(p.coords)).length;
  btn.hidden = !n || n === state.filtered.length;
  btn.textContent = `List ${n.toLocaleString()} here`;
}
$("#listHere").addEventListener("click", () => {
  state.area = map.getBounds();
  applyFilters();
  setView("list");
});
$("#clearArea").addEventListener("click", () => {
  state.area = null;
  applyFilters();
});

// Selecting a pin: bigger pin + preview card at the bottom.
let accuracyCircle = null;
function selectProperty(id) {
  const p = state.byId.get(id);
  if (!p || reporting) return;
  const prev = state.selected;
  state.selected = id;
  for (const pid of [prev, id]) {
    const m = pid && markers.get(pid);
    if (m && cluster.hasLayer(m)) {
      m.setIcon(pinIcon(state.byId.get(pid), m._mode, pid === id));
      m._sel = pid === id;
      m.setZIndexOffset(pid === id ? 1000 : 0);
    }
  }
  showPreview(p);
  showAccuracy(p);
  // Keep the pin visible above the preview card.
  const m = markers.get(id);
  if (m && map.hasLayer(m)) {
    const pt = map.latLngToContainerPoint(m.getLatLng());
    const limit = map.getSize().y - (wide() ? 60 : 150);
    if (pt.y > limit) map.panBy([0, pt.y - limit + 30], { animate: !device.lowEnd });
  }
}
function clearSelection() {
  const m = state.selected && markers.get(state.selected);
  const p = state.selected && state.byId.get(state.selected);
  state.selected = null;
  if (m && p) {
    m.setIcon(pinIcon(p, m._mode, false));
    m._sel = false;
    m.setZIndexOffset(0);
  }
  $("#preview").hidden = true;
  hideAccuracy();
}
map.on("click", (e) => {
  if (reporting) return placeReportMarker(e);
  clearSelection();
});

function thumbHtml(p, w, h) {
  if (photosOn() && p.thumb) return `<div class="thumb" style="width:${w}px;height:${h}px"><img src="thumbs/${esc(p.id)}.webp" alt="" width="${w}" height="${h}" loading="lazy" decoding="async"></div>`;
  return `<div class="thumb" style="width:${w}px;height:${h}px">${p.photos?.length ? photoIcon : homeIcon}</div>`;
}
function showPreview(p) {
  const st = bidStatus(p);
  const el = $("#preview");
  el.innerHTML = `
    ${thumbHtml(p, 92, 92)}
    <div class="card-body">
      <div class="card-top"><span class="price">${peso(p.minPrice)}</span>${heart(p)}</div>
      <div class="line2">${esc(title(p.type))}${p.floorArea ? ` · ${p.floorArea} m²` : p.lotArea ? ` · ${p.lotArea} m² lot` : ""}</div>
      <div class="place">${esc(title(p.barangay || p.subdivision || ""))}${p.barangay || p.subdivision ? ", " : ""}${esc(title(p.city))}</div>
      <div class="card-top" style="margin-top:6px"><span class="badge ${st.cls}">${esc(st.label)}</span><span class="go">Details <svg class="ic"><use href="#i-chevron"/></svg></span></div>
    </div>
    <button class="close" aria-label="Close preview"><svg class="ic"><use href="#i-x"/></svg></button>`;
  el.hidden = false;
  el.onclick = (e) => {
    if (e.target.closest(".close")) return clearSelection();
    if (e.target.closest("[data-save]")) return toggleSave(p);
    openDetail(p.id);
  };
}

function showAccuracy(p) {
  hideAccuracy();
  const pr = precisionOf(p);
  if (!pr?.km || !p.coords) return;
  accuracyCircle = L.circle(p.coords, { radius: pr.km * 1000, color: getComputedStyle(document.documentElement).getPropertyValue("--approx").trim() || "#b4602e", weight: 1, fillOpacity: 0.1, interactive: false }).addTo(map);
}
function hideAccuracy() {
  accuracyCircle?.remove();
  accuracyCircle = null;
}

// Near me: the phone's location is used only on tap and never leaves the phone.
let meMarker = null;
$("#nearMe").addEventListener("click", () => {
  if (!navigator.geolocation) return toast("Your browser can't share your location.");
  toast("Finding your location…");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const ll = [pos.coords.latitude, pos.coords.longitude];
      meMarker?.remove();
      meMarker = L.marker(ll, { icon: L.divIcon({ className: "pin-host", html: '<div class="me-dot"></div>', iconSize: [18, 18] }), interactive: false }).addTo(map);
      map.setView(ll, 13);
    },
    (err) => toast(err.code === 1 ? "Location is turned off for this site. Allow it in your browser settings." : "Couldn't find your location. Try again outdoors."),
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }, // low accuracy: faster, easier on the battery
  );
});

// One-time tip.
function maybeShowTip() {
  if (store.get("pm.tip.v1", false)) return;
  $("#tip").hidden = false;
  $("#tipOk").onclick = () => {
    $("#tip").hidden = true;
    store.set("pm.tip.v1", true);
  };
}

// ---------------------------------------------------------------- filtering
function matches(p, f, now) {
  if (f.region && p.region !== f.region) return false;
  if (f.province && p.province !== f.province) return false;
  if (f.city && p.city !== f.city) return false;
  if (f.price && !(p.minPrice >= f.price.min && p.minPrice < f.price.max)) return false;
  if (f.types.size && !f.types.has(p._group)) return false;
  if (f.status.size && !f.status.has(bidStatus(p, now).key)) return false;
  if (f.sale.size && !f.sale.has(p.saleFlag === 3 ? "nego" : "auction")) return false;
  if (f.occ === "occupied" && !isOccupied(p)) return false;
  if (f.occ === "unoccupied" && isOccupied(p)) return false;
  if (f.q) {
    for (const w of f.q.toLowerCase().split(/\s+/).filter(Boolean)) if (!p._hay.includes(w)) return false;
  }
  return true;
}
const countMatches = (f) => {
  const now = new Date();
  let n = 0;
  for (const p of state.all) if (matches(p, f, now)) n++;
  return n;
};
function activeFilterCount(f = filters) {
  return (f.region ? 1 : 0) + (f.price ? 1 : 0) + f.types.size + f.status.size + f.sale.size + (f.occ ? 1 : 0);
}

function applyFilters({ refit = false } = {}) {
  const now = new Date();
  state.filtered = state.all.filter((p) => matches(p, filters, now) && (!state.area || (p.coords && state.area.contains(p.coords))));
  const end = (p) => phTime(p.bidEnd)?.getTime() ?? Infinity;
  const cmp = {
    price: (a, b) => a.minPrice - b.minPrice,
    "-price": (a, b) => b.minPrice - a.minPrice,
    end: (a, b) => end(a) - end(b),
    area: (a, b) => (b.floorArea ?? 0) - (a.floorArea ?? 0),
  }[$("#sort").value];
  state.filtered.sort(cmp);
  state.shown = PAGE;
  const n = state.filtered.length;
  $("#count").textContent = `${n.toLocaleString()} ${n === 1 ? "property" : "properties"}${state.area ? " in this area" : ""}`;
  $("#areaNote").hidden = !state.area;
  const fc = activeFilterCount();
  $("#filterCount").hidden = !fc;
  $("#filterCount").textContent = fc;
  if (state.selected && !state.filtered.some((p) => p.id === state.selected)) clearSelection();
  renderChips();
  renderList();
  renderMarkers();
  if (refit && !state.area && n) {
    const pts = state.filtered.filter((p) => p.coords).map((p) => p.coords);
    if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 15, animate: !device.lowEnd });
  }
}

let searchTimer;
$("#q").addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    filters.q = e.target.value.trim();
    state.area = null;
    applyFilters({ refit: true });
  }, 250);
});
$("#q").addEventListener("keydown", (e) => e.key === "Enter" && e.target.blur());
$("#sort").addEventListener("change", () => applyFilters());

// Quick chips under the search box + chips for active filters (tap to remove).
const QUICK = [
  { key: "open", label: "Bidding open", on: (f) => f.status.has("open"), toggle: (f) => toggleSet(f.status, "open") },
  { key: "u1m", label: "Under ₱1M", on: (f) => f.price?.key === "u1m", toggle: (f) => (f.price = f.price?.key === "u1m" ? null : { key: "u1m", label: "Under ₱1M", min: 0, max: 1e6 }) },
  ...TYPE_GROUPS.filter((g) => g.key !== "town").map((g) => ({ key: g.key, label: g.label, on: (f) => f.types.has(g.key), toggle: (f) => toggleSet(f.types, g.key) })),
  { key: "unocc", label: "Unoccupied", on: (f) => f.occ === "unoccupied", toggle: (f) => (f.occ = f.occ === "unoccupied" ? "" : "unoccupied") },
];
function toggleSet(set, v) {
  set.has(v) ? set.delete(v) : set.add(v);
}
function renderChips() {
  const chips = [];
  if (filters.city || filters.province || filters.region) {
    const where = title(filters.city || filters.province) || regionLabel(filters.region);
    chips.push(`<button class="chip" aria-pressed="true" data-clear="place">${esc(where)} <svg class="ic"><use href="#i-x"/></svg></button>`);
  }
  if (filters.price && filters.price.key !== "u1m") chips.push(`<button class="chip" aria-pressed="true" data-clear="price">${esc(filters.price.label)} <svg class="ic"><use href="#i-x"/></svg></button>`);
  if (filters.types.has("town")) chips.push(`<button class="chip" aria-pressed="true" data-clear="town">Townhouse / row house <svg class="ic"><use href="#i-x"/></svg></button>`);
  if (filters.status.has("soon")) chips.push(`<button class="chip" aria-pressed="true" data-clear="soon">Opening soon <svg class="ic"><use href="#i-x"/></svg></button>`);
  for (const s of filters.sale) chips.push(`<button class="chip" aria-pressed="true" data-clear="sale-${s}">${s === "nego" ? "Negotiated sale" : "Auction"} <svg class="ic"><use href="#i-x"/></svg></button>`);
  if (filters.occ === "occupied") chips.push(`<button class="chip" aria-pressed="true" data-clear="occ">Occupied <svg class="ic"><use href="#i-x"/></svg></button>`);
  for (const q of QUICK) chips.push(`<button class="chip" aria-pressed="${q.on(filters)}" data-quick="${q.key}">${esc(q.label)}</button>`);
  if (activeFilterCount() > 1) chips.push(`<button class="chip clear" data-clear="all">Clear all</button>`);
  $("#chiprow").innerHTML = chips.join("");
}
$("#chiprow").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.quick) QUICK.find((q) => q.key === b.dataset.quick).toggle(filters);
  const c = b.dataset.clear;
  if (c === "place") Object.assign(filters, { region: "", province: "", city: "" });
  if (c === "price") filters.price = null;
  if (c === "town") filters.types.delete("town");
  if (c === "soon") filters.status.delete("soon");
  if (c?.startsWith("sale-")) filters.sale.delete(c.slice(5));
  if (c === "occ") filters.occ = "";
  if (c === "all") filters = { ...emptyFilters(), q: filters.q };
  state.area = null;
  applyFilters({ refit: true });
});

// ---------------------------------------------------------------- list
function cardHtml(p) {
  const st = bidStatus(p);
  const size = p.floorArea ? `${p.floorArea} m²` : p.lotArea ? `${p.lotArea} m² lot` : "";
  return `<li><div class="card" data-open="${esc(p.id)}" role="button" tabindex="0">
    ${thumbHtml(p, 96, 80)}
    <div class="card-body">
      <div class="card-top"><span class="price">${peso(p.minPrice)}</span>${heart(p)}</div>
      <div class="line2">${esc(title(p.type))}${size ? ` · ${size}` : ""}</div>
      <div class="place">${esc(title(p.subdivision || p.barangay || ""))}${p.subdivision || p.barangay ? ", " : ""}${esc(title(p.city))}</div>
      <div class="badges"><span class="badge ${st.cls}">${esc(st.label)}</span>${p.saleFlag === 3 ? "" : `<span class="badge">${p.saleFlag === 1 ? "1st" : "2nd"} auction</span>`}</div>
    </div></div></li>`;
}
function renderList() {
  const items = state.filtered.slice(0, state.shown);
  if (!state.filtered.length) {
    $("#results").innerHTML = `<li class="empty"><h3>No properties match</h3><p class="muted">Try fewer filters or a wider area.</p>
      <button class="btn" id="emptyClear">Clear filters</button></li>`;
    $("#emptyClear").onclick = () => {
      filters = emptyFilters();
      $("#q").value = "";
      state.area = null;
      applyFilters({ refit: true });
    };
    return;
  }
  $("#results").innerHTML =
    items.map(cardHtml).join("") +
    (state.filtered.length > state.shown ? `<li class="more"><button class="btn" id="moreBtn">Show more (${(state.filtered.length - state.shown).toLocaleString()} left)</button></li>` : "");
  $("#moreBtn")?.addEventListener("click", () => {
    state.shown += PAGE;
    renderList();
  });
}
function onCardClick(e) {
  const save = e.target.closest("[data-save]");
  if (save) return toggleSave(state.byId.get(save.dataset.save));
  const card = e.target.closest("[data-open]");
  if (card) openDetail(card.dataset.open);
}
$("#results").addEventListener("click", onCardClick);
$("#results").addEventListener("keydown", (e) => e.key === "Enter" && onCardClick(e));

// ---------------------------------------------------------------- saved list
function renderSaved() {
  const list = $("#savedList");
  if (!saved.length) {
    list.innerHTML = "";
    $("#savedHint").hidden = false;
    return;
  }
  $("#savedHint").hidden = true;
  list.innerHTML = saved
    .map((s) => {
      const p = state.byId.get(s.id);
      if (p) return cardHtml(p);
      return `<li><div class="card"><div class="card-body"><div class="card-top"><span class="price muted">${peso(s.price)}</span>
        <button class="linkbtn" data-unsave="${esc(s.id)}">Remove</button></div><div class="line2 muted">${esc(s.label)}</div>
        <div class="place">No longer listed by Pag-IBIG</div></div></div></li>`;
    })
    .join("");
}
$("#savedList").addEventListener("click", (e) => {
  const un = e.target.closest("[data-unsave]");
  if (un) {
    saved = saved.filter((s) => s.id !== un.dataset.unsave);
    store.set("pm.saved", saved);
    updateSavedBadge();
    return renderSaved();
  }
  onCardClick(e);
});

// ---------------------------------------------------------------- sheets and the back button
// Opening details or filters adds a history step, so the phone's Back button closes them.
function openSheet(el, stateObj, url) {
  el.hidden = false;
  if (!history.state?.sheet) history.pushState({ sheet: stateObj }, "", url ?? location.href);
  else history.replaceState({ sheet: stateObj }, "", url ?? location.href);
}
function closeSheets() {
  if (history.state?.sheet) history.back();
  else hideSheets();
}
function hideSheets() {
  $("#detail").hidden = true;
  $("#filterSheet").hidden = true;
  closeLightbox();
}
window.addEventListener("popstate", (e) => {
  const s = e.state?.sheet;
  if (s?.detail && state.byId.has(s.detail)) renderDetail(state.byId.get(s.detail));
  else hideSheets();
});
for (const id of ["detail", "filterSheet"]) $(`#${id}`).addEventListener("click", (e) => e.target.id === id && closeSheets());
document.addEventListener("keydown", (e) => e.key === "Escape" && (!$("#lightbox").hidden ? closeLightbox() : closeSheets()));

// ---------------------------------------------------------------- details
// Estimate shown on each property: your down payment and age from Settings
// (the loan must end by age 70), ignoring the income limit.
const estimateTerm = () => Math.max(1, Math.min(30, 70 - settings.loan.age));
function loanEstimate(p) {
  return calculate({ price: p.minPrice, downPct: settings.loan.downPct, income: 1e9, sharePct: 35, ltvPct: 90, age: settings.loan.age, termYears: estimateTerm(), plan: "promo", afterPromoRate: 6.5 });
}
function openDetail(id) {
  const p = state.byId.get(id);
  if (!p) return;
  renderDetail(p);
  openSheet($("#detail"), { detail: id }, `${location.pathname}?p=${encodeURIComponent(id)}`);
}
function galleryHtml(p) {
  const photos = photoUrls(p);
  if (!photos.length) return `<div class="gallery"><div class="track"><div class="slide">${homeIcon}<span class="muted" style="margin-left:8px">No photo yet</span></div></div></div>`;
  if (!photosOn()) {
    return `<div class="gallery"><div class="load-photos">${p.thumb ? `<img src="thumbs/${esc(p.id)}.webp" alt="" width="96" height="96" style="border-radius:10px">` : ""}
      <span class="muted">Data saver is on (change it in Settings).</span><button class="btn small" id="loadPhotos">Show ${photos.length} photo${photos.length > 1 ? "s" : ""} (about ${(photos.length * 0.2).toFixed(1)} MB)</button></div></div>`;
  }
  // The thumbnail shows at once while the full photo loads. On cheap phones and slow
  // connections, a very large first photo (up to 4 MB) waits for a tap.
  const holdFirst = p.bigPhotoKB && (device.lowEnd || device.slowNet);
  const thumbBg = p.thumb ? ` style="background:center/cover url('thumbs/${esc(p.id)}.webp')"` : "";
  const slide = (u, i) =>
    i === 0 && holdFirst
      ? `<div class="slide"${thumbBg}><button class="btn small hold" data-load="${esc(u)}">Show full photo (${(p.bigPhotoKB / 1024).toFixed(1)} MB)</button></div>`
      : `<div class="slide"${i === 0 ? thumbBg : ""}><img src="${esc(u)}" alt="Photo ${i + 1} of the property" loading="${i ? "lazy" : "eager"}" decoding="async" data-full="${esc(u)}"></div>`;
  return `<div class="gallery"><div class="track" id="track">
    ${photos.map(slide).join("")}
    </div><span class="credit">Photo: Pag-IBIG Fund</span>${photos.length > 1 ? `<span class="counter" id="counter">1 / ${photos.length}</span>` : ""}</div>`;
}
function renderDetail(p) {
  const st = bidStatus(p);
  const pr = precisionOf(p);
  const est = loanEstimate(p);
  const gmaps = p.coords && !p.approx
    ? `https://www.google.com/maps/dir/?api=1&destination=${p.coords[0]},${p.coords[1]}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(title(p.address))}`;
  const where = [title(p.barangay), title(p.city)].filter(Boolean).join(", ");
  $("#detailBody").innerHTML = `
    <div class="detail-top">
      <button class="btn icon" id="detailBack" aria-label="Back"><svg class="ic"><use href="#i-back"/></svg></button>
    </div>
    <div class="detail-scroll">
      ${galleryHtml(p)}
      <div class="detail-main">
        <div class="big">${peso(p.minPrice)}</div>
        <div class="muted small">Minimum bid · bids are sealed until they're opened${p.opening ? ` on ${fmtDate(phTime(p.opening), false)}` : ""}</div>
        <h2 id="detailTitle" style="margin-top:8px">${esc(title(p.type))} in ${esc(where)}</h2>
        <div class="muted small">${esc(title(p.address))}</div>
        <div class="badges"><span class="badge ${st.cls}">${esc(st.label)}</span><span class="badge">${esc(p.saleType || "")}</span></div>
        <div class="facts">
          <div class="fact"><div class="k">Floor area</div><div class="v">${area(p.floorArea)}</div></div>
          <div class="fact"><div class="k">Lot area</div><div class="v">${area(p.lotArea)}</div></div>
          <div class="fact"><div class="k">Occupancy</div><div class="v">${isOccupied(p) ? "Occupied" : "Unoccupied"}</div></div>
          <div class="fact"><div class="k">Pin</div><div class="v">${esc(pr.short)}</div></div>
        </div>
        <button class="row-link" id="loanRow"><svg class="ic"><use href="#i-calc"/></svg>
          <span class="grow">About <b>${peso(est.monthly)} a month</b><br><span class="muted small">${settings.loan.downPct}% down, ${estimateTerm()} years, ${est.rate}% for the first 3 years. Tap to adjust.</span></span>
          <svg class="ic"><use href="#i-chevron"/></svg></button>
        ${p.approx ? `<div class="note">📍 <b>Approximate location.</b> Pag-IBIG didn't post a usable GPS reading${p.gpsRejected ? " (theirs pointed outside the town)" : ""}. The pin is ${pr.text}.
          <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(title(p.address))}" target="_blank" rel="noopener">Search the address on Google Maps</a>.</div>` : ""}
        <button class="linkbtn" id="reportBtn" style="padding-left:0">Pin in the wrong place?</button>
      </div>
      <div class="sections">
        <details><summary>Bidding</summary><dl class="kv">
          <dt>Sale type</dt><dd>${esc(p.saleType || "—")}</dd>
          <dt>Bidding period</dt><dd>${fmtDate(phTime(p.bidStart))} – ${fmtDate(phTime(p.bidEnd))}</dd>
          <dt>Bids opened</dt><dd>${fmtDate(phTime(p.opening))}</dd></dl></details>
        <details><summary>How to bid on Pag-IBIG</summary><ol class="steps">
          <li>Tap <b>Bid on Pag-IBIG</b>. The property ID is copied for you.</li>
          <li>On Pag-IBIG's site, choose <b>${esc(title(p.region))}</b> → <b>${esc(title(p.province))}</b> → <b>${esc(title(p.city))}</b>.</li>
          <li>Find property ID <b>${esc(p.id)}</b> in the results. Their site has no direct link to one property.</li></ol></details>
        <details><summary>Title and remarks</summary><dl class="kv">
          <dt>Property ID</dt><dd>${esc(p.id)} <button class="linkbtn" data-copy="${esc(p.id)}">Copy</button></dd>
          <dt>Batch no.</dt><dd>${esc(p.batch || "—")}</dd>
          <dt>Title (TCT/CCT)</dt><dd>${esc(p.titleNo || "—")}</dd>
          <dt>Remarks</dt><dd>${esc(p.remarks || "—")}</dd></dl></details>
        <details><summary>Handled by</summary><dl class="kv">
          <dt>Office</dt><dd>${esc(p.hub || "—")}</dd>
          <dt>Phone</dt><dd>${esc(p.contact || "—")}</dd>
          <dt>Email</dt><dd>${p.email ? esc(p.email) : "—"}</dd></dl></details>
      </div>
      <p class="mini-foot">Not affiliated with Pag-IBIG Fund. Always confirm details with Pag-IBIG before bidding.</p>
    </div>
    <div class="action-bar">
      <a class="btn primary" id="bidBtn" href="${OPA_URL}" target="_blank" rel="noopener">Bid on Pag-IBIG <svg class="ic"><use href="#i-external"/></svg></a>
      <a class="btn icon" href="${gmaps}" target="_blank" rel="noopener" aria-label="Directions"><svg class="ic"><use href="#i-route"/></svg></a>
      <button class="btn icon" id="shareBtn" aria-label="Share"><svg class="ic"><use href="#i-share"/></svg></button>
      <button class="btn icon save-btn" data-save="${esc(p.id)}" aria-pressed="${isSaved(p.id)}" aria-label="Save"><svg class="ic"><use href="#i-heart"/></svg></button>
    </div>`;
  $("#detail").hidden = false;
  $(".detail-scroll").scrollTop = 0;
  const body = $("#detailBody");
  body.querySelector("#detailBack").onclick = closeSheets;
  body.querySelector("#loanRow").onclick = () => {
    closeSheets();
    loadIntoCalculator(p);
  };
  body.querySelector("#reportBtn").onclick = () => {
    closeSheets();
    startReport(p);
  };
  body.querySelector("#bidBtn").onclick = () => copy(p.id, "Property ID copied. Paste it in Pag-IBIG's search.");
  body.querySelector("#shareBtn").onclick = () => shareProperty(p);
  body.querySelectorAll("[data-copy]").forEach((b) => (b.onclick = () => copy(b.dataset.copy, "Copied")));
  body.querySelector(".action-bar [data-save]").onclick = () => toggleSave(p);
  body.querySelector("#loadPhotos")?.addEventListener("click", () => {
    settings.dataSaver = false; // just for this property
    body.querySelector(".gallery").outerHTML = galleryHtml(p);
    settings.dataSaver = true;
    wireGallery(p);
  });
  wireGallery(p);
}
function wireGallery(p) {
  const track = $("#track");
  if (!track) return;
  const n = p.photos.length;
  track.addEventListener("scroll", () => {
    const i = Math.round(track.scrollLeft / track.clientWidth) + 1;
    const c = $("#counter");
    if (c) c.textContent = `${i} / ${n}`;
  }, { passive: true });
  track.addEventListener("click", (e) => {
    if (e.target.dataset.full) openLightbox(e.target.dataset.full);
    const load = e.target.closest("[data-load]");
    if (load) {
      const img = new Image();
      Object.assign(img, { src: load.dataset.load, alt: "Photo 1 of the property", decoding: "async" });
      img.dataset.full = load.dataset.load;
      img.onerror = () => (img.parentElement.innerHTML = `${photoIcon}<span class="muted" style="margin-left:8px">Photo unavailable</span>`);
      load.replaceWith(img);
    }
  });
  track.querySelectorAll("img").forEach((img) => (img.onerror = () => (img.parentElement.innerHTML = `${photoIcon}<span class="muted" style="margin-left:8px">Photo unavailable</span>`)));
}
function openLightbox(src) {
  $("#lightboxImg").src = src;
  $("#lightbox").hidden = false;
}
function closeLightbox() {
  $("#lightbox").hidden = true;
  $("#lightboxImg").removeAttribute("src");
}
$("#lightboxClose").onclick = closeLightbox;
$("#lightbox").addEventListener("click", (e) => e.target.id === "lightbox" && closeLightbox());

function copy(text, msg) {
  navigator.clipboard?.writeText(text).then(() => toast(msg), () => {});
}
async function shareProperty(p) {
  const url = `${SITE.url}/?p=${encodeURIComponent(p.id)}`;
  const text = `${title(p.type)} in ${title(p.city)}, minimum bid ${peso(p.minPrice)}`;
  if (navigator.share) {
    try {
      return await navigator.share({ title: "Pagmamahal Maps", text, url });
    } catch {
      return; // cancelled
    }
  }
  copy(url, "Link copied");
}

// ---------------------------------------------------------------- filters sheet
let draft = null;
const regionLabel = (r) =>
  String(r || "").replace(/^([^(]*)(\((.*)\))?/, (_, head, _p, inner) => title(head) + (inner ? `(${/\s/.test(inner) ? title(inner) : inner})` : ""));
const regionOrder = (r) => {
  if (/NCR|NATIONAL CAPITAL/.test(r)) return 0;
  if (/CORDILLERA|\(CAR\)/.test(r)) return 0.5;
  const m = r.match(/REGION\s+(\d+)(?:-([AB]))?/);
  if (m) return Number(m[1]) + (m[2] === "A" ? 0.1 : m[2] === "B" ? 0.2 : 0);
  return 99;
};
const cloneFilters = (f) => ({ ...f, types: new Set(f.types), status: new Set(f.status), sale: new Set(f.sale) });
function countBy(items, key) {
  const m = new Map();
  for (const p of items) if (p[key]) m.set(p[key], (m.get(p[key]) || 0) + 1);
  return m;
}
function options(counts, selected, allLabel, label = title, order) {
  const names = [...counts.keys()].sort(order ? (a, b) => order(a) - order(b) || a.localeCompare(b) : (a, b) => a.localeCompare(b));
  return `<option value="">${allLabel}</option>` + names.map((n) => `<option value="${esc(n)}" ${n === selected ? "selected" : ""}>${esc(label(n))} (${counts.get(n).toLocaleString()})</option>`).join("");
}
function chip(group, value, label, on) {
  return `<button class="chip" data-g="${group}" data-v="${esc(value)}" aria-pressed="${on}">${label}</button>`;
}
function renderFilterSheet() {
  const f = draft;
  const inRegion = state.all.filter((p) => p.region === f.region);
  const inProv = inRegion.filter((p) => p.province === f.province);
  $("#filterBody").innerHTML = `
    <div class="fgroup"><h3>Location</h3><div class="loc-selects">
      <select id="fRegion" aria-label="Region">${options(countBy(state.all, "region"), f.region, "All regions", regionLabel, regionOrder)}</select>
      <select id="fProvince" aria-label="Province" ${f.region ? "" : "disabled"}>${f.region ? options(countBy(inRegion, "province"), f.province, "All provinces") : '<option value="">All provinces</option>'}</select>
      <select id="fCity" aria-label="City or municipality" ${f.province ? "" : "disabled"}>${f.province ? options(countBy(inProv, "city"), f.city, "All cities") : '<option value="">All cities</option>'}</select>
    </div></div>
    <div class="fgroup"><h3>Price</h3><div class="chips">${PRICE_BANDS.map((b) => chip("price", b.key, b.label, f.price?.key === b.key)).join("")}</div></div>
    <div class="fgroup"><h3>Property type</h3><div class="chips">${TYPE_GROUPS.map((g) => chip("type", g.key, `<svg class="ic"><use href="#i-${g.key === "lot" ? "pin" : "home"}"/></svg>${g.label}`, f.types.has(g.key))).join("")}</div></div>
    <div class="fgroup"><h3>Bidding</h3><div class="chips">${chip("status", "open", "Open now", f.status.has("open"))}${chip("status", "soon", "Opening soon", f.status.has("soon"))}</div></div>
    <div class="fgroup"><h3>Sale type</h3><div class="chips">${chip("sale", "auction", "Public auction", f.sale.has("auction"))}${chip("sale", "nego", "Negotiated sale", f.sale.has("nego"))}</div></div>
    <div class="fgroup"><h3>Occupancy</h3><div class="chips">${chip("occ", "unoccupied", "Unoccupied", f.occ === "unoccupied")}${chip("occ", "occupied", "Occupied", f.occ === "occupied")}</div></div>`;
  const n = countMatches(f);
  $("#applyFilters").textContent = n ? `Show ${n.toLocaleString()} ${n === 1 ? "property" : "properties"}` : "No matches. Try fewer filters";
}
$("#filtersBtn").addEventListener("click", () => {
  draft = cloneFilters(filters);
  renderFilterSheet();
  openSheet($("#filterSheet"), { filters: true });
});
$("#filterBody").addEventListener("click", (e) => {
  const b = e.target.closest(".chip");
  if (!b) return;
  const { g, v } = b.dataset;
  if (g === "price") draft.price = draft.price?.key === v ? null : PRICE_BANDS.find((x) => x.key === v);
  if (g === "type") toggleSet(draft.types, v);
  if (g === "status") toggleSet(draft.status, v);
  if (g === "sale") toggleSet(draft.sale, v);
  if (g === "occ") draft.occ = draft.occ === v ? "" : v;
  renderFilterSheet();
});
$("#filterBody").addEventListener("change", (e) => {
  if (e.target.id === "fRegion") Object.assign(draft, { region: e.target.value, province: "", city: "" });
  if (e.target.id === "fProvince") Object.assign(draft, { province: e.target.value, city: "" });
  if (e.target.id === "fCity") draft.city = e.target.value;
  renderFilterSheet();
});
$("#resetFilters").addEventListener("click", () => {
  draft = { ...emptyFilters(), q: filters.q };
  renderFilterSheet();
});
$("#applyFilters").addEventListener("click", () => {
  filters = draft;
  state.area = null;
  closeSheets();
  applyFilters({ refit: true });
});

// ---------------------------------------------------------------- report a wrong pin
const reportBar = $("#reportBar");
let reporting = null;
function startReport(p) {
  reporting = { p, marker: null };
  setView("map");
  $("#preview").hidden = true;
  if (p.coords) map.setView(p.coords, Math.max(map.getZoom(), 16));
  showAccuracy(p);
  const sub = p.subdivision?.trim();
  reportBar.innerHTML = `<span class="report-msg">Tap where <b>${esc(title(sub) || "the property")}</b> really is, then press Send.</span>
    ${sub ? `<label class="report-whole"><input type="checkbox" id="reportWhole"> Same fix for the whole building or subdivision</label>` : ""}
    <input type="text" id="reportWebsite" name="website" tabindex="-1" autocomplete="off" class="hp" aria-hidden="true">
    <div id="reportCheck"></div>
    <span class="report-actions"><button class="btn small" id="reportCancel">Cancel</button><button class="btn small primary" id="reportSend" disabled>Send</button></span>`;
  reportBar.hidden = false;
  map.getContainer().classList.add("picking");
  $("#reportCancel").addEventListener("click", endReport);
  $("#reportSend").addEventListener("click", sendReport);
  if (REPORT.endpoint) loadTurnstile().catch(() => {});
}
function endReport() {
  reporting?.marker?.remove();
  if (reporting?.widget != null) window.turnstile?.remove(reporting.widget);
  reporting = null;
  reportBar.hidden = true;
  map.getContainer().classList.remove("picking");
  hideAccuracy();
}
function placeReportMarker(e) {
  if (reporting.sending) return;
  const ll = [e.latlng.lat, e.latlng.lng];
  if (reporting.marker) reporting.marker.setLatLng(ll);
  else reporting.marker = L.marker(ll, { draggable: true, title: "Correct location", icon: L.divIcon({ className: "pin-host", html: '<div class="me-dot" style="background:var(--approx)"></div>', iconSize: [18, 18] }) }).addTo(map);
  $("#reportSend").disabled = false;
}
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
  if (reporting.widget != null) {
    window.turnstile.remove(reporting.widget);
    reporting.widget = null;
  }
  return new Promise((resolve, reject) => {
    reporting.widget = window.turnstile.render("#reportCheck", {
      sitekey: REPORT.turnstileSiteKey,
      appearance: "interaction-only",
      callback: resolve,
      "error-callback": () => {
        reject(new Error("The bot check couldn't confirm you're human. Please press Send again."));
        return true;
      },
      "expired-callback": () => reject(new Error("The check expired. Please press Send again.")),
      "timeout-callback": () => reject(new Error("The check timed out. Please press Send again.")),
    });
  });
}
function reportMessage(html, done = false) {
  reportBar.querySelector(".report-msg").innerHTML = html;
  if (done) {
    reportBar.querySelector(".report-actions").innerHTML = `<button class="btn small primary" id="reportClose">Close</button>`;
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
        body: JSON.stringify({ propertyId: p.id, lat: coords[0], lng: coords[1], wholeSubdivision: whole, website: $("#reportWebsite")?.value ?? "", token }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out.ok) throw new Error(out.error || `Error ${res.status}`);
      reportMessage("✅ <b>Thanks!</b> We'll check it. Clear fixes show on the map within about 15 minutes; others are reviewed within a day.", true);
    } catch (err) {
      reporting.sending = false;
      $("#reportSend") && ($("#reportSend").disabled = false);
      reportMessage(`⚠️ ${esc(err.message)}`);
    }
    return;
  }
  const q = new URLSearchParams({ template: "wrong-pin.yml", title: `Wrong pin: ${p.subdivision?.trim() || p.id}`, property_id: p.id, location: coords.join(", ") });
  window.open(`https://github.com/${REPORT.githubRepo}/issues/new?${q}`, "_blank", "noopener");
  endReport();
}

// ---------------------------------------------------------------- calculator
const c = {
  price: $("#cPrice"), down: $("#cDown"), income: $("#cIncome"), age: $("#cAge"), term: $("#cTerm"),
  plan: $("#cPlan"), after: $("#cAfter"), share: $("#cShare"), ltv: $("#cLtv"),
};
$("#rulesLink").href = LOAN_RULES.sourceUrl;
$("#ratesUntil").textContent = new Date(LOAN_RULES.ratesValidUntil).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" });
if (new Date() > new Date(`${LOAN_RULES.ratesValidUntil}T23:59:59+08:00`)) {
  $("#calcFor").insertAdjacentHTML("beforebegin",
    `<p class="note warn">⚠️ These rates were valid until ${esc($("#ratesUntil").textContent)} and may be out of date.
      Check the current rates on <a href="${LOAN_RULES.sourceUrl}" target="_blank" rel="noopener">Pag-IBIG's website</a>.</p>`);
}
c.income.value = settings.loan.income;
c.down.value = settings.loan.downPct;
c.age.value = settings.loan.age;
c.share.value = LOAN_RULES.assumptions.incomeShareForPayment;
c.ltv.value = LOAN_RULES.assumptions.loanToValue;
c.plan.innerHTML =
  `<option value="promo">Promo: ${LOAN_RULES.promo.tiers.map((t) => t.rate + "%").join(" / ")} fixed for first ${LOAN_RULES.promo.years} years</option>` +
  LOAN_RULES.regularRates.map((r) => `<option value="${r.years}">${r.rate}% fixed for ${r.years} years</option>`).join("");
c.after.innerHTML = LOAN_RULES.regularRates.map((r) => `<option value="${r.rate}">${r.rate}% (current ${r.years}-yr rate)</option>`).join("");

function readCalc() {
  return {
    price: Math.max(0, Number(c.price.value) || 0), downPct: Number(c.down.value), income: Math.max(0, Number(c.income.value) || 0),
    sharePct: Number(c.share.value), ltvPct: Number(c.ltv.value), age: Math.min(80, Math.max(18, Number(c.age.value) || 30)),
    termYears: Number(c.term.value), plan: c.plan.value, afterPromoRate: Number(c.after.value),
  };
}
function renderCalc() {
  const input = readCalc();
  const maxTerm = Math.max(1, Math.min(LOAN_RULES.maxTermYears, LOAN_RULES.maxAgeAtMaturity - input.age));
  c.term.max = maxTerm;
  if (Number(c.term.value) > maxTerm) c.term.value = maxTerm;
  input.termYears = Number(c.term.value);
  [...c.plan.options].forEach((o) => (o.disabled = o.value !== "promo" && Number(o.value) > input.termYears));
  if (c.plan.selectedOptions[0]?.disabled) {
    c.plan.value = "promo";
    input.plan = "promo";
  }
  $("#afterPromoWrap").style.display = input.plan === "promo" ? "" : "none";
  $("#oDown").textContent = `${input.downPct}% · ${peso((input.price * input.downPct) / 100)}`;
  $("#oTerm").textContent = `${input.termYears} years`;
  $("#oShare").textContent = `${input.sharePct}%`;
  $("#oLtv").textContent = `${input.ltvPct}%`;

  const r = calculate(input);
  const fullLoanIncome = r.incomeNeededForFullLoan;
  $("#calcSummary").innerHTML = `You'd pay about<b>${peso(r.monthly)} a month</b>for ${r.termYears} years on a ${peso(r.loan)} loan${input.plan === "promo" && r.afterPromo ? `, then about ${peso(r.afterPromo.monthly)} after year ${LOAN_RULES.promo.years}` : ""}.
    <div class="small" style="margin-top:6px;opacity:.9">Cash you need up front: ${peso(r.cashNeeded)} plus fees. Income needed for this loan: about ${peso(fullLoanIncome)} a month.</div>`;

  const warnings = [];
  if (r.ageTooHigh) warnings.push(`Applicants must be ${LOAN_RULES.maxAgeAtApplication} or younger.`);
  if (r.termCappedByAge) warnings.push(`Term shortened so the loan ends by age ${LOAN_RULES.maxAgeAtMaturity}.`);
  if (r.binding === "capacity" && r.loan < r.limits[0].value)
    warnings.push(`Your income limits the loan. To borrow the full ${peso(Math.min(r.limits[0].value, r.limits[1].value))}, you'd need about ${peso(r.incomeNeededForFullLoan)} a month in gross income.`);
  $("#calcOut").innerHTML = `
    <div class="stat"><div class="k">Monthly amortization</div><div class="v">${peso(r.monthly, 2)}</div><div class="s">at ${r.rate}% ${input.plan === "promo" ? `for the first ${LOAN_RULES.promo.years} years` : `fixed for ${input.plan} years`}</div></div>
    <div class="stat"><div class="k">Loan amount</div><div class="v">${peso(r.loan)}</div><div class="s">${r.termYears}-year term</div></div>
    <div class="stat"><div class="k">Cash you need</div><div class="v">${peso(r.cashNeeded)}</div><div class="s">price minus loan, before fees</div></div>
    ${r.afterPromo ? `<div class="stat"><div class="k">After year ${LOAN_RULES.promo.years}</div><div class="v">${peso(r.afterPromo.monthly, 2)}</div><div class="s">if repriced to ${r.afterPromo.rate}%</div></div>` : ""}
    <div class="stat"><div class="k">Total interest</div><div class="v">${peso(r.totalInterest)}</div><div class="s">${input.plan === "promo" || Number(input.plan) >= r.termYears ? "over the full term" : "if the rate never changes"}</div></div>
    <div class="stat"><div class="k">Reserve payment</div><div class="v">${peso(r.reserve, 2)}</div><div class="s">1 month's amortization, set aside from your loan</div></div>
    <div class="limits"><strong>How the loan amount was decided:</strong> Pag-IBIG lends the <em>lowest</em> of these.
      <ul>${r.limits.map((l) => `<li class="${l.key === r.binding ? "bind" : ""}">${esc(l.label)}: ${peso(l.value)}${l.key === r.binding ? " ← lowest" : ""}</li>`).join("")}</ul>
      ${warnings.map((w) => `<p class="warn">${esc(w)}</p>`).join("")}</div>`;
  const plans = ["promo", ...LOAN_RULES.regularRates.map((x) => String(x.years))].filter((pl) => pl === "promo" || Number(pl) <= input.termYears);
  $("#compare").innerHTML =
    `<thead><tr><th>Plan</th><th>Rate</th><th>Loan</th><th>Monthly</th><th>Total interest*</th></tr></thead><tbody>` +
    plans.map((pl) => {
      const x = calculate({ ...input, plan: pl });
      const name = pl === "promo" ? `Promo, first ${LOAN_RULES.promo.years} yrs` : `Fixed ${pl} yrs`;
      return `<tr class="${pl === input.plan ? "sel" : ""}"><td>${name}</td><td>${x.rate}%</td><td>${peso(x.loan)}</td><td>${peso(x.monthly, 2)}</td><td>${peso(x.totalInterest)}</td></tr>`;
    }).join("") +
    `</tbody><caption class="small muted" style="caption-side:bottom;text-align:left;padding-top:6px">*Assumes the rate stays the same after it reprices. Real future rates may differ.</caption>`;
}
function loadIntoCalculator(p) {
  c.price.value = Math.round(p.minPrice || 0);
  $("#calcFor").innerHTML = `For <strong>${esc(title(p.type))} in ${esc(title(p.city))}</strong> at its minimum bid of ${peso(p.minPrice)}. If you bid higher, change the price.`;
  setView("calc");
  renderCalc();
  $("#calc").scrollTop = 0;
}
$("#calcForm").addEventListener("input", renderCalc);
$("#calcForm").addEventListener("change", renderCalc);
renderCalc();

// ---------------------------------------------------------------- settings
let installPrompt = null; // Android/desktop Chrome "Install app" (iPhone uses Share > Add to Home Screen)
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installPrompt = e;
  if (state.view === "settings") renderSettings();
});
const isInstalled = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);

// Preview colors for the theme buttons: background, card, buttons, accent.
const THEME_SWATCH = {
  sand: ["#f3ede1", "#fbf8f1", "#566336", "#b4602e"],
  oat: ["#f5efe6", "#fffaf3", "#9a4a29", "#5f6d40"],
  khaki: ["#ede3cf", "#f8f2e6", "#5b4636", "#9a6a1c"],
  white: ["#ffffff", "#f1f3f4", "#0f5f5c", "#b8501c"],
  dark: ["#1a1814", "#302b24", "#b6c28a", "#e9976b"],
};
const TEXT_SIZES = [["normal", "Normal", 14], ["large", "Large", 17], ["larger", "Larger", 20]];
const switchRow = (id, on, label, desc) =>
  `<label class="set-row" for="${id}"><span class="lbl"><b>${label}</b>${desc ? `<span>${desc}</span>` : ""}</span>
    <span class="switch"><input type="checkbox" role="switch" id="${id}" ${on ? "checked" : ""}><span></span></span></label>`;
const btnRow = (label, desc, button) =>
  `<div class="set-row"><span class="lbl"><b>${label}</b>${desc ? `<span>${desc}</span>` : ""}</span>${button || ""}</div>`;

function renderSettings() {
  const theme = window.pmTheme;
  const a = theme.read();
  const phoneDark = matchMedia("(prefers-color-scheme: dark)").matches;
  const showing = document.documentElement.dataset.theme;
  const themes = Object.entries(theme.THEMES).map(([key, t]) => {
    const [bg, card, brand, acc] = THEME_SWATCH[key];
    return `<button class="theme-opt" role="radio" data-theme="${key}" aria-checked="${showing === key}">
      <span class="sw" style="background:${bg}" aria-hidden="true"><i style="left:8px;right:8px;top:8px;height:14px;background:${card}"></i><i style="left:8px;width:40%;bottom:8px;height:14px;background:${brand};border-radius:999px"></i><i style="right:10px;bottom:8px;width:14px;height:14px;border-radius:50%;background:${acc}"></i></span>${t.name}</button>`;
  }).join("");
  const sizes = TEXT_SIZES.map(([k, name, px]) =>
    `<button role="radio" data-text="${k}" aria-checked="${a.text === k}" aria-label="${name} text" style="font-size:${px}px">A</button>`).join("");
  const followNote = phoneDark && a.followDark && a.theme !== "dark"
    ? `Your phone is in dark mode, so Dark is showing. Turn this off to use ${theme.THEMES[a.theme].name}.`
    : "Use Dark automatically when your phone is in dark mode.";
  const loan = settings.loan;
  let install = "";
  if (!isInstalled()) {
    if (installPrompt) install = btnRow("Install the app", "Opens from your home screen like any app. Uses about 5 MB.", '<button class="btn small primary" id="sInstall">Install</button>');
    else if (isIOS()) install = btnRow("Install the app", "In Safari, tap Share, then “Add to Home Screen”.");
  }
  $("#settingsBody").innerHTML = `
    <div class="set-group"><h3>Appearance</h3>
      <div class="theme-grid" role="radiogroup" aria-label="Theme">${themes}</div>
      ${switchRow("sFollowDark", a.followDark, "Match phone's dark mode", followNote)}
      ${btnRow("Text size", "Makes words bigger everywhere in the app.", `<span class="seg" role="radiogroup" aria-label="Text size">${sizes}</span>`)}
    </div>

    <div class="set-group"><h3>Map and photos</h3>
      ${switchRow("sSaver", settings.dataSaver, "Data saver", "No photos on the map and list. Property photos load only when you ask. Good for slow or limited data.")}
      ${switchRow("sPhotoPins", settings.photoPins && !settings.dataSaver, "Photo pins", "When you zoom in close, pins show a small photo of the property.")}
      ${switchRow("sLiteMap", settings.liteMap, "Lite map", "A simpler map that's easier on older phones. The page reloads to switch.")}
      ${switchRow("sRememberMap", settings.rememberMap, "Remember where I left the map", "Opens the map at the same place next time.")}
    </div>

    <div class="set-group"><h3>Loan estimates</h3>
      <p class="set-note" style="padding-top:4px">Used for the “about ₱… a month” on each property and as the loan calculator's starting values.</p>
      <label class="set-row"><span class="lbl"><b>Monthly income</b><span>Before deductions, in pesos</span></span><input type="number" id="sIncome" min="0" step="500" inputmode="numeric" value="${loan.income}"></label>
      <label class="set-row"><span class="lbl"><b>Down payment</b></span><select id="sDown">${[0, 5, 10, 15, 20, 30, 40, 50].map((v) => `<option value="${v}" ${v === loan.downPct ? "selected" : ""}>${v}%</option>`).join("")}</select></label>
      <label class="set-row"><span class="lbl"><b>Your age</b><span>The loan must end by age 70</span></span><input type="number" id="sAge" min="18" max="65" inputmode="numeric" value="${loan.age}"></label>
    </div>

    <div class="set-group"><h3>Storage and data</h3>
      ${btnRow("Listings updated", `${esc($(".updated")?.textContent || "Loading…")} · refreshed every morning`)}
      ${btnRow("Space used on this phone", '<span id="sUsage">Checking…</span>', '<button class="btn small" id="sClearCache">Clear</button>')}
      ${btnRow("Saved properties", saved.length ? `${saved.length} saved` : "None yet", saved.length ? '<button class="btn small" id="sClearSaved">Remove all</button>' : "")}
      ${btnRow("Reset settings", "Back to the original look and options. Saved properties stay.", '<button class="btn small" id="sReset">Reset</button>')}
    </div>

    <div class="set-group"><h3>Help and about</h3>
      ${install}
      ${btnRow("Share Pagmamahal Maps", "Send the app to family and friends", '<button class="btn small" id="sShare"><svg class="ic"><use href="#i-share"/></svg>Share</button>')}
      ${btnRow("Show tips again", "", '<button class="btn small" id="sTips">Show</button>')}
      <a class="set-row" href="https://github.com/${SITE.githubRepo}/issues/new" target="_blank" rel="noopener" style="color:inherit;text-decoration:none"><span class="lbl"><b>Report a problem or suggest an idea</b><span>Opens GitHub (free account needed)</span></span><svg class="ic"><use href="#i-external"/></svg></a>
      <a class="set-row" href="about" style="color:inherit;text-decoration:none"><span class="lbl"><b>About, privacy and disclaimer</b><span>Not affiliated with Pag-IBIG Fund · version ${APP_VERSION}</span></span><svg class="ic"><use href="#i-chevron"/></svg></a>
    </div>`;
  showUsage();
}

async function showUsage() {
  const el = $("#sUsage");
  if (!el) return;
  try {
    const { usage } = await navigator.storage.estimate();
    const mb = usage / 1048576;
    el.textContent = `${mb < 0.1 ? "Less than 0.1" : `About ${mb.toFixed(1)}`} MB: the app and today's listings, for offline use`;
  } catch {
    el.textContent = "The app and today's listings, for offline use";
  }
}

function setAppearance(change) {
  window.pmTheme.save({ ...window.pmTheme.read(), ...change });
  renderSettings();
}
function redrawPins() {
  for (const m of markers.values()) m._mode = null;
  refreshPinModes();
}
const forget = (...keys) => keys.forEach((k) => { try { localStorage.removeItem(k); } catch { /* blocked */ } });

$("#settingsBody").addEventListener("click", async (e) => {
  const t = e.target.closest("button");
  if (!t) return;
  if (t.dataset.theme) {
    const a = window.pmTheme.read();
    const change = { theme: t.dataset.theme };
    // Picking a light theme while the phone is dark: show it now instead of Dark.
    if (matchMedia("(prefers-color-scheme: dark)").matches && a.followDark && t.dataset.theme !== "dark") {
      change.followDark = false;
      toast("Turned off “Match phone's dark mode” so this theme shows");
    }
    setAppearance(change);
  } else if (t.dataset.text) {
    setAppearance({ text: t.dataset.text });
  } else if (t.id === "sInstall" && installPrompt) {
    installPrompt.prompt();
    await installPrompt.userChoice.catch(() => {});
    installPrompt = null;
    renderSettings();
  } else if (t.id === "sShare") {
    const data = { title: SITE.name, text: "Pag-IBIG acquired properties on a map, with photos and a loan calculator. Free.", url: SITE.url };
    if (navigator.share) navigator.share(data).catch(() => {});
    else copy(SITE.url, "Link copied");
  } else if (t.id === "sTips") {
    store.set("pm.tip.v1", false);
    setView("map");
    maybeShowTip();
  } else if (t.id === "sClearCache") {
    try {
      for (const k of await caches.keys()) await caches.delete(k);
      toast("Cleared. The app downloads what it needs next time.");
    } catch {
      toast("Couldn't clear it here. Use your browser settings instead.");
    }
    showUsage();
  } else if (t.id === "sClearSaved") {
    if (!confirm(`Remove all ${saved.length} saved properties from this phone? This can't be undone.`)) return;
    saved = [];
    store.set("pm.saved", saved);
    updateSavedBadge();
    $$("[data-save]").forEach((b) => b.setAttribute("aria-pressed", "false"));
    toast("Saved properties removed");
    renderSettings();
  } else if (t.id === "sReset") {
    if (!confirm("Reset the look and all options to how they started? Saved properties stay.")) return;
    forget("pm.appearance", "pm.dataSaver", "pm.photoPins", "pm.liteMap", "pm.rememberMap", "pm.mapPos", "pm.loan");
    location.reload();
  }
});

$("#settingsBody").addEventListener("change", (e) => {
  const t = e.target;
  if (t.id === "sFollowDark") setAppearance({ followDark: t.checked });
  else if (t.id === "sSaver") {
    settings.dataSaver = t.checked;
    store.set("pm.dataSaver", t.checked);
    redrawPins();
    renderList();
    renderSettings();
  } else if (t.id === "sPhotoPins") {
    settings.photoPins = t.checked;
    store.set("pm.photoPins", t.checked);
    if (t.checked && settings.dataSaver) {
      settings.dataSaver = false;
      store.set("pm.dataSaver", false);
      renderList();
      toast("Data saver turned off so photos can show");
    }
    redrawPins();
    renderSettings();
  } else if (t.id === "sLiteMap") {
    store.set("pm.liteMap", t.checked);
    location.reload();
  } else if (t.id === "sRememberMap") {
    settings.rememberMap = t.checked;
    store.set("pm.rememberMap", t.checked);
    if (!t.checked) forget("pm.mapPos");
  } else if (["sIncome", "sDown", "sAge"].includes(t.id)) {
    const income = Math.max(0, Math.round(Number($("#sIncome").value) || 0));
    const age = Math.min(65, Math.max(18, Math.round(Number($("#sAge").value) || LOAN_DEFAULTS.age)));
    settings.loan = { income, downPct: Number($("#sDown").value), age };
    store.set("pm.loan", settings.loan);
    c.income.value = income;
    c.down.value = settings.loan.downPct;
    c.age.value = age;
    renderCalc();
    $("#sIncome").value = income;
    $("#sAge").value = age;
    toast("Saved");
  }
});

// ---------------------------------------------------------------- start
async function load() {
  try {
    const res = await fetch("data/listings.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.all = data.properties.filter((p) => p.id);
    for (const p of state.all) {
      p._hay = [p.address, p.barangay, p.city, p.province, p.region, p.subdivision, p.type, p.id].join(" ").toLowerCase();
      p._group = typeGroup(p.type);
      state.byId.set(p.id, p);
    }
    const updated = new Date(data.generatedAt).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
    $$(".updated").forEach((el) => (el.textContent = updated));
    $("#mapLoading").remove();
    applyFilters({ refit: false });
    // Opened from a shared link (?p=...): show that property; Back returns to the map.
    const shared = new URLSearchParams(location.search).get("p");
    if (shared && state.byId.has(shared)) {
      history.replaceState(null, "", location.pathname);
      const p = state.byId.get(shared);
      if (p.coords) map.setView(p.coords, 16);
      openDetail(shared);
    } else {
      maybeShowTip();
    }
  } catch (err) {
    $("#mapLoading").textContent = "Couldn't load properties. Check your connection and refresh.";
    $("#results").innerHTML = `<li class="empty"><h3>Couldn't load properties</h3><p class="muted">Check your connection and try again.</p><button class="btn" id="retryLoad">Try again</button></li>`;
    $("#retryLoad").onclick = () => location.reload();
  }
}

const startView = location.hash.slice(1);
setView(["list", "saved", "calc", "settings"].includes(startView) ? startView : "map");
updateSavedBadge();
load();

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
