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

- `data.json` — 425 guidelines (`id`, `name`, `category`, `reference`, `guideline`, `source`,
  `sourceLabel`), generated from the private repo's `guidelines/*/guidelines.csv` files.
- `index.html` / `style.css` / `app.js` — a small vanilla-JS single-page app, no build step,
  no framework. On load it randomly samples `SAMPLE_SIZE` (25) guidelines. Before rating starts,
  a one-time **"About you"** screen collects respondent background — separately from personal
  data, and not used to identify anyone:
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

`SUBMIT_ENDPOINT` in `app.js` is currently `null`. In this state, finishing the survey doesn't
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

## Tests

`test_flow.mjs` is a headless functional test (jsdom + a self-hosted static server, no external
dependencies beyond `npm install`) covering: the "About you" screen (validation, the
Role=Other conditional free-text field), sampling, the rating-list rendering (row count, progress
counter), submit validation (blocking Finish on incomplete rows), multi-select Scope, the
Relevance=0 → Generic disabled/blank behavior, row expand/collapse on header click, the
Not-Applicable mutual-exclusivity rule, and the final payload shape (35 assertions).

```bash
npm install
npm test
```

## Status

- [x] Frontend built and tested (sampling, form, validation, navigation, test-mode payload)
- [x] Respondent background ("About you": BPM experience, sustainability experience, role)
- [x] GitHub Pages enabled — live at <https://nyuuyn.github.io/green-bpm-survey/>
- [ ] Submission backend (Google Apps Script + Sheet) deployed and `SUBMIT_ENDPOINT` set
- [ ] Known open design question for whenever the backend is wired up: the private repo's
      `survey.csv` currently assumes one row per guideline `ID` (`validate_survey.py` rejects
      duplicate IDs). Once real submissions come in from multiple respondents, some guidelines
      will legitimately get more than one rating — that schema will need a `RespondentID`-style
      column (or a separate per-session table) before real data can be merged in, not solved yet.
