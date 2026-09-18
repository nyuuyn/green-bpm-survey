"""index.html is fully static (no JS) - test_landing.mjs already checks its
markup; this covers the one thing only a real browser proves: the two CTAs
actually navigate to the right pages.
"""
from playwright.sync_api import expect


def test_survey_cta_navigates_to_survey_page(page, base_url):
    page.goto(f"{base_url}/index.html")
    page.get_by_role("link", name="Take the survey").click()
    expect(page).to_have_url(f"{base_url}/survey.html")
    expect(page.locator("h1")).to_have_text("About you")


def test_analysis_cta_navigates_to_analysis_page(page, base_url):
    page.goto(f"{base_url}/index.html")
    page.get_by_role("link", name="See the analysis").click()
    expect(page).to_have_url(f"{base_url}/analysis.html")
    expect(page.locator("h1")).to_contain_text("relevant")
