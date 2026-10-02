# Data pipeline

## Repo structure

```
index.html, survey.html, analysis.html   the three static pages (see docs/ARCHITECTURE.md)
assets/css/   common.css, survey.css, analysis.css - common.css is shared, the other two are page-specific
assets/js/    common.js (shared), vendor/ (Preact+htm, vendored), survey/ (survey page),
              analysis/ (analysis page) - see docs/ARCHITECTURE.md for the full file list
assets/img/   images/logos
generated/data.json                      guideline text for the survey (generated)
generated/analysis_<round>.json          per-round rating data for the analysis page (generated)

data/                                    raw data, ratings, and analysis tooling
  guidelines/<source>/
    guidelines.csv          raw guideline data scraped from the source (ID, Name, Category, Reference, Guideline, Context)
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
GitHub Pages is a fixed allowlist (see `.github/workflows/deploy.yml`): the three HTML pages at
repo root plus `assets/` (scripts, styles, images) and the generated `generated/*.json` — the raw
CSVs, the notebook, and the Python scripts never ship to the live site.

## Sources

| Folder | Source | Rows | Type |
|---|---|---|---|
| `aws` | AWS Well-Architected Framework — Sustainability Pillar | 29 | General cloud |
| `azure` | Azure Well-Architected Framework — Sustainability recommendations | 135 | General cloud |
| `gcp` | Google Cloud Well-Architected Framework — Sustainability pillar | 106 | General cloud |
| `gsf` | Green Software Foundation Patterns Catalog | 59 | General cloud/web |
| `w3c` | W3C Web Sustainability Guidelines | 71 | General web |
| `ghgprotocol` | GHG Protocol Corporate Standard (WRI/WBCSD, revised edition) - one guideline per distinct, process-relevant "shall/should" statement or case study, across 7 of the standard's 11 substantive chapters | 13 | **General, non-IT** |
| `gbpp` | Green Business Process Patterns (Nowak et al., PLoP 2011) | 9 | **BPM-native** |
| `ppatterns` | process-pattern.app, patterns tagged "Sustainability" | 6 | **BPM-native** |
| `lean` | Lean and Environment (EPA Lean & Environment Toolkit; Lean Enterprise Institute "green waste" articles) | 10 | **BPM-native** |
| `gbpmbook` | Green Business Process Management: Towards the Sustainable Enterprise (vom Brocke, Seidel & Recker, eds., Springer 2012) - one guideline per chapter contribution, across 7 of the book's 13 chapters | 10 | **BPM-native** |

**448 guidelines total.**

`gbpmbook` is deliberately narrower than it could be: the book has 13 chapters, but several (a Green IS literature review, a Triple-Bottom-Line critique, a single-company case study, a generic ICT maturity model) don't yield a BPM-specific, actionable guideline distinct from the general-cloud sources above - including them would reproduce the same "generic sustainability guidance mistaken for BPM guidance" problem this source exists to counterbalance. See issues #5 and #18 for the still-open question of whether ABPMP's BPM CBOK and/or OMG's OCEB syllabus are worth mining the same way (narrowly, for their genuinely sustainability-specific content, not wholesale).

`ghgprotocol` exists for a different reason than the three BPM-native sources: every other "general" source above (`aws`/`azure`/`gcp`/`gsf`/`w3c`) is IT/cloud/web-flavored, so a low BPM-relevance score for the general bucket as a whole couldn't distinguish "generic because it's IT-specific" from "generic because it's just not process-shaped." The GHG Protocol is a real, freely-published primary source (no paywall, unlike ISO 14001 which was considered and rejected for this slot - see PR discussion) that has nothing to do with IT at all, making it a control group for that question. Like `gbpmbook`, it's narrower than its full page count: most of the standard (financial-consolidation rules, double-counting policy, verification materiality thresholds, offset/credit accounting) is detailed and real but pure accounting/bookkeeping mechanics with no process-design angle, so only the chapters/sections with genuine process or organizational-governance content (operational boundaries, inventory-quality management, target-setting) are represented.

`Context` is an optional, hand-written column on `guidelines.csv` (blank for most rows) — a
sentence or two of extra background for guidelines whose one-line text reads as too thin on its
own, paraphrased by a human from that guideline's own `Reference` link rather than scraped, since
the sources are too structurally different (vendor docs, a spec page, a PDF, a blog post, two
patterns catalogs) for one generic scrape to make sense across all of them. Shown on the survey
card under the guideline text when present (see `survey.js`); see issue #11.

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
this public survey's real results. `analysis.html` is two cards: a static **intro card** (what
this is, plus a "Guidelines collected per source" chart - see below), and a **results card**
below it with one **toggle button per round** at its top, followed by whatever those buttons
select. Select exactly one round to see it on its own, headed "`{round label} results`"
(relevance distribution, BPM Scope/Lifecycle coverage, generic-vs-specific split, and a top-20
table), or select two or more to see a **comparison panel** instead, headed with the names of the
selected rounds (e.g. "Comparing AI (General), AI (BPM Expert)") - see below. The tabs stay at the top of the results card regardless of which of those is showing,
since they're a sibling of both, not nested inside either. Charts render via
[Chart.js](https://www.chartjs.org/) (loaded from a CDN, no build step). The page is reachable
directly from the landing page, or from the survey's Thank-you screen - taking the survey isn't
required to see it. This reuses `RELEVANCE_OPTIONS`/`SCOPE_OPTIONS`/`LIFECYCLE_OPTIONS` from
`common.js` so the rating form and the analysis page can't drift apart.

The intro card's "Guidelines collected per source" chart is fetched from `generated/data.json`
directly rather than any round's file (`mountIntroSourceChart` in `charts.js`). It isn't part
of the results card at all, because it's a fact about the guideline corpus, not about anyone's
ratings - every round rates the same 425 guidelines, so a per-round or per-comparison copy of
this chart would always show identical numbers.

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
`relevanceSteps` (see `roundColor()` in `palette.js`) rather than introducing new hues, keeping
the same "one green family" design language as the single-round charts.

### Source block

Below the round results card is a second, independent card - "How do the guideline sources
compare?" - with its own tab bar, one button per source (`ANALYSIS_SOURCE_ORDER`). It exists
because every per-source chart in the round panel above (`mountHighRelevanceChart`,
`mountRelevanceMixChart`, `mountScopeNativeChart`, `mountGenericShareChart`, all in `charts.js`) shows all 10 sources
at once; this block lets you pick a specific source, or a few, and see them with the same depth a
round gets - a dedicated single-source panel, or a focused multi-source comparison panel.

**Always scoped to one round.** The source block reads from exactly one round's records -
whichever is first, in canonical `ANALYSIS_ROUNDS` order, among the round(s) currently selected
above (`activeRoundForSourceBlock()` in `analysis.js`). Selecting 2+ rounds up top (entering
round-comparison mode) does *not* hide the source block or empty it out - it keeps showing
whichever of the selected rounds comes first, with a note naming which one and how many are
selected, rather than trying to support both axes of comparison (round x source) at once - that
combination wasn't judged worth the added complexity for what it'd show. Source-tab selection is
plain in-memory state (`activeSources` in `analysis.js`), not folded into `location.hash` like the
round selection is - it isn't deep-linkable, trading that away for zero risk to the round-hash
contract described above.

`palette.js` holds the color system; `charts.js` builds every Chart.js mount/config from it
(anything that only exists to feed a chart) plus the record-aggregation functions that feed those
configs; `chart-dom.js` builds the chart-adjacent markup (the card each chart sits in, legends,
the heatmap table) that those mounts attach to by canvas id; `round-panel.js`/
`comparison-panel.js`/`source-panel.js` each build one panel's full non-chart DOM (scaffolding,
tables) as a Preact/htm component; `analysis.js` is the page controller - fetching/caching round
data, tab state, and hash routing - deciding which panel to build/mount and when. All of them call
into each other as plain globals, the same way they all call into `common.js`'s `html`/
`preactRender` (classic `<script>` tags, no build step, no modules - see docs/ARCHITECTURE.md for
the Preact+htm setup and the full file list).

**Why there's no heatmap or disagreement table here.** The round comparison's heatmap and
disagreement table both work because every round re-rates the *same* 448 guidelines, so
"did round A and round B score this guideline the same way" is a meaningful question. Sources
don't have that property - every guideline belongs to exactly one source, so there's no second
rating of the same guideline to compare against. The source comparison panel instead reuses
`mountMergedBarCharts` (in `charts.js`, factored out of the round panel's old `mountMergedCharts`
so both callers share one implementation) for five grouped-bar charts - relevance distribution,
scope counts, lifecycle counts, mean relevance by scope, and generic/BPM-specific split - one
series per selected source - plus a guideline-level "top-rated guidelines among selected sources"
table, which is the
closest valid analogue: not "where do these sources disagree" (meaningless for a partition), but
"which specific guidelines rank highest among just the sources I'm looking at."

The single-source panel (exactly one source selected) is the same idea minus the three charts
that are inherently cross-source (share-highly-relevant-by-source, relevance-mix-by-source,
scope-by-native) - those collapse to a single trivial data point for one source, since that
information already lives in the round panel above. It adds one small chart of its own (generic
vs. BPM-specific split, for just this source) and a top-10 guidelines table.

`data/analysis.ipynb` has a matching, much lighter-weight version of the same idea: a
"Comparing specific sources side-by-side" section near the other per-source cells, where editing
a `COMPARE_SOURCES` list and re-running the cell filters the already-merged dataframe down to just
those sources and reuses the existing relevance-distribution plotting code - no new data-loading
logic, since source filtering is a `pandas` filter either way.
