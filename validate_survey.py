"""Validate respondents.csv and guidelines/<source>/survey*.csv against the allowed
values in SURVEY_SCHEMA.md.

Usage: python validate_survey.py [glob_pattern]
       (default glob_pattern: guidelines/*/survey.csv)

Always validates respondents.csv first (if present), then every file matching the
glob pattern. survey_claude.csv is treated as a single complete pass: unique ID per
file, full coverage of guidelines.csv required. Any other matched file (i.e.
survey.csv) is treated as a pool of possibly-many respondent submissions: the same
ID may appear multiple times (once per respondent who rated it), duplicates are only
an error within the same (RespondentID, ID) pair, and coverage is reported as
information rather than required.
"""
import collections
import csv
import glob
import os
import sys

RELEVANCE_VALUES = {"", "0", "1", "2", "3", "4", "5"}
SCOPE_VALUES = {
    "Process Model",
    "Worker/Task",
    "Process Data",
    "Infrastructure/Platform",
    "Organizational/Governance",
}
GENERIC_VALUES = {"", "Yes", "No"}
LIFECYCLE_VALUES = {
    "Design",
    "Modeling",
    "Execution",
    "Monitoring",
    "Analysis",
    "Optimization",
    "Not Applicable",
}
EXPERIENCE_VALUES = {
    "",
    "None",
    "Studied it, not in practice",
    "Practitioner, < 2 years",
    "Practitioner, 2-5 years",
    "Practitioner, 5+ years",
    "Prefer not to say",
}

RESPONDENTS_PATH = "respondents.csv"


def load_respondent_ids(path=RESPONDENTS_PATH):
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8-sig", newline="") as f:
        return {r["RespondentID"].strip() for r in csv.DictReader(f)}


def validate_respondents_file(path):
    errors = []
    with open(path, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))

    ids_seen = set()
    for i, row in enumerate(rows, start=2):
        rid = row.get("RespondentID", "").strip()
        if not rid:
            errors.append(f"line {i}: empty RespondentID")
        elif rid in ids_seen:
            errors.append(f"line {i}: duplicate RespondentID {rid!r}")
        ids_seen.add(rid)

        for col in ("BPM Experience", "Sustainability Experience"):
            val = row.get(col, "").strip()
            if val not in EXPERIENCE_VALUES:
                errors.append(f"line {i} ({rid}): {col} {val!r} not an allowed value")

        if not row.get("Role", "").strip():
            errors.append(f"line {i} ({rid}): Role must not be empty")

    return errors


def validate_file(path, respondent_ids=None):
    mode = "single" if os.path.basename(path) == "survey_claude.csv" else "multi"
    errors = []
    with open(path, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))

    guidelines_path = os.path.join(os.path.dirname(path), "guidelines.csv")
    guideline_ids = None
    if os.path.exists(guidelines_path):
        with open(guidelines_path, encoding="utf-8-sig", newline="") as f:
            guideline_ids = {r["ID"].strip() for r in csv.DictReader(f)}

    id_counts = collections.Counter()
    ids_seen = set()  # single mode: every ID seen so far
    pairs_seen = set()  # multi mode: every (RespondentID, ID) pair seen so far

    for i, row in enumerate(rows, start=2):  # +1 header, +1 to make it 1-based
        rid = row.get("ID", "").strip()
        respondent = row.get("RespondentID", "").strip()

        if not respondent:
            errors.append(f"line {i}: empty RespondentID")
        elif respondent_ids is not None and respondent not in respondent_ids:
            errors.append(f"line {i}: RespondentID {respondent!r} not found in {RESPONDENTS_PATH}")

        if not rid:
            errors.append(f"line {i}: empty ID")
        else:
            id_counts[rid] += 1
            if mode == "single":
                if rid in ids_seen:
                    errors.append(f"line {i}: duplicate ID {rid!r}")
                ids_seen.add(rid)
            else:
                pair = (respondent, rid)
                if pair in pairs_seen:
                    errors.append(f"line {i}: duplicate rating - {respondent!r} already rated {rid!r}")
                pairs_seen.add(pair)

        if guideline_ids is not None and rid and rid not in guideline_ids:
            errors.append(f"line {i}: ID {rid!r} not found in {guidelines_path}")

        relevance = row.get("BPM Relevance", "").strip()
        if relevance not in RELEVANCE_VALUES:
            errors.append(f"line {i} ({rid}): BPM Relevance {relevance!r} not in 0-5")

        scope_raw = row.get("BPM Scope", "").strip()
        if scope_raw:
            for p in [s.strip() for s in scope_raw.split(",") if s.strip()]:
                if p not in SCOPE_VALUES:
                    errors.append(
                        f"line {i} ({rid}): BPM Scope value {p!r} not allowed "
                        f"(allowed: {sorted(SCOPE_VALUES)})"
                    )

        generic = row.get("Generic", "").strip()
        if generic not in GENERIC_VALUES:
            errors.append(f"line {i} ({rid}): Generic {generic!r} must be Yes/No/blank")
        elif relevance == "0" and generic != "":
            errors.append(
                f"line {i} ({rid}): Generic must be blank when BPM Relevance is 0, got {generic!r}"
            )

        lifecycle_raw = row.get("BPM Lifecycle", "").strip()
        if lifecycle_raw:
            parts = [p.strip() for p in lifecycle_raw.split(",") if p.strip()]
            if "Not Applicable" in parts and len(parts) > 1:
                errors.append(
                    f"line {i} ({rid}): 'Not Applicable' must be used alone in BPM Lifecycle, got {lifecycle_raw!r}"
                )
            for p in parts:
                if p not in LIFECYCLE_VALUES:
                    errors.append(
                        f"line {i} ({rid}): BPM Lifecycle value {p!r} not allowed "
                        f"(allowed: {sorted(LIFECYCLE_VALUES)})"
                    )

    if guideline_ids is not None:
        rated_ids = set(id_counts)
        if mode == "single":
            missing = guideline_ids - rated_ids
            if missing:
                errors.append(
                    f"{len(missing)} ID(s) from {guidelines_path} have no row here: {sorted(missing)[:10]}"
                    + (" ..." if len(missing) > 10 else "")
                )
        else:
            unrated = guideline_ids - rated_ids
            multi_rated = sum(1 for c in id_counts.values() if c > 1)
            print(
                f"  [coverage] {len(rated_ids)}/{len(guideline_ids)} guideline(s) have >=1 rating, "
                f"{multi_rated} have 2+ ratings, {len(unrated)} have none yet"
            )

    return errors


def main():
    pattern = sys.argv[1] if len(sys.argv) > 1 else "guidelines/*/survey.csv"

    total_errors = 0

    if os.path.exists(RESPONDENTS_PATH):
        errors = validate_respondents_file(RESPONDENTS_PATH)
        if errors:
            print(f"=== {RESPONDENTS_PATH}: {len(errors)} issue(s) ===")
            for e in errors:
                print(f"  {e}")
            total_errors += len(errors)
        else:
            print(f"{RESPONDENTS_PATH}: OK")
    else:
        print(f"Warning: {RESPONDENTS_PATH} not found - RespondentID values won't be cross-checked.")

    respondent_ids = load_respondent_ids()

    paths = sorted(glob.glob(pattern))
    if not paths:
        print(f"No files found matching {pattern!r}")
        sys.exit(1)

    for path in paths:
        errors = validate_file(path, respondent_ids=respondent_ids)
        if errors:
            print(f"=== {path}: {len(errors)} issue(s) ===")
            for e in errors:
                print(f"  {e}")
            total_errors += len(errors)
        else:
            print(f"{path}: OK")

    if total_errors:
        print(f"\n{total_errors} total issue(s) found.")
        sys.exit(1)
    print("\nAll files valid.")


if __name__ == "__main__":
    main()
