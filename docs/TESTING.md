# Tests

Three headless functional tests (jsdom + a self-hosted static server, no external dependencies
beyond `npm install`), one per page - 50 assertions total, living in `tests/`:

- `tests/test_landing.mjs` — index.html is static, so this just parses the markup: both CTAs link
  to the right page and are styled prominently, no `<script>` tags.
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

```bash
npm install
npm test
```

## End-to-end tests (Playwright)

`tests_e2e/` is a `pytest-playwright` suite that drives the site in a real browser instead of
jsdom - the only way to actually verify the analysis screen's charts render (non-blank
`<canvas>` pixels), and the only way to exercise a real file download (the "Download
responses" button). It spins up its own static file server per test session (same as
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

## Running locally

Pure static files — any local server works:

```bash
npm run serve        # python -m http.server 8123, then open http://localhost:8123
```

(Opening `index.html` directly via `file://` won't work — `fetch("generated/data.json")` requires http.)
