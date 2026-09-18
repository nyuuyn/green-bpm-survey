"""Shared flow-driving helpers for the e2e suite - real-browser equivalent of the
check()/submit()/fillDefault() helpers in test_flow.mjs, but clicking actual
buttons/inputs instead of dispatching synthetic DOM events.
"""
import json

SAMPLE_SIZE = 25


def check(page, name, value):
    page.locator(f'input[name="{name}"][value="{value}"]').check()


def start_survey(page, base_url):
    page.goto(f"{base_url}/index.html")
    page.get_by_role("button", name="Start", exact=True).click()
    page.wait_for_selector("h1:has-text('About you')")


def fill_about_you(page, *, bpm_experience="None", sustainability_experience="None", role="Student"):
    check(page, "bpmExperience", bpm_experience)
    check(page, "sustainabilityExperience", sustainability_experience)
    check(page, "role", role)
    page.get_by_role("button", name="Continue").click()
    page.wait_for_selector("h1:has-text('Rate each guideline')")


def fill_row_default(page, i):
    check(page, f"relevance-{i}", "3")
    check(page, f"scope-{i}", "Organizational/Governance")
    check(page, f"generic-{i}", "Yes")
    check(page, f"lifecycle-{i}", "Not Applicable")


def finish_rating(page, row_count=SAMPLE_SIZE):
    for i in range(row_count):
        fill_row_default(page, i)
    page.get_by_role("button", name="Finish").click()
    page.wait_for_selector("h1:has-text('Thank you')")


def complete_survey(page, base_url, **respondent_kwargs):
    """Drives the full flow (Start -> About you -> 25 rows -> Finish) and returns
    the parsed test-mode payload shown on the Thank-you screen."""
    start_survey(page, base_url)
    fill_about_you(page, **respondent_kwargs)
    finish_rating(page)
    return json.loads(page.locator("pre.summary-box").inner_text())


def canvas_has_content(page, canvas_id):
    """True if the canvas has drawn non-transparent pixels - the one thing jsdom
    can't verify, since it has no real <canvas> 2D context."""
    return page.evaluate(
        """(id) => {
            const canvas = document.getElementById(id);
            const ctx = canvas.getContext("2d");
            const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
            for (let i = 3; i < data.length; i += 4) {
                if (data[i] !== 0) return true; // any non-transparent pixel
            }
            return false;
        }""",
        canvas_id,
    )
