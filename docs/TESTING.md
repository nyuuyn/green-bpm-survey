# Tests

Five headless functional tests (jsdom + a self-hosted static server, no external dependencies
beyond `npm install`), living in `tests/` - one per page, plus a standalone one for the
color system:

- `tests/test_landing.mjs` — index.html is static, so this just parses the markup: all three CTAs
  link to the right page and are styled prominently, no `<script>` tags.
- `tests/test_flow.mjs` — survey.html: boots straight into "About you" (no intro/Start step), that
  screen's validation (including the Role=Other conditional free-text field), the rating-list
  rendering (row count, progress counter), submit validation (blocking Finish on incomplete
  rows), multi-select Scope, the Relevance=0 → Generic disabled/blank behavior, row
  expand/collapse on header click, the Not-Applicable mutual-exclusivity rule, the final
  payload shape, and that the completion screen links to `analysis.html`.
- `tests/test_analysis.mjs` — analysis.html standalone (no survey completion needed): chart/table
  mounting, legends, and that "Home" is a plain link rather than a JS state restore. Chart.js
  itself is stubbed out since jsdom has no `<canvas>` 2D context, so only the surrounding
  DOM/aggregation logic is covered here - see the Playwright suite below for real chart
  rendering.
- `tests/test_guidelines.mjs` — guidelines.html standalone: the wheel renders six wedges/arrows in
  the right order, clicking one opens the popup for that phase (hash-linked), the listed
  guidelines are sorted by relevance, and closing (close button or overlay click) clears it.
  Click events are dispatched directly at the `<path>` elements here - see the Playwright suite
  below for the real-hit-testing regression test this can't cover on its own.
- `tests/test_palette.mjs` — `assets/js/analysis/palette.js` in isolation (no chart/page scaffolding
  needed): both branches of `isDarkMode()`/`chartPalette()`/`greenRamp()` (the other suites only
  ever run in jsdom's default no-`matchMedia` light mode, so dark mode was previously untested
  everywhere) and both sides of `readableTextOn()`'s luminance threshold.

```bash
npm install
npm test
```

### Coverage

```bash
npm run coverage   # c8, gated at 80% lines/branches/functions/statements, scoped to assets/js/**
```

The four page suites load each script as its own `vm.Script` (see `runPageScripts()` in
`tests/test_server.mjs`) rather than `window.eval()`-ing one concatenated string, specifically so
c8/V8 coverage can attribute executed code back to the real file - `window.eval()` runs as an
isolated "Eval" per the spec, which coverage tooling can't map to a source path; `vm.Script` in
the jsdom window's own context runs as a "Script" instead (the same goal a classic `<script>` tag
uses), which both fixes attribution and - as a side effect - is what makes top-level `let`/`const`/
`class` visible across files in the first place, the same as in a real browser.

## End-to-end tests (Playwright)

`tests_e2e/` is a `pytest-playwright` suite that drives the site in a real browser instead of
jsdom - the only way to actually verify the analysis screen's charts render (non-blank
`<canvas>` pixels), the only way to exercise a real file download (the "Download responses"
button), and the only way to catch real pointer-event hit-testing bugs (`test_guidelines_page.py`
is the regression test for the guidelines wheel's label-intercepts-the-click bug - jsdom's
synthetic `dispatchEvent` bypasses hit-testing entirely, so `test_guidelines.mjs` alone couldn't
have caught it). It spins up its own static file server per test session (same as
`npm run serve`, just from Python), so nothing else needs to be running first.

```bash
python -m venv .venv
.venv/Scripts/activate   # or: source .venv/bin/activate on macOS/Linux
pip install -r tests_e2e/requirements.txt
playwright install chromium
pytest                    # or: npm run test:e2e
```

Runs headless by default; add `--headed` to watch it, or `--headed --slowmo=250` to slow it
down. CI (`.github/workflows/test.yml`) runs the data-pipeline check, this suite, and `npm test`
on every push/PR to `main`; `.github/workflows/deploy.yml` only deploys after that workflow
succeeds on a push to `main` (see its file for why deploy is a separate workflow rather than a
job in `test.yml`: cross-workflow `needs` isn't a thing in GitHub Actions, so it listens for
the Test workflow's completion via `workflow_run` instead).

## Data pipeline unit tests (pytest)

`data/tests/` unit-tests `data/generate_data.py` and `data/validate_survey.py` directly - CI's
"Data pipeline" job only ever runs those scripts against the real (already-valid) data and diffs
the output, which proves the checked-in `generated/*.json` is fresh but never exercises an error
path. These tests monkeypatch each module's path/table globals (`GUIDELINES_DIR`, `SOURCES`, ...)
to point at small fixture CSVs under `tmp_path` instead, so every rule from `SURVEY_SCHEMA.md` -
the Generic-blank-at-Relevance-0 rule, the Not-Applicable-must-be-alone rule, single- vs.
multi-mode duplicate handling, coverage reporting, etc. - gets a test that actually breaks it, not
just one that round-trips already-valid data.

Collected by the same `pytest` invocation as the Playwright suite above (`pytest.ini` lists both
`tests_e2e` and `data/tests`, plus `pythonpath = data` so the tests can `import generate_data` /
`import validate_survey` directly) - run `pytest data/tests` instead of bare `pytest` to run just
this half, when you want it fast and without a browser.

```bash
pip install -r tests_e2e/requirements.txt   # pytest-cov is included
npm run coverage:py   # pytest + coverage.py, gated at 80% lines/branches, scoped to data/*.py
```

## Running locally

Pure static files — any local server works:

```bash
npm run serve        # python -m http.server 8123, then open http://localhost:8123
```

(Opening `index.html` directly via `file://` won't work — `fetch("generated/data.json")` requires http.)
