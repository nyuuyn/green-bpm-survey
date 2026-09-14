# Survey Schema

Defines the allowed values for the columns in every `guidelines/<source>/survey.csv`. This is the single source of truth for the interview — use it to fill in ratings, and run `validate_survey.py` before committing to catch typos or out-of-range values.

## Columns

| Column | Type | Allowed values | Notes |
|---|---|---|---|
| `ID` | free text | must match an `ID` in the corresponding `guidelines.csv` | join key |
| `BPM Relevance` | integer | `0`, `1`, `2`, `3`, `4`, `5` (or blank if not yet rated) | see rubric below |
| `BPM Scope` | categorical, multi-select (comma-separated) | `Process Model`, `Worker/Task`, `Process Data`, `Infrastructure/Platform`, `Organizational/Governance` (or blank if not yet rated) | see definitions below. Select every layer the guideline actually acts on — many guidelines touch more than one |
| `Generic` | boolean | `Yes`, `No`, or blank | `Yes` = good general software/cloud practice, not specific to BPM; `No` = the relevance argument is specific to business processes. **Must be blank when `BPM Relevance` is `0`** — if something isn't relevant to BPM at all, there's no BPM argument left to call generic-or-specific |
| `BPM Justification` | free text | open, German or English | the "why" behind the relevance score |
| `BPM Lifecycle` | categorical, multi-select (comma-separated) | `Design`, `Modeling`, `Execution`, `Monitoring`, `Analysis`, `Optimization`, `Not Applicable` | see definitions below. `Not Applicable` must be used alone, not combined with other phases |
| `Discussion` | free text | open | reserved for open follow-up notes/disagreements; currently unused across all sources |

## `BPM Relevance` rubric

Inferred from how the initial test-run interview actually used the scale (101 of 239 answers landed on `1`, only 4 on `0` — the boundary between them matters, so use it deliberately):

- **0** — Not relevant to BPM at all; the guideline concerns something a process design would never touch (e.g. ML model file formats).
- **1** — Barely relevant; applies only in a generic software/infrastructure sense, no meaningful connection to process design or execution.
- **2** — Weak/indirect relevance; a connection exists but is a stretch or highly situational.
- **3** — Moderate relevance; clearly applicable in some but not all process contexts, or relevance depends heavily on the use case.
- **4** — High relevance; a clear, common application to process design, modeling, or execution.
- **5** — Directly and obviously relevant; a core BPM concern (e.g. region selection, demand-based scaling of orchestrated workers).

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
