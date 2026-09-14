"""Validate guidelines/<source>/survey.csv against the allowed values in SURVEY_SCHEMA.md.

Usage: python validate_survey.py [glob_pattern]
       (default glob_pattern: guidelines/*/survey.csv)
"""
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


def validate_file(path):
    errors = []
    with open(path, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))

    guidelines_path = os.path.join(os.path.dirname(path), "guidelines.csv")
    guideline_ids = None
    if os.path.exists(guidelines_path):
        with open(guidelines_path, encoding="utf-8-sig", newline="") as f:
            guideline_ids = {r["ID"].strip() for r in csv.DictReader(f)}

    ids_seen = set()
    for i, row in enumerate(rows, start=2):  # +1 header, +1 to make it 1-based
        rid = row.get("ID", "").strip()
        if not rid:
            errors.append(f"line {i}: empty ID")
        elif rid in ids_seen:
            errors.append(f"line {i}: duplicate ID {rid!r}")
        ids_seen.add(rid)
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
        missing = guideline_ids - ids_seen
        if missing:
            errors.append(
                f"{len(missing)} ID(s) from {guidelines_path} have no row here: {sorted(missing)[:10]}"
                + (" ..." if len(missing) > 10 else "")
            )

    return errors


def main():
    pattern = sys.argv[1] if len(sys.argv) > 1 else "guidelines/*/survey.csv"
    paths = sorted(glob.glob(pattern))
    if not paths:
        print(f"No files found matching {pattern!r}")
        sys.exit(1)

    total_errors = 0
    for path in paths:
        errors = validate_file(path)
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
    print("\nAll survey.csv files valid.")


if __name__ == "__main__":
    main()
