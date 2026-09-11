# Green BPM Guideline Survey

A survey of sustainability/green-software guidelines from seven public sources, rated for
relevance to Business Process Management (BPM) — process design, modeling, execution, and
monitoring — as opposed to being generic cloud/software advice.

## Why

Sustainability guidance is abundant (cloud vendor frameworks, web guidelines, pattern
catalogs), but most of it is written for infrastructure and application engineers, not process
designers. This project collects that guidance, annotates each guideline with its relevance to
BPM specifically, and compares general sustainability sources against BPM-native ones to see
whether "relevant to BPM" is actually a distinct signal or just noise.

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
| `Keywords` | free-text topic tags |
| `BPM Relevance` | 0–5, how relevant the guideline is to BPM |
| `BPM Scope` | which layer the guideline actually acts on: Process Model / Worker-Task / Process Data / Infrastructure-Platform / Organizational-Governance |
| `Generic` | Yes/No — is this just generic good practice, or a BPM-specific argument? |
| `BPM Justification` | the reasoning behind the rating |
| `BPM Lifecycle` | which BPM lifecycle phase(s) apply: Design, Modeling, Execution, Monitoring, Analysis, Optimization, or Not Applicable |
| `Discussion` | reserved for follow-up notes |

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

General sustainability sources cluster around 68–84% of their guidelines scoring 0–2 on BPM
Relevance (not very relevant) and only 8–17% scoring 4–5. The two BPM-native sources invert
this completely: 0% at 0–2, 83–89% at 4–5. See `analysis.ipynb` for the full breakdown.

## Status / what's next

- [x] Raw guideline data collected and split from survey data for all 7 sources
- [x] Survey schema locked (`BPM Relevance`, `BPM Scope`, `Generic`, `BPM Lifecycle`)
- [x] Claude-generated rating pass over all 415 guidelines
- [x] First analysis notebook
- [ ] Real human interview pass (`survey.csv` is still empty everywhere)
- [ ] Human vs. Claude rating comparison (the notebook has a stub section ready for this)
