// The one settings file for Pagmamahal Maps. The app reads it in the browser,
// and the data scripts (scripts/*.mjs) import it too, so each setting lives in
// one place. The relay has its own copy of the site address in
// relay/wrangler.toml (ALLOWED_ORIGINS).

export const SITE = {
  name: "Pagmamahal Maps",
  url: "https://pagmamahal-maps.pages.dev",
  githubRepo: "lordgrim336-pixel/pagmamahal",
};

// Map background: OpenFreeMap (free, no key, OpenStreetMap data).
export const MAP = {
  style: "https://tiles.openfreemap.org/styles/liberty",
  attribution:
    '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> · ' +
    '&copy; <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> · ' +
    'Data &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · ' +
    '<a href="https://docs.overturemaps.org/attribution/" target="_blank" rel="noopener" title="Overture Maps Foundation; data from Meta, Microsoft, Foursquare and others">Overture</a> · ' +
    '<span title="Barangay boundaries: NAMRIA, PSA, OCHA (CC BY-IGO)">NAMRIA/PSA/OCHA</span>',
};

// Where "Pin in the wrong place?" reports go, in order of preference:
//   endpoint + turnstileSiteKey -> one-tap, no sign-in (the Cloudflare relay in relay/)
//   githubRepo                  -> opens the pre-filled report form on GitHub (needs an account)
//   email                       -> opens a pre-filled email
// If none is set, the report is copied to the clipboard instead.
export const REPORT = {
  endpoint: "https://pagmamahal-reports.lord-grim336.workers.dev/report",
  turnstileSiteKey: "0x4AAAAAAGJ2eK_VwUyvluTt",
  githubRepo: SITE.githubRepo,
  email: "",
};
