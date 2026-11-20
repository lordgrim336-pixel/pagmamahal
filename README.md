# Pagmamahal Maps

**Live at https://pagmamahal-maps.pages.dev**

A free web app (that also installs on phones) for browsing Pag-IBIG Fund
acquired properties on a map, with a Pag-IBIG housing loan calculator.

Not affiliated with Pag-IBIG Fund. See the site's
[About, privacy & disclaimer](https://pagmamahal-maps.pages.dev/about) page.

## What it does

- **Map** of properties from the Pag-IBIG Online Public Auction (1st auction,
  2nd auction and negotiated sale). Teal pins have the exact GPS reading Pag-IBIG
  posted. Orange pins are approximate: Pag-IBIG left the GPS blank, so the pin sits
  at the subdivision or town center.
- **List** with search, a Region → Province → City filter (each step is
  optional, and each dropdown only lists places that have properties), other
  filters (sale type, property type, occupancy, max price, "bidding open now")
  and sorting.
- **Property details**: minimum bid price, bidding dates, areas, occupancy,
  remarks, the handling office, and buttons for the Pag-IBIG site, Google Maps
  and the loan calculator.
- **Loan calculator**: adjust the price, down payment, income, age, term and
  interest plan. It shows the monthly amortization, the loan amount (and which
  limit decided it), the cash you need, total interest, and a comparison of every
  interest plan.

### Limits of the Pag-IBIG data

- **No live bids.** Pag-IBIG auctions are sealed-bid, so other bidders' offers
  aren't public. The app shows the **minimum bid price**.
- **No per-property link.** Pag-IBIG's site opens property details in a panel,
  not on a page of their own. "Open on Pag-IBIG" opens the auction site and copies
  the property ID. The details panel also says which region, province and city to
  pick there.
- **About two thirds of listings have no usable GPS reading.** See below.

## How pins are placed

Every source is free and needs no account or card. Each pin uses the first of
these that works:

| Order | Source | Typical accuracy* |
| --- | --- | --- |
| 1 | Manual corrections in `data/location-overrides.json` | exact |
| 2 | Pag-IBIG's own GPS, **only if it lies inside the town in the address** (about 4% of readings don't) | exact |
| 3 | Middle of other Pag-IBIG GPS readings in the same subdivision | inside the subdivision |
| 4 | The subdivision on OpenStreetMap, checked to be inside the town | 0.17 km (90% within 0.5 km) |
| 5 | The subdivision in [Overture Maps Places](https://docs.overturemaps.org/guides/places/), checked to be inside the town, preferring the barangay | 0.21 km (90% within 0.8 km) |
| 6 | Inside the barangay named in the address (official PSGC boundaries) | 0.9 km (90% within 2 km) |
| 7 | Town center | 3.9 km |

*Measured with `npm run eval-locations`: for subdivisions whose true location
is known from Pag-IBIG GPS, each method is tried without that GPS and its
distance from the true spot is recorded.

In the app, approximate pins say which method placed them, show a shaded circle
for the area the property is probably in, and offer **See address on Google Maps**.
Opening that link is free; Google's search often pinpoints buildings our open
data lacks.

### Fixing wrong pins

Anyone can press **Pin in the wrong place?**, tap the right spot and press Send.
Reports are handled automatically (see "How wrong-pin reports are handled" below). To apply a report, paste its entry into
`data/location-overrides.json`. Key it by property ID for one listing, or by
`sub:<SUBDIVISION>|<CITY>` to fix every unit in a building or subdivision. It
takes effect on the next `npm run fetch`.

## Running it on your computer

You need [Node.js](https://nodejs.org) 18 or newer. Once, install the tools and
download the open map data (about 100 MB):

```powershell
npm install
```

```powershell
npm run update-boundaries
```

```powershell
npm run update-overture
```

Then collect the listings:

```powershell
npm run fetch
```

This writes `public/data/listings.json` in a minute or two. OpenStreetMap's rules
allow scheduled scripts only 4 lookups a minute. So each run looks up at most 60
new subdivisions there, one every 15 seconds, and saves results in
`data/geocode-cache.json` for good. Change the cap with `-- --osm-budget 20`
(0 = no new lookups).

Refresh the open data now and then: `npm run update-overture` every few months
(Overture releases monthly), and `npm run update-boundaries` when a new PSGC
quarter comes out.

```powershell
npm start
```

Then open http://localhost:5173.

## Hosting (free)

| Piece | Where | Cost |
| --- | --- | --- |
| Website | Cloudflare Pages, project `pagmamahal-maps` → https://pagmamahal-maps.pages.dev | free plan |
| Daily data refresh, report checks, tests | GitHub Actions in this public repo | free for public repos |
| Report relay and bot check | Cloudflare Worker `pagmamahal-reports` + Turnstile (`relay/`) | free plan |
| Daily Claude review | Claude routine "Daily pin review" | included in a Claude Pro plan |
| Old address `lordgrim336-pixel.github.io/pagmamahal` | GitHub Pages, redirects to the new address | free |

**Publish site** (`.github/workflows/publish.yml`) runs daily at 05:17
Philippine time, and after every pin fix or code change. It collects the
listings, places the pins and publishes `public/` to Cloudflare Pages. It needs
one repository secret, `CLOUDFLARE_API_TOKEN`: a Cloudflare API token with
**Cloudflare Pages: Edit** permission.

**Safety:** if Pag-IBIG's site is down, more than 5% of city searches fail, or
listings drop by more than 30% compared with the published site, the run stops
and the site keeps yesterday's data. GitHub emails you about the failed run.
Run `npm run fetch -- --force` if a big drop is real.

All site settings (address, map style, report relay) live in one file,
`public/js/config.js`. The relay keeps its own allowed-address list in
`relay/wrangler.toml`.

### How wrong-pin reports are handled

1. A user taps **Pin in the wrong place?**, taps the right spot and presses
   **Send**. There's no sign-in: the report goes to a small free relay on
   Cloudflare (`relay/`). The relay runs an invisible bot check (Turnstile),
   limits reports per day, and saves the report as `data/inbox/<id>.json` in
   this repo. Visitor IP addresses are never stored, only a salted hash used to
   spot repeat reporters.
2. **Process pin reports** (`.github/workflows/pin-inbox.yml`) checks each report
   within minutes, using `scripts/process-inbox.mjs`. The report is **applied
   automatically** only if all of these hold:
   - the spot is inside the property's town and barangay;
   - the current pin isn't Pag-IBIG's own GPS or an earlier verified fix;
   - the property hasn't had a fix in the last 30 days;
   - it's for one property only;
   - fewer than 30 automatic fixes were made today.

   Anything else is marked `pending` in `data/pin-reports.json`.
3. **Daily Claude review:** a scheduled Claude routine runs every day at 9:00 AM
   Philippine time, on your Claude plan with no extra charge. It follows
   `docs/daily-pin-review.md`. If nothing is pending it stops right away.
   Otherwise it weighs the evidence (boundaries, Overture, OpenStreetMap, other
   reports) and opens one pull request with its decisions. GitHub notifies you;
   merging the PR applies the fixes and republishes the map.
4. People with GitHub accounts can also use the issue form (`wrong-pin` label).
   Those reports are checked by `.github/workflows/pin-report.yml`, and you can
   approve any report yourself by adding the **approved** label.

Every fix is a normal commit, so a bad one can be reverted from GitHub's history.

### Relay setup (once)

See `relay/README.md`. Until the relay is set up (`endpoint` in
`public/js/config.js` is empty), **Send** falls back to the GitHub issue form.

## Tests

```powershell
npm test
```

These cover the loan math, the automatic pin-report rules and address parsing.
`.github/workflows/test.yml` runs them on every change and pull request,
including the daily Claude review's pull requests.

## Putting it online elsewhere (optional)

The app in `public/` is plain HTML, CSS and JavaScript with no build step. Any
static host works (Netlify, Cloudflare Pages, GitHub Pages, Vercel): publish the
`public` folder.

To keep listings fresh, run `npm run fetch` on a schedule (for example once a
day) and re-publish. With GitHub, a scheduled GitHub Actions workflow can do both.
Keep `data/geocode-cache.json` and `data/location-overrides.json` with the
project, so lookups and corrections are never lost.

The map credits its data sources in the bottom corner, as their licenses
require: OpenStreetMap (ODbL), Overture Maps Foundation and its sources
(CDLA-Permissive-2.0 / Apache-2.0 / CC0), and NAMRIA, PSA and OCHA for the
barangay boundaries (CC BY-IGO). Pin locations taken from OpenStreetMap make
`listings.json` an ODbL "derivative database". If you share that file
publicly, share it under ODbL terms.

On a phone, open the site and choose **Add to Home Screen** to install it like
an app. It keeps working offline with the last listings it loaded.

## Updating loan rates

Every loan rule lives in `public/js/loan-rules.js`, taken from
https://pagibigfund.gov.ph/Availmentofnewloan.html (rates valid until
December 31, 2026). When Pag-IBIG publishes new rates, edit that file.

Two values are **assumptions**, because Pag-IBIG's loan page doesn't state them.
Users can adjust both in the calculator:

- payments capped at **35%** of gross monthly income;
- a **90%** loan-to-value limit.

Estimates leave out insurance (MRI/SRI and fire insurance) and fees.

## Files

| Path | Purpose |
| --- | --- |
| `scripts/fetch-listings.mjs` | Collects listings from Pag-IBIG |
| `scripts/lib/locate.mjs` | Decides each pin's location (the order above) |
| `scripts/lib/overture-match.mjs` | Finds subdivisions by name in Overture Places |
| `scripts/lib/admin-areas.mjs` | Town/barangay boundaries: "is this point in the right town?" |
| `scripts/eval-locations.mjs` | Measures each location method's accuracy |
| `scripts/update-overture.mjs`, `scripts/update-boundaries.mjs` | Download the open map data |
| `data/location-overrides.json` | Your manual pin corrections |
| `data/overture/`, `data/boundaries/` | Downloaded open map data |
| `public/js/config.js` | All site settings: address, map style, report relay |
| `public/about.html` | About, privacy and disclaimer page |
| `public/_headers` | Security headers for Cloudflare Pages |
| `public/icons/` | Logo, phone icons and link-preview image (`npm run icons` re-renders the PNGs) |
| `relay/` | Cloudflare Worker that receives "wrong pin" reports |
| `scripts/process-inbox.mjs`, `scripts/review-report.mjs` | Check pin reports from the app and from GitHub |
| `tests/` | Automated tests |
| `docs/daily-pin-review.md` | Instructions for the daily Claude review |
| `docs/LAUNCH-REPORT.md` | Status report, costs and launch plan |
| `docs/research/` | Research on free location sources |
| `scripts/serve.mjs` | Small local web server |
| `public/index.html` | The app page |
| `public/js/app.js` | Map, list, details and calculator screens |
| `public/js/loan-rules.js` | Pag-IBIG loan rules and loan math |
| `public/css/styles.css` | Styles (light and dark, phone and desktop) |
| `public/sw.js`, `public/manifest.webmanifest` | Offline support and phone install |
| `public/data/listings.json` | Collected listings (generated) |
| `data/geocode-cache.json` | Saved approximate locations (generated) |
