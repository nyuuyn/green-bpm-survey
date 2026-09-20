"""Generate data.json and analysis_<round>.json for the frontend, from data/guidelines/*.

Single-source-of-truth generator for everything the frontend fetches:

- data.json — guideline text only (id/name/category/reference/guideline/source/
  sourceLabel), read straight off guidelines.csv. Fetched by survey.js to build
  the sample respondents rate.
- analysis_<round>.json (one per round in ROUNDS below) — guidelines.csv
  left-joined with that round's survey_claude*.csv on ID, mirroring
  data/analysis.ipynb's load_source(). Fetched by analysis.js, one file per tab.

Both output kinds land at the repo root (../ from this file), where the
GitHub Pages deploy step already expects them (see .github/workflows/test.yml).

Usage: python data/generate_data.py
Run this after editing any guidelines.csv/survey_claude*.csv, then commit the
regenerated output alongside the CSV change — CI (data-freshness check in
test.yml) fails the build if they've drifted apart.
"""
import csv
import json
from pathlib import Path

DATA_DIR = Path(__file__).parent
GUIDELINES_DIR = DATA_DIR / "guidelines"
OUTPUT_ROOT = DATA_DIR.parent

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
BPM_NATIVE = {"gbpp", "ppatterns", "lean"}

# round name -> survey CSV filename suffix (claude itself has no suffix)
ROUNDS = {
    "claude": "survey_claude.csv",
    "sustainability": "survey_claude_sustainability.csv",
    "bpm": "survey_claude_bpm.csv",
}


def read_csv(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def split_multi(value):
    return [v.strip() for v in value.split(",") if v.strip()] if value else []


def write_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=0)
    print(f"Wrote {len(data)} records to {path}")


def build_data_json():
    items = []
    for source, label in SOURCES.items():
        for r in read_csv(GUIDELINES_DIR / source / "guidelines.csv"):
            items.append({
                "id": r["ID"], "name": r["Name"], "category": r.get("Category", ""),
                "reference": r["Reference"], "guideline": r["Guideline"],
                "source": source, "sourceLabel": label,
            })
    return items


def build_analysis_json(survey_filename):
    records = []
    for source in SOURCES:
        guidelines = {r["ID"]: r for r in read_csv(GUIDELINES_DIR / source / "guidelines.csv")}
        ratings = {r["ID"]: r for r in read_csv(GUIDELINES_DIR / source / survey_filename)}
        for gid, g in guidelines.items():
            r = ratings.get(gid, {})
            relevance = r.get("BPM Relevance", "")
            records.append({
                "id": gid,
                "name": g["Name"],
                "source": source,
                "bpmNative": source in BPM_NATIVE,
                "relevance": int(relevance) if relevance != "" else None,
                "scope": split_multi(r.get("BPM Scope", "")),
                "generic": r.get("Generic", "") or None,
                "lifecycle": split_multi(r.get("BPM Lifecycle", "")),
            })
    return records


def main():
    write_json(OUTPUT_ROOT / "data.json", build_data_json())
    for round_name, survey_filename in ROUNDS.items():
        write_json(OUTPUT_ROOT / f"analysis_{round_name}.json", build_analysis_json(survey_filename))


if __name__ == "__main__":
    main()
