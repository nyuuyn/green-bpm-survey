# Green BPM Guideline Survey

**Goal: distill a proper "Green BPM Guideline" — a curated, evidence-backed set of sustainability
practices that actually matter for business process design, modeling, execution, and
monitoring — out of the flood of general-purpose sustainability guidance that exists today.**

Sustainability guidance is abundant (cloud vendor frameworks, web guidelines, pattern
catalogs), but almost all of it is written for infrastructure and application engineers, not
process designers. Most of it is *not* actually relevant to BPM — an early rating pass across
415 guidelines found that general sources average 79% low-relevance content and only 12%
genuinely high-relevance, while sources written specifically for green BPM invert that almost
completely (0% low, 87% high — see "Key finding" below). That gap is the reason this project
exists: rather
than pointing a BPM practitioner at seven different sustainability frameworks and asking them to
guess which parts apply, this project collects them all, has both an AI pass and a real human
interview rate every guideline's BPM relevance, and will use the highly-rated results to compile
a single, focused Green BPM Guideline.

**Pipeline:** collect guidelines from multiple sources → rate each one for BPM relevance (scope,
lifecycle phase, generic-vs-specific) → validate/compare AI and human ratings → filter down to
the high-relevance subset → synthesize that subset into a coherent guideline document.
We're currently between steps 2 and 3: a public survey at
[green-bpm-survey](https://github.com/nyuuyn/green-bpm-survey) collects the real human ratings
that will be compared against the existing AI pass in this repo.

## Repo structure

```
guidelines/<source>/
    guidelines.csv          raw guideline data scraped from the source (ID, Name, Category, Reference, Guideline)
    survey.csv              human interview ratings — currently empty, reserved for the real interview pass
    survey_claude.csv       Claude-generated ratings, same schema as survey.csv, kept separate for comparison
    guidelines_archive_*.csv  (azure/gsf/w3c only) pre-refresh snapshot, kept so old survey answers stay traceable

SURVEY_SCHEMA.md    the locked column definitions and rating rubric — read this before adding ratings
validate_survey.py  validates a survey.csv (or any file matching a glob) against the locked schema
analysis.ipynb       loads every source, merges guidelines + ratings, and charts the results
requirements.txt    Python dependencies for the notebook
```

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

**415 guidelines total.**

## Data schema

Each `guidelines.csv` row is raw data taken from the source itself: `ID`, `Name`, `Category`
(where the source has one), `Reference` (source URL), `Guideline` (a short paraphrased
description).

Each `survey.csv` / `survey_claude.csv` row is the annotation layer, joined to `guidelines.csv`
by `ID`:

| Column | Meaning |
|---|---|
| `BPM Relevance` | 0–5, how relevant the guideline is to BPM |
| `BPM Scope` | which layer(s) the guideline acts on — multi-select: Process Model / Worker-Task / Process Data / Infrastructure-Platform / Organizational-Governance |
| `Generic` | Yes/No — is this just generic good practice, or a BPM-specific argument? Blank when `BPM Relevance` is 0 (nothing to classify) |
| `BPM Justification` | the reasoning behind the rating |
| `BPM Lifecycle` | which BPM lifecycle phase(s) apply: Design, Modeling, Execution, Monitoring, Analysis, Optimization, or Not Applicable |
| `Discussion` | reserved for follow-up notes |

Keywords are deliberately *not* collected from raters — forcing people to invent tags adds
friction for little gain. Keyword/topic extraction will instead be done analytically over the
`Guideline` and `BPM Justification` text once real ratings exist.

See [`SURVEY_SCHEMA.md`](SURVEY_SCHEMA.md) for the full rubric and the allowed-value
definitions — the schema is intentionally locked (not free text) so ratings stay comparable
across sources and raters.

`survey.csv` is the human interview pass and is currently empty for every source.
`survey_claude.csv` is an independent AI-generated rating pass over all 415 guidelines,
following the same schema, kept in a separate file so the two can eventually be compared
rather than mixed.

## Setup

```bash
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements.txt
```

Open `analysis.ipynb` in Jupyter, VS Code, or IntelliJ/PyCharm with the Jupyter plugin.

## Validating ratings

Before committing changes to any `survey*.csv`, check it against the locked schema:

```bash
python validate_survey.py                                  # checks every guidelines/*/survey.csv
python validate_survey.py "guidelines/aws/survey_claude.csv"  # checks one specific file
```

It catches out-of-range values, invalid categories, duplicate IDs, and IDs that don't exist in
the matching `guidelines.csv` (in either direction — missing rows and stray extra rows are both
flagged).

## Key finding so far

Across the 5 general sustainability sources (400 guidelines), 79.2% score 0–2 on BPM Relevance
(not very relevant) and only 12.2% score 4–5. The 2 BPM-native sources (15 guidelines) invert
this almost completely: 0% at 0–2, 86.7% at 4–5. This is the evidence that "relevant to BPM" is
a real, distinct signal — not noise — and that filtering for it is worth doing. See
`analysis.ipynb` for the full breakdown.

## Status / what's next

- [x] Raw guideline data collected and split from survey data for all 7 sources
- [x] Survey schema locked (`BPM Relevance`, `BPM Scope`, `Generic`, `BPM Lifecycle`)
- [x] Claude-generated rating pass over all 415 guidelines
- [x] First analysis notebook
- [x] Public survey frontend live at [green-bpm-survey](https://github.com/nyuuyn/green-bpm-survey) / <https://nyuuyn.github.io/green-bpm-survey/>
- [ ] Submission backend for the survey (Google Apps Script + Sheet) — frontend is currently in test mode
- [ ] Real human interview pass (`survey.csv` is still empty everywhere)
- [ ] Human vs. Claude rating comparison (the notebook has a stub section ready for this)
- [ ] Filter to the high-relevance subset and synthesize the actual Green BPM Guideline document
