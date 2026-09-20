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
this public survey's real results. `analysis.html` shows one **toggle button per round**: select
exactly one to see that round on its own (relevance distribution, BPM Scope/Lifecycle coverage,
generic-vs-specific split, and a top-20 table), or select two or more to switch to a **comparison
panel** instead - see below. Charts render via [Chart.js](https://www.chartjs.org/) (loaded from
a CDN, no build step). The page is reachable directly from the landing page, or from the survey's
Thank-you screen - taking the survey isn't required to see it. This reuses
`RELEVANCE_OPTIONS`/`SCOPE_OPTIONS`/`LIFECYCLE_OPTIONS` from `common.js` so the rating form and
the analysis page can't drift apart.

The intro card at the top (above the round toggles) has its own "Guidelines collected per
source" chart, fetched from `generated/data.json` directly rather than any round's file
(`mountIntroSourceChart` in `analysis.js`). It isn't part of any round panel or the comparison
panel, because it's a fact about the guideline corpus, not about anyone's ratings - every round
rates the same 425 guidelines, so a per-round or per-comparison copy of this chart would always
show identical numbers.

Each round is driven by its own `generated/analysis_<round>.json` - one flat record per guideline
(`id`, `name`, `source`, `bpmNative`, `relevance`, `scope`, `generic`, `lifecycle`), produced by
`data/generate_data.py` (it joins each source's `guidelines.csv` with that round's
`survey_claude*.csv`; a future real-human round will filter `survey.csv` by respondent group
instead, following the same output convention). The selected round(s) are reflected in the URL
hash, ids joined by `+` (`analysis.html#claude+bpm`), so a specific single round or comparison is
linkable.

Adding a round once its data exists is: extend `data/generate_data.py`'s `ROUNDS` (or add a new
generator function) to emit `generated/analysis_<round>.json`, add one `{ id, label, file, blurb }`
entry to `ANALYSIS_ROUNDS` in `analysis.js` - no other code changes needed, since every chart/
table-building function already just takes a plain records array (or a map of them, for the
comparison panel) rather than anything round-count-specific. Each round's data is fetched once
and cached (`recordsByRound` in `analysis.js`) the first time it's needed, whether that's opening
its single-round tab or including it in a comparison - re-selecting an already-loaded round never
re-fetches.

### Comparison panel (2+ rounds selected)

Selecting two or more rounds replaces the single-round panels with one comparison panel, built
fresh (and its Chart.js instances destroyed/recreated) every time the selection changes. It has
four parts, mirroring how each of the single round's 8 chart types either merges cleanly across
rounds or doesn't:

1. **Merged charts** (`mountMergedCharts`) - the 4 single-series charts (relevance distribution,
   scope counts, lifecycle counts, mean relevance by scope) become grouped bars with one dataset
   per selected round.
2. **Small multiples** (`mountSmallMultiples`) - the 4 charts that are already two- or
   four-series (native/general split, relevance mix, generic split) would need a 3rd dimension to
   merge, which doesn't fit in a bar chart - so each selected round gets its own copy instead,
   reusing the exact mount functions the single-round panel uses.
3. **Relevance agreement heatmap** (`buildHeatmapSection`) - guideline-level, one 4x4 heatmap per
   *pair* of selected rounds (only pairwise makes sense here), counting how many guidelines got
   each combination of relevance scores from both rounds. The diagonal is exact agreement.
4. **Disagreement table** (`spreadTableCard`) - guidelines rated in every selected round, ranked
   by the gap between the highest and lowest relevance score given, for spotting the specific
   guidelines where rounds disagree most.

Round colors in the merged charts and heatmap intensity both reuse the palette's existing
`relevanceSteps` (see `roundColor()` in `analysis.js`) rather than introducing new hues, keeping
the same "one green family" design language as the single-round charts.
