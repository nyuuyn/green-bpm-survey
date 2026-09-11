"""Validate guidelines/<source>/survey.csv against the allowed values in SURVEY_SCHEMA.md.

Usage: python validate_survey.py
"""
import csv
import glob
import sys

RELEVANCE_VALUES = {"", "0", "1", "2", "3", "4", "5"}
SCOPE_VALUES = {
    "",
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

    ids_seen = set()
    for i, row in enumerate(rows, start=2):  # +1 header, +1 to make it 1-based
        rid = row.get("ID", "").strip()
        if not rid:
            errors.append(f"line {i}: empty ID")
        elif rid in ids_seen:
            errors.append(f"line {i}: duplicate ID {rid!r}")
        ids_seen.add(rid)

        relevance = row.get("BPM Relevance", "").strip()
        if relevance not in RELEVANCE_VALUES:
            errors.append(f"line {i} ({rid}): BPM Relevance {relevance!r} not in 0-5")

        scope = row.get("BPM Scope", "").strip()
        if scope not in SCOPE_VALUES:
            errors.append(f"line {i} ({rid}): BPM Scope {scope!r} not an allowed value")

        generic = row.get("Generic", "").strip()
        if generic not in GENERIC_VALUES:
            errors.append(f"line {i} ({rid}): Generic {generic!r} must be Yes/No/blank")

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

    return errors


def main():
    paths = sorted(glob.glob("guidelines/*/survey.csv"))
    if not paths:
        print("No survey.csv files found under guidelines/*/")
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
