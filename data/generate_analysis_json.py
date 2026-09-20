"""Generate analysis_<round>.json for the frontend from guidelines.csv + a survey_claude*.csv.

Mirrors analysis.ipynb's load_source() merge (guidelines.csv left-joined with
the round's survey CSV on ID), but emits one flat JSON array for the
frontend to aggregate client-side. Re-run and copy the output to the
green-bpm-survey repo whenever a source's survey CSV changes (same workflow
as data.json).

Usage: python generate_analysis_json.py [round]
  round: claude (default), sustainability, or bpm - matches the suffix on
  guidelines/<source>/survey_claude_<round>.csv (claude itself has no suffix:
  survey_claude.csv). Output is always analysis_<round>.json.

A future envite/public round will need its own generator, filtering
survey.csv by respondent group instead of reading a survey_claude*.csv, but
should follow the same analysis_<round>.json output convention so the
frontend can pick it up by just adding one entry to ANALYSIS_ROUNDS in
analysis.js.
"""
import csv
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).parent
GUIDELINES_DIR = REPO_ROOT / "guidelines"

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


def split_multi(value):
    return [v.strip() for v in value.split(",") if v.strip()] if value else []


def load_source(source, survey_filename):
    with open(GUIDELINES_DIR / source / "guidelines.csv", encoding="utf-8-sig", newline="") as f:
        guidelines = {r["ID"]: r for r in csv.DictReader(f)}

    with open(GUIDELINES_DIR / source / survey_filename, encoding="utf-8-sig", newline="") as f:
        ratings = {r["ID"]: r for r in csv.DictReader(f)}

    records = []
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
    round_name = sys.argv[1] if len(sys.argv) > 1 else "claude"
    survey_filename = "survey_claude.csv" if round_name == "claude" else f"survey_claude_{round_name}.csv"

    all_records = []
    for source in SOURCES:
        all_records.extend(load_source(source, survey_filename))

    out_path = REPO_ROOT / f"analysis_{round_name}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(all_records, f, ensure_ascii=False, indent=0)
    print(f"Wrote {len(all_records)} records to {out_path}")


if __name__ == "__main__":
    main()
