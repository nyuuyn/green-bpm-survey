# Frontend architecture

Three static pages, no build step, no framework.

- **`index.html`** — the landing page. Fully static (no JS): explains the project's goal and
  guideline sources, and links to the other two pages. This is the page people should land on
  first (shared links, GitHub Pages root).
- **`survey.html`** + **`survey.js`** — the rating flow. `generated/data.json` (425 guidelines:
  `id`, `name`, `category`, `reference`, `guideline`, `source`, `sourceLabel`) is fetched on load,
  `SAMPLE_SIZE` (25) of them are sampled, and rating starts immediately - no separate
  intro/Start step, since that content lives on the landing page instead.
- **`analysis.html`** + **`analysis.js`** — the charts, one toggle button per rating round.
  Select a single round to see its own charts, or select two or more to compare them directly
  (merged charts, per-round small multiples, a relevance-agreement heatmap, and a table of the
  guidelines the selected rounds disagree on most). Independently reachable - doesn't require
  taking the survey first. Details: [`DATA_PIPELINE.md`](DATA_PIPELINE.md#analysis-page).
- **`common.js`** — the handful of things `survey.js` and `analysis.js` both need
  (`RELEVANCE_OPTIONS`/`SCOPE_OPTIONS`/`LIFECYCLE_OPTIONS`, the tiny `el()` DOM builder,
  `renderApp()`), loaded before either page script.

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

Then it shows all sampled guidelines as a collapsible list, one row per guideline. Picking a
Relevance score expands that row's remaining fields; rows can be worked in any order and stay
visibly marked (✓ complete / ! invalid after a blocked submit) so progress is legible without
paging through 25 separate screens. Each row collects:

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

## Test mode

`SUBMIT_ENDPOINT` in `survey.js` is currently `null`. In this state, finishing the survey doesn't
submit anywhere — responses are shown on-screen as JSON and downloadable, so the whole flow is
testable without a backend. To go live, deploy a submission backend (Google Apps Script + Sheet)
and set `SUBMIT_ENDPOINT` to its URL.
