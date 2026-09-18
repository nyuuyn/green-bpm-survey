"""The analysis screen's charts are the main reason this suite exists: jsdom has
no real <canvas> 2D context, so test_flow.mjs can only stub Chart.js out and check
that a Chart instance was constructed - it can't tell a chart from a blank canvas.
This suite runs in a real browser, so it can.
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


def _open_analysis_screen(page, base_url):
    complete_survey(page, base_url)
    page.get_by_role("button", name="See the guideline analysis").click()
    page.wait_for_selector("h1:has-text('relevant')")


def test_analysis_screen_renders_all_charts_with_real_content(page, base_url):
    _open_analysis_screen(page, base_url)

    expect(page.locator("canvas")).to_have_count(len(CHART_IDS))
    for chart_id in CHART_IDS:
        expect(page.locator(f"#{chart_id}")).to_be_visible()
        assert canvas_has_content(page, chart_id), f"{chart_id} rendered no visible pixels"


def test_analysis_screen_legends_present(page, base_url):
    _open_analysis_screen(page, base_url)

    legends = page.locator(".chart-legend")
    # relevance-mix, high-relevance-share, scope-native, generic-share
    expect(legends).to_have_count(4)

    high_relevance_card = page.locator(".chart-card", has=page.locator("#chart-high-relevance"))
    expect(high_relevance_card.locator(".chart-legend")).to_contain_text("General source")
    expect(high_relevance_card.locator(".chart-legend")).to_contain_text("BPM-native source")


def test_top_20_table_has_20_rows(page, base_url):
    _open_analysis_screen(page, base_url)
    expect(page.locator(".data-table tbody tr")).to_have_count(20)


def test_back_button_restores_completion_screen_without_resubmitting(page, base_url):
    payload_before = complete_survey(page, base_url)
    pre_text_before = page.locator("pre.summary-box").inner_text()

    page.get_by_role("button", name="See the guideline analysis").click()
    page.wait_for_selector("h1:has-text('relevant')")

    page.get_by_role("button", name="Back").click()
    expect(page.locator("h1")).to_have_text("Thank you! 🎉")
    # Same payload still shown - Back must restore the existing card, not call
    # renderComplete() again (which would eventually mean re-submitting).
    assert page.locator("pre.summary-box").inner_text() == pre_text_before
    assert payload_before["sessionId"]


def test_download_full_dataset_link_points_at_analysis_json(page, base_url):
    _open_analysis_screen(page, base_url)
    link = page.get_by_role("link", name="Download full dataset (JSON)")
    expect(link).to_have_attribute("href", "analysis.json")
