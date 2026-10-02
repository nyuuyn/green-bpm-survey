"""The analysis page's charts are the main reason this suite exists: jsdom has
no real <canvas> 2D context, so test_analysis.mjs can only stub Chart.js out and
check that a Chart instance was constructed - it can't tell a chart from a blank
canvas. This suite runs in a real browser, so it can.

analysis.html is now a standalone page (independently reachable from the
landing page), so most of these navigate straight to it instead of completing
the survey first. It also shows one tab per survey round (ANALYSIS_ROUNDS in
analysis.js) - three today (general/sustainability/BPM Claude personas).
"""
from playwright.sync_api import expect

from helpers import canvas_has_content, complete_survey

CHART_NAMES = [
    "chart-relevance-dist",
    "chart-high-relevance",
    "chart-relevance-mix",
    "chart-scope-counts",
    "chart-scope-native",
    "chart-generic-share",
    "chart-lifecycle",
    "chart-mean-by-scope",
]


def _chart_ids(round_id):
    return [f"{name}-{round_id}" for name in CHART_NAMES]


def _open_analysis_page(page, base_url):
    page.goto(f"{base_url}/analysis.html")
    page.wait_for_selector("h1:has-text('relevant')")


def _active_panel(page):
    # Scoped to .round-panels so this doesn't also match the source block's
    # #source-result panel below, which carries the same .analysis-card class
    # and is visible by default too (see test_source_block_*.py-style tests
    # further down this file).
    return page.locator(".round-panels .analysis-card:not([hidden])")


SOURCE_CHART_NAMES = ["relevance-dist", "scope-counts", "lifecycle", "mean-by-scope", "generic-split"]


def _source_chart_ids(source_id):
    return [f"src-chart-{name}-{source_id}" for name in SOURCE_CHART_NAMES]


def test_analysis_page_renders_all_charts_with_real_content(page, base_url):
    _open_analysis_page(page, base_url)

    chart_ids = _chart_ids("claude")
    source_chart_ids = _source_chart_ids("aws")  # the source block's default single-source panel
    expect(page.locator("canvas")).to_have_count(len(chart_ids) + len(source_chart_ids) + 1)  # +1 intro
    for chart_id in ["chart-per-source", *chart_ids, *source_chart_ids]:
        expect(page.locator(f"#{chart_id}")).to_be_visible()
        assert canvas_has_content(page, chart_id), f"{chart_id} rendered no visible pixels"


def test_intro_per_source_chart_is_static_and_shared_across_rounds(page, base_url):
    """Guidelines collected per source is a fact about the corpus (data.json),
    not about any round's ratings - every round would report the exact same
    counts - so it lives once in the intro card, unaffected by tab selection."""
    _open_analysis_page(page, base_url)
    intro_chart = page.locator(".analysis-intro #chart-per-source")
    expect(intro_chart).to_be_visible()
    assert canvas_has_content(page, "chart-per-source")

    page.get_by_role("button", name="AI (Sustainability Expert)").click()
    expect(page.locator("#comparison-panel")).to_be_visible()
    expect(page.locator("#chart-per-source")).to_have_count(1)  # still just the one, not duplicated into the comparison panel
    expect(page.locator("#comparison-panel #chart-per-source")).to_have_count(0)


def test_analysis_page_has_three_tabs_with_general_active_by_default(page, base_url):
    # Scoped to [data-round] since the page also has a second tab bar for the
    # source block (10 buttons, "AWS" active by default) using the same .tab class.
    _open_analysis_page(page, base_url)
    expect(page.locator(".tab[data-round]")).to_have_count(3)
    expect(page.locator(".tab[data-round].active")).to_have_text("AI (General)")


def test_round_selector_lives_at_the_top_of_the_results_card(page, base_url):
    # The tab bar sits at the top of the same card as the results (round
    # panels / comparison panel), not in the intro card and not floating
    # unstyled between cards - it stays visible no matter which result shows.
    _open_analysis_page(page, base_url)
    expect(page.locator(".analysis-intro .tabs")).to_have_count(0)

    results_card = page.locator(".card", has=page.locator(".round-panels"))
    expect(results_card).not_to_have_class("analysis-intro")
    expect(results_card.locator(".tabs .tab")).to_have_count(3)
    expect(results_card.locator(".round-panels")).to_have_count(1)
    expect(results_card.locator("#comparison-panel")).to_have_count(1)


def test_round_and_comparison_panels_have_result_headings(page, base_url):
    _open_analysis_page(page, base_url)
    expect(page.locator('.analysis-card[data-round="claude"] h2').first).to_have_text("AI (General) results")

    page.get_by_role("button", name="AI (Sustainability Expert)").click()
    expect(page.locator("#comparison-panel h2").first).to_have_text("Comparing AI (General), AI (Sustainability Expert)")

    page.get_by_role("button", name="AI (BPM Expert)").click()
    expect(page.locator("#comparison-panel h2").first).to_have_text("Comparing AI (General), AI (Sustainability Expert), AI (BPM Expert)")


def test_switching_to_a_single_other_round_still_works_like_a_tab(page, base_url):
    """Deselecting the default round and selecting a different single round
    behaves like the old exclusive-tab UI - single-round view, own charts."""
    _open_analysis_page(page, base_url)

    page.get_by_role("button", name="AI (Sustainability Expert)").click()  # now 2 active (comparison)
    page.get_by_role("button", name="AI (General)").click()  # deselect claude -> back to 1 active

    expect(page).to_have_url(f"{base_url}/analysis.html#sustainability")
    expect(page.locator(".tab[data-round].active")).to_have_text("AI (Sustainability Expert)")
    expect(page.locator("#comparison-panel")).to_be_hidden()

    for chart_id in _chart_ids("sustainability"):
        expect(page.locator(f"#{chart_id}")).to_be_visible()
        assert canvas_has_content(page, chart_id), f"{chart_id} rendered no visible pixels"


MERGED_CHART_IDS = [
    "cmp-chart-relevance-dist", "cmp-chart-scope-counts", "cmp-chart-lifecycle", "cmp-chart-mean-by-scope",
]
SMALL_MULTIPLE_KINDS = ["high-relevance", "relevance-mix", "scope-native", "generic-share"]


def _small_multiple_ids(round_id):
    return [f"cmp-chart-{kind}-{round_id}" for kind in SMALL_MULTIPLE_KINDS]


def test_selecting_two_rounds_shows_the_comparison_panel(page, base_url):
    _open_analysis_page(page, base_url)

    page.get_by_role("button", name="AI (Sustainability Expert)").click()
    expect(page).to_have_url(f"{base_url}/analysis.html#claude+sustainability")

    # Both tabs read as selected; the single-round panels are hidden in favor
    # of the comparison panel.
    expect(page.get_by_role("button", name="AI (General)")).to_have_class("tab active")
    expect(page.get_by_role("button", name="AI (Sustainability Expert)")).to_have_class("tab active")
    expect(page.locator('.analysis-card[data-round="claude"]')).to_be_hidden()
    comparison = page.locator("#comparison-panel")
    expect(comparison).to_be_visible()

    # The 4 merged (one series per round) charts and the 4x2 small-multiple
    # charts (one per round, for the chart types too busy to merge) all
    # actually render pixels, not just exist in the DOM.
    for chart_id in MERGED_CHART_IDS + _small_multiple_ids("claude") + _small_multiple_ids("sustainability"):
        expect(comparison.locator(f"#{chart_id}")).to_be_visible()
        assert canvas_has_content(page, chart_id), f"{chart_id} rendered no visible pixels"
    expect(comparison.locator("canvas")).to_have_count(len(MERGED_CHART_IDS) + 4 * 2)

    # Guideline-level cross-analysis: one agreement heatmap for the pair, plus
    # a table of the guidelines these two rounds disagree on most.
    expect(comparison.locator(".heatmap-table")).to_have_count(1)
    expect(comparison.locator(".heatmap-table thead th")).to_have_count(5)  # blank corner + 4 relevance scores

    spread_table = comparison.locator(".data-table").filter(has_text="Spread")
    expect(spread_table.locator("thead th")).to_have_text(
        ["Source", "Guideline", "AI (General)", "AI (Sustainability Expert)", "Spread"]
    )
    expect(spread_table.locator("tbody tr")).to_have_count(20)


def test_selecting_a_third_round_rebuilds_the_comparison_panel(page, base_url):
    _open_analysis_page(page, base_url)
    page.get_by_role("button", name="AI (Sustainability Expert)").click()
    page.get_by_role("button", name="AI (BPM Expert)").click()

    expect(page).to_have_url(f"{base_url}/analysis.html#claude+sustainability+bpm")
    comparison = page.locator("#comparison-panel")
    expect(comparison.locator("canvas")).to_have_count(len(MERGED_CHART_IDS) + 4 * 3)
    expect(comparison.locator(".heatmap-table")).to_have_count(3)  # one per pair: 3 choose 2


def test_the_only_active_tab_cannot_be_deselected(page, base_url):
    _open_analysis_page(page, base_url)
    # Clicking the sole active tab is a true no-op - it returns before touching
    # location.hash at all, so a default (hash-less) load stays hash-less.
    url_before = page.url
    page.get_by_role("button", name="AI (General)").click()
    expect(page).to_have_url(url_before)
    expect(page.get_by_role("button", name="AI (General)")).to_have_class("tab active")
    expect(page.locator('.analysis-card[data-round="claude"]')).to_be_visible()


def test_analysis_page_legends_present(page, base_url):
    _open_analysis_page(page, base_url)

    legends = _active_panel(page).locator(".chart-legend")
    # relevance-mix, high-relevance-share, scope-native, generic-share
    expect(legends).to_have_count(4)

    high_relevance_card = page.locator(".chart-card", has=page.locator("#chart-high-relevance-claude"))
    expect(high_relevance_card.locator(".chart-legend")).to_contain_text("General source")
    expect(high_relevance_card.locator(".chart-legend")).to_contain_text("BPM-native source")


def test_top_20_table_has_20_rows(page, base_url):
    _open_analysis_page(page, base_url)
    expect(_active_panel(page).locator(".data-table tbody tr")).to_have_count(20)


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


def test_download_full_dataset_link_points_at_this_rounds_json(page, base_url):
    _open_analysis_page(page, base_url)
    link = _active_panel(page).get_by_role("link", name="Download full dataset (JSON)")
    expect(link).to_have_attribute("href", "generated/analysis_claude.json")


def test_completion_screen_link_navigates_to_analysis_page(page, base_url):
    """Integration check: finishing the survey and clicking through actually
    lands on the standalone analysis page, not just a same-page state swap."""
    complete_survey(page, base_url)
    page.get_by_role("link", name="See the guideline analysis").click()
    expect(page).to_have_url(f"{base_url}/analysis.html")
    expect(page.locator("h1")).to_contain_text("relevant")


# --- Source block: a second, independent tab bar below the round results,
# scoped to whichever single round is active above rather than the URL hash
# (see docs/DATA_PIPELINE.md). Sources partition the 448 guidelines rather
# than re-rating them, so its comparison panel has no heatmap/disagreement
# table - just the merged charts and a guideline-level top-rated table. ---

def test_source_block_default_single_source_panel_renders_real_content(page, base_url):
    _open_analysis_page(page, base_url)

    source_tabs = page.locator(".tab[data-source]")
    expect(source_tabs).to_have_count(10)
    expect(page.locator(".tab[data-source].active")).to_have_text("AWS")

    source_panel = page.locator("#source-result")
    expect(source_panel.locator("h2").first).to_have_text("AWS results")
    for chart_id in _source_chart_ids("aws"):
        expect(source_panel.locator(f"#{chart_id}")).to_be_visible()
        assert canvas_has_content(page, chart_id), f"{chart_id} rendered no visible pixels"


def test_source_block_comparison_panel_on_selecting_a_second_source(page, base_url):
    _open_analysis_page(page, base_url)
    page.get_by_role("button", name="Azure", exact=True).click()

    source_panel = page.locator("#source-result")
    expect(source_panel.locator("h2").first).to_have_text("Comparing AWS, Azure")

    merged_ids = [
        "cmp-src-chart-relevance-dist", "cmp-src-chart-scope-counts", "cmp-src-chart-lifecycle",
        "cmp-src-chart-mean-by-scope", "cmp-src-chart-generic-split",
    ]
    for chart_id in merged_ids:
        expect(source_panel.locator(f"#{chart_id}")).to_be_visible()
        assert canvas_has_content(page, chart_id), f"{chart_id} rendered no visible pixels"

    expect(source_panel.locator(".heatmap-table")).to_have_count(0)
    rows = source_panel.locator(".data-table tbody tr")
    count = rows.count()
    assert 0 < count <= 15, f"expected 1-15 top-rated rows, got {count}"


def test_source_block_stays_visible_while_comparing_two_or_more_rounds(page, base_url):
    """Regression test: selecting 2+ rounds above used to hide the source
    block entirely (its charts disappeared). It should instead keep showing
    data for whichever selected round comes first in ANALYSIS_ROUNDS order,
    with a note naming it."""
    _open_analysis_page(page, base_url)
    source_panel = page.locator("#source-result")
    source_note = page.locator("#source-note")
    expect(source_panel).to_be_visible()
    expect(source_note).to_be_hidden()
    for chart_id in _source_chart_ids("aws"):
        assert canvas_has_content(page, chart_id), f"{chart_id} rendered no visible pixels"

    page.get_by_role("button", name="AI (Sustainability Expert)").click()  # 2 rounds active now
    expect(source_panel).to_be_visible()
    expect(source_panel.locator("h2").first).to_have_text("AWS results")
    for chart_id in _source_chart_ids("aws"):
        expect(source_panel.locator(f"#{chart_id}")).to_be_visible()
        assert canvas_has_content(page, chart_id), f"{chart_id} rendered no visible pixels"
    expect(source_note).to_be_visible()
    expect(source_note).to_have_text('Showing sources for "AI (General)" - the first of your 2 selected rounds above.')

    page.get_by_role("button", name="AI (BPM Expert)").click()  # 3 rounds active now
    expect(source_panel).to_be_visible()
    expect(source_note).to_have_text('Showing sources for "AI (General)" - the first of your 3 selected rounds above.')

    # Deselecting the round the block was showing (claude), while another
    # (bpm) stays active alongside sustainability, switches it to the next
    # one in canonical order (sustainability) rather than disappearing.
    page.get_by_role("button", name="AI (General)").click()
    expect(source_panel).to_be_visible()
    expect(source_note).to_have_text('Showing sources for "AI (Sustainability Expert)" - the first of your 2 selected rounds above.')

    page.get_by_role("button", name="AI (Sustainability Expert)").click()  # back to 1 round (bpm)
    expect(source_panel).to_be_visible()
    expect(source_panel.locator("h2").first).to_have_text("AWS results")
    expect(source_note).to_be_hidden()
