# Data pipeline

## Repo structure

```
index.html, survey.html, analysis.html   the three static pages (see README's "How it works")
style.css, common.js, survey.js, analysis.js
generated/data.json                      guideline text for the survey (generated)
generated/analysis_<round>.json          per-round rating data for the analysis page (generated)
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
  generate_data.py          regenerates generated/*.json from the CSVs above (see below)
  requirements.txt          Python dependencies for the notebook

tests_e2e/, tests/, package.json, pytest.ini, .github/workflows/   tests + CI (see docs/TESTING.md)
```

Everything under `data/` is source material and tooling. What actually gets **deployed** to
GitHub Pages is a fixed allowlist (see `.github/workflows/deploy.yml`): the static
pages/scripts/styles at repo root plus the generated `generated/*.json` — the raw
CSVs, the notebook, and the Python scripts never ship to the live site.

## Sources

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

## Generating `generated/*.json`

```
data/guidelines/<source>/guidelines.csv  ─┐
data/guidelines/<source>/survey*.csv     ─┴─►  data/generate_data.py  ─►  generated/data.json, generated/analysis_<round>.json
                                                                            (committed, deployed)
```

`data/generate_data.py` is the single generator for everything the frontend fetches — `generated/data.json`
(guideline text only, for the survey page) and one `generated/analysis_<round>.json` per AI persona round
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

See [`data/SURVEY_SCHEMA.md`](../data/SURVEY_SCHEMA.md) for the full rubric and allowed-value
definitions — the schema is intentionally locked (not free text) so ratings stay comparable
across sources and raters.

## Analysis notebook

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

Chart outputs are stripped before commit (see the repo root's `.gitattributes` + the `nbstripout`
setup in `data/requirements.txt`) so diffs only show the code/markdown that actually changed, not
regenerated image bytes. Run `nbstripout --install` once per clone to enable this locally; CI
doesn't depend on it, it's purely to keep `git diff` reviewable.

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

Each round is driven by its own `generated/analysis_<round>.json` - one flat record per guideline
(`id`, `name`, `source`, `bpmNative`, `relevance`, `scope`, `generic`, `lifecycle`), produced by
`data/generate_data.py` (it joins each source's `guidelines.csv` with that round's
`survey_claude*.csv`; a future real-human round will filter `survey.csv` by respondent group
instead, following the same output convention). The active tab is reflected in the URL hash
(`analysis.html#claude`) so a specific round's results are linkable.

Adding a round once its data exists is: extend `data/generate_data.py`'s `ROUNDS` (or add a new
generator function) to emit `generated/analysis_<round>.json`, add one `{ id, label, file, blurb }`
entry to `ANALYSIS_ROUNDS` in `analysis.js` - no other code changes needed, since the chart/table-
building functions already just take a plain records array and a round id (for unique canvas
ids). Each round's panel is fetched and its charts mounted lazily, the first time that tab is
opened - switching back to an already-loaded tab just toggles visibility instead of re-fetching.
