# Developer project locations as a free, permanent geocoding lookup table for Pag-IBIG listings

Method note: most findings below come from direct HTTP probes (curl, 2026-11-20) of developer robots.txt files, sitemaps, WordPress REST endpoints and project pages, plus a few web searches. Several sites timed out or refused automated requests during the session (Bria, Amaia, Sta. Lucia project pages, Taft, pagibigfund.gov.ph). Those are listed under Gaps and were not verified.

## Q1. Which developer websites list projects with locations precise enough for a map pin, and how is the data exposed?

### Takeaway
Of the developers checked, **Lumina Homes** is the best source. Each project page carries exact project coordinates in inline JavaScript (`new google.maps.LatLng(lat, lng)`), across 33 listed projects. **8990 Holdings** (Deca / Urban Deca) lists about 24 projects with a barangay + city address and the DHSUD LTS number, but no coordinates. **Camella** publishes about 101 project pages through an open WordPress REST API with province and city taxonomy, but no coordinates in the HTML. **PHirst Park Homes** gives a street/barangay address plus a Google Maps embed that searches by name (`q=phirst park homes naic`), not by lat/lng. So outside Lumina, the realistic output is a barangay- or city-level centroid, not a rooftop pin.

### Cited Findings
**Lumina Homes (Vista Land group, not Ayala)**
- The site footer lists Lumina among Vista Land sister brands (Vista Land, Brittany, Camella, Crown Asia, Vista Residences), which confirms the parent group. — [lumina.com.ph](https://www.lumina.com.ph/property-listing/)
- `/property-listing/` links to 33 project pages at `/property-listing/property/{slug}`, e.g. lumina-pandi, lumina-tanza, lumina-tarlac, lumina-bacolod, lumina-butuan, lumina-tagum, lumina-pagadian and the-balanga-residences. — [Lumina property listing](https://www.lumina.com.ph/property-listing/)
- The Lumina Pandi page contains `var myLatlng = new google.maps.LatLng(14.899562, 120.983266)` as the map centre/marker. It also has a `features` array of nearby landmarks (schools etc.) with their own LatLng values and titles. Extraction should take only `myLatlng` and skip the landmark array. The page text gives the address "Brgy. Pinagkuartelan, Pandi, Bulacan". — [Lumina Pandi](https://www.lumina.com.ph/property-listing/property/lumina-pandi)
- The sitemap.xml has 2,133 URLs, almost all news/blog. Projects are discovered from the `/property-listing/` page, not the sitemap. — [Lumina sitemap](https://www.lumina.com.ph/sitemap.xml)
- robots.txt sets Crawl-delay 10 for SemrushBot and SiteAuditBot and disallows `/loan-calculator/`, `/social-platform/`, `/vlogs/` and some subdomains. Property-listing pages are not disallowed. — [Lumina robots.txt](https://www.lumina.com.ph/robots.txt)
- The Terms and Conditions say the site "contains material which is owned by or licensed to us… design, layout, look, appearance and graphics. Reproduction is prohibited other than in accordance with the copyright notice" and that unauthorised use "may give rise to a claim for damages". — [Lumina T&C](https://www.lumina.com.ph/terms-and-conditions/)
- Unverified: only current listings were seen. Older or sold-out Lumina phases (e.g. "Phase 4" names in Pag-IBIG lists) may not have their own pages.

**8990 Holdings (Deca Homes, Urban Deca Homes, Urban Deca Towers)**
- The old domain decahomes.com now redirects to a domain-sale page (atom.com). The live project catalogue is on 8990holdings.com. — curl probe of https://www.decahomes.com/ (302 → atom.com/name/DecaHomes)
- robots.txt (Yoast) is `User-agent: * / Disallow:` (nothing blocked) with a sitemap index. — [8990 robots.txt](https://8990holdings.com/robots.txt)
- `project-sitemap.xml` lists 24 project URLs plus one location page:
  - Deca Homes: marilao-extension, sta-barbara-resort-residences, catalunan-grande, indangan, mulig, resort-residences, gensan-1, pavia-resort-residences-1/-2, meycauayan, pampanga, leganes-residences, tarlac-new-project, urdaneta-new-project, cabanatuan
  - Urban Deca Homes: commonwealth, ortigas, banilad, campville, marilao, mahogany, manila
  - Other: urban-deca-towers-cubao, monterrazas-de-cebu
  - [8990 project sitemap](https://8990holdings.com/project-sitemap.xml)
- The WordPress REST API is open: `/wp-json/wp/v2/project` returns project records (title, slug, link, `project_location` taxonomy = luzon/visayas/mindanao, template). — [8990 REST](https://8990holdings.com/wp-json/wp/v2/project?per_page=1)
- The Deca Homes Cabanatuan page gives "Address: Brgy. Sta. Arcadia, Cabanatuan City, Nueva Ecija", "LTS – 0003064", product type (2-storey socialized) and land area 325,585 sq m. It has no iframe, map link or coordinates. — [Deca Homes Cabanatuan](https://8990holdings.com/projects/deca-homes-cabanatuan/)
- The Urban Deca Homes Ortigas, Deca Homes GenSan 1 and Deca Homes Resort Residences pages also showed no iframe or coordinates in the static HTML. — curl probes of the 8990holdings.com project pages above
- The catalogue looks curated (about 24 projects). The many older Deca Homes projects in Davao, Cebu, Iloilo, Bulacan, Pampanga and Cavite that show up in Pag-IBIG foreclosure lists are likely not all present. — inference from the sitemap count

**Camella / Vista Land**
- robots.txt allows project pages and blocks only facet/paging paths (`/page/`, `/sort/`, `/property-type/`, `/status/`, `/search-results/`…). It points to `sitemap_index.xml`. — [Camella robots.txt](https://www.camella.com.ph/robots.txt)
- `property-sitemap.xml` has 114 URLs, about 101 of them non-"model-house" project pages (e.g. `/property/camella-isabela/`). — [Camella property sitemap](https://www.camella.com.ph/property-sitemap.xml)
- The WordPress REST API is open: `/wp-json/wp/v2/properties` reports X-WP-Total = 113. Each record carries `property_state`, `property_city` and `property_area` taxonomy IDs, resolvable through `/wp-json/wp/v2/property_city` etc. That gives province + city per project. — [Camella REST](https://www.camella.com.ph/wp-json/wp/v2/properties?per_page=2)
- The Camella Isabela page loads the Google Maps JS API (Houzez theme), but the static HTML had no lat/lng values, LatLng calls or map iframes. The `item-address` element was empty. Coordinates, if any, are not exposed in the static page. — [Camella Isabela](https://www.camella.com.ph/property/camella-isabela/)

**PHirst Park Homes (Century/Mitsubishi JV)**
- robots.txt allows public pages, explicitly allows ClaudeBot and GPTBot-type agents, and disallows `/*?*=`, `/api` and `/admin`. — [PHirst robots.txt](https://www.phirstparkhomes.com/robots.txt)
- `page-sitemap.xml` lists about 20 project pages under `/projects/`: bacolod, balanga, baliwag, batulao, calamba, calamba-west, gapan, gen-san, gen-tri, lipa (+ the-cove), magalang, magalang-east, naic, pandi, san-pablo, san-pablo-east, sto-tomas, tanza, tayabas. — [PHirst page sitemap](https://www.phirstparkhomes.com/page-sitemap.xml)
- The Naic page gives "Address: Governor's Drive, Brgy. Halang, Sabang and San Roque, Naic, Cavite". Its map is a Google embed by text query (`google.com/maps?q=phirst%20park%20homes%20naic&…&output=embed`), with no coordinates in the URL. — [PHirst Naic](https://www.phirstparkhomes.com/projects/naic/)

**Fiesta Communities**
- robots.txt is `User-agent: * / Disallow: /`, which disallows all crawling. The homepage returned a 5.6 KB bot-challenge-style page with an obfuscated link. — [Fiesta robots.txt](https://www.fiestacommunities.ph/robots.txt)

**Amaia (Ayala Land)**
- robots.txt is `Allow: /` with `Sitemap: https://www.amaialand.com/sitemap.xml`, but the sitemap returned 0 `<loc>` entries and the homepage fetch failed. Project-level location format was not verified. — [Amaia robots.txt](https://www.amaialand.com/robots.txt)

**Sta. Lucia Land**
- robots.txt (Yoast) blocks nothing. The sitemap index includes `projects-sitemap.xml` and `project_category-sitemap.xml`, but fetching the projects sitemap returned nothing (timeout or empty), so project pages were not inspected. — [Sta. Lucia robots.txt](https://stalucialand.com.ph/robots.txt), [sitemap index](https://stalucialand.com.ph/sitemap_index.xml)

**Bria Homes**
- www.briahomes.com.ph returned Cloudflare 522 (origin down). briahomes.com has robots `Allow: /` with an llms.txt reference, but its sitemap lists only `/lander`. A news search names bria.com.ph as the official site, which was unreachable during the session. — curl probes; [BusinessWorld on Bria Mindanao expansion](https://www.bworldonline.com/?p=241063)
- Press coverage lists Bria projects in Tagum, Maco, Panabo, Carmen (Davao del Norte), General Santos, Kidapawan, Cagayan de Oro, Misamis Oriental and Bukidnon, plus Bria Homes San Fernando (Pampanga), Bria Homes Bay (Laguna), Bria Condo Calamba, Bria Condo General Trias and BRIA Dumaguete (Upper Cantil-e). These are town-level locations only. — [BusinessWorld](https://www.bworldonline.com/?p=241063), [Philstar 2021](https://www.philstar.com/business/2021/08/21/2121528/bria-homes-unveils-4-projects-luzon), [ABS-CBN 2020](https://news.abs-cbn.com/advertorial/life/10/23/20/bria-homes-completes-construction-of-five-properties)

### Inferences
- A practical pipeline:
  - Lumina: parse `myLatlng` per project, giving about 33 exact pins.
  - 8990: parse "Address: Brgy. X, City, Province" plus the LTS number, then geocode the barangay with an open gazetteer (PSGC + OSM/Nominatim barangay centroids).
  - Camella: REST API city/province, then the city centroid, refined manually from OSM where the subdivision is mapped.
  - PHirst: the address string, then the barangay centroid.
- The "embedded Google Maps iframe with `!3d…!4d…`" pattern was not seen on any of the sites probed. Developers either hand-code JS LatLng (Lumina), use a text-query embed (PHirst), or show none (8990, Camella static HTML). Pages may load more map data through JS/AJAX, which a headless browser could reveal. Not tested.
- Even in the best case (Lumina), a project-level pin is the site gate or centroid. That is adequate for a "which subdivision" map, but not lot-level.

### Gaps
- Bria (bria.com.ph), Amaia, Sta. Lucia, Taft Properties (Symfoni Nichols), Golden Horizon/Golden Haven, Pasinaya Homes, Northdale/Pagsibol/Pagsinag (Naic), Mondale/Extraordinary Homes, El Pueblo, Harmony Hills and City Homes Resortville were not inspected. The sites timed out, or there was no time within the call budget.
- Whether Camella or 8990 expose coordinates through JS-rendered content or AJAX (e.g. Houzez `admin-ajax.php` map endpoints) was not tested.
- Whether any developer keeps pages for sold-out or older phases was not verified. The catalogues observed appear to be current-selling only.

## Q2. Terms of use / robots.txt implications for reusing factual location data

### Takeaway
robots.txt permits crawling project pages for Lumina, 8990, Camella, PHirst and Sta. Lucia. Fiesta disallows everything. The one ToS checked (Lumina) prohibits "reproduction" of site material and frames it around design/layout/graphics. A table of facts you derive yourself (project name, barangay/city, a lat/lng pair) is a much weaker target than copying pages. It is still a grey area, so the safest permanent store is your own derived facts, cross-checked against open data (OSM/PSGC), not mirrored page content.

### Cited Findings
- Lumina T&C: reproduction of site material is prohibited and unauthorised use may lead to damages claims. The named protected material is "design, layout, look, appearance and graphics". — [Lumina T&C](https://www.lumina.com.ph/terms-and-conditions/)
- robots.txt allows crawling the project paths for 8990 ([robots](https://8990holdings.com/robots.txt)), Camella ([robots](https://www.camella.com.ph/robots.txt)), PHirst ([robots](https://www.phirstparkhomes.com/robots.txt)) and Sta. Lucia ([robots](https://stalucialand.com.ph/robots.txt)). Lumina sets crawl-delay only for SEO bots ([robots](https://www.lumina.com.ph/robots.txt)). Fiesta blocks all ([robots](https://www.fiestacommunities.ph/robots.txt)).
- Camella's page embeds a Google Maps JS API key. This shows the map display is Google's, but no coordinate values were in the static page. — [Camella Isabela](https://www.camella.com.ph/property/camella-isabela/)

### Inferences
- Background knowledge, not verified this session; a legal check is advised:
  - Philippine copyright (RA 8293) protects original expression, not facts.
  - The Philippines has no EU-style sui generis database right.
  - So a handful of coordinates or addresses per project, re-entered into your own table, is low-risk.
  - Bulk-copying text, photos or site-plan images is not.
- Coordinates that a developer hand-typed into its own JS (Lumina) are the developer's data, not Google Maps content, so Google's terms on caching Maps data arguably don't apply. Coordinates read off Google's map tiles or Places results would fall under Google's terms, which restrict permanent storage. Avoid deriving pins from Google.
- For a Leaflet/OSM map, the strongest licence position is to:
  - store the developer-stated address (a fact), and
  - geocode it against OSM/Nominatim (ODbL, attribution and share-alike for the derived database) or PSGC barangay centroids.
- Use developer coordinates as a QA cross-check, or store them as facts with source attribution.
- Respect Fiesta's `Disallow: /`. Get Fiesta locations from press releases, the DHSUD LTS, or manual lookup.
- Crawl politely: one request per project page, a one-time build, and a 10 s delay, which matches Lumina's stated delay.

### Gaps
- Terms of use for 8990, Camella/Vista, PHirst, Amaia and Bria were not read.
- No Philippine case law on scraping factual real-estate data was found.

## Q3. Government sources (DHSUD/HLURB, Pag-IBIG, NHA): do they include locations or coordinates, and are they downloadable?

### Takeaway
No downloadable national registry of DHSUD-licensed projects with locations was found. Pag-IBIG publishes acquired-asset sale lists as PDFs, which carry property addresses but are not a developer-project gazetteer. NHA project locations exist mainly as an NHA GIS map and through FOI responses. The most useful government hook is the **DHSUD LTS number**, which 8990 prints on its project pages and which could link a project to DHSUD records if they become available through FOI.

### Cited Findings
- Searches for a downloadable DHSUD list of registered or LTS projects found only DHSUD issuances on licence-to-sell procedure (e.g. DO 2020-001 and DO 2021-008, mirrored on the UPLB DIP Lab CKAN), not a project registry. — [UPLB DIP Lab CKAN, DO 2020-001](https://ckan.diplab.uplb.edu.ph/id/dataset/do-no-2020-001), [DO 2021-008](https://ckan.diplab.uplb.edu.ph/da_DK/dataset/do-no-2021-008)
- Pag-IBIG's Acquired Assets section (pagibigfund.gov.ph/acquiredassets.html) is where it publishes downloadable "List of Properties for Sale" PDFs (negotiated sale and public auction batches). Copies are mirrored by third parties. — [Gulf News explainer](https://gulfnews.com/amp/story/world%2Fasia%2Fphilippines%2Fphilippines-property-super-sale-30k-foreclosed-homes-up-for-grabs-via-pag-ibig-how-to-buy-or-bid-1.500249589); example mirrored PDFs: [Pampanga NegoSale batch](https://www.foreclosurephilippines.com/wp-content/uploads/2024/04/pampanga-negosale-batch-40113-040424-compressed.pdf), [Cebu NegoSale batch](https://www.foreclosurephilippines.com/wp-content/uploads/2022/04/cebu_negosale_batch_64014_040422_compressed.pdf)
- pagibigfund.gov.ph could not be fetched ("unable to verify domain" / connection failure). The existence and format of a "list of properties from partner-developers" page could not be confirmed. — fetch attempt on https://www.pagibigfund.gov.ph/
- Metrobank publishes "list of accredited developers and projects" PDFs (2023–2024), listing developers and projects by location. This bank-side accreditation list is a possible cross-reference for project names and towns. — [Metrobank list, Apr 2024](https://web-assets.metrobank.com.ph/1714111173-list-of-accredited-developer-per-website-as-of-04-26-2024.pdf), [Nov 2023](https://web-assets.metrobank.com.ph/1700459305-list-of-accredited-developer-per-website-as-of-11-20-2023.pdf)
- NHA: no consolidated downloadable list was found. The PSSC data portal describes an "NHA GIS Maps" resource showing NHA project locations. NHA has also released relocation-site lists (e.g. Metro Manila and Region IV-A, Nov 2024) in response to FOI requests. — [PSSC data portal](https://www.data.pssc.org.ph/?p=579), [NHA on FOI portal](https://foi.gov.ph/agencies/nha/)
- SHFC (a DHSUD attached agency) publishes some corporate reports as PDFs (e.g. pipeline and take-out). These are relevant to community-mortgage projects, not developer subdivisions. — [SHFC Pipeline and Take-out PDF](https://www.shfc.dhsud.gov.ph/wp-content/uploads2/pdf/corporate-reports/Pipeline-and-Take-out.pdf)

### Inferences
- Government data is public-domain-like and safe to store, but not in a form ready for pins. An FOI request to DHSUD for "registered projects with LTS no., project name, developer, barangay/municipality" is the most promising free route to a complete, permanent, legally clean table, including old and sold-out projects. It would still need barangay-level geocoding.
- Metrobank and other bank accreditation PDFs could fill name→town gaps for developers whose sites are unreachable (Bria, Fiesta).

### Gaps
- Whether DHSUD has an online LTS verification or search tool: no source found.
- The current content of Pag-IBIG's partner-developer property pages: the site was unreachable.
- The NHA GIS map's format, licence and whether it is downloadable: not verified.

## Q4. Estimated coverage of a typical Pag-IBIG acquired-asset listing set

### Takeaway
No quantitative breakdown of Pag-IBIG listings by developer was found, so any coverage figure is an estimate. From the names and the catalogues found, roughly:
- Lumina (33 current projects with coordinates) plus 8990 (24 projects with barangay addresses) plus Camella (about 101 projects with city) plus PHirst (about 20) give town-level placement for a large share of developer-subdivision names.
- Exact pins are available only for Lumina.
- Older phases, sold-out projects and smaller developers (Fiesta, Pasinaya, Golden Horizon, Northdale, etc.) will need gazetteer or manual geocoding.

### Cited Findings
- Pag-IBIG negotiated-sale and auction PDFs are organised by region or branch (e.g. NCR, Pampanga, Cebu batches) and are where names like "LUMINA PANDI PHASE 4" or "DECA HOMES…" appear. — [Pampanga NegoSale batch](https://www.foreclosurephilippines.com/wp-content/uploads/2024/04/pampanga-negosale-batch-40113-040424-compressed.pdf), [NCR T-335 ND](https://foreclosurephilippines.com/wp-content/uploads/2024/07/ncr-t-335-nd-071724-compressed.pdf)
- Developer catalogue sizes found:
  - Lumina: 33 projects ([listing](https://www.lumina.com.ph/property-listing/))
  - 8990: 24 ([sitemap](https://8990holdings.com/project-sitemap.xml))
  - Camella: about 101 project pages / 113 REST records ([sitemap](https://www.camella.com.ph/property-sitemap.xml))
  - PHirst: about 20 ([sitemap](https://www.phirstparkhomes.com/page-sitemap.xml))

### Inferences
- The project name usually carries the town (e.g. "Lumina Pandi", "Deca Homes GenSan", "Fiesta Communities – Castillejos"). So even without developer data, a name→municipality parse plus PSGC centroids gives a town-level pin for most rows. Developer data mainly improves this to barangay or exact level.
- Matching needs fuzzy normalisation:
  - strip "PHASE n", "EXT", "RESORT RESIDENCES 1/2"
  - map "GENSAN" → General Santos and "URBAN DECA HOMES ORTIGAS" → the urban-deca-homes-ortigas slug
- PHirst projects are mostly recent (late 2010s onward), so they are probably under-represented in foreclosure lists relative to Deca, Lumina and Camella. This is an inference, not verified.

### Gaps
- No actual Pag-IBIG listing set was tallied by developer in this session, so the share per developer is unknown. Recommend counting the names in a few recent regional PDFs to measure coverage directly.
