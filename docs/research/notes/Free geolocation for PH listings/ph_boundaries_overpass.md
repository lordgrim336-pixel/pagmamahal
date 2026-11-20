# Free PH barangay boundaries + OSM Overpass name search (as of 2026-11-20)

## Which free barangay boundary dataset is best (source, license, vintage, format, size, name match)?

### Takeaway
Use **faeldon/philippines-psgc-shapefiles** (Level 4 barangays, PSGC 3Q 2026, release v1.0.1, published 2026-11-07), or its sister **faeldon/philippines-json-maps** (same data as GeoJSON/TopoJSON, pre-simplified and split per city/municipality). Both are derived from OCHA COD-AB (NAMRIA + PSA) boundaries, re-keyed to current PSGC codes and names. The geometry is CC BY-IGO, so you must credit NAMRIA/PSA/OCHA. You can store it permanently and show it on Leaflet. geoBoundaries has no barangay level (ADM4) for PHL. altcoder's repo is archived at 4Q 2023.

### Cited Findings
- faeldon/philippines-json-maps: `latest/` maps are **PSGC 3Q 2026**. Boundaries come from OCHA COD-AB (NAMRIA and PSA), with codes and names matched to the PSA PSGC. Older vintages (2023-4q, 2019, 2011) are available as Releases. — [GitHub faeldon/philippines-json-maps](https://github.com/faeldon/philippines-json-maps)
- License: scripts and maps are MIT. The underlying boundaries are **CC BY-IGO**, so republishing requires crediting NAMRIA and PSA via OCHA COD-AB. — [GitHub faeldon/philippines-json-maps](https://github.com/faeldon/philippines-json-maps)
- Levels in json-maps: country, island groups, regions, provinces/NCR districts, municipalities/cities, barangays, and Manila's 14 sub-municipalities. — [GitHub faeldon/philippines-json-maps](https://github.com/faeldon/philippines-json-maps)
- Simplification levels:
  - high: 10% of vertices (0.1)
  - medium: 1% (0.01)
  - low: 0.1% (0.001)

  Formats are GeoJSON and TopoJSON. Medium and low are in the repo; high resolution is only in Releases. — [GitHub faeldon/philippines-json-maps](https://github.com/faeldon/philippines-json-maps)
- File layout in json-maps is one file per parent area. `municities/` holds one file per municipality or city containing its barangays. The naming pattern is `<children>-<parent level>-<parent PSGC>[.topo].<simplification>.json`, e.g. `municities-provdist-1804500000.0.001.json`. — [GitHub faeldon/philippines-json-maps](https://github.com/faeldon/philippines-json-maps)
- json-maps feature properties:
  - parent and own codes: `adm1_psgc` up to the feature's own level
  - names: `adm2_en`, etc.
  - `geo_level`, `len_km`, `area_km2`
  - for barangays, `geom_src`

  Codes are integers with leading zeros dropped. — [GitHub faeldon/philippines-json-maps](https://github.com/faeldon/philippines-json-maps)
- json-maps release v1.1.1 "PSGC 2026-3q" was published 2026-11-07. Asset sizes:

  | Asset | Size |
  |---|---|
  | geojson-hires.zip | 93.8 MB |
  | geojson-medres.zip | 13.8 MB |
  | geojson-lowres.zip | 4.9 MB |
  | topojson-hires.zip | 23.6 MB |
  | topojson-medres.zip | 5.8 MB |
  | topojson-lowres.zip | 3.8 MB |

  — [GitHub API releases, philippines-json-maps](https://api.github.com/repos/faeldon/philippines-json-maps/releases)
- faeldon/philippines-psgc-shapefiles release v1.0.1 "PSGC 3Q 2026" was published 2026-11-07. Asset sizes:
  - `PH_Adm4_BgySubMuns.shp.zip`: 200.4 MB
  - `PH_Adm4_BgySubMuns_complete.shp.zip`: 200.4 MB
  - `PH_Adm4_BgySubMuns.csv` (attributes only): 3.4 MB
  - `PH_Adm3_MuniCities.shp.zip`: 167.7 MB
  - a SHA256SUMS file is included

  — [GitHub API releases, philippines-psgc-shapefiles](https://api.github.com/repos/faeldon/philippines-psgc-shapefiles/releases)
- Shapefiles are in **EPSG:32651 (UTM 51N, metres)**, so reproject to EPSG:4326 for Leaflet/turf. — [GitHub faeldon/philippines-psgc-shapefiles](https://github.com/faeldon/philippines-psgc-shapefiles)
- `geom_src` values:
  - `source`: the COD-AB shape
  - `dissolved`: a union of other shapes, e.g. merged barangays or Manila sub-municipalities
  - `plotted`: built from the creating law, fitted against the mother barangay
  - `approximated`: an indicative shape, in the "complete" variant only
  - `none`: no shape, in the "known" variant

  — [GitHub faeldon/philippines-psgc-shapefiles](https://github.com/faeldon/philippines-psgc-shapefiles)
- Known caveat: 4 barangays created in 2024 have no published boundary: Marawi's Sultan Corobong, Sultan Panoroganan and Angoyao, and Tupi's Juan-Loreto Tamayo. Their mother barangays keep the larger earlier shapes. Manila sub-municipality shapes overlap their barangays, so filter `geo_level == "Bgy"`. — [GitHub faeldon/philippines-psgc-shapefiles](https://github.com/faeldon/philippines-psgc-shapefiles)
- I downloaded and inspected `PH_Adm4_BgySubMuns.csv` (v1.0.1). Columns are `adm1_psgc,adm2_psgc,adm3_psgc,adm4_psgc,adm4_en,geo_level,geom_src,len_crs,area_crs,len_km,area_km2`. It has **42,010 `Bgy` rows**. By geometry source:

  | Group | Rows |
  |---|---|
  | Bgy, source | 41,865 |
  | Bgy, plotted | 7 |
  | Bgy, dissolved | 1 |
  | Bgy, none | 4 |
  | SubMun, dissolved | 14 |

  Rows of the CSV are not all parsed cleanly by a naive comma split, because names containing commas are quoted. — [faeldon release asset CSV](https://github.com/faeldon/philippines-psgc-shapefiles/releases/download/v1.0.1/PH_Adm4_BgySubMuns.csv)
- Name-match spot checks against that CSV:
  - **Dasmariñas (PSGC 0402109000):** "Malagasang II-A" (0402109015) and the full I-A..I-G and II-A..II-G series are present.
  - **Parañaque (adm3 1381000000):** has 16 barangays, including "San Isidro" (1381000013), "B. F. Homes", "Don Bosco", "Merville", "Moonwalk", "Sun Valley" and others.
  - **"Poblacion I":** 45 exact matches nationwide.
  - **Case:** names are in Title Case, not the ALL-CAPS used in addresses.
  - **Parenthetical names:** only 34 barangay names carry parentheses, e.g. "Magallungon (Sta. Teresa)" and "Rizal (Poblacion)".
  - **"Perez (Lucbanan)":** no such row exists. There are plain "Perez" rows (e.g. 0402122010 in Cavite) and a separate "Lucbanan" (0501602009, Camarines Norte).

  So address strings with parenthetical alternate names need fallback matching. — [faeldon release asset CSV](https://github.com/faeldon/philippines-psgc-shapefiles/releases/download/v1.0.1/PH_Adm4_BgySubMuns.csv)
- Municipality and city names come from the Adm3 CSV, e.g. `1381000000, City of Parañaque, City`. Barangay rows carry only codes for their parents, so join on `adm3_psgc`. — [faeldon Adm3 CSV](https://github.com/faeldon/philippines-psgc-shapefiles/releases/download/v1.0.1/PH_Adm3_MuniCities.csv)
- altcoder/philippines-psgc-shapefiles is **archived and no longer maintained**. Its data is through **4Q 2023**, from 2023 OCHA/HDX shapefiles, and the repo points to faeldon/philippines-psgc-shapefiles. License is MIT. A clone pulls about 3.34 GiB of git-lfs content. — [GitHub altcoder/philippines-psgc-shapefiles](https://github.com/altcoder/philippines-psgc-shapefiles)
- geoBoundaries gbOpen PHL offers only ADM0–ADM3, with **no ADM4/barangay**. The source is the HDX "philippines-administrative-levels-0-to-3" dataset (NAMRIA/PSA/OCHA), license CC BY 3.0 IGO, year represented 2020, source updated 2023-01-19. — [geoBoundaries API PHL](https://www.geoboundaries.org/api/current/gbOpen/PHL/ALL/)
- OSM's Parañaque city relation (r122940, admin_level=6) carries `ref=1381000000` (the 10-digit PSGC) and `old_ref=137604000` (the old 9-digit code). So OSM admin relations in PH can be joined to PSGC via `ref`. — [Overpass API query result, overpass-api.de, 2026-11-20](https://overpass-api.de/api/interpreter)

### Inferences
- faeldon's data is the clear winner: it is current (3Q 2026), PSGC-keyed, and already split per city with low/medium resolution.
  - For centroids and point-in-polygon, a per-city `municities-*.0.01.json` (medium) or `0.001` (low) file is likely enough at barangay scale.
  - Low resolution (0.1% of vertices) may produce false "outside" results near barangay edges in dense NCR. Consider medium resolution plus a tolerance buffer (e.g. accept results within 100–200 m of the polygon).
- Name matching should go through the PSGC code, not raw strings. Normalize both sides:
  - uppercase
  - strip accents (ñ→n)
  - expand "Sto."/"Sta."/"Pob."
  - remove punctuation
  - treat parenthetical text as an alias: try both the outer and inner name, e.g. "PEREZ (LUCBANAN)" matches either "Perez" or "Lucbanan"
  - normalize Roman numerals and suffixes ("II-A" vs "2-A")

  Always scope the match to the already-resolved city's `adm3_psgc`, because names like "San Isidro" and "Poblacion I" repeat nationwide.
- Attribution text to show on the Leaflet map: "Boundaries: NAMRIA, PSA via OCHA COD-AB (CC BY-IGO); processed by faeldon/philippines-json-maps."

### Gaps
- I could not read HDX COD-AB PHL directly: data.humdata.org returned HTTP 403 for both the dataset page and the CKAN API. The latest COD-AB version and date, exact license wording (CC BY-IGO vs CC BY 3.0 IGO), and the HDX-side file sizes are unverified. The only evidence comes indirectly via faeldon and geoBoundaries.
- psa.gov.ph returned 403. I could not confirm whether the PSGC publication has coordinates. To my knowledge it is a code/name/population list only, with no centroids, but this is unverified this session. Also unconfirmed: the exact PSA spelling, e.g. whether PSA writes "Perez (Lucbanan)" and in which municipality.
- NAMRIA does not appear to offer a free downloadable barangay layer; I did not verify this.
- I did not read the exact faeldon json-maps per-file sizes, or whether the json-maps release has a "complete" variant.

## Computing centroids / point-on-surface and doing point-in-polygon in Node compactly

### Takeaway
Precompute one representative point per barangay offline and store it in a small JSON or CSV keyed by PSGC: 42k rows is about 2–3 MB, or under 1 MB gzipped. Use point-on-surface rather than the geometric centroid so the point always lands inside oddly shaped or multi-part barangays. For validation, lazy-load the per-city barangay GeoJSON from faeldon's `municities/` folder and run turf `booleanPointInPolygon`.

### Cited Findings
- faeldon json-maps already splits barangays per municipality/city, at three resolutions in GeoJSON and TopoJSON. The whole-country lowres TopoJSON zip is 3.8 MB and the medres one is 5.8 MB. — [GitHub faeldon/philippines-json-maps](https://github.com/faeldon/philippines-json-maps); [GitHub API releases](https://api.github.com/repos/faeldon/philippines-json-maps/releases)
- The raw shapefile is in UTM 51N metres, so reproject before computing lon/lat centroids, e.g. `ogr2ogr -t_srs EPSG:4326`. — [GitHub faeldon/philippines-psgc-shapefiles](https://github.com/faeldon/philippines-psgc-shapefiles)

### Inferences
These are standard library behaviour; I did not re-fetch the docs this session.
- Turf.js functions to use:
  - `@turf/point-on-feature` (`pointOnFeature`) guarantees a point on the surface.
  - `@turf/centroid` and `@turf/center-of-mass` can fall outside concave or multipolygon barangays.
  - `@turf/boolean-point-in-polygon` handles Polygon and MultiPolygon.
  - `@turf/simplify` (Douglas–Peucker, with a `tolerance` in degrees) is available if you start from hires.

  Docs: https://turfjs.org/docs/api/pointOnFeature, https://turfjs.org/docs/api/booleanPointInPolygon, https://turfjs.org/docs/api/simplify
- Alternatives:
  - mapshaper CLI (`-simplify 5% keep-shapes -split adm3_psgc -o format=geojson`) to produce compact per-city files.
  - GDAL `ST_PointOnSurface` via ogr2ogr SQL, or DuckDB spatial `ST_PointOnSurface`, to build the centroid table offline.
  - `topojson-client` `feature()` to turn TopoJSON into GeoJSON at runtime, since TopoJSON is about 3–4x smaller.
- For speed, use `rbush`/`geojson-rbush` or simply select by `adm3_psgc` first. One city has at most a few hundred barangays, so brute-force point-in-polygon is fine.
- Validation rule:
  1. Resolve the stated city and barangay to a PSGC code.
  2. Check that the geocoder point is inside that barangay polygon, optionally buffered by about 150 m using `@turf/buffer` or a distance-to-boundary check.
  3. If it fails the barangay check but passes the city check, flag it.
  4. If it fails the city check, reject it and fall back to the barangay point-on-surface.

### Gaps
- No measured per-city file sizes or accuracy loss for lowres vs medres. You should test this on dense NCR barangays (e.g. Parañaque's 16).

## OSM coverage, Overpass usage policy, and query techniques for subdivisions/condos

### Takeaway
Overpass can do case-insensitive regex name search within an admin area (`area(id:3600000000+relId)` or an area built from a `ref`=PSGC lookup). However, the main public server, overpass-api.de, was overloaded during testing (502 "at capacity" and empty responses), and its policy discourages app-backend use. Use Overpass only for occasional, cached lookups, with a User-Agent and 30 s backoff. For a production pipeline, use a local Geofabrik extract instead (see next section).

### Cited Findings
- overpass-api.de (FOSSGIS) policy:
  - "No more than 10,000 queries per day and download no more than 1 GB data per day"
  - heavy regular use should be reduced by a factor of 100
  - identify your app with a User-Agent or Referer header
  - no parallel scripts
  - after HTTP 429/406, pause 30 seconds
  - the wiki notes the server is currently overloaded

  — [OSM Wiki: Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API)
- Alternative instances:
  - VK Maps: `https://maps.mail.ru/osm/tools/overpass/api/interpreter`, "no requests limitations"
  - private.coffee (formerly overpass.kumi.systems): `https://overpass.private.coffee/api/interpreter`, "no rate limit"; notify them in advance for large projects
  - Geofabrik and NextGIS instances need an API key, and some are paid

  — [OSM Wiki: Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API)
- Overpass request mechanics:
  - default timeout 180 s, default maxsize 512 MiB
  - per-user slots plus a cooldown, shown by `/api/status`
  - a request waits up to 15 s for a slot
  - 429 means rate limited; 504 means resource limits were hit
  - scraping or app-backend use is discouraged, with a planet dump or your own instance recommended instead

  — [Overpass API commons/usage doc](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html)
- Live test on 2026-11-20 against overpass-api.de:
  - A simple query `rel["boundary"="administrative"]["name"~"Para.aque"]` worked. It returned r122940 (admin_level=6, ref=1381000000, official_name "City of Parañaque") plus Parañaque District 1 and 2 at admin_level=7.
  - Heavier `area(...)` queries then returned "502 Gateway Timeout … server is currently at capacity … retry using exponential backoff", or empty bodies.
  - The same query on overpass.private.coffee also returned an empty response.

  — [Overpass API query results, overpass-api.de](https://overpass-api.de/api/interpreter)
- Practical note from that test: a literal "ñ" in a regex sent from Git Bash curl matched nothing, while `Para.aque` worked. Use `.` or `[nñ]` in regexes, or query by relation id or `ref`. — [Overpass API query results](https://overpass-api.de/api/interpreter)

### Inferences
- Query template (untested end-to-end because of server load). Here `area(id:3600122940)` is 3600000000 + relation id 122940; pick it up via `rel[boundary=administrative][ref="1381000000"]`:
  ```
  [out:json][timeout:60];
  rel["boundary"="administrative"]["ref"="1381000000"];  // PSGC city code
  map_to_area->.c;
  (
    nwr(area.c)["landuse"="residential"]["name"~"merville|moonwalk",i];
    nwr(area.c)["place"~"^(neighbourhood|suburb|quarter|village)$"]["name"~"merville",i];
    nwr(area.c)["building"~"^(apartments|residential)$"]["name"~"tower|residences",i];
    nwr(area.c)["residential"]["name"~"...",i];
  );
  out tags center;
  ```
  - `out tags center` returns a lat/lon center for ways and relations, which is enough to place a pin.
  - Scope to a barangay relation (admin_level=10 in PH OSM, by convention) when one exists.
  - Otherwise scope to the city and post-filter with the faeldon polygon via turf point-in-polygon. This is the more robust choice, because OSM barangay relation coverage is uneven; I did not measure it.
- Name normalization for fuzzy matching:
  - uppercase and strip accents
  - drop generic tokens: SUBDIVISION, SUBD, SUBD., VILLAGE, VILL, HOMES, HOMESITE, ESTATES, RESIDENCES, TOWER/TWR + numerals, BLDG, CONDOMINIUM/CONDO, PHASE/PH + numerals or Roman numerals, BLK/LOT, "AT", "THE"
  - drop developer prefixes: e.g. SMDC, DMCI, AYALA LAND, CAMELLA, LUMINA, AVIDA, VISTA, MEGAWORLD, ROBINSONS, ROCKWELL
  - then compare token sets, e.g. Jaccard or token-sort ratio, as with fuzzball.js `token_set_ratio`
  - keep the stripped prefix as a tie-breaker
- For the Overpass regex, use only the 1–2 most distinctive tokens, e.g. `"name"~"pacific.*heights",i`, then rank the candidates locally.

### Gaps
- I could not measure how many named `landuse=residential`, `place=neighbourhood` and `building=apartments` features exist in PH or in Parañaque: Overpass timed out or returned empty during the test window.
- I could not confirm from the wiki which admin_level PH uses for barangays (expected 10) or how complete barangay relations are. The Philippines admin-division wiki URL I tried returned 404, and the admin_level table page was truncated before the Philippines row.
- I did not verify the VK Maps and private.coffee instances working for PH queries; private.coffee returned empty during the test.

## Local Geofabrik extract as a rate-limit-free alternative

### Takeaway
Geofabrik's Philippines extract is free (ODbL) and updated daily. Filter it once locally to named residential, neighbourhood and apartment features, about 586 MB in, a few MB out. Then do all fuzzy name search in Node or DuckDB with no rate limits, and refresh it periodically.

### Cited Findings
- `philippines-latest.osm.pbf` is **586 MB**, with data up to 2026-11-18T21:21:02Z, updated daily. `philippines-latest-free.shp.zip` is **1.3 GB**. License is ODbL 1.0. — [Geofabrik Philippines](https://download.geofabrik.de/asia/philippines.html)
- The Overpass docs recommend dumps or your own instance over public instances for bulk or app use. — [Overpass API commons doc](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html)

### Inferences
- Suggested pipeline (standard tooling; commands not run this session):
  1. `osmium tags-filter philippines-latest.osm.pbf nwr/landuse=residential nwr/place=neighbourhood,suburb,quarter,village,hamlet nwr/building=apartments,residential,condominium nwr/residential r/boundary=administrative -o ph-named.osm.pbf`
  2. `osmium export ph-named.osm.pbf -f geojsonseq` or `ogr2ogr`, keeping only features with a `name`. Alternatively, DuckDB spatial `ST_Read('ph-named.osm.pbf')` and the `layer=multipolygons`/`points` layers, then `ST_PointOnSurface`.
  3. Store a compact table: `osm_id, name, normalized_tokens, tags, lon, lat, adm3_psgc, adm4_psgc`. Assign PSGC codes by point-in-polygon against faeldon barangays.
- ODbL requires attribution "© OpenStreetMap contributors" on the Leaflet map. A derived database you publish is share-alike, but internal use and storage is fine.

### Gaps
- No measured count or size of the filtered named-feature subset for PH.
- The osmium, DuckDB and ogr2ogr commands were not executed or verified this session.
