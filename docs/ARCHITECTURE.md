# Frontend architecture

Three static pages, no build step. The pages live at the repo root; every script and stylesheet
below lives under `assets/js/` and `assets/css/` respectively (images under `assets/img/`) —
filenames are given without that prefix here for brevity.

- **`index.html`** — the landing page. Fully static (no JS): explains the project's goal and
  guideline sources, and links to the other two pages. This is the page people should land on
  first (shared links, GitHub Pages root).
- **`survey.html`** — the rating flow, built from `assets/js/survey/`.
- **`analysis.html`** — the charts, built from `assets/js/analysis/`.

## Preact + htm, no build step

Both `survey.html` and `analysis.html` render their screens with
[Preact](https://preactjs.com/) + [htm](https://github.com/developit/htm) instead of hand-rolled
DOM building. Preact gives declarative, auto-re-rendering components (`useState`-driven, like
React); htm gives JSX-like markup via tagged template literals (`` html`<div>...</div>` ``)
instead of JSX, so there's no compiler step. Both ship as plain UMD builds vendored into
`assets/js/vendor/` (`preact.min.js`, `preact-hooks.umd.js`, `htm.umd.js`), loaded via classic
`<script>` tags ahead of everything else — same "no bundler, no npm install for production"
model the rest of the site uses (Chart.js is loaded the same way, from a CDN). `preact` is pinned
to `10.28.4`, the last release before `11.0.0` dropped the UMD build in favor of ESM-only.

`assets/js/common.js` sets this up once, shared by both pages:

```js
const { h, render: preactRender } = window.preact;
const { useState, useRef } = window.preactHooks;
const html = window.htm.bind(h);
window.preact.options.debounceRendering = (render) => render();
```

The last line forces every re-render to happen **synchronously** instead of Preact's default
(batching `setState` into a microtask). Without it, a state change wouldn't show up in the DOM
until a tick later, which would make an interaction like "pick a relevance score" not immediately
reflect in the UI (or in a test's next assertion) the way the old imperative code did. This is a
global setting — it affects every Preact component on either page, not just one screen.

`common.js` also still has the older, non-Preact helpers both pages keep using for the handful of
screens/spots that don't need componentized state: `el()` (a tiny hyperscript-style DOM builder),
`renderApp()` (`#app.replaceChildren(...)`), and `fetchJSON()`. The survey's completion screen
(`renderComplete` in `survey.js`) is the main example — it's built once, never re-rendered, so a
Preact component would buy it nothing.

**Mounting convention.** Each screen-level function (`renderRespondentInfo`, `renderRatingList`,
etc.) is responsible for cleanly unmounting whatever was in `#app` before mounting itself:

```js
preactRender(null, app); // unmount whatever was there before (safe no-op if nothing was mounted)
preactRender(html`<${SomeScreen} />`, app);
```

This matters because `#app`'s children sometimes come from `preactRender` and sometimes from
`renderApp()`'s plain DOM replacement — mixing the two without explicitly unmounting first can
leave Preact's internal tracking pointing at DOM nodes that were removed out from under it by the
other path. On the analysis page, panels are mounted into **stable, pre-existing wrapper divs**
(built once in `buildPage()`, carrying the `.analysis-card` class/id/`hidden` state) rather than
replaced wholesale — `preactRender(vnode, thatDiv)` re-renders in place, which is both simpler and
avoids the unmount dance entirely for panels that only ever render via Preact.

## File layout

Each page's screens are split one-component-per-file, with a slim **controller** file (same name
as the page) that owns shared config/state/orchestration and is loaded *last* — its `boot()` /
`buildPage()` call at the bottom is what actually starts the page, so everything it calls must
already be loaded.

```
assets/js/
  common.js              shared vocab (RELEVANCE_OPTIONS/SCOPE_OPTIONS/LIFECYCLE_OPTIONS), el()/
                          renderApp()/fetchJSON(), the Preact+htm setup above
  vendor/                 preact.min.js, preact-hooks.umd.js, htm.umd.js (vendored UMD builds)

  survey/
    rating-row.js           RatingRow component - one guideline's rating fields
    respondent-info-form.js RespondentInfoForm component + renderRespondentInfo()/collectRespondentInfo()
    rating-list.js          RespondentSummary + RatingList components + renderRatingList()
    survey.js               controller: config, `state`, validateRowAnswer/buildAnswerRecord,
                             the completion screen (renderComplete, plain el()/renderApp() - see
                             above), and boot() (loaded last)

  analysis/
    palette.js              color system (chartPalette/roundColor/sourceColor/readableTextOn) -
                             pure functions, no DOM
    charts.js                Chart.js mounts (mountChart and everything built on it) + the
                             record -> chart-data aggregation functions. No DOM-building here.
    chart-dom.js             chart-adjacent Preact/htm markup: chartCard(), legendDot(), the
                              relevance-agreement heatmap table, and the comparison-panel
                              placeholder grids (buildMergedGrid/buildSmallMultiples/
                              buildSourceMergedGrid) - the DOM these mounts attach to by canvas id
    round-panel.js           RoundPanelContent - a single round's results
    comparison-panel.js      ComparisonPanelContent + its heatmap/disagreement-table helpers -
                              2+ rounds selected
    source-panel.js          SourcePanelContent + SourceComparisonPanelContent - the source block
    analysis.js               controller: ANALYSIS_ROUNDS, round/source caching, tab state, hash
                               routing, the TabBar component, and buildPage() (loaded last)
```

Every file in a page's folder calls into the others as plain globals - classic `<script>` tags,
no modules, loaded in the order listed in `survey.html`/`analysis.html` (which matches the lists
above). A real browser shares one global scope across all of them; the jsdom unit tests
(`tests/test_flow.mjs`, `tests/test_analysis.mjs`) replicate this by `eval()`-ing every file's
source in one call, in the same order, since each `eval()` call would otherwise get its own
isolated top-level scope even on the same `window`.

**Why this split, not something else.** The controller/component split follows the actual seam in
the code - "decides *which* screen/panel to show and when" vs. "renders one screen/panel" - rather
than a generic MVC-style model/view/controller folder scheme. The latter doesn't actually fit:
there's no persistent model layer or router, and `charts.js`'s chart-mounting code is genuinely
both data-shaping (the aggregation functions) and view (it builds canvas DOM) at once, so forcing
it into separate model/view folders would split closely-related code apart for no real gain. The
two pages don't share any components, so splitting by page first (not by role first) keeps
everything one page needs in one place.

## The survey flow

Before rating starts, an **"About you"** screen collects respondent background — separately
from personal data, and not used to identify anyone:

- **BPM experience** (None / studied it / practitioner at a few duration bands)
- **Sustainability/green-IT experience** — a *separate* axis from BPM experience, since the
  two are independent (a BPM expert can be new to sustainability and vice versa)
- **Role** (Process Analyst, Developer, Consultant, Researcher, Student, etc., or a free-text
  "Other")

These answers are saved to `localStorage` (`greenBpmSurvey.respondentInfo` in `survey.js`) as
soon as they're submitted. On a later visit in the same browser — e.g. clicking "Start another
round" on the Thank-you screen, which just does `location.reload()` — `boot()` finds the saved
answers and skips "About you" entirely, going straight to a freshly-sampled rating list (each
round still gets its own `sessionId` and its own sample of guidelines; only the background
questions are reused). The rating list shows a small summary of the remembered answers with a
"Not you? Edit your info" link that returns to "About you" prefilled with those same answers
(rather than blank) in case someone's background changed or was entered wrong - submitting that
form again overwrites what's stored.

This exists so ratings can later be checked for whether BPM/sustainability background
actually changes what gets rated as relevant, rather than treating every rating as equally
authoritative regardless of who gave it. It's stored once per session (in the payload's
`respondent` object), not repeated per guideline.

Then it shows all sampled guidelines as a collapsible list, one row per guideline (`RatingRow`).
Picking a Relevance score expands that row's remaining fields; rows can be worked in any order and
stay visibly marked (✓ complete / ! invalid after a blocked submit) so progress is legible without
paging through 10 separate screens. Each row collects:

- **BPM Relevance** (0–3)
- **BPM Scope** — multi-select, since many guidelines act on more than one layer
- **Generic** (Yes/No) — automatically disabled and left blank when Relevance is 0, since
  there's no BPM argument left to classify as generic-or-specific at that point
- **BPM Lifecycle** (multi-select, with "Not Applicable" enforced as mutually exclusive)
- optional free-text **Justification**

Keywords are deliberately *not* collected — that's done analytically over the guideline text
after the real survey, not by asking respondents to invent tags. This is the same schema as
[`../data/SURVEY_SCHEMA.md`](../data/SURVEY_SCHEMA.md) — keep both in sync if you change one
(they're now the same repo, so there's no cross-repo drift risk left, just don't forget the
other file).

Row state (`answers`/`expandedRows`/`invalidRows`) is lifted into the `RatingList` component
(standard Preact/React "parent owns the list, child reports changes via a callback" pattern) -
`RatingRow` itself holds no state of its own.

## Test mode

`SUBMIT_ENDPOINT` in `survey.js` is currently `null`. In this state, finishing the survey doesn't
submit anywhere — responses are shown on-screen as JSON and downloadable, so the whole flow is
testable without a backend. To go live, deploy a submission backend (Google Apps Script + Sheet)
and set `SUBMIT_ENDPOINT` to its URL.
