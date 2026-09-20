# Green BPM Survey

**Goal: distill a proper "Green BPM Guideline" — a curated, evidence-backed set of sustainability
practices that actually matter for business process design, modeling, execution, and
monitoring — out of the flood of general-purpose sustainability guidance that exists today.**

Sustainability guidance is abundant (cloud vendor frameworks, web guidelines, pattern
catalogs), but almost all of it is written for infrastructure and application engineers, not
process designers. Most of it is *not* actually relevant to BPM — an early rating pass across
415 guidelines found that general sources average 79% low-relevance content and only 12%
genuinely high-relevance, while sources written specifically for green BPM invert that almost
completely (0% low, 87% high — see "Key finding" below; relevance is rated on a locked 0–3
scale, see [`data/SURVEY_SCHEMA.md`](data/SURVEY_SCHEMA.md)). That gap is the reason this
project exists: rather than pointing a BPM practitioner at seven different sustainability
frameworks and asking them to guess which parts apply, this project collects them all, has
both an AI pass and a real human interview rate every guideline's BPM relevance, and will use
the highly-rated results to compile a single, focused Green BPM Guideline.

**Pipeline:** collect guidelines from multiple sources → rate each one for BPM relevance (scope,
lifecycle phase, generic-vs-specific) → validate/compare AI and human ratings → filter down to
the high-relevance subset → synthesize that subset into a coherent guideline document. This
site is currently between steps 2 and 3: the survey below collects the real human ratings that
will be compared against the existing AI pass.

**Live:** <https://nyuuyn.github.io/green-bpm-survey/>

## Key finding so far

Across the 5 general sustainability sources (400 guidelines), 79.2% score 0–1 on BPM Relevance
(not very relevant) and only 12.2% score 3 (highly relevant). The 2 BPM-native sources (15
guidelines) invert this almost completely: 0% at 0–1, 86.7% at 3. This is the evidence that
"relevant to BPM" is a real, distinct signal — not noise — and that filtering for it is worth
doing. See [`data/analysis.ipynb`](data/analysis.ipynb) for the full breakdown, or the
[Analysis page](https://nyuuyn.github.io/green-bpm-survey/analysis.html) for the interactive
version.

## Repo structure

```
index.html, survey.html, analysis.html   the three static pages (see "How it works" below)
style.css, common.js, survey.js, analysis.js
data.json                                guideline text for the survey (generated)
analysis_<round>.json                    per-round rating data for the analysis page (generated)
assets/                                  images/logos

data/                                    raw data, ratings, and analysis tooling
  guidelines/<source>/
    guidelines.csv          raw guideline data scraped from the source (ID, Name, Category, Reference, Guideline)
    survey.csv              human interview ratings — currently empty, reserved for the real interview pass
    survey_claude.csv       Claude-generated ratings, no persona framing, same schema as survey.csv
    survey_claude_sustainability.csv  Claude ratings framed as a sustainability/green-IT expert (lay BPM exposure) — test data
    survey_claude_bpm.csv             Claude ratings framed as a BPM expert (lay sustainability exposure) — test data
    guidelines_archive_*.csv  (azure/gsf/w3c only) pre-refresh snapshot, kept so old survey answers stay traceable
  respondents.csv           one row per survey session (background: BPM/sustainability experience, role)
  SURVEY_SCHEMA.md          the locked column definitions and rating rubric
  validate_survey.py        validates a survey.csv (or any file matching a glob) against the locked schema
  analysis.ipynb            loads every source, merges guidelines + ratings, and charts the results
  generate_data.py          regenerates data.json + analysis_<round>.json from the CSVs above (see "Data pipeline")
  requirements.txt          Python dependencies for the notebook

tests_e2e/, test_*.mjs, package.json, pytest.ini, .github/workflows/test.yml   tests + CI (see "Tests" below)
```

Everything under `data/` is source material and tooling. What actually gets **deployed** to
GitHub Pages is a fixed allowlist (see `.github/workflows/test.yml`'s `deploy` job): the static
pages/scripts/styles at repo root plus the generated `data.json`/`analysis_*.json` — the raw
CSVs, the notebook, and the Python scripts never ship to the live site.

### Sources

| Folder | Source | Rows | Type |
|---|---|---|---|
| `aws` | AWS Well-Architected Framework — Sustainability Pillar | 29 | General cloud |
| `azure` | Azure Well-Architected Framework — Sustainability recommendations | 135 | General cloud |
| `gcp` | Google Cloud Well-Architected Framework — Sustainability pillar | 106 | General cloud |
| `gsf` | Green Software Foundation Patterns Catalog | 59 | General cloud/web |
| `w3c` | W3C Web Sustainability Guidelines | 71 | General web |
| `gbpp` | Green Business Process Patterns (Nowak et al., PLoP 2011) | 9 | **BPM-native** |
| `ppatterns` | process-pattern.app, patterns tagged "Sustainability" | 6 | **BPM-native** |
| `lean` | Lean and Environment (EPA Lean & Environment Toolkit; Lean Enterprise Institute "green waste" articles) | 10 | **BPM-native** |

**425 guidelines total.**

## How it works

Three static pages, no build step, no framework:

- **`index.html`** — the landing page. Fully static (no JS): explains the project's goal and
  guideline sources, and links to the other two pages. This is the page people should land on
  first (shared links, GitHub Pages root).
- **`survey.html`** + **`survey.js`** — the rating flow. `data.json` (425 guidelines: `id`,
  `name`, `category`, `reference`, `guideline`, `source`, `sourceLabel`) is fetched on load,
  `SAMPLE_SIZE` (25) of them are sampled, and rating starts immediately - no separate
  intro/Start step, since that content lives on the landing page instead.
- **`analysis.html`** + **`analysis.js`** — the charts (see "Analysis page" below).
  Independently reachable - doesn't require taking the survey first.
- **`common.js`** — the handful of things `survey.js` and `analysis.js` both need
  (`RELEVANCE_OPTIONS`/`SCOPE_OPTIONS`/`LIFECYCLE_OPTIONS`, the tiny `el()` DOM builder,
  `renderApp()`), loaded before either page script.

Before rating starts, a one-time **"About you"** screen collects respondent background —
separately from personal data, and not used to identify anyone:
  - **BPM experience** (None / studied it / practitioner at a few duration bands)
  - **Sustainability/green-IT experience** — a *separate* axis from BPM experience, since the
    two are independent (a BPM expert can be new to sustainability and vice versa)
  - **Role** (Process Analyst, Developer, Consultant, Researcher, Student, etc., or a free-text
    "Other")

  This exists so ratings can later be checked for whether BPM/sustainability background
  actually changes what gets rated as relevant, rather than treating every rating as equally
  authoritative regardless of who gave it. It's stored once per session (in the payload's
  `respondent` object), not repeated per guideline.

  Then it shows all sampled guidelines as a collapsible list, one row per guideline. Picking a
  Relevance score expands that row's remaining fields; rows can be worked in any order and stay
  visibly marked (✓ complete / ! invalid after a blocked submit) so progress is legible without
  paging through 25 separate screens. Each row collects:
  - **BPM Relevance** (0–3)
  - **BPM Scope** — multi-select, since many guidelines act on more than one layer
  - **Generic** (Yes/No) — automatically disabled and left blank when Relevance is 0, since
    there's no BPM argument left to classify as generic-or-specific at that point
  - **BPM Lifecycle** (multi-select, with "Not Applicable" enforced as mutually exclusive)
  - optional free-text **Justification**

  Keywords are deliberately *not* collected — that's done analytically over the guideline text
  after the real survey, not by asking respondents to invent tags. This is the same schema as
  [`data/SURVEY_SCHEMA.md`](data/SURVEY_SCHEMA.md) — keep both in sync if you change one (they're
  now the same repo, so there's no cross-repo drift risk left, just don't forget the other file).

### Test mode (current state)

`SUBMIT_ENDPOINT` in `survey.js` is currently `null`. In this state, finishing the survey doesn't
submit anywhere — responses are shown on-screen as JSON and downloadable, so the whole flow is
testable without a backend. To go live, deploy a submission backend (Google Apps Script + Sheet)
and set `SUBMIT_ENDPOINT` to its URL.

## Data pipeline

```
data/guidelines/<source>/guidelines.csv  ─┐
data/guidelines/<source>/survey*.csv     ─┴─►  data/generate_data.py  ─►  data.json, analysis_<round>.json
                                                                            (repo root, committed, deployed)
```

`data/generate_data.py` is the single generator for everything the frontend fetches — `data.json`
(guideline text only, for the survey page) and one `analysis_<round>.json` per AI persona round
(for the analysis page's tabs), all read straight from `data/guidelines/*/*.csv`. Run it after
editing any CSV, then commit the regenerated JSON alongside the CSV change:

```bash
python data/generate_data.py
```

CI (`data` job in `.github/workflows/test.yml`) regenerates the same output and fails the build
with `git diff --exit-code` if it doesn't match what's committed — that catches "edited a CSV,
forgot to regenerate" before it reaches the live site. The same job runs `data/validate_survey.py`
against the locked schema (out-of-range values, invalid categories, duplicate IDs, IDs missing
from or not present in the matching `guidelines.csv`):

```bash
python data/validate_survey.py                                       # every guidelines/*/survey.csv
python data/validate_survey.py "data/guidelines/aws/survey_claude.csv"  # one specific file
```

See [`data/SURVEY_SCHEMA.md`](data/SURVEY_SCHEMA.md) for the full rubric and allowed-value
definitions — the schema is intentionally locked (not free text) so ratings stay comparable
across sources and raters.

### Analysis notebook

`data/analysis.ipynb` loads every source's `guidelines.csv` + `survey_claude*.csv`, merges them,
and charts BPM Relevance distribution, Scope/Lifecycle coverage, the generic-vs-specific split,
and the three-way general/sustainability-persona/BPM-persona comparison. It also has a stub
section for the real Claude-vs-human comparison, which activates once `survey.csv` has data.

```bash
python -m venv .venv
.venv\Scripts\activate            # Windows
pip install -r data/requirements.txt
```

Open `data/analysis.ipynb` in Jupyter, VS Code, or IntelliJ/PyCharm with the Jupyter plugin.

## Analysis page

The Green BPM Guideline is being distilled through multiple survey rounds - an AI-generated
preliminary pass (Claude, live today, under three persona framings), an internal expert survey
with envite Consulting (BPM, architecture, and sustainability practitioners), and eventually
this public survey's real results. `analysis.html` shows one **tab per round**, each
independently rated and analyzed: relevance distribution, BPM Scope/Lifecycle coverage,
generic-vs-specific split, and a top-20 table, via [Chart.js](https://www.chartjs.org/) (loaded
from a CDN, no build step). It's reachable directly from the landing page, or from the survey's
Thank-you screen - taking the survey isn't required to see it. This reuses
`RELEVANCE_OPTIONS`/`SCOPE_OPTIONS`/`LIFECYCLE_OPTIONS` from `common.js` so the rating form and
the analysis page can't drift apart.

Each round is driven by its own `analysis_<round>.json` - one flat record per guideline (`id`,
`name`, `source`, `bpmNative`, `relevance`, `scope`, `generic`, `lifecycle`), produced by
`data/generate_data.py` (it joins each source's `guidelines.csv` with that round's
`survey_claude*.csv`; a future real-human round will filter `survey.csv` by respondent group
instead, following the same output convention). The active tab is reflected in the URL hash
(`analysis.html#claude`) so a specific round's results are linkable.

Adding a round once its data exists is: extend `data/generate_data.py`'s `ROUNDS` (or add a new
generator function) to emit `analysis_<round>.json`, add one `{ id, label, file, blurb }` entry
to `ANALYSIS_ROUNDS` in `analysis.js` - no other code changes needed, since the chart/table-
building functions already just take a plain records array and a round id (for unique canvas
ids). Each round's panel is fetched and its charts mounted lazily, the first time that tab is
opened - switching back to an already-loaded tab just toggles visibility instead of re-fetching.

## Running locally

Pure static files — any local server works:

```bash
npm run serve        # python -m http.server 8123, then open http://localhost:8123
```

(Opening `index.html` directly via `file://` won't work — `fetch("data.json")` requires http.)

## Tests

Three headless functional tests (jsdom + a self-hosted static server, no external dependencies
beyond `npm install`), one per page - 50 assertions total:

- `test_landing.mjs` — index.html is static, so this just parses the markup: both CTAs link to
  the right page and are styled prominently, no `<script>` tags.
- `test_flow.mjs` — survey.html: boots straight into "About you" (no intro/Start step), that
  screen's validation (including the Role=Other conditional free-text field), the rating-list
  rendering (row count, progress counter), submit validation (blocking Finish on incomplete
  rows), multi-select Scope, the Relevance=0 → Generic disabled/blank behavior, row
  expand/collapse on header click, the Not-Applicable mutual-exclusivity rule, the final
  payload shape, and that the completion screen links to `analysis.html`.
- `test_analysis.mjs` — analysis.html standalone (no survey completion needed): chart/table
  mounting, legends, and that "Home" is a plain link rather than a JS state restore. Chart.js
  itself is stubbed out since jsdom has no `<canvas>` 2D context, so only the surrounding
  DOM/aggregation logic is covered here - see the Playwright suite below for real chart
  rendering.

```bash
npm install
npm test
```

### End-to-end tests (Playwright)

`tests_e2e/` is a `pytest-playwright` suite that drives the site in a real browser instead of
jsdom - the only way to actually verify the analysis screen's charts render (non-blank
`<canvas>` pixels), and the only way to exercise a real file download (the "Download
responses" button). It spins up its own static file server per test session (same as
`npm run serve`, just from Python), so nothing else needs to be running first.

```bash
python -m venv .venv
.venv/Scripts/activate   # or: source .venv/bin/activate on macOS/Linux
pip install -r tests_e2e/requirements.txt
playwright install chromium
pytest                    # or: npm run test:e2e
```

Runs headless by default; add `--headed` to watch it, or `--headed --slowmo=250` to slow it
down. CI (`.github/workflows/test.yml`) runs the data-pipeline check, this suite, and `npm test`
on every push/PR to `main`; deployment only runs after all three pass.

## Status / what's next

- [x] Raw guideline data collected and split from survey data for all 8 sources
- [x] Survey schema locked (`BPM Relevance`, `BPM Scope`, `Generic`, `BPM Lifecycle`)
- [x] Claude-generated rating pass over all 425 guidelines, plus two more passes with persona
      framing (sustainability-expert, BPM-expert) - test/comparison data previewing where those
      perspectives diverge, shown as extra tabs on the analysis page
- [x] Analysis notebook (`data/analysis.ipynb`) and analysis page (`analysis.html`)
- [x] Frontend built and tested (sampling, form, validation, navigation, test-mode payload),
      respondent background screen, GitHub Pages live, real-browser Playwright regression suite
- [x] Single-repo data pipeline: `data/generate_data.py` regenerates `data.json`/
      `analysis_*.json` from the CSVs, CI fails the build if they've drifted out of sync
- [ ] Submission backend (Google Apps Script + Sheet) deployed and `SUBMIT_ENDPOINT` set
- [ ] Real human interview pass (`data/guidelines/*/survey.csv` is still empty everywhere)
- [ ] Human vs. Claude rating comparison (`data/analysis.ipynb` has a stub section ready for this)
- [ ] Filter to the high-relevance subset and synthesize the actual Green BPM Guideline document
