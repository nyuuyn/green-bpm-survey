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
will be compared against the existing AI pass. Full pipeline details: [`docs/DATA_PIPELINE.md`](docs/DATA_PIPELINE.md).

**Live:** <https://nyuuyn.github.io/green-bpm-survey/>

## Key finding so far

Across the 5 general sustainability sources (400 guidelines), 79.2% score 0–1 on BPM Relevance
(not very relevant) and only 12.2% score 3 (highly relevant). The 2 BPM-native sources (15
guidelines) invert this almost completely: 0% at 0–1, 86.7% at 3. This is the evidence that
"relevant to BPM" is a real, distinct signal — not noise — and that filtering for it is worth
doing. See [`data/analysis.ipynb`](data/analysis.ipynb) for the full breakdown, or the
[Analysis page](https://nyuuyn.github.io/green-bpm-survey/analysis.html) for the interactive
version.

## How it works

Three static pages, no build step, no framework:

- **`index.html`** — the landing page. Fully static (no JS): explains the project's goal and
  guideline sources, and links to the other two pages. This is the page people should land on
  first (shared links, GitHub Pages root).
- **`survey.html`** + **`survey.js`** — the rating flow. `generated/data.json` (425 guidelines:
  `id`, `name`, `category`, `reference`, `guideline`, `source`, `sourceLabel`) is fetched on load,
  `SAMPLE_SIZE` (25) of them are sampled, and rating starts immediately - no separate
  intro/Start step, since that content lives on the landing page instead.
- **`analysis.html`** + **`analysis.js`** — the charts, one toggle button per rating round.
  Select a single round to see its own charts, or select two or more to compare them directly
  (merged charts, per-round small multiples, a relevance-agreement heatmap, and a table of the
  guidelines the selected rounds disagree on most). Independently reachable - doesn't require
  taking the survey first. Details: [`docs/DATA_PIPELINE.md`](docs/DATA_PIPELINE.md#analysis-page).
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

## Running locally

Pure static files — any local server works:

```bash
npm run serve        # python -m http.server 8123, then open http://localhost:8123
```

(Opening `index.html` directly via `file://` won't work — `fetch("generated/data.json")` requires http.)

## Docs

- [`docs/DATA_PIPELINE.md`](docs/DATA_PIPELINE.md) — repo structure, guideline sources, the
  `generate_data.py` pipeline, the analysis notebook, and how the analysis page's rounds work.
- [`docs/TESTING.md`](docs/TESTING.md) — unit tests (jsdom) and the Playwright e2e suite, plus
  how CI/CD (`.github/workflows/test.yml` + `deploy.yml`) is wired up.
- [`data/SURVEY_SCHEMA.md`](data/SURVEY_SCHEMA.md) — the locked rating rubric.

## Status / what's next

- [x] Raw guideline data collected and split from survey data for all 8 sources
- [x] Survey schema locked (`BPM Relevance`, `BPM Scope`, `Generic`, `BPM Lifecycle`)
- [x] Claude-generated rating pass over all 425 guidelines, plus two more passes with persona
      framing (sustainability-expert, BPM-expert) - test/comparison data previewing where those
      perspectives diverge, shown as extra tabs on the analysis page
- [x] Analysis notebook (`data/analysis.ipynb`) and analysis page (`analysis.html`)
- [x] Frontend built and tested (sampling, form, validation, navigation, test-mode payload),
      respondent background screen, GitHub Pages live, real-browser Playwright regression suite
- [x] Single-repo data pipeline: `data/generate_data.py` regenerates `generated/*.json`
      from the CSVs, CI fails the build if they've drifted out of sync
- [ ] Submission backend (Google Apps Script + Sheet) deployed and `SUBMIT_ENDPOINT` set
- [ ] Real human interview pass (`data/guidelines/*/survey.csv` is still empty everywhere)
- [ ] Human vs. Claude rating comparison (`data/analysis.ipynb` has a stub section ready for this)
- [ ] Filter to the high-relevance subset and synthesize the actual Green BPM Guideline document
