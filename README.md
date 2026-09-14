# Green BPM Survey — Frontend

The public-facing survey site for the [green-bpm-guideline-survey](https://github.com/nyuuyn/green-bpm-guideline-survey)
project. Presents a random sample of sustainability guidelines and asks respondents to rate
each one's relevance to Business Process Management.

This repo is deliberately **public** and separate from the private data/analysis repo: it only
contains the survey UI and `data.json`, a bundle of guideline text and source links that's
already public information (paraphrased from public vendor docs, W3C, and academic papers).
No ratings, analysis, or internal notes live here.

## How it works

- `data.json` — 415 guidelines (`id`, `name`, `category`, `reference`, `guideline`, `source`,
  `sourceLabel`), generated from the private repo's `guidelines/*/guidelines.csv` files.
- `index.html` / `style.css` / `app.js` — a small vanilla-JS single-page app, no build step,
  no framework. On load it randomly samples `SAMPLE_SIZE` (25) guidelines and walks the
  respondent through one at a time, collecting: BPM Relevance (0–5), BPM Scope, Generic
  (Yes/No), BPM Lifecycle (multi-select), optional Keywords and Justification — the same
  schema as [`SURVEY_SCHEMA.md`](https://github.com/nyuuyn/green-bpm-guideline-survey/blob/main/SURVEY_SCHEMA.md)
  in the data repo.

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
json.dump(items, open("data.json", "w", encoding="utf-8"), ensure_ascii=False)
```

## Tests

`test_flow.mjs` is a headless functional test (jsdom + a self-hosted static server, no external
dependencies beyond `npm install`) covering: sampling, question rendering, submit validation,
back/forward navigation with answer persistence, the Not-Applicable mutual-exclusivity rule,
and the final payload shape.

```bash
npm install
npm test
```

## Status

- [x] Frontend built and tested (sampling, form, validation, navigation, test-mode payload)
- [ ] GitHub Pages enabled
- [ ] Submission backend (Google Apps Script + Sheet) deployed and `SUBMIT_ENDPOINT` set
