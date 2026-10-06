"""lifecycle.html is the one place in the frontend that needs real pointer-event
hit-testing (the wedge label text sits visually on top of its clickable <path> -
see lifecycle.css's `pointer-events: none` on .lifecycle-wedge-icon/-label),
which jsdom's synthetic dispatchEvent() can't catch (tests/test_lifecycle.mjs
dispatches straight at the element). This suite clicks the wedges the way a
real user would, so it's the one that actually proves the click target works.
"""
import re

from playwright.sync_api import expect

PHASES = ["Design", "Modeling", "Execution", "Monitoring", "Analysis", "Optimization"]


def _expect_no_hash(page, base_url):
    # location.hash = "" leaves a trailing "#" in the address bar in real
    # browsers (a harmless, well-known quirk) - phaseFromHash() in
    # lifecycle.js treats that the same as no hash at all either way.
    expect(page).to_have_url(re.compile(rf"^{re.escape(base_url)}/lifecycle\.html#?$"))


def _open_lifecycle_page(page, base_url):
    page.goto(f"{base_url}/lifecycle.html")
    page.wait_for_selector("svg.lifecycle-wheel")


def test_wheel_renders_six_phases_in_order(page, base_url):
    _open_lifecycle_page(page, base_url)
    expect(page.locator("path.lifecycle-wedge")).to_have_count(6)
    expect(page.locator(".lifecycle-wedge-label")).to_have_text(PHASES)


def test_clicking_a_wedge_opens_a_popup_of_relevant_guidelines(page, base_url):
    """Real click (not a synthetic dispatchEvent) - this is the regression test
    for the wedge-label-intercepts-the-click bug (fixed via pointer-events:
    none in lifecycle.css)."""
    _open_lifecycle_page(page, base_url)

    page.locator("path.lifecycle-wedge").first.click()
    expect(page).to_have_url(f"{base_url}/lifecycle.html#Design")

    popup = page.locator(".popup-card")
    expect(popup).to_be_visible()
    expect(popup.locator("h2")).to_contain_text("Design")

    items = popup.locator(".popup-guideline")
    count = items.count()
    assert 0 < count <= 6, f"expected 1-6 guidelines, got {count}"
    for i in range(count):
        item = items.nth(i)
        expect(item.locator(".popup-guideline-name")).not_to_have_text("")
        expect(item.locator(".popup-guideline-score")).not_to_have_text("")
        expect(item.locator("a.ref-link")).to_be_visible()


def test_popup_updates_in_place_when_navigating_the_hash_to_a_different_phase(page, base_url):
    """The popup overlay (position: fixed, full viewport) sits on top of the
    wheel while open - by design, a real user has to close it before clicking
    a different wedge, same as any modal. What this test actually covers is
    that re.render() swaps the popup's content in place (not a second stacked
    popup) when the active phase changes - exercised via the hash, the same
    mechanism a wedge click uses under the hood."""
    _open_lifecycle_page(page, base_url)

    page.locator("path.lifecycle-wedge").first.click()  # Design
    expect(page.locator(".popup-card h2")).to_contain_text("Design")

    page.evaluate("location.hash = 'Monitoring'")
    expect(page).to_have_url(f"{base_url}/lifecycle.html#Monitoring")
    expect(page.locator(".popup-card h2")).to_contain_text("Monitoring")
    expect(page.locator(".popup-card")).to_have_count(1)  # updated in place, not stacked


def test_closing_the_popup_via_close_button_clears_the_hash(page, base_url):
    _open_lifecycle_page(page, base_url)
    page.locator("path.lifecycle-wedge").first.click()
    expect(page.locator(".popup-card")).to_be_visible()

    page.locator(".popup-close").click()
    _expect_no_hash(page, base_url)
    expect(page.locator(".popup-card")).to_have_count(0)


def test_closing_the_popup_via_overlay_click(page, base_url):
    _open_lifecycle_page(page, base_url)
    page.locator("path.lifecycle-wedge").first.click()
    expect(page.locator(".popup-card")).to_be_visible()

    # Click the overlay itself, away from the card.
    page.locator(".popup-overlay").click(position={"x": 5, "y": 5})
    expect(page.locator(".popup-card")).to_have_count(0)


def test_direct_link_to_a_phase_opens_its_popup_on_load(page, base_url):
    page.goto(f"{base_url}/lifecycle.html#Execution")
    expect(page.locator(".popup-card h2")).to_contain_text("Execution")


def test_header_breadcrumb_and_nav_links(page, base_url):
    _open_lifecycle_page(page, base_url)
    expect(page.locator(".crumb-current")).to_have_text("Lifecycle")

    expect(page.get_by_role("link", name="analysis page")).to_have_attribute("href", "analysis.html")

    page.locator("a.brand").click()
    expect(page).to_have_url(f"{base_url}/index.html")


def test_landing_page_links_to_lifecycle_guide(page, base_url):
    page.goto(f"{base_url}/index.html")
    link = page.get_by_role("link", name="Browse the lifecycle guide")
    expect(link).to_have_attribute("href", "lifecycle.html")
    link.click()
    expect(page).to_have_url(f"{base_url}/lifecycle.html")


def test_analysis_page_links_to_lifecycle_guide(page, base_url):
    page.goto(f"{base_url}/analysis.html")
    link = page.get_by_role("link", name="lifecycle guide")
    expect(link).to_have_attribute("href", "lifecycle.html")
