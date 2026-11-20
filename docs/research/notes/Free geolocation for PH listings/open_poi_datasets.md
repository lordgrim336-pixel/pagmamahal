# Open POI datasets (Overture Places, Foursquare OS Places, Wikidata) for locating named Philippine condos and subdivisions

Research date: 2026-11-20. Includes a **live test**: I ran DuckDB (Node bindings `@duckdb/node-api`) against Overture release `2026-11-18.0` on public S3 and extracted every Philippine place. Results are below. Local copy of the extract (9 columns, 1,246,673 rows, 86.5 MB Parquet): `C:\Users\John\AppData\Local\Temp\claude\88c8bd9bed08787a\1111fbfd-405f-41cc-8306-aa2d9733ab9c\scratchpad\ddb\ph_places.parquet` (scratchpad, may be cleared). Scripts: `q.mjs`, `q2.mjs` in the same folder.

## Overture Maps Places: release, sources, licenses, attribution, redistribution

### Takeaway
Overture Places is current (release `2026-11-18.0`), free, needs no account, and can be stored permanently and shown on any map, Leaflet/OSM included. It is mostly Meta (Facebook pages) data under CDLA-Permissive-2.0. Foursquare-sourced rows are Apache-2.0, and AllThePlaces rows are CC0. Attribution is required: "Overture Maps Foundation" plus a "Data from Meta" line, and so on for each source.

### Cited Findings
- I accessed release `2026-11-18.0` and used it in the docs' DuckDB examples. The query ran successfully. The S3 path is `s3://overturemaps-us-west-2/release/2026-11-18.0/theme=places/type=place/*` — [Overture DuckDB guide](https://docs.overturemaps.org/getting-data/duckdb/)
- The previous release, 2026-10-21.0, shipped schema v2.0.0. Places grew from 81,455,423 to 88,418,121. New sources were Uberall (424,600), Birdeye (11,855) and OpenTravel (2,698 Hilton). BrightQuery grew to 15.77M. Operating-status coverage is 32.54%. GERS churn was 11.92% (8.3M places added, 1.37M removed) — [2026-10-21 release notes](https://docs.overturemaps.org/blog/2026/10/21/release-notes/)
- The Places guide (Nov 2026) says Meta supplies about 61.27M records and BrightQuery about 16M. Other sources are Microsoft, Foursquare (3,757,439, Apache-2.0), PinMeTo, AllThePlaces, Uberall, DAC, Krick, Birdeye, RenderSEO and OpenTravel. The places theme contains no OSM data. The total is about 88–90M; the page is internally inconsistent — [Places guide](https://docs.overturemaps.org/guides/places/)
- The places guide also says "joining this data with OSM may require the ODbL license for the resulting derivative database" — [Places guide](https://docs.overturemaps.org/guides/places/)
- Licenses by source (from the attribution page):
  - CDLA Permissive 2.0, each with a "Data from X." line: Meta, Microsoft, PinMeTo, Krick, RenderSEO, DAC, BrightQuery, Birdeye, Uberall and OpenTravel.
  - Apache 2.0: Foursquare, with the text "Copyright 2024 Foursquare Labs, Inc. All rights reserved." plus a NOTICE stating the data was transformed to the Overture schema.
  - CC0 1.0: AllThePlaces.
  - General citation: "Overture Maps Foundation, overturemaps.org."
  - Source: [Overture attribution](https://docs.overturemaps.org/attribution/)
- Schema facts:
  - `confidence` is a 0–1 existence score. It is "not strictly comparable across providers", so use it only as a relative filter.
  - `basic_category` has about 280 values and `taxonomy` has about 2,300 categories (fields `hierarchy`, `primary`, `alternates`).
  - The legacy `categories` field was removed in September 2026.
  - `id` is the GERS ID, which stays stable across releases.
  - Other fields: `names.primary`, `addresses[]`, `websites`, `phones`, `socials`, `sources`, and point `geometry` / `bbox`.
  - Source: [Places guide](https://docs.overturemaps.org/guides/places/)
- 2026 roadmap: about 75M places, with a new ML quality model and BrightQuery integration planned (summarized from the 2026 summit; WebSearch summary, not verified directly) — [Overture 2026 summit post](https://overturemaps.org/blog/2026/inside-the-2026-overture-member-summit-the-road-ahead/)

### Inferences
- CDLA-Permissive-2.0 and Apache-2.0 both allow copying, storing, modifying and redistributing, commercially too, with attribution. Saving matched coordinates in a permanent JSON file and drawing them as Leaflet markers on OSM tiles is therefore permitted.
- A suitable credit line would be: "Places: © Overture Maps Foundation (Data from Meta, Microsoft, Foursquare…)".
- The ODbL caveat applies to merging Overture rows into an OSM-derived database. Showing your own points over OSM raster tiles is a separate overlay, so the caveat does not apply as long as you do not mix OSM-extracted data into your JSON. This is my reading, not legal advice.
- Releases are monthly and GERS IDs are stable. Store the `id` (GERS) along with lat/lon so you can re-check or refresh later.

### Gaps
- I did not see an Azure Blob path in the current docs. It was historically `https://overturemapswestus2.blob.core.windows.net/release/<release>/theme=places/type=place/`, but that is unverified for 2026-11.
- I did not read the 2026-11-18 release notes themselves.

## Overture: residential categories and Philippines coverage (live query results)

### Takeaway
The Philippines has about 1.25M Overture places, 97% of them from Meta. All the test developments have records, usually several each. But they are almost always categorized as `real_estate_service`, `home_developer` or `real_estate_agent`, or miscategorized (for example `historic_site`), not as residential buildings. Many are sales-agent Facebook pages whose coordinates are the agent's location, not the development's. The dataset is very useful for finding candidates but needs filtering by distance to the expected city/barangay.

### Cited Findings (my DuckDB run on `2026-11-18.0`; method from [Overture DuckDB guide](https://docs.overturemaps.org/getting-data/duckdb/))
- Extract: bbox lon 116.9–126.7, lat 4.5–21.2, filtered to `addresses[1].country='PH'`.
  - Rows: 1,246,673. It took about 50 seconds over the internet with no account. Saved with 9 columns, the Parquet file is 86.5 MB.
  - By source: meta 1,213,248; Foursquare 17,959; Microsoft 6,393; AllThePlaces 5,336; Uberall 3,679; PinMeTo 38; DAC 17; OpenTravel 3.
  - Confidence: 821,573 rows ≥0.5 and 252,891 rows ≥0.8.
- Residential-ish `taxonomy.primary` counts in PH:
  - real_estate_service 25,192
  - real_estate_agent 3,755
  - real_estate_investment 370
  - service_apartment 166
  - housing_authority 159
  - **condominium 71**
  - apartment 18
  - housing_cooperative 3
  - `home_developer` and `property_management` also appear.
- `basic_category` counts:
  - real_estate_service 33,947
  - condominium 71
  - housing_or_property_service 30
  - apartment 18
  - No "subdivision" or "residential complex" category was seen.
- The 71 `condominium` rows are mainly developer-branded condo projects with high confidence (0.77–0.98). Examples: "Kizuna Heights by Vista Residences" (Makati), "West Parc by Filinvest" (Muntinlupa), "Bristol at Parkway Place".
- Name-pattern counts in PH: "subd/subdivision" 5,857; "residences" 4,798; "homes" 8,538; "village" 5,343; "condo" 4,095.
- Test names, as name, category, confidence, source and coordinates:
  - **Symfoni Nichols, Guadalupe, Cebu City**:
    - "Symfoni at Nichols Condominium Cebu City Philippines", real_estate_service, 0.40, meta, 10.3165, 123.8847.
    - "Symfoni Nichols Bossa Tower", historic_site, 0.41, 10.31676, 123.88195.
    - "Symfoni Nicols Condo Units For Sale in Cebu", 0.23, 10.32311, 123.88383.
    - All are clustered around Guadalupe, so this looks usable.
  - **Urban Deca Homes Ortigas, Pasig**: about 10 "Urban Deca Homes Ortigas - <agent>" pages. All have locality Pasig, but the coordinates are scattered across Imus, Cavite (14.4048, 120.9564), Makati and Pasig. The best candidates are:
    - "Urban Deca Homes Ortigas", housing_authority, 0.33, 14.58687, 121.06132.
    - "URBAN DECA HOMES Ortigas", historic_site, 0.57, 14.55271, 121.10143.
    - These two disagree by about 5 km, so treat this one as ambiguous.
  - **Lumina Pandi, Bulacan**:
    - "Lumina Pandi Official | Affordable House and Lot in Bulacan", home_developer, 0.85, **Microsoft**, 14.89707, 120.98417.
    - "Lot 16 Block 19 Phase 1 Lumina Homes Pandi Bulacan", 0.39, 14.89633, 120.98298.
    - The two agree, so this looks usable.
  - **Deca Homes South Bacolod**: about 8 records clustered at 10.595–10.600, 122.947–122.953. Examples:
    - "Deca Homes South Bacolod City 6100", 0.72, 10.59628, 122.95174.
    - "Deca Homes South Bacolod Cabug Entrance", 10.59566, 122.94701.
    - This looks usable.
  - **Northdale Villas, Naic, Cavite**:
    - "Northdale Villas", real_estate_service, 0.45, 14.31875, 120.78185.
    - "The Northdale Naic", home_developer, 0.54, 14.31221, 120.78309.
    - Other Naic hits lie within about 3 km. There is also an outlier with locality "Las Piñas" at 14.44, 121.01.
- Observed noise:
  - Many duplicates and many agent or rental listing pages ("… by Agent Sha", "Jayson's Pad For Rent …").
  - Miscategorization is common (subdivisions as `historic_site`, one "Deca Homes Bacolod" as `homeless_shelter`).
  - The `addresses[1].locality` field sometimes contradicts the coordinates.
  - Lumina-family entries in other towns also appear (Tanza, Bauan, General Trias). Microsoft-sourced "Lumina X Official" rows have high confidence (0.85–0.90).

### Inferences
- Overture finds named PH developments that OSM/Nominatim often misses, because developers and agents create Facebook pages for them. Expect a hit rate well above OSM for branded projects (Lumina, Deca, Camella, SMDC, Vista, Avida). Expect lower hit rates for small non-branded subdivisions; this was not measured.
- The coordinate is usually the developer's pin or the sales office, typically on or near the site. Agent pages are often at the agent's home or office and can be 10–30 km away.
- Recommended filters:
  - Don't filter by category. Instead drop names matching `by |agent|for rent|for sale|pad|staycation|unit \d`.
  - Prefer `home_developer`, `condominium`, `housing_authority`, `historic_site` (a frequent mis-tag for actual sites), and Microsoft-sourced rows.
  - Require the point to fall within the expected city/municipality polygon or within about 3 km of the barangay centroid.
  - When several candidates survive, take the medoid of the cluster.

### Gaps
- I did not compute precision or recall against ground truth.
- I did not verify the true locations of Urban Deca Homes Ortigas or Northdale Villas against an authoritative source.

## Exact free extraction method (Overture)

### Takeaway
A single DuckDB query over public S3 (no credentials; `s3_region='us-west-2'`) pulls the Philippines in about a minute into a file of tens of MB. You then fuzzy-match locally.

### Cited Findings
- The docs pattern: `read_parquet('s3://overturemaps-us-west-2/release/2026-11-18.0/theme=places/type=place/*', filename=true, hive_partitioning=1) WHERE bbox.xmin BETWEEN … AND bbox.ymin BETWEEN …`. For point places, filter only the bbox min values — [Overture DuckDB guide](https://docs.overturemaps.org/getting-data/duckdb/)
- The query I ran successfully (DuckDB 1.3 via Node; needs `INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';`):

```sql
COPY (
  SELECT id, names.primary AS name, basic_category, taxonomy.primary AS tprim,
         confidence, sources[1].dataset AS src, addresses[1].locality AS loc,
         bbox.xmin AS lon, bbox.ymin AS lat
  FROM read_parquet('s3://overturemaps-us-west-2/release/2026-11-18.0/theme=places/type=place/*', hive_partitioning=1)
  WHERE bbox.xmin BETWEEN 116.9 AND 126.7 AND bbox.ymin BETWEEN 4.5 AND 21.2
    AND addresses[1].country = 'PH'
) TO 'ph_places.parquet';
```

  Result: 1,246,673 rows in about 50 seconds, an 86.5 MB file (my run).
- Alternatives:
  - The `overturemaps` Python CLI can download by bbox to GeoJSON or GeoParquet — [Places guide](https://docs.overturemaps.org/guides/places/)
  - [explore.overturemaps.org](https://docs.overturemaps.org/getting-data/explore/) shows the Places layer for visually checking a specific GERS ID — [Explorer blog](https://docs.overturemaps.org/blog/2026/03/12/explorer-got-pretty/)

### Inferences
- Matching step: normalize names (lowercase, strip punctuation and the words "official/phase/subd/subdivision/homes/condominium").
- Use DuckDB's built-in `jaro_winkler_similarity(a,b)` or `jaccard`, or rapidfuzz `token_set_ratio`, with a threshold of about 0.85. Combine it with `ST_Distance_Sphere` to the geocoded town centroid (≤5 km for a city, ≤3 km for a barangay).
- Write `{name, lat, lon, gers_id, source, confidence, matched_name}` to JSON. Pin the release string for reproducibility.

### Gaps
- I did not measure the full-schema (all columns) PH subset size. Expect it to be a few hundred MB if you keep websites, phones and so on.

## Foursquare OS Places

### Takeaway
FSQ OS Places is Apache-2.0 and free, with about 100M+ POIs and a "Residential Building > Apartment or Condo" category (ID 12122). Since 2025–26, access requires registration: a gated Hugging Face dataset (free account, accept terms) or the FSQ Places Portal (account plus access token). The legacy anonymous S3 bucket was replaced. Overture already includes about 18k Foursquare-sourced PH rows, so the standalone download is mainly useful for extra recall.

### Cited Findings
- The Hugging Face dataset `foursquare/fsq-os-places` is gated. You must log in, accept conditions (agreeing on behalf of your organization and allowing the use of the org name/logo), and use an HF token.
  - Latest folder: `release/dt=2026-11-17/places/parquet/*.parquet` and `release/dt=2026-11-17/categories/parquet`. Some download links on the card still point to `dt=2025-11-18`.
  - Total repo size is listed as 274 GB, likely all releases.
  - License: Apache-2.0.
  - Source: [HF dataset card](https://huggingface.co/datasets/foursquare/fsq-os-places)
- Foursquare docs:
  - Primary access is now the Places Portal, where you create an account, generate an access token and connect via an Iceberg catalog (DuckDB, Spark, PyIceberg snippets) "instead of the legacy public S3 bucket".
  - It is also available on Snowflake Marketplace.
  - A PMTiles file is listed at `s3://fsq-os-places-us-east-1/release/vector-tiles/latest/fsq-os-places.pmtiles`.
  - Source: [Access FSQ OS Places](https://docs.foursquare.com/data-products/docs/access-fsq-os-places)
- Schema (places table):
  - `fsq_place_id`, `name`, `latitude`, `longitude`, `address`, `locality`, `region`, `postcode`, `admin_region`, `post_town`, `po_box`, `country`
  - `date_created`, `date_refreshed`, `date_closed`
  - `tel`, `website`, `email`, `facebook_id`, `instagram`, `twitter`
  - `fsq_category_ids`, `fsq_category_labels`, `placemaker_url`
  - `unresolved_flags` (closed, duplicate, delete, privatevenue, inappropriate, doesnt_exist), `geom`, `bbox`
  - The categories table has a 6-level hierarchy.
  - There is no confidence score. Use `date_refreshed`, `date_closed` and `unresolved_flags` instead.
  - Source: [Places OS Data Schemas](https://docs.foursquare.com/data-products/docs/places-os-data-schema)
- Category 12122 = "Community and Government > Residential Building > Apartment or Condo" (WebSearch summary of the FSQ categories FAQ) — [Places Categories FAQs](https://docs.foursquare.com/data-products/docs/places-categories-faqs)
- License Apache 2.0 under "Copyright 2024 Foursquare Labs, Inc."; the launch post describes 100M+ POIs, commercial use allowed — [FSQ OS Places launch blog](https://foursquare.com/resources/blog/products/foursquare-open-source-places-a-new-foundational-dataset-for-the-geospatial-community/); [Overture attribution](https://docs.overturemaps.org/attribution/)
- A Fused mirror exists at [source.coop/fused/fsq-os-places](https://source.coop/fused/fsq-os-places) (not checked for freshness).

### Inferences
- Registration on HF or the Portal is free, and nothing I found mentions a credit card. You can then query HF Parquet with DuckDB `hf://` paths (with a token secret) and `WHERE country='PH'`.
- Foursquare's historical check-in heritage means PH condo buildings were frequently created as venues under "Residential Building (Apartment / Condo)". This is likely a good complement to Overture/Meta for condos specifically, but I did not test it.
- Attribution: include the Apache NOTICE ("Copyright 2024 Foursquare Labs, Inc.") and note the modifications.

### Gaps
- Not tested: I did not register, so I have no PH row count and no check of the test names in FSQ OS Places.
- I could not confirm whether the old public bucket `s3://fsq-os-places-us-east-1/release/dt=.../places/parquet` still serves anonymous reads.
- The PH subset size is unknown.

## Wikidata

### Takeaway
Wikidata (CC0, free SPARQL) has only a thin layer of notable PH residential items: famous Makati/BGC towers and old Metro Manila villages. None of the test developments are in it. It is of low value for this use case.

### Cited Findings
- Searching "Symfoni Nichols" on Wikidata gives no results — [Wikidata search](https://www.wikidata.org/w/index.php?search=Symfoni+Nichols&title=Special:Search&ns0=1)
- A SPARQL query for items with `P17=Q928` (Philippines) and coordinates whose English label ends in Residences/Subdivision/Village/Homes/Tower/Condominium/Villas returned 120 rows (116 items).
  - Examples: The Gramercy Residences, Knightsbridge Residences, BF Homes, Ayala Alabang Village, Dasmariñas Village, UP Village.
  - There were no Lumina, Deca Homes, Camella, SMDC or Avida developments, only a couple of Airbnb-style listings mentioning SMDC or Urban Deca.
  - Source: [Wikidata Query Service](https://query.wikidata.org/sparql?format=json&query=SELECT%20%3Fitem%20%3FitemLabel%20%3Fcoord%20WHERE%20%7B%20%3Fitem%20wdt%3AP17%20wd%3AQ928%3B%20wdt%3AP625%20%3Fcoord%3B%20rdfs%3Alabel%20%3FitemLabel.%20FILTER(LANG(%3FitemLabel)%3D%22en%22)%20FILTER(REGEX(%3FitemLabel%2C%20%22(Residences%7CSubdivision%7CVillage%7CHomes%7CTower%7CCondominium%7CVillas)%24%22))%20%7D%20LIMIT%20300)

### Inferences
- Wikidata is CC0, so it can be stored with no attribution. It is only worth a fallback lookup for high-profile Metro Manila towers and legacy villages.

### Gaps
- A label-suffix regex undercounts. I did not query by class (e.g. instance-of residential building or gated community).

## Evidence on PH coverage quality (third-party)

### Takeaway
I found no published quality assessment of Overture or FSQ residential POIs in the Philippines. The live query above is the best available evidence.

### Cited Findings
- An OSM diary titled "There are beach resorts inside subdivisions in my area, Overture data claims" appears to document Overture miscategorization inside (likely Philippine) subdivisions. I could not read it because of a redirect, and the location is unconfirmed — [OSM diary, UndueMarmot](https://www.openstreetmap.org/user/UndueMarmot/diary/402107)
- Overture acknowledges ongoing coverage gaps (2026 summit deck) — [Places Surge deck](https://hosted-files.sched.co/overturesummit2026/39/Places%20Surge%20Headliner.pdf)
- An OSM PH diary on inconsistent OSM coverage is old (2014) and only background — [maning diary](https://www.openstreetmap.org/user/maning/diary/21068)

### Inferences
- The miscategorizations I observed (`historic_site`, `homeless_shelter`, `lodging` for subdivisions) are consistent with that diary's title. Rely on name and distance matching rather than category.

### Gaps
- No systematic precision/recall study for PH exists that I could find.
