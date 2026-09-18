# Survey Schema

Defines the allowed values for the columns in `respondents.csv` and every `guidelines/<source>/survey.csv`. This is the single source of truth for the interview — use it to fill in ratings, and run `validate_survey.py` before committing to catch typos or out-of-range values.

## Two files, two grains

- **`respondents.csv`** (repo root, not per-source) — one row per survey *session*. A session isn't scoped to one source: a single respondent's random sample spans multiple sources at once, so this can't live under `guidelines/<source>/`.
- **`guidelines/<source>/survey.csv`** — one row per *(respondent, guideline)* rating, joined to `respondents.csv` by `RespondentID` and to `guidelines.csv` by `ID`. The same guideline is expected to accumulate rows from multiple respondents over time — `RespondentID` was added specifically so `ID` no longer has to be unique in this file (only the *pair* does). `guidelines/<source>/survey_claude.csv` is the one exception: it's a single complete AI-generated pass, not a pool of sessions, so it keeps the older stricter rules (unique `ID`, full coverage required) — see `validate_survey.py`'s docstring for exactly how the two are told apart. Every row there uses the fixed `RespondentID` `claude`, with a matching row in `respondents.csv`.

## `respondents.csv` columns

| Column | Type | Allowed values | Notes |
|---|---|---|---|
| `RespondentID` | free text | unique per row | the survey frontend's session UUID; `claude` for the AI rating pass |
| `SubmittedAt` | timestamp | ISO 8601, or blank | when the session was submitted |
| `BPM Experience` | categorical | `None`, `Studied it, not in practice`, `Practitioner, < 2 years`, `Practitioner, 2-5 years`, `Practitioner, 5+ years`, `Prefer not to say`, or blank | |
| `Sustainability Experience` | categorical | same enum as `BPM Experience`, or blank | kept as a separate axis from BPM Experience deliberately — someone can be a BPM expert new to sustainability, or the reverse, and conflating the two would hide that disagreement |
| `Role` | free text | not locked to an enum — the frontend offers a fixed list plus a free-text "Other" | must not be empty |

## `guidelines/<source>/survey*.csv` columns

| Column | Type | Allowed values | Notes |
|---|---|---|---|
| `RespondentID` | free text | must match a `RespondentID` in `respondents.csv` | join key to the respondent's background |
| `ID` | free text | must match an `ID` in the corresponding `guidelines.csv` | join key to the guideline being rated |
| `BPM Relevance` | integer | `0`, `1`, `2`, `3` (or blank if not yet rated) | see rubric below |
| `BPM Scope` | categorical, multi-select (comma-separated) | `Process Model`, `Worker/Task`, `Process Data`, `Infrastructure/Platform`, `Organizational/Governance`, or blank | see definitions below. Select every layer the guideline actually acts on — many guidelines touch more than one. **Must be blank when `BPM Relevance` is `0`** (see note below) |
| `Generic` | boolean | `Yes`, `No`, or blank | `Yes` = good general software/cloud practice, not specific to BPM; `No` = the relevance argument is specific to business processes. **Must be blank when `BPM Relevance` is `0`** — if something isn't relevant to BPM at all, there's no BPM argument left to call generic-or-specific |
| `BPM Justification` | free text | open, German or English | the "why" behind the relevance score |
| `BPM Lifecycle` | categorical, multi-select (comma-separated) | `Design`, `Modeling`, `Execution`, `Monitoring`, `Analysis`, `Optimization`, `Not Applicable`, or blank | see definitions below. `Not Applicable` must be used alone, not combined with other phases. **Must be blank when `BPM Relevance` is `0`** (see note below) — distinct from `Not Applicable`, which means "this guideline is relevant to BPM but doesn't map onto any specific lifecycle phase" |

**A blank `BPM Scope` or `BPM Lifecycle` means one of two things depending on `BPM Relevance`:** if `BPM Relevance` is not yet filled in, blank means "not yet rated" (same as every other column). If `BPM Relevance` is `0`, blank is the *required* value — same rule as `Generic`, extended to these two columns: a guideline with zero BPM relevance has no scope or lifecycle argument left to classify either.
| `Discussion` | free text | open | reserved for open follow-up notes/disagreements; currently unused across all sources |

## `BPM Relevance` rubric

Collapsed from an earlier 0–5 scale down to 0–3 (see changelog) — the boundary between `0` and `1` still matters most in practice (it was the split 101-of-239 test-run answers landed on `1` vs. only 4 on `0`), so use it deliberately:

- **0** — Not relevant to BPM at all; the guideline concerns something a process design would never touch (e.g. ML model file formats). `BPM Scope`, `Generic`, and `BPM Lifecycle` are all left blank at this score — see the note under `BPM Scope`/`BPM Lifecycle` above.
- **1** — Low relevance; applies only in a generic software/infrastructure sense, or a BPM connection exists but is a stretch or highly situational.
- **2** — Moderate relevance; clearly applicable in some but not all process contexts, or relevance depends heavily on the use case.
- **3** — High relevance; a clear, common, or core application to process design, modeling, or execution (e.g. region selection, demand-based scaling of orchestrated workers).

## `BPM Scope` definitions

This column was added because the test-run justifications repeatedly reasoned about *which layer* a guideline acts on, without anywhere to record it explicitly (18 of 239 justifications mention "worker" specifically to make this distinction). Select every layer the guideline's recommendation actually changes — some guidelines legitimately touch more than one (e.g. a resource-selection pattern can affect both `Worker/Task` and `Process Model` if the choice is baked into how the process is structured):

- **Process Model** — affects the structure of the process itself: control flow, gateways, timers, task boundaries, sub-processes.
- **Worker/Task** — affects the implementation of an individual task/service invoked by the process (e.g. a service task's backing code or hosting), not the process structure.
- **Process Data** — affects data carried through the process: variables, payloads, documents, process history.
- **Infrastructure/Platform** — affects underlying compute/hosting infrastructure (region, hardware, scaling infra) independent of any specific process or task.
- **Organizational/Governance** — affects policy, culture, roles, or targets rather than a technical artifact.

## `BPM Lifecycle` definitions

Canonical spelling only — the test-run data mixed `Analyse`/`Analysis` (18 vs. 7) and used three different "not applicable" markers (`-`, `None`, blank). Going forward:

- **Design** — strategic/conceptual decisions about how a process should work, before modeling begins.
- **Modeling** — concrete construction of the process model (e.g. BPMN authoring).
- **Execution** — the running/enactment of process instances.
- **Monitoring** — observing running or completed instances (metrics, logs, dashboards).
- **Analysis** — evaluating process data after the fact (mining, reporting, root-cause analysis).
- **Optimization** — using analysis/monitoring findings to improve the process.
- **Not Applicable** — the guideline has no clear tie to any BPM lifecycle phase. Use this alone, never combined with other phases.

## Changelog

- 2026-09-11: Added `BPM Scope` and `Generic` columns; locked `BPM Relevance` and `BPM Lifecycle` to the enums above (previously free text with drift: `Analyse`/`Analysis`, and `-`/`None`/blank all meaning "not applicable").
- 2026-09-14: Removed `Keywords` (forcing raters to invent tags added friction; keyword extraction will instead be done analytically over `Guideline`/`BPM Justification` text after the real interview). Changed `BPM Scope` from single-select to multi-select, matching `BPM Lifecycle`'s pattern, since many guidelines genuinely act on more than one layer. Clarified that `Generic` must be blank when `BPM Relevance` is `0` (a 0-relevance guideline has no BPM argument left to classify as generic-or-specific).
- 2026-09-16: Added `respondents.csv` and a `RespondentID` column on every `survey*.csv` row, to support the real survey (public frontend now live) where multiple respondents rate overlapping guidelines and each session's BPM/sustainability experience and role need to be tied back to their ratings. `ID` is no longer required to be unique in `survey.csv` (only the `(RespondentID, ID)` pair is) — `survey_claude.csv` keeps the old unique-`ID`/full-coverage rules since it's a single complete pass, not a pool of sessions.
- 2026-09-18: Extended the "blank at `BPM Relevance` = `0`" rule from `Generic` alone to also cover `BPM Scope` and `BPM Lifecycle` — the public survey frontend now hides those fields entirely once Relevance is set to `0`, since there's no scope or lifecycle argument left to classify either. Retroactively blanked `BPM Scope`/`BPM Lifecycle` on the 95 existing `survey_claude.csv` rows that had `BPM Relevance` = `0` (previously they carried a forced/arbitrary value), so the AI pass matches what real respondents will submit.
- 2026-09-18: Collapsed `BPM Relevance` from a 0–5 scale to 0–3, done before any real human ratings exist so nothing has to be remapped later. Mapping applied retroactively to all 425 `survey_claude.csv` rows: old `0`→`0`, `{1,2}`→`1`, `3`→`2`, `{4,5}`→`3` (new distribution: `0`:95, `1`:223, `2`:38, `3`:69).
