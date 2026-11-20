# Free-tier geocoding / place-search APIs for a zero-cost Philippine property map (researched 2026-11-20)

Context: ~1,000-1,600 distinct lookups/month from a server-side Node script, results baked into a JSON file refreshed daily, shown on Leaflet + OSM tiles. Must be free with no credit card. Google is excluded (results "must be shown on a Google map", per [Geocodio terms comparison](https://www.geocod.io/geocoding-terms-of-use-comparison)).

Research limits: about 20 tool calls. Several primary terms pages (TomTom legal, HERE pricing, Esri docs) returned 403/404 or rendered no text to the fetcher. Where only a secondary summary was found, the entry says so.

## Per-provider facts: quota, card, storage, third-party map display, attribution, data source, rate limits

### Takeaway
Of the providers checked, only an OSM-based service (Nominatim, plus Geoapify and LocationIQ with caveats) is plainly free, needs no card, and allows display on Leaflet. Every proprietary-data provider fails at least one test: Mapbox needs a Mapbox map and a card for permanent storage, Esri's stored geocodes have no free tier, HERE caps storage at 30 days and its 30k plan asks for a payment method, Radar has no free tier, and TomTom's free Search allowance looks like it is now 2,500 per month.

### Cited Findings

**TomTom (Search API / Places Search API)**
- Free tier: the pricing page lists the Search API as "Free 2.5K monthly", and says in general "Free monthly requests per API, no credit card needed." — [TomTom pricing](https://docs.tomtom.com/pricing)
  - FLAG, possible change: TomTom was long known for 2,500 free requests per *day*. The current page reads as per *month*. 2,500/month would still cover 1,600 lookups at one request each, with little room for retries.
- The Search API is now described as using "TomTom's previous-generation map format", and "For new projects we recommend Places Search API." — [TomTom pricing](https://docs.tomtom.com/pricing)
- Storage: caching is allowed only for as long as the response headers permit. Building derivative databases from TomTom results is prohibited. Display on third-party maps is permitted. (Secondary: Geocodio's summary of TomTom's T&Cs.) — [Geocodio terms comparison, updated Oct 21 2026](https://www.geocod.io/geocoding-terms-of-use-comparison)
- An older TomTom third-party product EULA restricts combining TomTom data with "spatial map data that is not provided by TomTom". I only saw a truncated fragment, so its scope is unconfirmed. — [TomTom third-party EULA 2017](https://download.tomtom.com/open/banners/third-party-product-terms-eula-2017-12.pdf)
- The developer T&C moved to docs.tomtom.com/legal/terms-and-conditions; developer.tomtom.com/terms-and-conditions now gives a 301 redirect. The page rendered no clause text to my fetcher. — [TomTom docs legal](https://docs.tomtom.com/legal/terms-and-conditions)

**HERE (Geocoding & Search v7)**
- Base plan: geocode and reverse geocode are free for 0-30,000 transactions a month. Permanent Geocoding is not in the Base plan. A pricing update took effect on April 1, 2026. — [HERE plans](https://developers.here.com/plans) (via search snippet; the pricing page returned 403)
- Card: HERE's KB says "You provide a payment method up front, but are not charged unless usage exceeds the free tier." — [HERE KB billing](https://docs.here.com/here-kb/docs/how-is-billing-for-a-developer-here-platform-account). Search snippets also mention a "Limited plan: Free – no credit card needed, 1,000 free daily requests" — [HERE pricing](https://www.here.com/pricing). Sources conflict on this point, so verify at signup.
- Storage: by default the HERE Platform Terms prohibit storing geocoding results outside the platform for more than 30 days, except for internal testing/evaluation or audit/legal records. "Permanent Geocoding" is a paid commercial add-on licence that allows storage beyond 30 days, for internal systems only. — [HERE KB: Permanent Geocoding](https://docs.here.com/here-kb/docs/permanent-geocoding-overview-licensing-and-usage-rules) (from the search snippet; the page itself returned 404 when fetched)
- Display: a HERE map is not required, so third-party maps are permitted. Layering is fine if HERE content stays distinguishable and attributed (Platform Terms §6.4 is cited). §6.4 also bans use with ML/AI systems. — [Geocodio HERE comparison](https://www.geocod.io/here-geocoding-vs-geocodio-comparison/); [Geocodio terms comparison](https://www.geocod.io/geocoding-terms-of-use-comparison)

**Esri ArcGIS Location Platform**
- Geocodes (not stored): 20K free per month, then $0.50 per 1,000. Geocodes (stored): no free tier, $4 per 1,000. A geocode counts as stored when you "Store or persist geocoding service results", billed through `findAddressCandidates` with `forStorage=true`. — [ArcGIS Location Platform pricing](https://location.arcgis.com/pricing/)
- Places service free allowance: 500 nearby/extent searches, and 100 each of place, address, details and location attribute lookups. After that, $8 per 1,000 searches. — [ArcGIS pricing](https://location.arcgis.com/pricing/)
- The pricing page says nothing about non-Esri basemaps or a card requirement. — [ArcGIS pricing](https://location.arcgis.com/pricing/)
- Esri's terms summary page — [Esri blog, hosted services terms/pricing differences (updated Oct 22, 2025)](https://www.esri.com/arcgis-blog/products/developers/developers/arcgis-hosted-services-terms-of-use-pricing-differences) — was found but not fetched.

**Mapbox (Geocoding v6)**
- "Temporary results are not allowed to be cached, while Permanent results are allowed to be cached and stored indefinitely." "By default, the Geocoding API will use Temporary geocoding." Permanent geocoding "requires that you have a valid credit card on file". — [Mapbox Geocoding API docs](https://docs.mapbox.com/api/search/geocoding/)
- "You may only use responses from the Geocoding API in conjunction with a Mapbox map." — [Mapbox Geocoding API docs](https://docs.mapbox.com/api/search/geocoding/)
- Rate limit: "1000 requests per minute" by default, with HTTP 429 when exceeded. — [Mapbox docs](https://docs.mapbox.com/api/search/geocoding/)
- Temporary requests allow only human-initiated queries, and permanent results may not be redistributed. — [Geocodio terms comparison](https://www.geocod.io/geocoding-terms-of-use-comparison)

**Geoapify (OSM-based, plus other open data)**
- "The commercial use of the Free-package is allowed in the development and, with some limitations, in the production phase." "you must always provide OpenStreetMap attribution." "Geoapify attribution is mandatory when using Free subscription plan." — [Geoapify T&C](https://www.geoapify.com/terms-and-conditions/)
- The T&C page does not cover storing results or a card requirement. — [Geoapify T&C](https://www.geoapify.com/terms-and-conditions/)

**LocationIQ (OSM-based)**
- Free plan: "5000 requests /day", "2 requests /second", 60/minute. Going over the daily cap returns 429 "Rate Limited Day". — [LocationIQ pricing](https://locationiq.com/pricing)
- "You may use our free plan in commercial projects if you spread the love by adding a link to us", in the form `<a href='https://locationiq.com'>Search by LocationIQ.com</a>`. — [LocationIQ pricing](https://locationiq.com/pricing)
- Storage: "you can cache API request-response pairs for upto 48 hours." — [LocationIQ pricing FAQ](https://locationiq.com/pricing)

**OpenCage (aggregates OSM and other open sources)**
- Free trial: "2,500 requests/day", "1 request/sec". No card is required ("No."). — [OpenCage pricing](https://opencagedata.com/pricing)
- Storage: "You can store the data returned by the API permanently." — [OpenCage pricing](https://opencagedata.com/pricing)
- The trial is "testing only". Production use is meant to move to a paid plan. — [OpenCage pricing](https://opencagedata.com/pricing)

**MapTiler Cloud**
- Free plan: "Suitable for testing, PoC, prototyping, personal, or non-commercial use". It includes 1k search sessions per month, "No credit card needed", and a "MapTiler logo on the map". — [MapTiler pricing](https://www.maptiler.com/cloud/pricing/)

**Stadia Maps (Pelias-based, open data)**
- Free plan: 200,000 credits a month with no overage, "Commercial use not allowed". A 14-day trial runs "without a credit card". Forward and reverse geocoding cost 20 credits per request (so about 10,000 geocodes a month), and autocomplete v2 costs 1 credit. The plan table separates "Temp storage" from "Persistent storage" by plan. The Free plan lists "Basic APIs only", so it is unclear whether geocoding is included. — [Stadia pricing](https://stadiamaps.com/pricing)

**Radar**
- "Radar does not currently offer a free tier." Plans are annual commitments: Core Maps (geocoding) from $0.50 per 1,000, Premium (places) from $2.00 per 1,000. — [Radar pricing](https://radar.com/pricing)
  - FLAG, changed: Radar used to advertise a free 100k/month tier. That is gone.

**Azure Maps**
- Geocodes may be kept while the Azure account is active; otherwise a general 6-month cache cap applies. Display of most results on third-party maps is restricted. — [Geocodio terms comparison](https://www.geocod.io/geocoding-terms-of-use-comparison)

**Nominatim (OSMF public instance, current solution)**
- "an absolute maximum of 1 request per second" per application. Results "must be cached". A valid User-Agent or Referer is required ("stock User-Agents as set by http libraries will not do"). Recurring scripts are limited to 4 requests per minute. Services whose main function is geocoding "must run their own service". Attribution is "as suitable for your medium". — [OSMF Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/)

### Inferences
- The 4 requests/minute limit on recurring Nominatim scripts still allows about 1,600 lookups in roughly 7 hours. Caching unchanged addresses and querying only new listings cuts this further.
- Stadia allows roughly 10,000 geocodes a month on the Free plan, but that plan is non-commercial. MapTiler's free plan is also non-commercial and limited to 1k sessions, so both depend on whether the property map counts as commercial.

### Gaps
- I did not fetch Photon (komoot), Geocode.earth, Jawg or Azure pricing pages. From prior knowledge, not verified this session: Photon's public instance at photon.komoot.io is fair-use only with no SLA, and it is OSM data, so storage and display follow ODbL. Geocode.earth (Pelias) had only a trial and no permanent free tier. Jawg is primarily tiles. Azure needs an Azure subscription, which normally means a card.
- I could not read TomTom's exact caching clause; the T&C page rendered empty. HERE's §6.4 text was seen only through Geocodio, a competitor.
- Geoapify's storage rules and card requirement: not confirmed on the T&C page. Geoapify's pricing page states 3,000 credits/day, but I did not fetch it this session.
- Esri: I could not confirm whether a card is needed or whether display on non-Esri basemaps is allowed.

## Which providers allow BOTH permanent storage AND display on OSM/Leaflet, free and with no card?

### Takeaway
Nominatim, self-hosted Photon/Nominatim, and probably Geoapify meet all of these conditions. OpenCage meets them on paper (permanent storage, no card) but its trial is "testing only". No proprietary-data provider qualifies.

### Cited Findings
- Nominatim: caching is required, any display is allowed with attribution, there is no signup, and the rate limits are strict. — [OSMF policy](https://operations.osmfoundation.org/policies/nominatim/)
- OpenCage: permanent storage allowed, no card, but the trial is "testing only". — [OpenCage pricing](https://opencagedata.com/pricing)
- Geoapify: the free plan is commercial-OK with limitations and needs OSM + Geoapify attribution. Storage is not addressed on the T&C page. — [Geoapify T&C](https://www.geoapify.com/terms-and-conditions/)
- LocationIQ: free commercial use with a backlink, but caching is capped at 48 hours. — [LocationIQ pricing](https://locationiq.com/pricing)
- Mapbox fails on display (Mapbox map only) and on permanent storage (needs a card). — [Mapbox docs](https://docs.mapbox.com/api/search/geocoding/)
- Esri fails on storage: there is no free stored tier. — [ArcGIS pricing](https://location.arcgis.com/pricing/)
- HERE fails on storage: 30 days maximum without the paid add-on. — [HERE KB](https://docs.here.com/here-kb/docs/permanent-geocoding-overview-licensing-and-usage-rules)
- Radar has no free tier at all. — [Radar pricing](https://radar.com/pricing)

### Inferences
- OSM-derived results (Nominatim, Geoapify, LocationIQ, Photon) are ODbL data. Keeping coordinates in your own JSON is generally ODbL-compatible if you attribute OSM. LocationIQ's 48-hour cap is a contractual limit on top of that.

### Gaps
- I found no explicit Geoapify clause on permanent storage.

## For providers with short caching windows, would a daily refresh comply?

### Takeaway
A daily re-geocode fits within HERE's 30-day cap and LocationIQ's 48-hour cap. It does not fit Mapbox Temporary (no caching at all) or Esri's not-stored geocodes (persisting anything is a "stored" geocode). TomTom depends on the cache headers it returns.

### Cited Findings
- HERE: 30-day maximum. — [HERE KB](https://docs.here.com/here-kb/docs/permanent-geocoding-overview-licensing-and-usage-rules)
- LocationIQ: "upto 48 hours". — [LocationIQ pricing](https://locationiq.com/pricing)
- Mapbox Temporary: "not allowed to be cached". — [Mapbox docs](https://docs.mapbox.com/api/search/geocoding/)
- Esri: "Store or persist geocoding service results" is billed as a stored geocode. — [ArcGIS pricing](https://location.arcgis.com/pricing/)
- TomTom: caching is allowed as long as the response headers permit. — [Geocodio comparison](https://www.geocod.io/geocoding-terms-of-use-comparison)

### Inferences
- A daily full re-geocode of 1,000-1,600 places uses roughly 30,000-48,000 calls a month. That exceeds HERE's 30k Base plan, TomTom's 2.5K/month, and Esri's 20K. It fits within LocationIQ's 5,000/day.
- Even a daily-refreshed JSON file is arguably a "store" on Esri, and Mapbox Temporary forbids building a file at all. HERE plausibly complies if every coordinate is overwritten within 30 days, but HERE's §6.4 restrictions on mixing data still need a legal read.

### Gaps
- No provider explicitly says whether a static file regenerated daily from fresh calls counts as "caching within the window". Exact TomTom header values (for example Cache-Control max-age) were not observed.

## Philippine POI/condo coverage (proprietary vs OSM)

### Takeaway
HERE, TomTom, Esri, Mapbox, Azure and Radar use proprietary or licensed POI data and are the most likely to know named condos and subdivisions such as "Symfoni Nichols" or "Urban Deca Homes Banilad". Those are also the providers whose terms block a free stored JSON. OSM-based services (Nominatim, Photon, Geoapify, LocationIQ, OpenCage, Stadia, MapTiler) will only find what OSM contributors have mapped.

### Cited Findings
- Geoapify requires OSM attribution, which shows OSM is its core data. — [Geoapify T&C](https://www.geoapify.com/terms-and-conditions/)
- Esri sells separate Places service attributes (place, address, details), so it has its own POI database. — [ArcGIS pricing](https://location.arcgis.com/pricing/)

### Inferences
- A practical zero-cost approach is to geocode by barangay or street through Nominatim and keep a hand-curated override table of coordinates for named developments that OSM is missing.

### Gaps
- I found no published benchmark of Philippine POI or address coverage for any provider. I did not live-test "Symfoni Nichols" or "Urban Deca Homes Banilad" against any API; that needs a few manual queries with free keys.
- Whether Azure still uses TomTom data was not verified this session.
