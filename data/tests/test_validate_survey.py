"""Unit tests for validate_survey.py. CI only ever runs this script against
the real data/guidelines/* and respondents.csv (which are, by construction,
already valid) - so every error path below (the actual point of a validator)
was previously untested. These pin validate_respondents_file()/validate_file()
against small in-memory-ish fixtures (tmp_path CSVs) covering each rule from
the module docstring and SURVEY_SCHEMA.md: allowed-value checks, single- vs
multi-mode duplicate handling, the Generic-blank-at-Relevance-0 rule, and the
Not-Applicable-must-be-alone rule for BPM Lifecycle.
"""
import csv

import validate_survey


def write_csv(path, rows, fieldnames=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = fieldnames or list(rows[0].keys())
    with open(path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


SURVEY_FIELDS = [
    "RespondentID",
    "ID",
    "BPM Relevance",
    "BPM Scope",
    "Generic",
    "BPM Lifecycle",
]


def survey_row(**overrides):
    row = {
        "RespondentID": "R1",
        "ID": "G1",
        "BPM Relevance": "2",
        "BPM Scope": "Process Model",
        "Generic": "Yes",
        "BPM Lifecycle": "Design",
    }
    row.update(overrides)
    return row


# ---------- load_respondent_ids ----------


def test_load_respondent_ids_returns_none_when_file_missing(tmp_path):
    assert validate_survey.load_respondent_ids(tmp_path / "nope.csv") is None


def test_load_respondent_ids_strips_whitespace(tmp_path):
    path = tmp_path / "respondents.csv"
    write_csv(path, [{"RespondentID": " R1 "}, {"RespondentID": "R2"}], fieldnames=["RespondentID"])
    assert validate_survey.load_respondent_ids(path) == {"R1", "R2"}


# ---------- validate_respondents_file ----------


def test_validate_respondents_file_accepts_a_valid_row(tmp_path):
    path = tmp_path / "respondents.csv"
    write_csv(
        path,
        [{"RespondentID": "R1", "BPM Experience": "None", "Sustainability Experience": "None", "Role": "Dev"}],
    )
    assert validate_survey.validate_respondents_file(path) == []


def test_validate_respondents_file_flags_empty_and_duplicate_ids(tmp_path):
    path = tmp_path / "respondents.csv"
    write_csv(
        path,
        [
            {"RespondentID": "", "BPM Experience": "None", "Sustainability Experience": "None", "Role": "Dev"},
            {"RespondentID": "R1", "BPM Experience": "None", "Sustainability Experience": "None", "Role": "Dev"},
            {"RespondentID": "R1", "BPM Experience": "None", "Sustainability Experience": "None", "Role": "Dev"},
        ],
    )
    errors = validate_survey.validate_respondents_file(path)
    assert any("empty RespondentID" in e for e in errors)
    assert any("duplicate RespondentID 'R1'" in e for e in errors)


def test_validate_respondents_file_flags_bad_experience_and_empty_role(tmp_path):
    path = tmp_path / "respondents.csv"
    write_csv(
        path,
        [
            {
                "RespondentID": "R1",
                "BPM Experience": "Expert somehow",
                "Sustainability Experience": "None",
                "Role": "",
            }
        ],
    )
    errors = validate_survey.validate_respondents_file(path)
    assert any("BPM Experience" in e and "not an allowed value" in e for e in errors)
    assert any("Role must not be empty" in e for e in errors)


# ---------- validate_file: RespondentID / ID bookkeeping ----------


def test_validate_file_flags_empty_respondent_and_empty_id(tmp_path):
    path = tmp_path / "survey.csv"
    write_csv(path, [survey_row(RespondentID="", ID="")], fieldnames=SURVEY_FIELDS)
    errors = validate_survey.validate_file(path)
    assert any("empty RespondentID" in e for e in errors)
    assert any("empty ID" in e for e in errors)


def test_validate_file_cross_checks_respondent_ids_when_provided(tmp_path):
    path = tmp_path / "survey.csv"
    write_csv(path, [survey_row(RespondentID="unknown")], fieldnames=SURVEY_FIELDS)
    errors = validate_survey.validate_file(path, respondent_ids={"R1"})
    assert any("RespondentID 'unknown' not found" in e for e in errors)


def test_validate_file_skips_respondent_cross_check_when_none_given(tmp_path):
    path = tmp_path / "survey.csv"
    write_csv(path, [survey_row(RespondentID="anyone")], fieldnames=SURVEY_FIELDS)
    errors = validate_survey.validate_file(path, respondent_ids=None)
    assert not any("not found" in e for e in errors)


# ---------- validate_file: single vs multi mode ----------


def test_survey_claude_csv_is_single_mode_and_rejects_duplicate_ids(tmp_path):
    path = tmp_path / "survey_claude.csv"
    write_csv(
        path,
        [survey_row(RespondentID="R1", ID="G1"), survey_row(RespondentID="R2", ID="G1")],
        fieldnames=SURVEY_FIELDS,
    )
    errors = validate_survey.validate_file(path)
    assert any("duplicate ID 'G1'" in e for e in errors)


def test_plain_survey_csv_is_multi_mode_and_allows_the_same_id_from_different_respondents(tmp_path):
    path = tmp_path / "survey.csv"
    write_csv(
        path,
        [survey_row(RespondentID="R1", ID="G1"), survey_row(RespondentID="R2", ID="G1")],
        fieldnames=SURVEY_FIELDS,
    )
    errors = validate_survey.validate_file(path)
    assert errors == []


def test_multi_mode_rejects_the_same_respondent_rating_the_same_id_twice(tmp_path):
    path = tmp_path / "survey.csv"
    write_csv(
        path,
        [survey_row(RespondentID="R1", ID="G1"), survey_row(RespondentID="R1", ID="G1")],
        fieldnames=SURVEY_FIELDS,
    )
    errors = validate_survey.validate_file(path)
    assert any("duplicate rating" in e for e in errors)


def test_single_mode_reports_missing_coverage_against_adjacent_guidelines_csv(tmp_path):
    write_csv(tmp_path / "guidelines.csv", [{"ID": "G1"}, {"ID": "G2"}], fieldnames=["ID"])
    path = tmp_path / "survey_claude.csv"
    write_csv(path, [survey_row(RespondentID="R1", ID="G1")], fieldnames=SURVEY_FIELDS)

    errors = validate_survey.validate_file(path)
    assert any("have no row here" in e and "'G2'" in e for e in errors)


def test_single_mode_passes_when_every_guideline_is_rated(tmp_path):
    write_csv(tmp_path / "guidelines.csv", [{"ID": "G1"}], fieldnames=["ID"])
    path = tmp_path / "survey_claude.csv"
    write_csv(path, [survey_row(RespondentID="R1", ID="G1")], fieldnames=SURVEY_FIELDS)

    assert validate_survey.validate_file(path) == []


def test_multi_mode_reports_coverage_as_information_not_an_error(tmp_path, capsys):
    write_csv(tmp_path / "guidelines.csv", [{"ID": "G1"}, {"ID": "G2"}], fieldnames=["ID"])
    path = tmp_path / "survey.csv"
    write_csv(path, [survey_row(RespondentID="R1", ID="G1")], fieldnames=SURVEY_FIELDS)

    errors = validate_survey.validate_file(path)
    assert errors == []
    assert "[coverage] 1/2 guideline(s)" in capsys.readouterr().out


def test_unknown_id_against_adjacent_guidelines_csv_is_flagged(tmp_path):
    write_csv(tmp_path / "guidelines.csv", [{"ID": "G1"}], fieldnames=["ID"])
    path = tmp_path / "survey.csv"
    write_csv(path, [survey_row(RespondentID="R1", ID="NOT-A-REAL-ID")], fieldnames=SURVEY_FIELDS)

    errors = validate_survey.validate_file(path)
    assert any("not found in" in e and "guidelines.csv" in e for e in errors)


def test_validate_file_works_without_an_adjacent_guidelines_csv(tmp_path):
    path = tmp_path / "survey.csv"
    write_csv(path, [survey_row()], fieldnames=SURVEY_FIELDS)
    assert validate_survey.validate_file(path) == []


# ---------- validate_file: field-value rules ----------


def test_bpm_relevance_must_be_0_to_3_or_blank(tmp_path):
    path = tmp_path / "survey.csv"
    write_csv(path, [survey_row(**{"BPM Relevance": "5"})], fieldnames=SURVEY_FIELDS)
    errors = validate_survey.validate_file(path)
    assert any("BPM Relevance" in e and "not in 0-3" in e for e in errors)


def test_bpm_scope_accepts_multiple_comma_separated_values(tmp_path):
    path = tmp_path / "survey.csv"
    write_csv(
        path,
        [survey_row(**{"BPM Scope": "Process Model, Worker/Task"})],
        fieldnames=SURVEY_FIELDS,
    )
    assert validate_survey.validate_file(path) == []


def test_bpm_scope_rejects_an_unknown_value(tmp_path):
    path = tmp_path / "survey.csv"
    write_csv(path, [survey_row(**{"BPM Scope": "Not A Real Scope"})], fieldnames=SURVEY_FIELDS)
    errors = validate_survey.validate_file(path)
    assert any("BPM Scope value 'Not A Real Scope' not allowed" in e for e in errors)


def test_generic_must_be_yes_no_or_blank(tmp_path):
    path = tmp_path / "survey.csv"
    write_csv(path, [survey_row(Generic="Maybe")], fieldnames=SURVEY_FIELDS)
    errors = validate_survey.validate_file(path)
    assert any("Generic 'Maybe' must be Yes/No/blank" in e for e in errors)


def test_generic_must_be_blank_when_relevance_is_zero(tmp_path):
    path = tmp_path / "survey.csv"
    write_csv(path, [survey_row(**{"BPM Relevance": "0"}, Generic="Yes")], fieldnames=SURVEY_FIELDS)
    errors = validate_survey.validate_file(path)
    assert any("Generic must be blank when BPM Relevance is 0" in e for e in errors)


def test_generic_blank_is_fine_when_relevance_is_zero(tmp_path):
    path = tmp_path / "survey.csv"
    write_csv(
        path,
        [survey_row(**{"BPM Relevance": "0", "BPM Scope": "", "Generic": "", "BPM Lifecycle": ""})],
        fieldnames=SURVEY_FIELDS,
    )
    assert validate_survey.validate_file(path) == []


def test_not_applicable_must_be_used_alone_in_lifecycle(tmp_path):
    path = tmp_path / "survey.csv"
    write_csv(
        path,
        [survey_row(**{"BPM Lifecycle": "Design, Not Applicable"})],
        fieldnames=SURVEY_FIELDS,
    )
    errors = validate_survey.validate_file(path)
    assert any("'Not Applicable' must be used alone" in e for e in errors)


def test_lifecycle_accepts_not_applicable_alone(tmp_path):
    path = tmp_path / "survey.csv"
    write_csv(path, [survey_row(**{"BPM Lifecycle": "Not Applicable"})], fieldnames=SURVEY_FIELDS)
    assert validate_survey.validate_file(path) == []


def test_lifecycle_rejects_an_unknown_phase(tmp_path):
    path = tmp_path / "survey.csv"
    write_csv(path, [survey_row(**{"BPM Lifecycle": "Deployment"})], fieldnames=SURVEY_FIELDS)
    errors = validate_survey.validate_file(path)
    assert any("BPM Lifecycle value 'Deployment' not allowed" in e for e in errors)


# ---------- main() ----------


def test_main_exits_1_and_prints_summary_when_errors_found(tmp_path, monkeypatch, capsys):
    survey_dir = tmp_path / "guidelines" / "src"
    write_csv(survey_dir / "guidelines.csv", [{"ID": "G1"}], fieldnames=["ID"])
    write_csv(survey_dir / "survey.csv", [survey_row(**{"BPM Relevance": "9"})], fieldnames=SURVEY_FIELDS)

    monkeypatch.setattr(validate_survey, "RESPONDENTS_PATH", str(tmp_path / "no-respondents.csv"))
    # load_respondent_ids's `path=RESPONDENTS_PATH` default is bound once at def
    # time, so patching the module attribute above doesn't reach main()'s no-arg
    # call to it - patch the function itself to isolate this test from whatever
    # IDs happen to be in this machine's real data/respondents.csv.
    monkeypatch.setattr(validate_survey, "load_respondent_ids", lambda path=None: None)
    monkeypatch.setattr("sys.argv", ["validate_survey.py", str(survey_dir / "survey.csv")])

    try:
        validate_survey.main()
        assert False, "expected SystemExit"
    except SystemExit as exc:
        assert exc.code == 1
    assert "total issue(s) found" in capsys.readouterr().out


def test_main_exits_0_and_prints_all_valid_when_no_errors(tmp_path, monkeypatch, capsys):
    survey_dir = tmp_path / "guidelines" / "src"
    write_csv(survey_dir / "guidelines.csv", [{"ID": "G1"}], fieldnames=["ID"])
    write_csv(survey_dir / "survey_claude.csv", [survey_row(ID="G1")], fieldnames=SURVEY_FIELDS)

    monkeypatch.setattr(validate_survey, "RESPONDENTS_PATH", str(tmp_path / "no-respondents.csv"))
    monkeypatch.setattr(validate_survey, "load_respondent_ids", lambda path=None: None)
    monkeypatch.setattr("sys.argv", ["validate_survey.py", str(survey_dir / "survey_claude.csv")])

    validate_survey.main()  # returns normally - no SystemExit on the all-valid path
    assert "All files valid." in capsys.readouterr().out


def test_main_prints_ok_when_respondents_csv_has_no_issues(tmp_path, monkeypatch, capsys):
    respondents_path = tmp_path / "respondents.csv"
    write_csv(
        respondents_path,
        [{"RespondentID": "R1", "BPM Experience": "None", "Sustainability Experience": "None", "Role": "Dev"}],
    )
    survey_dir = tmp_path / "guidelines" / "src"
    write_csv(survey_dir / "guidelines.csv", [{"ID": "G1"}], fieldnames=["ID"])
    write_csv(survey_dir / "survey_claude.csv", [survey_row(ID="G1")], fieldnames=SURVEY_FIELDS)

    monkeypatch.setattr(validate_survey, "RESPONDENTS_PATH", str(respondents_path))
    monkeypatch.setattr(validate_survey, "load_respondent_ids", lambda path=None: None)
    monkeypatch.setattr("sys.argv", ["validate_survey.py", str(survey_dir / "survey_claude.csv")])

    validate_survey.main()  # returns normally - both respondents.csv and the survey file are valid
    assert f"{respondents_path}: OK" in capsys.readouterr().out


def test_main_exits_1_when_no_files_match_the_glob(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(validate_survey, "RESPONDENTS_PATH", str(tmp_path / "no-respondents.csv"))
    monkeypatch.setattr(validate_survey, "load_respondent_ids", lambda path=None: None)
    monkeypatch.setattr("sys.argv", ["validate_survey.py", str(tmp_path / "nothing-*.csv")])

    try:
        validate_survey.main()
        assert False, "expected SystemExit"
    except SystemExit as exc:
        assert exc.code == 1
    assert "No files found matching" in capsys.readouterr().out


def test_main_validates_respondents_csv_first_when_present(tmp_path, monkeypatch, capsys):
    respondents_path = tmp_path / "respondents.csv"
    write_csv(
        respondents_path,
        [{"RespondentID": "", "BPM Experience": "None", "Sustainability Experience": "None", "Role": "Dev"}],
    )
    survey_dir = tmp_path / "guidelines" / "src"
    write_csv(survey_dir / "guidelines.csv", [{"ID": "G1"}], fieldnames=["ID"])
    write_csv(survey_dir / "survey_claude.csv", [survey_row(ID="G1")], fieldnames=SURVEY_FIELDS)

    monkeypatch.setattr(validate_survey, "RESPONDENTS_PATH", str(respondents_path))
    monkeypatch.setattr(validate_survey, "load_respondent_ids", lambda path=None: None)
    monkeypatch.setattr("sys.argv", ["validate_survey.py", str(survey_dir / "survey_claude.csv")])

    try:
        validate_survey.main()
        assert False, "expected SystemExit"
    except SystemExit as exc:
        assert exc.code == 1
    out = capsys.readouterr().out
    assert str(respondents_path) in out and "issue(s)" in out
