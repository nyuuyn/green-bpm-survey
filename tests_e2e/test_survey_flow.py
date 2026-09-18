"""Real-browser coverage of the survey flow. This deliberately doesn't re-test
every DOM-logic assertion test_flow.mjs already covers (jsdom is fine for that) -
it focuses on things only a real browser proves: native click/submit behavior,
and an actual file download.
"""
import json
import re

from playwright.sync_api import expect

from helpers import check, complete_survey, fill_about_you, finish_rating, start_survey


def test_survey_page_boots_directly_into_about_you(page, base_url):
    # No intro/Start step on survey.html anymore - that content moved to the
    # landing page (index.html); this page fetches data.json and renders
    # "About you" immediately.
    start_survey(page, base_url)
    expect(page.locator("h1")).to_have_text("About you")


def test_header_breadcrumb_present_on_every_survey_screen(page, base_url):
    # The header breadcrumb ("Green BPM Survey / Survey") is static markup, not
    # part of what survey.js re-renders into #app - present and consistent no
    # matter which of the three screens is currently showing.
    crumb = page.locator(".crumb-current")
    brand_link = page.locator("a.brand")

    start_survey(page, base_url)
    expect(crumb).to_have_text("Survey")

    fill_about_you(page)
    expect(crumb).to_have_text("Survey")

    finish_rating(page)
    expect(crumb).to_have_text("Survey")

    brand_link.click()
    expect(page).to_have_url(f"{base_url}/index.html")


def test_about_you_validation(page, base_url):
    start_survey(page, base_url)

    # Empty submit is blocked with an error, not a silent no-op.
    page.get_by_role("button", name="Continue").click()
    expect(page.locator(".error-text")).to_contain_text("BPM experience")

    # Role = Other reveals a free-text field and blocks submit until it's filled.
    check(page, "role", "Other")
    role_other = page.locator('input[name="roleOther"]')
    expect(role_other).to_be_visible()
    check(page, "bpmExperience", "Practitioner, 5+ years")
    check(page, "sustainabilityExperience", "None")
    page.get_by_role("button", name="Continue").click()
    expect(page.locator(".error-text")).to_contain_text("specify your role")

    role_other.fill("Sustainability Officer")
    page.get_by_role("button", name="Continue").click()
    expect(page.locator("h1")).to_have_text("Rate each guideline")
    expect(page.locator(".rating-row")).to_have_count(25)
    expect(page.locator("#progressLabel")).to_have_text("0 / 25")


def test_finish_blocked_when_rows_incomplete(page, base_url):
    start_survey(page, base_url)
    fill_about_you(page)
    page.get_by_role("button", name="Finish").click()
    expect(page.locator(".error-text")).to_contain_text("25 guideline")
    expect(page.locator("h1")).to_have_text("Rate each guideline")


def test_relevance_zero_disables_and_clears_scope_generic_lifecycle(page, base_url):
    start_survey(page, base_url)
    fill_about_you(page)

    # Row body (Scope/Generic/Lifecycle) is hidden until a Relevance score expands
    # it - pick a non-zero score first, same as a real user would, then switch to
    # 0 and confirm the prior selection actually gets cleared, not just left blank.
    check(page, "relevance-0", "2")
    check(page, "scope-0", "Process Model")
    check(page, "relevance-0", "0")

    for name in ["scope-0", "generic-0", "lifecycle-0"]:
        inputs = page.locator(f'input[name="{name}"]')
        for i in range(inputs.count()):
            expect(inputs.nth(i)).to_be_disabled()
            expect(inputs.nth(i)).not_to_be_checked()

    row0 = page.locator('.rating-row[data-index="0"]')
    expect(row0).to_have_class(re.compile(r"\bcomplete\b"))


def test_lifecycle_not_applicable_is_mutually_exclusive(page, base_url):
    start_survey(page, base_url)
    fill_about_you(page)

    check(page, "relevance-0", "3")
    check(page, "lifecycle-0", "Design")
    check(page, "lifecycle-0", "Not Applicable")
    expect(page.locator('input[name="lifecycle-0"][value="Design"]')).not_to_be_checked()
    expect(page.locator('input[name="lifecycle-0"][value="Not Applicable"]')).to_be_checked()

    check(page, "lifecycle-0", "Monitoring")
    expect(page.locator('input[name="lifecycle-0"][value="Not Applicable"]')).not_to_be_checked()


def test_row_header_click_toggles_expand_collapse(page, base_url):
    start_survey(page, base_url)
    fill_about_you(page)

    row = page.locator('.rating-row[data-index="3"]')
    body = row.locator(".rating-row-body")
    expect(body).to_be_hidden()
    row.locator(".rating-row-header").click()
    expect(body).to_be_visible()
    row.locator(".rating-row-header").click()
    expect(body).to_be_hidden()


def test_full_submission_payload_shape(page, base_url):
    payload = complete_survey(
        page,
        base_url,
        bpm_experience="Practitioner, 5+ years",
        sustainability_experience="None",
        role="Student",
    )

    expect(page.locator(".test-mode-note")).to_be_visible()
    assert len(payload["responses"]) == 25
    assert payload["sessionId"] and payload["submittedAt"]
    assert payload["respondent"]["BPM Experience"] == "Practitioner, 5+ years"
    assert all("ID" in r for r in payload["responses"])
    assert all("Keywords" not in r for r in payload["responses"])
    # Relevance=0 -> blank Scope/Generic/Lifecycle is covered by
    # test_relevance_zero_disables_and_clears_scope_generic_lifecycle instead of
    # here, since complete_survey()'s default fill uses Relevance=3 for every row.


def test_download_button_produces_a_real_file(page, base_url):
    """jsdom can't exercise Blob/createObjectURL + a programmatic download click -
    this is the one existing behavior only a real browser can verify."""
    complete_survey(page, base_url)

    with page.expect_download() as download_info:
        page.get_by_role("button", name="Download responses (JSON)").click()
    download = download_info.value

    assert download.suggested_filename.startswith("survey-response-")
    assert download.suggested_filename.endswith(".json")
    path = download.path()
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    assert len(data["responses"]) == 25
