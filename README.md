# Green BPM Survey — Frontend

The public-facing survey site for the [green-bpm-guideline-survey](https://github.com/nyuuyn/green-bpm-guideline-survey)
project, whose goal is to distill a proper "Green BPM Guideline" out of the flood of general
sustainability advice that exists today (most of which turns out not to be very relevant to
BPM specifically — see that repo's README for why). This site collects the real human ratings
that step needs: it presents a random sample of guidelines and asks respondents to rate each
one's relevance to Business Process Management.

**Live:** <https://nyuuyn.github.io/green-bpm-survey/>

This repo is deliberately **public** and separate from the private data/analysis repo: it only
contains the survey UI and `data.json`, a bundle of guideline text and source links that's
already public information (paraphrased from public vendor docs, W3C, and academic papers).
No ratings, analysis, or internal notes live here.

## How it works

Three static pages, no build step, no framework:

- **`index.html`** — the landing page. Fully static (no JS): explains the project's goal and
  guideline sources, and links to the other two pages. This is the page people should land on
  first (shared links, GitHub Pages root).
- **`survey.html`** + **`survey.js`** — the rating flow. `data.json` (425 guidelines: `id`,
  `name`, `category`, `reference`, `guideline`, `source`, `sourceLabel`, generated from the
  private repo's `guidelines/*/guidelines.csv` files) is fetched on load, `SAMPLE_SIZE` (25) of
  them are sampled, and rating starts immediately - no separate intro/Start step, since that
  content now lives on the landing page instead.
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
  - **BPM Relevance** (0–5)
  - **BPM Scope** — multi-select, since many guidelines act on more than one layer
  - **Generic** (Yes/No) — automatically disabled and left blank when Relevance is 0, since
    there's no BPM argument left to classify as generic-or-specific at that point
  - **BPM Lifecycle** (multi-select, with "Not Applicable" enforced as mutually exclusive)
  - optional free-text **Justification**

  Keywords are deliberately *not* collected — that's done analytically over the guideline text
  after the real survey, not by asking respondents to invent tags. This is the same schema as
  [`SURVEY_SCHEMA.md`](https://github.com/nyuuyn/green-bpm-guideline-survey/blob/main/SURVEY_SCHEMA.md)
  in the data repo — keep both in sync if you change one.

### Test mode (current state)

`SUBMIT_ENDPOINT` in `survey.js` is currently `null`. In this state, finishing the survey doesn't
submit anywhere — responses are shown on-screen as JSON and downloadable, so the whole flow is
testable without a backend. To go live, deploy a submission backend (see the parent repo's
notes on the GitHub Pages + Google Sheets approach) and set `SUBMIT_ENDPOINT` to its URL.

## Running locally

Pure static files — any local server works:

```bash
npm run serve        # python -m http.server 8123, then open http://localhost:8123
```

(Opening `index.html` directly via `file://` won't work — `fetch("data.json")` requires http.)

## Regenerating data.json

Run from the **private** `green-bpm-guideline-survey` repo (not this one), then copy the
output here:

```python
import csv, json

SOURCES = {
    "aws": "AWS Well-Architected - Sustainability Pillar",
    "azure": "Azure Well-Architected - Sustainability",
    "gcp": "Google Cloud Well-Architected - Sustainability",
    "gsf": "Green Software Foundation Patterns Catalog",
    "w3c": "W3C Web Sustainability Guidelines",
    "gbpp": "Green Business Process Patterns (Nowak et al., 2011)",
    "ppatterns": "process-pattern.app",
    "lean": "Lean and Environment (EPA Toolkit / Lean Enterprise Institute)",
}
items = []
for source, label in SOURCES.items():
    with open(f"guidelines/{source}/guidelines.csv", encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            items.append({
                "id": r["ID"], "name": r["Name"], "category": r.get("Category", ""),
                "reference": r["Reference"], "guideline": r["Guideline"],
                "source": source, "sourceLabel": label,
            })
json.dump(items, open("data.json", "w", encoding="utf-8"), ensure_ascii=False, indent=0)
```

## Analysis page

The Green BPM Guideline is being distilled through multiple survey rounds - an AI-generated
preliminary pass (Claude, live today), an internal expert survey with envite Consulting (BPM,
architecture, and sustainability practitioners), and eventually a public survey.
`analysis.html` shows one **tab per round**, each independently rated and analyzed: relevance
distribution, BPM Scope/Lifecycle coverage, generic-vs-specific split, and a top-20 table, via
[Chart.js](https://www.chartjs.org/) (loaded from a CDN, no build step). It's reachable
directly from the landing page, or from the survey's Thank-you screen - taking the survey
isn't required to see it. This reuses `RELEVANCE_OPTIONS`/`SCOPE_OPTIONS`/`LIFECYCLE_OPTIONS`
from `common.js` so the rating form and the analysis page can't drift apart.

Each round is driven by its own `analysis_<round>.json` - one flat record per guideline (`id`,
`name`, `source`, `bpmNative`, `relevance`, `scope`, `generic`, `lifecycle`), regenerated the
same way as `data.json`. `analysis_claude.json` comes from `generate_analysis_json.py` in the
**private** repo (it joins each source's `guidelines.csv` with `survey_claude.csv`); a future
round's generator will follow the same output convention. The active tab is reflected in the
URL hash (`analysis.html#envite`) so a specific round's results are linkable.

Adding a round once its data exists is: generate `analysis_<round>.json`, copy it into this
repo, add one `{ id, label, file, blurb }` entry to `ANALYSIS_ROUNDS` in `analysis.js` - no
other code changes needed, since the chart/table-building functions already just take a plain
records array and a round id (for unique canvas ids). Each round's panel is fetched and its
charts mounted lazily, the first time that tab is opened - switching back to an
already-loaded tab just toggles visibility instead of re-fetching.

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
down. CI (`.github/workflows/test.yml`) runs both this and `npm test` on every push/PR to
`main`.

## Status

- [x] Frontend built and tested (sampling, form, validation, navigation, test-mode payload)
- [x] Respondent background ("About you": BPM experience, sustainability experience, role)
- [x] GitHub Pages enabled — live at <https://nyuuyn.github.io/green-bpm-survey/>
- [x] Post-survey analysis screen (Claude AI-rating pass only, charts via Chart.js)
- [x] Split into a landing page (`index.html`) plus standalone `survey.html` / `analysis.html`
      pages, backed by a real-browser Playwright suite (`tests_e2e/`) as a regression check
- [x] Analysis page supports multiple survey rounds as tabs (`ANALYSIS_ROUNDS` in
      `analysis.js`) - three AI (Claude) passes today: general, sustainability-expert-framed,
      and BPM-expert-framed persona test data; envite/public human rounds slot in later
- [ ] Submission backend (Google Apps Script + Sheet) deployed and `SUBMIT_ENDPOINT` set
- [ ] Known open design question for whenever the backend is wired up: the private repo's
      `survey.csv` currently assumes one row per guideline `ID` (`validate_survey.py` rejects
      duplicate IDs). Once real submissions come in from multiple respondents, some guidelines
      will legitimately get more than one rating — that schema will need a `RespondentID`-style
      column (or a separate per-session table) before real data can be merged in, not solved yet.
