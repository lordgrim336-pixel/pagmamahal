# Pagmamahal

A web app (that also installs on phones) for browsing Pag-IBIG Fund acquired
properties on a map, with a Pag-IBIG housing loan calculator.

Not affiliated with Pag-IBIG Fund.

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
Set where reports go in `public/js/config.js`: a GitHub repo (opens a
prefilled issue) or an email address. If neither is set, the report is copied for
the person to send you. To apply a report, paste its entry into
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

## Hosting on GitHub (free)

Everything below is free for **public** repositories: hosting (GitHub Pages),
the daily refresh and report checks (GitHub Actions). Users need a free GitHub
account only to report a wrong pin.

1. Create a new **public** repository on GitHub, without a README.
2. Push this folder to it.
3. In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. **Actions → Publish site → Run workflow**. The first run takes about 10 minutes.
   The site appears at `https://<your-username>.github.io/<repo-name>/`. After
   that it refreshes daily at 05:17 Philippine time.

### How wrong-pin reports are handled

1. A user taps **Pin in the wrong place?**, taps the right spot and presses Send.
   This opens the report form on GitHub, already filled in.
2. **Check pin report** (`.github/workflows/pin-report.yml`) checks it within
   minutes, using `scripts/review-report.mjs`:
   - **Applied automatically** if the spot is inside the property's town and
     either inside its barangay or within 1.5 km of the current pin. The fix is
     saved to `data/location-overrides.json`, the reporter is thanked, and the
     map republishes.
   - **Labeled `needs-review`** if the spot is outside the town or far away, if
     the property has Pag-IBIG GPS or an earlier verified fix, if the reporter's
     account is under a week old, or if the reporter already had 10 fixes today.
   - A fix for a **whole building/subdivision** needs two different people
     reporting spots within 300 m. Until then only the reported unit moves.
3. **Weekly Claude review:** a scheduled Claude routine (runs on your Claude plan,
   no extra charge) follows `docs/weekly-pin-review.md`. It looks at the
   `needs-review` reports, comments its recommendation on each, and opens one pull
   request with the fixes it recommends. Merging that PR applies them.
4. You can also approve any report yourself by adding the **approved** label.

Every fix is a normal commit, so a bad one can be reverted from GitHub's history.

## Putting it online elsewhere

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
| `public/js/config.js` | Where "wrong pin" reports go |
| `reports/`, `research_notes/` | Research on free location sources |
| `scripts/serve.mjs` | Small local web server |
| `public/index.html` | The app page |
| `public/js/app.js` | Map, list, details and calculator screens |
| `public/js/loan-rules.js` | Pag-IBIG loan rules and loan math |
| `public/css/styles.css` | Styles (light and dark, phone and desktop) |
| `public/sw.js`, `public/manifest.webmanifest` | Offline support and phone install |
| `public/data/listings.json` | Collected listings (generated) |
| `data/geocode-cache.json` | Saved approximate locations (generated) |
