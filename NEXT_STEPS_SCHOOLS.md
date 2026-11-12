# Wikigai Schools: next steps to implement the strategy

**Written:** 2026-11-12 with v20261112d · **Strategy:** `Business_Model/Schools_Listings/` (Strategy v20261112b, Markets UK/IE/US/MX, schema v1.0 + v1.1, scoring)
**Rule kept:** every step ships as a dated `website/vYYYYMMDD` folder, tested local → preprod → prod; infrastructure goes to the CTO OpenClaw agent.

---

## 0. Where we are (v20261112d)

| Done | Not yet |
|---|---|
| Public `/schools` (EN/FR/ES) with server-side gating and blurred insights, sign-up prompt | Real data (everything is **demo**: fictional institutions, illustrative figures) |
| My learning › Schools with path-based defaults (1st area + 1st profession), folded extras, full insights, shortlist | Server-rendered result lists and per-programme pages for SEO (results load in the browser today) |
| `/api/schools` (+ shortlist), migration 017, privacy export/delete/merge, analytics events | Admission odds from the student's own grades (today: acceptance-rate bands only) |
| 44 + 23 tests passing, i18n clean, SEO audit clean (apart from the intended noindex) | Institution side (claimed profiles, consented leads, billing) |

---

## 1. Decisions for you (this week)

| # | Decision | My recommendation |
|---|---|---|
| D1 | Approve the two versions (see `docs/schools-preview/index.html`) | Approve; tell me what to change before preprod |
| D2 | What stays visible to visitors | Keep facts visible (place, level, duration, language, tuition band €/€€/€€€, careers it leads to); blur every insight. Facts are what Google indexes |
| D3 | Publish on preprod now with demo data? | Yes: preprod only, noindex, not linked from the landing page. Gather tester feedback |
| D4 | First real-data markets | **ES + FR first (weeks 1–4), then IE + MX (weeks 3–6), UK (weeks 5–8), US wedge (weeks 8–12)**, per the markets document |
| D5 | Seasonal tools to build before the deadlines | **Irish CAO points predictor (CAO deadline 1 Feb 2027)** and **Mexican UNAM/IPN score simulator (calls in January 2027)**; Parcoursup odds for France (wishes open in January) |
| D6 | Who owns what | Business units from strategy §18: Data agent (BU1), CMO agent (BU2), Product (BU3), Sales (BU4), Partnerships (BU5), CTO agent (platform) |

---

## 2. Implementation plan

### Week 1 (16–22 Nov): ship the shell, connect the funnel
| Step | Owner | Deliverable | Done when |
|---|---|---|---|
| 1.1 | CTO agent | Deploy **v20261112d** to preprod (`SCHOOLS_INDEX` unset) | `schools_smoke.mjs` passes on preprod |
| 1.2 | Product | **Sign-up returns to Schools:** `/signup?next=/learning/schools` survives verify → survey → results | New user lands on My learning › Schools after the test |
| 1.3 | Product | **Ikigai results → Schools bridge:** block on the results page, "Programmes that lead to *UX Designer*" (top 3 cards + link) | Click-through tracked (`schools_search` from results) |
| 1.4 | CMO agent | Friendly testers (copy link / WhatsApp / LinkedIn) on preprod `/schools` and `/learning/schools` | 10 testers, feedback noted |

### Weeks 1–4: Data Factory MVP (Spain + France)
| Step | Owner | Deliverable |
|---|---|---|
| 2.1 | Data agent | **Source register + licences** (`data_source` table): QEDU and RUCT (ES), Parcoursup and Mon Master open data, InserSup (FR), ETER, ROR, Wikidata, ESCO. Licence and refresh cadence per source |
| 2.2 | Data agent | **Loader scripts** (Python + DuckDB, in `tools/schools/`) writing the *same JSON shape* as `schools-demo.json`. The API runs unchanged with `SCHOOLS_DATA=…` |
| 2.3 | Data agent | Entity resolution (ROR / national IDs, then fuzzy match, then a review queue) + **career mapping** (ESCO ↔ the 160 Wikigai careers, 32 subfields) |
| 2.4 | Product | ROI v1 on real data (`wikigai_schools_scoring.py` method), confidence grades A–D, field priors per country |
| 2.5 | CTO agent | Migration **018**: move from JSON to Postgres using the `schools` schema (strategy `wikigai_schools_schema.sql` + `_v1_1_markets.sql`); API reads Postgres; JSON stays as fallback |

**Exit:** ES + FR real programmes in preprod, demo removed for those countries (`DEMO` tag off per market), spot-check of 100 programmes by hand.

### Weeks 3–8: seasonal admission tools (fixed deadlines)
| Tool | Market | Must be live | Data |
|---|---|---|---|
| CAO points predictor + course-order optimiser | IE | **before 1 Feb 2027** (CAO deadline); change-of-mind window May–Jul | CAO points (5 years), Qualifax, HEA outcomes |
| "¿Me alcanza para entrar?" score simulator + private alternatives with scholarships | MX | **early Jan 2027** (UNAM/IPN calls) | Historical minimum scores, ANUIES/RVOE, IMCO Compara Carreras |
| Parcoursup odds (taux d'accès × profile) | FR | **mid-Jan 2027** (wishes open) | Parcoursup open data |
| Nota de corte odds | ES | before July 2027 (cut-off season) | QEDU |

Each tool is a page inside the directory (public teaser, full result after sign-up). They're the strongest lead magnets in the plan.

### Weeks 4–8: SEO at scale (the traffic engine)
| Step | Owner | Deliverable |
|---|---|---|
| 4.1 | CTO + CMO | **Server-rendered lists**: `/schools` and filtered landing pages render the first results as HTML (crawlers see programmes, not just the shell) |
| 4.2 | CTO | **Programme and institution pages**: `/{lang}/universities/{country}/{slug}` (+ programme) with schema.org `EducationalOccupationalProgram` / `CollegeOrUniversity` |
| 4.3 | CMO | **Career-path pages**: "How to become a UX designer in Spain": 160 careers × countries × 3 languages, built from Wikigai data (unique to us) |
| 4.4 | CTO | `seo_page` registry + **quality gate** (strategy §7.4); segmented sitemaps; `SCHOOLS_INDEX=true` **per market** only when its real data passes |
| 4.5 | CMO | Link `/schools` from the landing page, footer and ikigai results; first data PR piece ("Wikigai ROI Report Spain 2027") |
| 4.6 | CMO | Keyword validation (Semrush needs API units) to order the templates |

### Weeks 6–12: institution side (revenue)
| Step | Owner | Deliverable |
|---|---|---|
| 5.1 | Product + CTO | **Consent centre**: per-institution "may contact me" (strategy schema `consent`, `lead`; minors blocked by DB trigger, US CPA guard) |
| 5.2 | Sales agent | **Claim-your-profile** page for institutions (free) + "Ranked on Wikigai" badge |
| 5.3 | Sales agent | **Pilot with 10 private institutions** (ES/MX first): CPL €12–40, refund if rejected within 7 days, CSV/webhook delivery |
| 5.4 | Partnerships agent | First marketplace partners: housing, English courses (IE), study-abroad (US→ES/IE), education financing (MX) |
| 5.5 | Product | Owner stats (dashboard.digitradin.cloud): funnel from `/schools` visit → unlock click → sign-up → shortlist → consent |

### Legal track (parallel, before any lead leaves Wikigai)
Privacy policy update (saved schools now; institution contact consent later) · DPIA for minors (ES 14 / FR 15 / IE 16 / UK 13 / US COPPA 13 / MX 18) · per-source data licences · public methodology + trust charter page (EU UCPD ranking-parameter disclosure) · keep the AI admission odds advisory (EU AI Act).

---

## 3. Technical backlog from v20261112d (known limitations)
1. Results render client-side → add SSR (step 4.1).
2. Admission chance uses acceptance-rate bands → add the student's grades from My path (Strengths) and the country models in `wikigai_schools_markets.py`.
3. Match score is a simple weighted formula → align with the strategy engine (§9: career fit, affordability vs budget, academic fit, ROI, place, preferences) once a budget question is added.
4. Fees use one "home" category → add the student's fee category (nationality/residence: EU, UK nations, US in-state, international).
5. Public API is cacheable but un-paginated beyond 48/page and rate-limited at 60 req/min/IP → add a CDN cache and bot limits before indexing.
6. Shortlist has no notes or status yet → add the Considering → Applied → Admitted board and the deadline reminders (strategy §6.2).

---

## 4. First-90-day targets (to calibrate)
| Metric | Day 30 | Day 90 |
|---|---|---|
| Real programmes live (ES, FR, IE, MX) | 2,000 | 15,000 |
| Indexed schools pages | 0 (demo) | 5,000 |
| `/schools` visits / month | 2,000 (testers + social) | 20,000 |
| Unlock-click → sign-up | 10% | 15% |
| Sign-ups that save ≥ 1 programme | 25% | 35% |
| Institutions in pilot / paying | 3 / 0 | 10 / 5 |
| CAO + UNAM tool users (season) | — | 5,000 |
