"""Generate analysis.json for the frontend from guidelines.csv + survey_claude.csv.

Mirrors analysis.ipynb's load_source() merge (guidelines.csv left-joined with
survey_claude.csv on ID), but emits one flat JSON array for the frontend to
aggregate client-side. Re-run and copy the output to the green-bpm-survey repo
whenever a source's survey_claude.csv changes (same workflow as data.json).
"""
import csv
import json
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


def load_source(source):
    with open(GUIDELINES_DIR / source / "guidelines.csv", encoding="utf-8-sig", newline="") as f:
        guidelines = {r["ID"]: r for r in csv.DictReader(f)}

    with open(GUIDELINES_DIR / source / "survey_claude.csv", encoding="utf-8-sig", newline="") as f:
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
    all_records = []
    for source in SOURCES:
        all_records.extend(load_source(source))

    out_path = REPO_ROOT / "analysis.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(all_records, f, ensure_ascii=False, indent=0)
    print(f"Wrote {len(all_records)} records to {out_path}")


if __name__ == "__main__":
    main()
