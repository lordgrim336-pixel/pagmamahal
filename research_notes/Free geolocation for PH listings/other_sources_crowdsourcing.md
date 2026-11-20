# Other zero-cost sources and crowdsourcing for PH listing location accuracy (beyond geocoders/POI)

Research date: 2026-11-20. Scope: building footprints, open addresses, street-level imagery, Wikimapia, crowdsourced "wrong pin" reports for a static site, OSM contribution, uncertainty UX, and GitHub Actions limits.

## Building footprints (Google Open Buildings v3, Microsoft Global ML, Overture): PH coverage, license, usefulness

### Takeaway
All three footprint datasets cover the Philippines (Microsoft's coverage map isn't readable as text, but Microsoft publishes a separate Indonesia/Malaysia/Philippines release). All three can be used for free. The licenses are Google: CC BY 4.0 or ODbL, your choice; Microsoft: CDLA-Permissive 2.0; Overture: ODbL. The simplest option for a Node daily job is Google v3 (CSV with `area_in_meters` and `confidence`) or Overture (GeoParquet with a bbox query). Both work for snapping a condo pin to the nearest large footprint and for estimating subdivision extent from clusters of small houses, but this should be a one-time preprocessing step, not something re-downloaded every day.

### Cited Findings
- Google Open Buildings v3 lists the Philippines (PHL), along with Indonesia, Malaysia, Thailand, Vietnam and others. The page notes the list "is subject to change" — [Google Open Buildings](https://sites.research.google/gr/open-buildings/)
- Google v3 license: dual CC BY 4.0 and ODbL v1.0, at the user's choice — [Google Open Buildings](https://sites.research.google/gr/open-buildings/)
- Google v3 format: CSV files, one per S2 level-4 cell. Polygons total 178 GB and points 48 GB. Fields are latitude/longitude (centroid), `area_in_meters`, `confidence` (0.65–1.0), WKT `geometry`, and `full_plus_code`. A separate score-thresholds CSV gives per-tile confidence cutoffs for 80/85/90% precision. Access is via gsutil (`gs://open-buildings-data/v3/...`), HDX country datasets, Earth Engine, or a Colab notebook for region extracts — [Google Open Buildings](https://sites.research.google/gr/open-buildings/)
- The Google site also links a "Temporal Dataset" marked New!. Its contents weren't verified — [Google Open Buildings](https://sites.research.google/gr/open-buildings/)
- Microsoft Global ML Building Footprints: CDLA Permissive 2.0. As of the 12 Nov 2026 update it has 30,108 tiles across 225 regions. Files are line-delimited GeoJSON in `.csv.gz` (EPSG:4326), partitioned by country and quadkey (level 9), and indexed by `dataset-links.csv`. Hosting moved to `bfppub.blob.core.windows.net` on 24 Jul 2026. Each footprint has an estimated `height` (m) and `confidence`, and these are now `null` where not measured (previously -1). Coverage GeoJSONs are provided for buildings and for buildings with height. The README links a separate Indonesia/Malaysia/Philippines release. It excludes imagery older than 2014 and areas with low detection probability. Its building counts are inconsistent (about 1.4B vs 999M) — [GitHub: microsoft/GlobalMLBuildingFootprints](https://github.com/microsoft/GlobalMLBuildingFootprints)
- Overture buildings theme: conflates OSM (highest priority), Esri Community Maps, Microsoft and Google ML buildings, and some authoritative datasets. It is ODbL because it includes OSM. Heights are merged between matched features. Release 2026-11-18.0 is at `s3://overturemaps-us-west-2/release/2026-11-18.0/theme=buildings/type=building/*` (an Azure mirror also exists) — [Overture buildings guide](https://docs.overturemaps.org/guides/buildings/)

### Inferences
- **Condo snapping:** Microsoft's per-building `height` is the most direct signal for "is this a tower?". Google gives only `area_in_meters`. A heuristic: within about 150–300 m of a geocoded condo pin, choose the footprint with the largest area (or, with Microsoft data, the tallest), and snap only if one candidate clearly dominates. Otherwise keep the original pin and show an uncertainty circle. Overture is convenient because it already merges OSM building tags such as names and levels with the ML footprints.
- **Subdivision extent:** Find dense clusters of small footprints (for example 30–150 m²) near an approximate point, using DBSCAN or a grid-density method, and take the convex or concave hull. That hull can be shown as an "approximate area" polygon. This is a heuristic, and adjacent subdivisions or informal settlements will merge together.
- **Pipeline cost:** Don't download country files inside the daily job. Run a one-time (or quarterly) extraction for the bounding boxes or cities you need, keep a small GeoJSON or FlatGeobuf in the repo or a release asset, and query it from the daily Node job. The full PH Google tile and Microsoft PH quadkeys are several GB uncompressed, which is too much to fetch every day on a runner.
- **Attribution:** If you show or derive data from Overture or the ODbL option of Google, include attribution, and remember that ODbL share-alike applies to derived databases you publish.

### Gaps
- I couldn't extract PH-specific building counts or imagery dates for any of the three datasets.
- Microsoft's coverage map is an image, so I couldn't confirm PH coverage in the global set, beyond the linked IDN/MYS/PHL release.
- I didn't verify the Google Temporal Dataset's details, or the Overture CLI or DuckDB bbox syntax (the docs page I fetched didn't include it).

## Open address points (OpenAddresses, Overture addresses), Mapillary, Wikimapia

### Takeaway
There is no usable open address-point dataset for the Philippines. OpenAddresses has no `ph` source directory, and Overture's addresses theme doesn't list PH. Mapillary is free (it needs a token) and its imagery is CC BY-SA, so it's useful for a human to verify a pin by viewing nearby street photos, not as a data source. Wikimapia data is CC BY-SA but is believed to be traced from Google imagery, and OSM refuses to import it. Avoid it as a data source.

### Cited Findings
- The OpenAddresses GitHub `sources/` directory has country folders such as `sg`, `th`, `tw`, `jp` and `kr`, but no `ph` folder. `GET /repos/openaddresses/openaddresses/contents/sources/ph` returns 404 (checked through the GitHub API on 2026-11-20) — [GitHub: openaddresses/openaddresses](https://github.com/openaddresses/openaddresses)
- OpenAddresses metadata is CC0, but the address data's licenses vary by source — [openaddresses.io](https://openaddresses.io/)
- Overture's addresses theme per-country table lists 41 countries, and the Philippines is not one of them. The theme has a mix of source licenses — [Overture addresses guide](https://docs.overturemaps.org/guides/addresses/)
- Mapillary API v4 requires an access token for graph.mapillary.com and tiles.mapillary.com. Rate limits are 60,000/min for the Entity API, 10,000/min for Search, and 50,000/day for tiles. Bbox search must cover less than 0.01 square degrees. Radius search takes `lat`, `lng` and `radius` (max 50 m) with `limit` up to 100. An iframe embed is available at `https://www.mapillary.com/embed?image_key=IMAGE_ID&style=photo|split|classic` — [Mapillary API docs](https://www.mapillary.com/developer/api-documentation)
- Mapillary images are CC BY-SA and require attribution to the photographer — [Mapillary help](https://help.mapillary.com/hc/en-us/articles/115001770409-CC-BY-SA-license-for-open-data). Mapillary explicitly allows deriving data from its images for OSM — [Mapillary OSM page](https://mapillary.com/osm); [OSM wiki: Mapillary](https://wiki.openstreetmap.org/wiki/Mapillary)
- Wikimapia's terms say its data is CC BY-SA. Contributors trace Google imagery, so it may be a derived work, which Google's terms bar. OSM doesn't import Wikimapia, and copying OSM into Wikimapia is also prohibited. The wiki calls Wikimapia's data model too limited for serious GIS — [OSM wiki: Wikimapia](https://wiki.openstreetmap.org/wiki/Wikimapia)

### Inferences
- **Mapillary in the app:** Add a "street view near this pin" link or iframe that uses the radius search (50 m) from the browser, showing the photographer attribution. A public client token in a static site is normal for Mapillary, but it's still worth checking token scopes. Use it as a verification aid for the maintainer and for users, not for automatic correction.
- **Mapillary in the daily job:** Optionally, the daily job can flag listings that have no Mapillary imagery within 50 m. Coverage is sparse in many PH subdivisions, because they are gated.

### Gaps
- I didn't check Mapillary coverage density in PH metros, or whether exposing a client token in a static site is officially sanctioned.
- I found no PH government open address-points dataset (for example from PSA or NAMRIA). That doesn't prove none exists, but I found nothing in these searches.

## Crowdsourced "report wrong pin" for a static, zero-cost site

### Takeaway
**Simplest robust option:** a prefilled GitHub Issue link that opens a GitHub Issue Form, labelled automatically, plus a GitHub Action that reads issues carrying an `approved` label and writes `overrides.json`, which the daily refresh then uses. It costs nothing, needs no card or backend, and GitHub accounts act as a spam barrier. The downside is that reporters need a GitHub account, which most Filipino home buyers won't have. For non-technical users, add a Google Form as a second, anonymous channel; exporting its responses into the job takes a small setup. Netlify Forms (now unlimited on credit plans), Cloudflare Workers plus D1 (generous free tier), Formspree (only 50 submissions/month) and Supabase (pauses after a week of inactivity) are all possible but add moving parts.

### Cited Findings
- **Prefilled issue URLs:** `https://github.com/OWNER/REPO/issues/new?title=...&body=...&labels=...&template=...` work. Labels and assignees require the reporter to have that permission, otherwise the request returns 404. Very long URLs return 414. Custom fields in issue forms can also be prefilled — [GitHub Docs: creating an issue](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/creating-an-issue)
- **Issue form YAML:** `name`, `description` and `body` are required, and `title`, `labels`, `assignees`, `type` and `projects` are optional. Field types include `markdown`, `input`, `textarea`, `dropdown`, `checkboxes` and `upload`. The `labels` key applies existing labels automatically to issues created from the template. Issue forms are labelled "public preview" — [GitHub Docs: syntax for issue forms](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms)
- **Issues event:** the `issues` trigger supports `opened`, `edited`, `labeled`, `closed` and other types, so a workflow can run when a maintainer adds a label — [GitHub Docs: events that trigger workflows](https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows)
- **Netlify Forms:** on credit-based plans, forms are "free and unlimited" with no submission tiers. However, if a Free plan site uses up its monthly credits, every project pauses ("Site not available") and form submissions aren't accepted until the next cycle. Free accounts can't buy add-on credits. A payment method is mentioned as required for the Personal and Pro plans, not Free. Legacy free plans had metered submission limits (number not captured) — [Netlify Forms usage & billing](https://docs.netlify.com/manage/forms/usage-and-billing/); [Netlify credit-plan billing FAQ](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/billing-faq-for-credit-based-plans/)
- **Cloudflare Workers Free:** 100,000 requests/day (reset at 00:00 UTC) and 10 ms CPU per request — [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/). D1 Free: 5M rows read/day, 100k rows written/day, 5 GB storage, 10 databases. Queries fail when a limit is hit until the reset — [Cloudflare D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)
- **Formspree Free:** 50 submissions/month, 2 linked emails, 30-day history, and warnings at 50/75/90% — [Formspree account limits](https://help.formspree.io/articles/account-management/account-limits)
- **Supabase Free:** 500 MB database per project, 50k MAU, a limit of 2 active projects, and free projects pause after 1 week of inactivity — [Supabase pricing](https://supabase.com/pricing)

### Inferences
- **Recommended flow:**
  1. Each listing popup gets a "Report wrong location" link to `issues/new?template=wrong-pin.yml&title=Wrong+pin:+<listing-id>&listing_id=<id>&current_lat=..&current_lng=..`. The `template` and form-field parameters work for anyone signed in, whereas the `labels` parameter wouldn't, because reporters lack label permission. The template's `labels:` key adds `location-report` instead.
  2. The form fields are the listing ID (prefilled), the correct location as a Google or OSM link or lat,lng, the correct subdivision or building name, a confidence dropdown, and how the reporter knows.
  3. The maintainer reviews the report and adds an `approved` label.
  4. A workflow `on: issues: types: [labeled]` with an `if:` on the label name parses the form body (issue forms render as `### Field` markdown sections), validates that the coordinates fall inside a PH bbox and within a reasonable distance, commits to `data/overrides.json`, and closes the issue. Alternatively, the daily refresh job can query `gh issue list --label approved` itself.
  5. The daily Node refresh applies overrides last, so they take precedence over geocoder results.
- **Spam:** the GitHub account requirement and manual approval are the spam control. No CAPTCHA infrastructure is needed.
- **Google Form fallback:** It needs no account and is free. It can link responses to a Google Sheet, which can be "published to the web" as CSV for the Action to fetch. Responses should still be approved by hand, for example with an "approved" column. Google Forms details weren't verified in this research.
- **Netlify:** Netlify Forms is now unlimited on Free credit plans, but hosting the site on Netlify ties form availability to the site's credit budget. A traffic spike pauses both the site and the forms.
- **Cloudflare:** A Worker plus D1 is the most capable zero-cost backend. It allows anonymous posts, and Turnstile could be added (not verified here). It adds code, secrets and abuse handling, so it's only worth it if anonymous, high-volume reporting matters.
- **Avoid:** Supabase, because pausing after a week without traffic is a poor fit for an occasional-use report form. Formspree, because 50/month is enough, but it only sends email or a dashboard, so getting reports into `overrides.json` needs manual steps.

### Gaps
- I didn't verify whether Cloudflare, Netlify or Formspree require a credit card to sign up for their free plans. None of the fetched pages stated a card requirement for the free tier.
- I didn't verify Google Forms limits or the exact syntax for prefilling issue-form fields by ID.
- I didn't verify spam-filter specifics for Netlify (Akismet, honeypot) or Formspree.

## Contributing missing subdivisions/condos to OpenStreetMap; imagery legality; Nominatim update speed

### Takeaway
Adding missing subdivisions and condos to OSM is legitimate and is the most durable fix, because it improves Nominatim and Overture for everyone. Follow the PH tagging conventions and trace only from your own knowledge or survey, Esri World Imagery (explicitly permitted), or Mapillary (explicitly permitted). Never use Google Maps or Street View, and never copy listing-site maps. Nominatim runs on minutely OSM diffs, so edits usually become searchable within minutes to hours, but I found no official statement of the public instance's lag.

### Cited Findings
- **PH conventions:** tag subdivisions as `landuse=residential` + `residential=single_family`, and condominium complexes as `residential=apartments`. Add `operator=*` for the developer. Don't add a "Subdivision" suffix unless it is part of the actual name. Barangays use `place=village` or `place=quarter`, `admin_level=10` and `admin_type:PH=barangay`, as relations. Use full street names with no abbreviations. These conventions were agreed by WikiProject Philippines — [OSM wiki: Philippines/Mapping conventions](https://wiki.openstreetmap.org/wiki/Philippines/Mapping_conventions)
- **Esri World Imagery:** Esri has allowed its use in OSM mapping without restrictions. It's selectable in iD, JOSM and Vespucci. Tag changesets with `imagery_used=Esri` or `source=Esri` — [OSM wiki: Esri](https://wiki.openstreetmap.org/wiki/Esri)
- **Bing:** Microsoft has deprecated Bing Maps for Enterprise. Community posts claim iD's Bing access continues until 2028 and report problems loading Bing in JOSM. These claims are disputed and unofficial — [OSM community: Bing Maps REST discontinued](https://community.openstreetmap.org/t/discontinued-services-bing-maps-rest-services/117308); [OSM wiki: Talk:Bing Maps](https://wiki.openstreetmap.org/wiki/Talk:Bing_Maps)
- **Mapillary:** images may be used to derive data for OSM — [Mapillary OSM page](https://mapillary.com/osm)
- **Nominatim updates:** a default Nominatim installation updates from the global minutely diffs — [Nominatim docs: Update](https://nominatim.org/release-docs/latest/admin/Update/). The public usage policy allows at most 1 request per second and recurring scripts at 4 requests per minute. It requires a custom User-Agent or Referer and caching, and it bans bulk or systematic queries and autocomplete — [OSMF Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/)
- **Wikimapia:** not an acceptable OSM source — [OSM wiki: Wikimapia](https://wiki.openstreetmap.org/wiki/Wikimapia)

### Inferences
- **Workflow:** when a crowdsourced report is approved and the location is verified (for example on Esri imagery, where a subdivision's gate and road grid are usually visible), also add or fix the feature in OSM with `name` and `landuse=residential` + `residential=single_family`. After Nominatim picks it up, the geocoder resolves it directly, and the local override becomes a fallback.
- **Rate limits:** a daily job with about 25 minutes of runtime must stay within the 4 requests/min limit for recurring scripts, which is about 100 requests in 25 minutes. Geocode only new or changed listings and cache the rest.
- **Disclosure:** don't import listing addresses into OSM in bulk. That would be an import and needs community review. Note also that a listing site's data may be copyrighted. Add only features you have verified.

### Gaps
- I didn't research MapRoulette (there are no PH-specific challenges, and I didn't research how to create one).
- I found no official figure for the nominatim.openstreetmap.org update lag.
- I didn't fetch the OSM wiki's Google-imagery prohibition page. The prohibition is standard OSM policy, but it isn't cited here.

## UX patterns for communicating location uncertainty

### Takeaway
The main precedent is Airbnb's "approximate location": a small circle inside a shaded circle, accurate to within about half a mile (under 1 km), with an optional "near cross streets" pin. The app can adapt this: draw a precision-dependent circle (or a building or subdivision hull polygon) instead of a crisp pin for low-confidence geocodes, and label the confidence explicitly.

### Cited Findings
- Airbnb listings without precise location show "a small circle surrounded by a shaded circle". The general radius is within about a half mile (less than 1 km) of the address, hosts can choose to show a pin near cross streets instead, and the exact address is shared only after booking — [Airbnb Help 2141](https://www.airbnb.com/help/article/2141/how-will-my-listings-location-be-shown-on-the-map); [Airbnb: setting expectations with accurate location](https://www.airbnb.com/resources/hosting-homes/a/setting-expectations-with-an-accurate-location-491)

### Inferences
- **Suggested Leaflet pattern:** each listing gets `precision` = `exact` (override or building snap), `street`, `subdivision`, `barangay`, `city` or `unknown`.
  - Precise: a solid marker.
  - Street or subdivision: a hollow marker with an `L.circle` of about 100–300 m, or a subdivision hull polygon.
  - Barangay or city: a dashed `L.circle` (about 1–3 km) or the barangay boundary polygon, with no pin, plus a popup line such as "Approximate location (barangay centroid) — report wrong pin".
  - A legend explains the styles. Clustering should keep low-precision listings visually distinct, for example with a different cluster colour.
- Keep the "Report wrong location" link next to the accuracy label, so the uncertainty and the way to fix it appear together.

### Gaps
- I didn't find documented uncertainty UX from foreclosure or real-estate listing sites (Zillow, Pag-IBIG or bank foreclosure portals, Lamudi). Airbnb is the only cited precedent.

## GitHub Actions free limits for a daily ~25-minute scheduled job (public repo)

### Takeaway
For a public repo, a daily 25-minute job on standard GitHub-hosted runners is free and well within limits. The things to watch are the 60-day inactivity auto-disable for schedules, delays or dropped runs at the top of the hour, and the 6-hour job cap.

### Cited Findings
- Standard GitHub-hosted runners are free in public repositories, and the minutes don't count against included usage — [GitHub Docs: Actions billing](https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions)
- Each job can run up to 6 hours. The Free plan allows 20 concurrent standard jobs — [GitHub Docs: Actions limits](https://docs.github.com/en/actions/reference/limits)
- `schedule` can run as often as every 5 minutes, runs from the default branch, and may be delayed under load. Load is highest at the start of each hour, and some queued jobs may be dropped. In public repos, scheduled workflows are disabled after 60 days with no repository activity — [GitHub Docs: events that trigger workflows](https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows)

### Inferences
- Use an off-the-hour cron such as `17 21 * * *` (05:17 PHT). If the daily job commits refreshed data to the repo, that counts as activity and should prevent the 60-day disable. Confirm this, or add `workflow_dispatch` as a manual fallback.
- The override-applying workflow (`on: issues: labeled`) also runs free in a public repo.
- Making the repo public exposes the data and the overrides file. If listing data must stay private, private-repo minutes are limited, and those limits weren't researched here.

### Gaps
- I didn't capture the free minutes for private repos, or confirm whether bot commits reset the 60-day inactivity timer.
