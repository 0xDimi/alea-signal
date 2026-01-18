# **PRD: Alea Market Screener \+ Researchability Score**

**Product:** Internal web app  
**Owner:** Head of Research (product), Engineering (delivery)  
**Primary outcome:** A daily, reliable pipeline that surfaces the *right* prediction markets for Alea to cover as **Memos (≤30d)** and **Theses (\>30d)**—fast, explainable, and easy to iterate.

---

## **1\) Problem statement**

Alea wants to integrate prediction markets into Theses and Memos. The bottleneck is **market selection**:

* The market universe is large and noisy.  
* Many markets are not researchable (ambiguous rules, weak data, low liquidity).  
* Analysts waste time browsing instead of modeling and publishing.

We need a simple, repeatable mechanism that answers:

“Which markets are worth Alea’s research time right now?”

---

## **2\) Goals**

### **2.1 Product goals**

1. **Reduce selection time**: analysts go from “I should cover something” → “here are 5 top candidates” in minutes.  
2. **Improve selection quality**: top-ranked markets are consistently researchable and meaningful (liquid/active).  
3. **Standardize decision-making**: the system explains *why* a market ranks high/low.  
4. **Enable workflow**: analysts can shortlist markets and track coverage state (On Deck / Active / Archive).  
5. **Ship fast, iterate weekly**: start simple, then add precision (orderbook/holders/alerts) only if needed.

### **2.2 Success criteria (MVP)**

* Analysts use it daily.  
* Top results “make sense” most of the time (qualitative sanity check).  
* Analysts regularly move markets from **New → On Deck**.  
* The tool is stable: ingestion runs reliably; stale data is visible.

---

## **3\) Non-goals (MVP)**

* Not a trading terminal.  
* No portfolio tracking.  
* No wallet/whale tracking.  
* No orderbook depth/spread analysis.  
* No alerts/push notifications.  
* No automatic thesis/memo writing.

(These can be v1+ if the MVP proves value.)

---

## **4\) Target users and jobs-to-be-done**

### **Persona A: Research Analyst**

**Job:** Find a market to research and publish quickly.  
**Needs:** Relevance filters, horizon (Memo vs Thesis), liquidity/activity signals, rules integrity signals, shortlisting.

### **Persona B: Head of Research**

**Job:** Ensure the team covers high-quality markets with consistent standards.  
**Needs:** Visibility into what’s “On Deck,” why markets are selected, ability to tune scoring inputs/weights, quality control.

### **Persona C: Editor / Ops (optional)**

**Job:** Manage publishing cadence and coverage pipeline.  
**Needs:** State tracking and notes, coverage ownership, clean links to source market pages.

---

## **5\) Core user stories**

1. **As an analyst**, I want to filter to Memo markets (≤30d) so I can find near-term opportunities.  
2. **As an analyst**, I want to filter by sector (crypto/macro/earnings/AI/tech) so I don’t see noise.  
3. **As an analyst**, I want a score that reflects “researchability” so I can prioritize.  
4. **As an analyst**, I want to see *why* a market scored high/low so I can trust it and override when needed.  
5. **As an analyst**, I want to tag a market as On Deck/Active and leave notes so the team can coordinate.  
6. **As Head of Research**, I want to tune the scoring config (weights/thresholds/tag filters) without code changes.

---

## **6\) Functional requirements (MVP)**

### **6.1 Data ingestion**

* Pull **active, open markets/events** from Polymarket on a schedule.  
* Store market metadata needed for ranking and filtering.  
* Persist `raw_payload` per market/event for debug and schema drift tracking.  
* Compute and store a Researchability Score per market.

**Data source for MVP:** Polymarket **Gamma API** (events \+ optional tags). The events payload includes fields like liquidity/volume/open interest and tag metadata needed for screening.  
Tags list endpoint exists and can support UI filters.

### **6.2 Market classification: Memo vs Thesis**

* Compute `days_to_expiry` from end date.  
* Default classification:  
  * Memo: `days_to_expiry ≤ 30`  
  * Thesis: `days_to_expiry > 30`

### **6.3 Screening UI (single page)**

A table that supports:

* Sort by: score (default), liquidity, volume24h, open interest, days to expiry  
* Filters:  
  * Mode: Memo / Thesis / All  
  * Min score  
  * Sector tags include/exclude (config-driven; default include: crypto/finance/economy; default exclude: politics)  
  * Days-to-expiry range  
  * Hide restricted markets (optional toggle)

### **6.4 Market detail view (drawer/modal)**

On row click:

* Market question/title, description (if available)  
* Expiry \+ days remaining  
* Liquidity, volume24h, open interest  
* Tags  
* Score breakdown (sub-scores \+ flags/reasons)  
* Action links:  
  * Open market on Polymarket

### **6.5 Workflow state \+ notes**

Per market:

* State: `New` (default), `On Deck`, `Active`, `Archive`  
* Free-text notes  
* Optional: owner (analyst name)

### **6.6 Explainability (must-have)**

For every score, store:

* total score and sub-scores  
* a list of “reasons/flags” (e.g., missing resolution source, low liquidity)

---

## **7\) Researchability Score spec (MVP)**

### **7.1 What the score is (and is not)**

* It is **not** “edge” or “expected value.”  
* It is **time-allocation priority**: “Is this market researchable and meaningful?”

### **7.2 Inputs (MVP)**

From Gamma events/markets metadata:

* `liquidity`  
* `volume24hr`  
* `openInterest`  
* `endDate`  
* `resolutionSource` (if present)  
* `tags` / categories  
* `restricted` (optional penalty)

**Decision:** include multi-outcome markets in MVP (no penalty).

(These are present in the Gamma events schema examples. )

### **7.3 Components (MVP)**

Total score \= 100 points:

1. **Activity & Tradeability: 50**  
* Liquidity: 25  
* Volume24h: 15  
* Open interest: 10  
2. **Rules & Basic Integrity: 30**  
* Has resolution source: 20 (else 0\)  
* Has end date: 10 (else 0\)  
3. **Alea Fit: 20**  
* Tag-based sector match: 0–20 (config-driven)

**Optional penalties:**

* Restricted market: −10  
* Missing tags: −5

**Storage requirements:**

* Persist `score_version` and `score_components` (JSON) for explainability and re-score diffs.

### **7.4 Normalization (keep it simple)**

Use **log scaling \+ clamp** so outliers don’t dominate.

Example approach:

* `liq_score = clamp(25 * log10(1+liq)/log10(1+L_ref), 0, 25)`  
* `vol_score = clamp(15 * log10(1+vol24h)/log10(1+V_ref), 0, 15)`  
* `oi_score = clamp(10 * log10(1+oi)/log10(1+OI_ref), 0, 10)`

Where `L_ref`, `V_ref`, `OI_ref` are config values you tune after observing the distribution.

**Decision:** compute `L_ref`, `V_ref`, `OI_ref` each sync using percentiles (default P90) to reduce tuning overhead and handle distribution shifts.

### **7.5 Flags/reasons (examples)**

* `missing_resolution_source`  
* `missing_end_date`  
* `low_liquidity`  
* `low_volume24h`  
* `weak_open_interest`  
* `not_in_alea_sectors`  
* `restricted_market`

These must display in UI tooltips or the detail drawer.

---

## **8\) Data & APIs**

### **8.1 Required APIs (MVP)**

1. **Gamma Events** (universe discovery \+ key metrics)  
   * `GET https://gamma-api.polymarket.com/events?active=true&closed=false&limit=100&offset=0` (paginate)  
2. **Gamma Tags** (optional but recommended for filter UX)  
   * `GET https://gamma-api.polymarket.com/tags?limit=100`

### **8.2 Deferred APIs (v1+)**

* CLOB orderbook for spread/depth  
* Data API holders for concentration  
* Alerts/websockets

---

## **9\) Technical requirements (MVP)**

### **9.1 Architecture (minimal)**

* **Ingestion job** (cron/scheduled worker)  
  * fetch events (+ tags optionally)  
  * upsert markets  
  * compute scores  
* **API service** (or Next.js API routes)  
  * list markets with filters/sorting  
  * market detail  
  * update annotations (state/notes)  
* **Web UI** (single-page table \+ detail drawer)

### **9.2 Storage**

* MVP can run on SQLite for local/dev; production should use Postgres.  
* Minimal tables:  
  * `markets`  
  * `scores`  
  * `annotations`
  * `sync_status`

### **9.3 Reliability**

* Track `last_successful_sync_at`  
* Show “data freshness” timestamp in UI  
* Retry/backoff on failures (especially 429/5xx)  
* Ingestion must be idempotent (upserts)

### **9.4 Security**

* Internal access only (basic auth or password gate is acceptable for MVP; SSO/IP allowlist optional)  
* No private keys, no signing, no trading  
* Read-only calls to public APIs

---

## **10\) UX requirements (MVP)**

### **10.1 Screener table columns**

* Researchability score (with sub-score tooltip)  
* Mode (Memo/Thesis)  
* Market question/title  
* Tags (top 1–3)  
* Expiry (days remaining)  
* Liquidity  
* Volume 24h  
* Open interest  
* Flags (badges)  
* State (New/On Deck/Active/Archive)

### **10.2 Core interactions**

* Sort by score/liquidity/volume/expiry  
* Filter by mode, score, tags, days-to-expiry  
* Inline edit state  
* Notes editor (modal or inline)  
* Click row → open detail drawer  
* “Open in Polymarket” link

---

## **11\) Metrics and instrumentation**

### **11.1 Usage metrics**

* DAU/WAU of internal users  
* **markets moved to On Deck per week**  
* **markets moved to Active per week**  
* Median time from “New” → “On Deck”  
* Percent of Active markets that originated from the top 20 screener list

### **11.2 Quality metrics (human-in-the-loop)**

* “Top-20 acceptance rate”: fraction of top 20 markets that analysts deem reasonable (thumbs up/down)  
* False positives list: markets consistently ranked high but rejected (feed back into config)

### **11.3 Reliability metrics**

* Ingestion success rate  
* Time since last successful sync  
* API error rates (429/5xx)

---

## **12\) Rollout plan (phased, no overbuild)**

### **Phase 1: MVP release**

* Ingestion \+ score \+ table \+ state/notes  
* Run internally for real usage, tune config weekly

### **Phase 2: First precision upgrades (only if MVP is used daily)**

* Add “On Deck/Active” enrichment fields (orderbook/holders)  
* Add “rules snapshot” and integrity flags

### **Phase 3: Automation for Memo pipeline**

* Add alerts and “Memo candidate” queue

---

## **13\) Risks and mitigations**

1. **Bad rankings frustrate analysts**  
   Mitigation: explainability \+ manual override \+ rapid config iteration.  
2. **Tags are messy / not aligned to Alea sectors**  
   Mitigation: maintain a small, explicit allowlist mapping file; iterate.  
3. **Rate limiting / unstable ingestion**  
   Mitigation: low-frequency polling, pagination, retries/backoff, freshness indicator.  
4. **MVP drifts into “terminal scope creep”**  
   Mitigation: enforce non-goals; prioritize selection workflow over trading features.

---

## **14\) Open questions (answer before MVP lock)**

1. Which tag slugs map to Alea sectors (crypto/finance/economy) vs excluded (sports/culture/politics)?  
2. Who owns config changes (Head of Research vs Eng)?

---

## **Appendix A: Config file (suggested)**

A single `config.json`:

* `memo_max_days: 30`  
* `include_tags: [...]`  
* `exclude_tags: [...]`  
* `sector_map: { crypto: [...], finance: [...], economy: [...] }`  
* `L_ref, V_ref, OI_ref`  
* `ref_percentile: 0.9`  
* `weights` (if you later split Memo vs Thesis scoring)  
* `penalties: { restricted: -10, missing_tags: -5 }`  
* `flags_thresholds: { min_liquidity, min_volume24h, min_open_interest }`

---

If you want, I can also convert this PRD into:

* a **one-page “MVP build checklist”** for engineers, and  
* a **one-page “scoring tuning guide”** for research leads (what to change when rankings feel wrong).
