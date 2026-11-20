# Pagmamahal Maps: status report and public launch plan

*Prepared November 20, 2026. Prices and limits come from the providers' own
pages, checked that day (sources at the end); they can change.*

> **Status, Nov 20, 2026 (evening):** sections 6.1–6.5, 6.6 (pages drafted,
> wording awaiting owner approval) and 6.8's rate warning are **done**. The site
> is live at **https://pagmamahal-maps.pages.dev**, published daily by GitHub
> Actions with the `CLOUDFLARE_API_TOKEN` secret (Cloudflare key "Pagmamahal Maps
> publish", Pages: Edit only, **expires Nov 20, 2027**). The old GitHub Pages
> address redirects there. 18 automated tests run on every change. Still open: the
> owner approving the About/Privacy wording, choosing a code license, and the
> phone test (6.9). Below is the plan as written before the work.

---

## 1. Summary

Pagmamahal is a free, mobile-friendly web app. It shows every Pag-IBIG Fund
acquired property up for auction on a map, with a housing-loan calculator and a
way for visitors to fix wrong map pins. It's live today at
`https://lordgrim336-pixel.github.io/pagmamahal/`.

**Running it costs $0 a month,** and stays at $0 even when public, as long as it
remains a free, non-commercial site within the free tiers below. The only "cost"
is the daily Claude review, which uses part of your existing Claude Pro plan's
usage. That's worth about **$1–30 a month** at API prices, but it isn't billed.

Before a public launch, nine pieces of work are recommended (section 8). Three
of them matter most:

1. **New address "Pagmamahal Maps":** `pagmamahal-maps.pages.dev`, free.
2. **Switch map tiles:** OpenStreetMap's own tile servers aren't meant for
   public apps with real traffic and can block one without notice. OpenFreeMap
   is a free, no-key replacement.
3. **Don't publish broken data** when Pag-IBIG's site is down for maintenance.
   It was in maintenance during this check.

---

## 2. What the app does

| Feature | Details |
|---|---|
| **Map of all listings** | 6,020 Pag-IBIG acquired properties in all 17 regions; clustered pins; phone and desktop layouts; installable on a phone's home screen; works offline with the last data |
| **Search and filters** | Text search (address, subdivision, barangay, ID); Region → Province → City (each optional, with counts); sale type; property type; occupancy; max price; "bidding open now"; sorting |
| **Property details** | Minimum bid, bidding dates, areas, occupancy, remarks, barangay, handling office; buttons for Pag-IBIG's site, Google Maps and the loan calculator; an explanation of how the pin was placed and how precise it is (accuracy circle) |
| **Loan calculator** | Uses Pag-IBIG's published rules: rates valid until **Dec 31, 2026**, ₱10M cap, 30-year term, loan must end by age 70. Adjustable price, down payment, income, age and term; compares every interest plan |
| **"Pin in the wrong place?"** | One tap, no sign-in, invisible bot check. Clear fixes go live within minutes; the rest get a daily Claude review |

**Things it can't show:** current bids (Pag-IBIG auctions are sealed-bid), or a
direct link to one property (Pag-IBIG's site has no such pages).

---

## 3. How it works

```
                 ┌──────────────── daily 05:17 PH ────────────────┐
Pag-IBIG site ──►│ GitHub Actions "Publish site"                  │──► GitHub Pages (the website)
                 │  collect listings → place pins → build site    │      lordgrim336-pixel.github.io/pagmamahal
                 └────────────────────────────────────────────────┘
                   uses: Overture places, PSGC barangay boundaries,
                         OpenStreetMap (Nominatim), saved corrections

Visitor taps "Pin in the wrong place?"
   └─► Cloudflare Worker relay (bot check, limits) ─► data/inbox/ in the GitHub repo
          └─► GitHub Actions "Process pin reports" (~12 s)
                 ├─ clear fix → data/location-overrides.json → republish map
                 └─ unclear  → "pending" → Claude daily review 09:00 PH → pull request → you merge
```

### Accounts and keys

| What | Where | Expires / renews |
|---|---|---|
| GitHub account + public repo `pagmamahal` | github.com/lordgrim336-pixel | — |
| Cloudflare account: Worker `pagmamahal-reports`, KV `REPORTS`, Turnstile widget "Pagmamahal" | dash.cloudflare.com | — |
| GitHub key "Pagmamahal relay" (only this repo, file editing only), stored as a relay secret | GitHub settings → tokens | **Nov 20, 2027**: regenerate before then |
| Turnstile secret key (relay secret) | Cloudflare → Turnstile | doesn't expire |
| Claude GitHub App (only this repo) | GitHub settings → installations | — |
| Claude routine "Daily pin review" | claude.ai/code/routines | — |

### Pin accuracy (measured)

| How a pin is placed | Listings | Typical error |
|---|---|---|
| Pag-IBIG's own GPS (checked to be inside the right town) | 1,922 | exact |
| GPS of other listings in the same subdivision | 2,337 | inside the subdivision |
| Subdivision found in OpenStreetMap or Overture | ~1,140 | 0.17–0.21 km |
| Barangay boundary center | ~609 | 0.9 km |
| Town center (last resort) | ~12 | 3.9 km |
| Fixed by hand or by visitor reports | growing | exact |

About 88 of Pag-IBIG's own GPS readings (4%) point outside the property's town.
Those are rejected automatically.

---

## 4. Costs if the app goes public

### Monthly running costs

| Service | What it's used for | Free allowance | Our usage | Cost |
|---|---|---|---|---|
| GitHub Pages | Hosting the website | 100 GB/month bandwidth (soft limit), 1 GB site | ~300 KB per new visitor → ~330,000 new visitors/month before the limit | **$0** |
| GitHub Actions | Daily data refresh, report checks | Free for public repos | ~3 min/day + ~12 s per report | **$0** |
| Cloudflare Workers | Report relay | 100,000 requests/day | 1–2 requests per report | **$0** |
| Cloudflare KV | Daily report limits | 1,000 writes/day | 2 writes per report → max ~500 reports/day (we cap at 200) | **$0** |
| Cloudflare Turnstile | Bot check | Unlimited | 1 per report | **$0** |
| Map tiles | Map background | OSM: no allowance for heavy apps; OpenFreeMap: no limits | 1 map load per visit | **$0** |
| Overture, PSGC boundaries, OpenStreetMap search | Placing pins | Free / open data | Downloaded monthly; ≤60 OSM lookups/day | **$0** |
| Claude daily review | Checks unclear reports | Included in your Pro plan's usage | 1 run/day (see below) | **$0 extra** |
| **Total** | | | | **$0 / month** |

**Optional:** a custom domain such as `pagmamahalmaps.com` costs about $10–15 a
year for a .com (it's not required).

### The Claude review, in tokens

The routine runs on your Claude Pro subscription. Its runs count against your
plan's usage limits, and **nothing is billed extra** unless you turn on paid
usage credits at claude.ai/settings/usage (leave them off). There is no separate
charge for the cloud machine it runs on.

What it would cost at API prices (Claude Sonnet 5.5: $2 per million input
tokens, $10 per million output, cached input $0.10 per million):

| Day type | Tokens per run (estimate) | API-price equivalent |
|---|---|---|
| Nothing to review (most days) | ~20,000 in / ~500 out; stops in seconds | ~$0.04 |
| 5–10 unclear reports | ~200,000–500,000 in (mostly cached) / ~10,000 out | ~$0.20–$1.00 |
| **Per month** | | **~$1–30**, all inside your Pro plan |

These are estimates; the real numbers show in each run's log.

### When free stops being enough

| If… | What happens | Free fix |
|---|---|---|
| More than ~330,000 new visitors a month | GitHub may ask the site to reduce traffic | Move hosting to Cloudflare Pages (recommended anyway, see 6.1) |
| More than 200 reports a day | Extra reports are politely refused until tomorrow | Raise the cap up to ~500/day |
| Busy review days repeatedly | The routine uses more of your Pro usage | Fine-tune the review rules |
| The site becomes a business (ads, paid features) | GitHub Pages doesn't allow commercial sites | Cloudflare Pages |

---

## 5. Risks found during this review

| # | Risk | Severity | Fix in plan |
|---|---|---|---|
| R1 | **OpenStreetMap tile servers** are for light use; "heavy use" apps must use other servers, and blocks can happen without notice | High at launch | 6.3 |
| R2 | **Pag-IBIG site maintenance**: during this check it redirected to a maintenance page. A refresh during an outage could publish partial data | High | 6.4 |
| R3 | **Loan rates expire Dec 31, 2026** (41 days). After that the calculator shows old rates | High, dated | 6.8 |
| R4 | No privacy notice or disclaimer page (Philippine Data Privacy Act, RA 10173; Cloudflare sees visitor IPs) | Medium | 6.6 |
| R5 | The name "Pagmamahal" with Pag-IBIG data could look official | Medium | 6.6 (clear "not affiliated" notice already shown; add an About page) |
| R6 | Map libraries load from a CDN without integrity checks | Low | 6.5 |
| R7 | The relay's command-line tool is pinned to an old, deprecated version | Low | 6.7 |
| R8 | GitHub key expires Nov 20, 2027 | Low, dated | 6.8 (reminder) |
| R9 | Listings data belongs to Pag-IBIG; no published terms were found that forbid reading its public pages | Low | Keep gentle collection rate; credit the source |

---

## 6. Launch work in detail

### 6.1 New address "Pagmamahal Maps"

Web addresses can't contain spaces, so the closest form is **pagmamahal-maps**.
All three options are free:

| Option | Address | Pros | Cons |
|---|---|---|---|
| **A. Cloudflare Pages (recommended)** | `https://pagmamahal-maps.pages.dev` | Short, no username in it; same Cloudflare account as the relay; no published bandwidth cap; commercial use allowed | One more Cloudflare key for GitHub to publish with |
| B. GitHub organization | `https://pagmamahal-maps.github.io` | Stays on GitHub | Needs a free GitHub organization, moving the repo, and redoing the Claude app and relay key |
| C. Rename the repo | `https://lordgrim336-pixel.github.io/pagmamahal-maps/` | 2 minutes | Still has your username in it |

The app's name and title become **"Pagmamahal Maps"** in every option. The relay,
bot check, Claude review and docs get updated to the new address. The old
address keeps working or redirects during the switch.

### 6.2 Clean code for public use

- Put the site address, repo name and other settings in **one config file**, instead of scattered through the code.
- Move the research notes into `docs/research/` and archive the test reports.
- Remove the GitHub-sign-in report form, so the one-tap form is the only way to report (optional; it's harmless to keep).
- Add a code license (MIT is common) and a short CONTRIBUTING guide.
- Add **automated tests** for the loan math, the pin rules and the report checks. They run on every change.
- Check accessibility: labels, keyboard use, color contrast.

### 6.3 Map tiles

Switch from OpenStreetMap's servers to **OpenFreeMap**: free, no key, no published
limits, OpenStreetMap data. Keep the same look and attribution. OpenFreeMap runs
on donations, so the tile address will live in one setting, making a later
switch quick.

### 6.4 Safe daily refresh

- Don't publish if Pag-IBIG is in maintenance, or if the number of listings drops sharply (for example, more than 30%) compared with the last good run. Keep yesterday's data instead.
- Email you when a refresh is skipped. GitHub does this when a workflow fails.

### 6.5 Security

- Add integrity checks (SRI) on map libraries loaded from the CDN.
- Add a Content-Security-Policy that limits the site to its known sources.
- Already done: no keys in the website, bot check, rate limits, report text treated as data, visitor IPs never stored.

### 6.6 Public pages

- **About:** what the app is, that it's **not affiliated with Pag-IBIG Fund**, and where the data comes from.
- **Privacy:** what a report stores (property ID, location, optional note, a scrambled visitor code), that Cloudflare processes IP addresses for the bot check, and how to ask for removal (RA 10173).
- **Disclaimer:** loan figures are estimates, not financial advice; always confirm with Pag-IBIG.
- **Link previews:** title, description and image for Facebook/Messenger sharing; phone icons (PNG).

### 6.7 Housekeeping

Update the relay's command-line tool to a current version and redeploy; clean up the
leftover terminal tabs.

### 6.8 Dated maintenance

- **By Jan 1, 2027:** update the loan rates from Pag-IBIG's page. The app will also show a "rates may be outdated" note automatically once the valid-until date passes.
- **Before Nov 20, 2027:** regenerate the relay's GitHub key, the same way as before (2 minutes).
- **Monthly, automatic:** refresh the Overture and boundary data.

### 6.9 Launch check

A full test on a phone: browse, filter, open properties, use the calculator,
report a pin, and see it go live. Then a soft launch to a few people before
sharing widely.

---

## 7. What's needed from you

| Step | When | Time |
|---|---|---|
| Choose the address option (A, B or C) | Now | — |
| Choose the code license (MIT or other) | Now | — |
| Option A only: create a Cloudflare Pages key for GitHub (I prepare it; you paste it) | During 6.1 | ~5 min |
| Read and approve the About / Privacy / Disclaimer wording | Before launch | ~10 min |
| Test on your phone | Before launch | ~10 min |
| Update loan rates (or ask me to) | Early January 2027 | ~10 min |

Building the rest takes one or two working sessions. It runs on your Claude
plan's usage, like today, with no extra charge.

---

## 8. Proposed order

1. **Address and name** (6.1): biggest visible change; everything else follows it.
2. **Safety first:** safe refresh (6.4) and map tiles (6.3).
3. **Clean code** (6.2) and **security** (6.5).
4. **Public pages** (6.6) and **housekeeping** (6.7).
5. **Launch check** (6.9), then share.

---

## Sources

- Claude routines: <https://code.claude.com/docs/en/routines>
- Using Claude Code with Pro: <https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan>
- Claude pricing: <https://claude.com/pricing>
- GitHub Pages limits: <https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits>
- OpenStreetMap tile usage policy: <https://operations.osmfoundation.org/policies/tiles/>
- Nominatim usage policy: <https://operations.osmfoundation.org/policies/nominatim/>
- OpenFreeMap: <https://openfreemap.org>
- Cloudflare Pages limits: <https://developers.cloudflare.com/pages/platform/limits/>
- Cloudflare Workers limits: <https://developers.cloudflare.com/workers/platform/limits/>
- Workers KV limits: <https://developers.cloudflare.com/kv/platform/limits/>
- Turnstile plans: <https://developers.cloudflare.com/turnstile/plans/>
