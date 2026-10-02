# Green BPM Survey

**Goal: distill a proper "Green BPM Guideline" — a curated, evidence-backed set of sustainability
practices that actually matter for business process design, modeling, execution, and
monitoring — out of the flood of general-purpose sustainability guidance that exists today.**

Sustainability guidance is abundant (cloud vendor frameworks, web guidelines, pattern
catalogs), but almost all of it is written for infrastructure and application engineers, not
process designers. Most of it is *not* actually relevant to BPM — that gap is why this project
exists: rather than pointing a BPM practitioner at seven different sustainability frameworks and
asking them to guess which parts apply, this project collects them all, has both an AI pass and a
real human interview rate every guideline's BPM relevance, and will use the highly-rated results
to compile a single, focused Green BPM Guideline.

**Pipeline:**

1. Collect guidelines from multiple sources
2. Rate each one for BPM relevance (scope, lifecycle phase, generic-vs-specific)
3. Validate/compare AI and human ratings
4. Filter down to the high-relevance subset
5. Synthesize that subset into a coherent guideline document

This site is currently between steps 2 and 3: the survey below collects the real human ratings
that will be compared against the existing AI pass. Full pipeline details:
[`docs/DATA_PIPELINE.md`](docs/DATA_PIPELINE.md).

**Live:** <https://nyuuyn.github.io/green-bpm-survey/>

## 📊 Key finding so far

- 6 general sustainability sources (413 guidelines): **78.2%** score 0–1 on BPM Relevance (not
  very relevant), only **12.3%** score 3 (highly relevant)
- 4 BPM-native sources (35 guidelines): nearly inverted — **2.9%** at 0–1, **74.3%** at 3
- Takeaway: "relevant to BPM" is a real, distinct signal — not noise — so filtering for it is
  worth doing
- One of the 6 general sources, the GHG Protocol Corporate Standard, was added specifically as a
  non-IT control group (every other general source is cloud/web-flavored). It lands in between —
  **46.2%** at 0–1, mean relevance 1.62 vs. ~1.09 for the five IT-flavored sources — so IT-specificity
  isn't the only thing driving the low scores, but removing it alone doesn't get anywhere near
  BPM-native territory either
- Neither bucket is uniform once you look source-by-source instead of at the two aggregates:
  among general sources, GCP is the clear low point (mean relevance **0.85**, only **10.4%** at 3)
  versus AWS/W3C (~1.3, ~17% at 3) — and GHG Protocol actually ranks *above every other general
  source individually* (mean **1.62**), not just "in between" on average. Among BPM-native
  sources, GBPP and ppatterns.app (**83–89%** at 3) clearly outscore Green BPM Book and Lean
  (**60–70%**) — a ~29-point spread inside a bucket the aggregate makes look monolithic

See [`data/analysis.ipynb`](data/analysis.ipynb) for the full breakdown, or the
[Analysis page](https://nyuuyn.github.io/green-bpm-survey/analysis.html) — including its
per-source comparison block — for the interactive version.

## 🧭 How it works

- Three static pages, no build step, no framework: `index.html` (landing), `survey.html` +
  `survey.js` (the rating flow), `analysis.html` + `analysis.js` (the charts)
- Before rating starts, a one-time "About you" screen collects respondent background (BPM
  experience, sustainability experience, role) — anonymous, stored once per session
- 25 randomly sampled guidelines per respondent, rated for Relevance, Scope, Generic-vs-specific,
  and Lifecycle phase

> ⚠️ **Test mode:** `SUBMIT_ENDPOINT` in `survey.js` is currently `null` — submissions aren't live
> yet, responses are just shown/downloaded as JSON. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#test-mode).

Full architecture, page-by-page and the survey flow in detail:
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## 🚀 Running locally

Pure static files — any local server works:

```bash
npm run serve        # python -m http.server 8123, then open http://localhost:8123
```

(Opening `index.html` directly via `file://` won't work — `fetch("generated/data.json")` requires http.)

## 📚 Docs

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — the three pages, the survey flow ("About you",
  rating rows), and test mode in detail.
- [`docs/DATA_PIPELINE.md`](docs/DATA_PIPELINE.md) — repo structure, guideline sources, the
  `generate_data.py` pipeline, the analysis notebook, and how the analysis page's rounds work.
- [`docs/TESTING.md`](docs/TESTING.md) — unit tests (jsdom) and the Playwright e2e suite, plus
  how CI/CD (`.github/workflows/test.yml` + `deploy.yml`) is wired up.
- [`data/SURVEY_SCHEMA.md`](data/SURVEY_SCHEMA.md) — the locked rating rubric.

## ✅ Status / what's next

- [x] Raw guideline data collected and split from survey data for all 10 sources
- [x] Survey schema locked (`BPM Relevance`, `BPM Scope`, `Generic`, `BPM Lifecycle`)
- [x] Claude-generated rating pass over all 448 guidelines, plus two more passes with persona
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
