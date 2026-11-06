"""Unit tests for generate_data.py - the single-source-of-truth generator for
everything the frontend fetches (data.json + analysis_<round>.json). These
were previously only exercised end-to-end by CI running the real script
against the real data/guidelines/* and diffing generated/ - which proves the
checked-in output is fresh, but never exercised edge cases the real data
doesn't currently contain (missing Category/Context, unrated or multi-valued
guidelines, etc). Each test below monkeypatches the module's SOURCES/
GUIDELINES_DIR/OUTPUT_ROOT globals to a small fixture layout instead, so
behavior is pinned independently of whatever's currently in data/guidelines/.
"""
import csv
import json

import generate_data


def write_csv(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = list(rows[0].keys())
    with open(path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def test_read_csv_handles_bom(tmp_path):
    path = tmp_path / "x.csv"
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        f.write("ID,Name\nA1,Alpha\n")
    assert generate_data.read_csv(path) == [{"ID": "A1", "Name": "Alpha"}]


def test_split_multi_strips_and_drops_blanks():
    assert generate_data.split_multi("Design, Monitoring ,, Analysis") == [
        "Design",
        "Monitoring",
        "Analysis",
    ]


def test_split_multi_single_value():
    assert generate_data.split_multi("Design") == ["Design"]


def test_split_multi_empty_string_returns_empty_list():
    assert generate_data.split_multi("") == []


def test_write_json_writes_file_and_reports_count(tmp_path, capsys):
    path = tmp_path / "out.json"
    generate_data.write_json(path, [{"a": 1}, {"b": 2}])

    assert json.loads(path.read_text(encoding="utf-8")) == [{"a": 1}, {"b": 2}]
    assert f"Wrote 2 records to {path}" in capsys.readouterr().out


def test_build_data_json_reads_every_source_and_falls_back_on_missing_columns(tmp_path, monkeypatch):
    monkeypatch.setattr(generate_data, "SOURCES", {"src1": "Source One", "src2": "Source Two"})
    monkeypatch.setattr(generate_data, "GUIDELINES_DIR", tmp_path)

    write_csv(
        tmp_path / "src1" / "guidelines.csv",
        [
            {
                "ID": "S1.1",
                "Name": "First",
                "Category": "Cat A",
                "Reference": "Ref 1",
                "Guideline": "Do the thing",
                "Context": "Some context",
            }
        ],
    )
    # src2's guidelines.csv omits the optional Category/Context columns entirely.
    write_csv(
        tmp_path / "src2" / "guidelines.csv",
        [{"ID": "S2.1", "Name": "Second", "Reference": "Ref 2", "Guideline": "Do another thing"}],
    )

    items = generate_data.build_data_json()

    assert items == [
        {
            "id": "S1.1",
            "name": "First",
            "category": "Cat A",
            "reference": "Ref 1",
            "guideline": "Do the thing",
            "context": "Some context",
            "source": "src1",
            "sourceLabel": "Source One",
        },
        {
            "id": "S2.1",
            "name": "Second",
            "category": "",
            "reference": "Ref 2",
            "guideline": "Do another thing",
            "context": "",
            "source": "src2",
            "sourceLabel": "Source Two",
        },
    ]


def test_build_data_json_skips_rows_marked_duplicate_of(tmp_path, monkeypatch):
    monkeypatch.setattr(generate_data, "SOURCES", {"src1": "Source One"})
    monkeypatch.setattr(generate_data, "GUIDELINES_DIR", tmp_path)

    write_csv(
        tmp_path / "src1" / "guidelines.csv",
        [
            {
                "ID": "S1.1",
                "Name": "Original",
                "Reference": "Ref 1",
                "Guideline": "Do the thing",
                "DuplicateOf": "",
            },
            {
                "ID": "S1.2",
                "Name": "Republished elsewhere",
                "Reference": "Ref 2",
                "Guideline": "Do the same thing",
                "DuplicateOf": "OTHER.1",
            },
        ],
    )

    items = generate_data.build_data_json()

    assert [item["id"] for item in items] == ["S1.1"]


def test_build_analysis_json_joins_ratings_and_fills_gaps(tmp_path, monkeypatch):
    monkeypatch.setattr(generate_data, "SOURCES", {"native": "Native Source", "ext": "External Source"})
    monkeypatch.setattr(generate_data, "BPM_NATIVE", {"native"})
    monkeypatch.setattr(generate_data, "GUIDELINES_DIR", tmp_path)

    write_csv(
        tmp_path / "native" / "guidelines.csv",
        [
            {"ID": "N1", "Name": "Rated"},
            {"ID": "N2", "Name": "Unrated"},
        ],
    )
    write_csv(
        tmp_path / "native" / "survey_claude.csv",
        [
            {
                "ID": "N1",
                "BPM Relevance": "3",
                "BPM Scope": "Process Model, Worker/Task",
                "Generic": "Yes",
                "BPM Lifecycle": "Design, Monitoring",
            }
        ],
    )
    write_csv(
        tmp_path / "ext" / "guidelines.csv",
        [
            {"ID": "E1", "Name": "External", "DuplicateOf": ""},
            {"ID": "E2", "Name": "Duplicate of N1", "DuplicateOf": "N1"},
        ],
    )
    write_csv(
        tmp_path / "ext" / "survey_claude.csv",
        [
            {"ID": "E1", "BPM Relevance": "0", "BPM Scope": "", "Generic": "", "BPM Lifecycle": ""},
            {"ID": "E2", "BPM Relevance": "3", "BPM Scope": "", "Generic": "", "BPM Lifecycle": ""},
        ],
    )

    records = generate_data.build_analysis_json("survey_claude.csv")

    assert records == [
        {
            "id": "N1",
            "name": "Rated",
            "source": "native",
            "bpmNative": True,
            "relevance": 3,
            "scope": ["Process Model", "Worker/Task"],
            "generic": "Yes",
            "lifecycle": ["Design", "Monitoring"],
        },
        {
            # N2 has no row in survey_claude.csv at all - ratings.get() falls back
            # to {}, so every rating field must come out blank/None, not KeyError.
            "id": "N2",
            "name": "Unrated",
            "source": "native",
            "bpmNative": True,
            "relevance": None,
            "scope": [],
            "generic": None,
            "lifecycle": [],
        },
        {
            "id": "E1",
            "name": "External",
            "source": "ext",
            "bpmNative": False,
            "relevance": 0,
            "scope": [],
            "generic": None,
            "lifecycle": [],
        },
    ]


def test_main_writes_data_json_and_one_file_per_round(tmp_path, monkeypatch):
    monkeypatch.setattr(generate_data, "SOURCES", {"src": "Source"})
    monkeypatch.setattr(generate_data, "BPM_NATIVE", set())
    monkeypatch.setattr(generate_data, "GUIDELINES_DIR", tmp_path / "guidelines")
    monkeypatch.setattr(generate_data, "OUTPUT_ROOT", tmp_path / "generated")
    monkeypatch.setattr(generate_data, "ROUNDS", {"onlyround": "survey_only.csv"})

    write_csv(
        tmp_path / "guidelines" / "src" / "guidelines.csv",
        [{"ID": "X1", "Name": "X", "Reference": "Ref X", "Guideline": "Do X"}],
    )
    write_csv(
        tmp_path / "guidelines" / "src" / "survey_only.csv",
        [{"ID": "X1", "BPM Relevance": "1", "BPM Scope": "", "Generic": "", "BPM Lifecycle": ""}],
    )

    generate_data.main()

    out_dir = tmp_path / "generated"
    assert json.loads((out_dir / "data.json").read_text(encoding="utf-8")) == [
        {
            "id": "X1",
            "name": "X",
            "category": "",
            "reference": "Ref X",
            "guideline": "Do X",
            "context": "",
            "source": "src",
            "sourceLabel": "Source",
        }
    ]
    assert json.loads((out_dir / "analysis_onlyround.json").read_text(encoding="utf-8")) == [
        {
            "id": "X1",
            "name": "X",
            "source": "src",
            "bpmNative": False,
            "relevance": 1,
            "scope": [],
            "generic": None,
            "lifecycle": [],
        }
    ]
