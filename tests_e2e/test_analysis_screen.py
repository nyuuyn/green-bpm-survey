"""The analysis page's charts are the main reason this suite exists: jsdom has
no real <canvas> 2D context, so test_analysis.mjs can only stub Chart.js out and
check that a Chart instance was constructed - it can't tell a chart from a blank
canvas. This suite runs in a real browser, so it can.

analysis.html is now a standalone page (independently reachable from the
landing page), so most of these navigate straight to it instead of completing
the survey first.
"""
from playwright.sync_api import expect

from helpers import canvas_has_content, complete_survey

CHART_IDS = [
    "chart-per-source",
    "chart-relevance-dist",
    "chart-high-relevance",
    "chart-relevance-mix",
    "chart-scope-counts",
    "chart-scope-native",
    "chart-generic-share",
    "chart-lifecycle",
    "chart-mean-by-scope",
]


def _open_analysis_page(page, base_url):
    page.goto(f"{base_url}/analysis.html")
    page.wait_for_selector("h1:has-text('relevant')")


def test_analysis_page_renders_all_charts_with_real_content(page, base_url):
    _open_analysis_page(page, base_url)

    expect(page.locator("canvas")).to_have_count(len(CHART_IDS))
    for chart_id in CHART_IDS:
        expect(page.locator(f"#{chart_id}")).to_be_visible()
        assert canvas_has_content(page, chart_id), f"{chart_id} rendered no visible pixels"


def test_analysis_page_legends_present(page, base_url):
    _open_analysis_page(page, base_url)

    legends = page.locator(".chart-legend")
    # relevance-mix, high-relevance-share, scope-native, generic-share
    expect(legends).to_have_count(4)

    high_relevance_card = page.locator(".chart-card", has=page.locator("#chart-high-relevance"))
    expect(high_relevance_card.locator(".chart-legend")).to_contain_text("General source")
    expect(high_relevance_card.locator(".chart-legend")).to_contain_text("BPM-native source")


def test_top_20_table_has_20_rows(page, base_url):
    _open_analysis_page(page, base_url)
    expect(page.locator(".data-table tbody tr")).to_have_count(20)


def test_header_breadcrumb_shows_current_page_and_links_home(page, base_url):
    # Navigation home is the brand link in the header breadcrumb ("Green BPM
    # Survey / Analysis"), not a separate "← Home" button in the card body -
    # analysis.html has no completion-screen state to return to anyway when
    # reached directly.
    _open_analysis_page(page, base_url)
    expect(page.locator(".crumb-current")).to_have_text("Analysis")

    page.locator("a.brand").click()
    expect(page).to_have_url(f"{base_url}/index.html")
    expect(page.get_by_role("link", name="Take the survey")).to_be_visible()


def test_download_full_dataset_link_points_at_analysis_json(page, base_url):
    _open_analysis_page(page, base_url)
    link = page.get_by_role("link", name="Download full dataset (JSON)")
    expect(link).to_have_attribute("href", "analysis.json")


def test_completion_screen_link_navigates_to_analysis_page(page, base_url):
    """Integration check: finishing the survey and clicking through actually
    lands on the standalone analysis page, not just a same-page state swap."""
    complete_survey(page, base_url)
    page.get_by_role("link", name="See the guideline analysis").click()
    expect(page).to_have_url(f"{base_url}/analysis.html")
    expect(page.locator("h1")).to_contain_text("relevant")
