"use strict";

/* ---------- Analysis page ----------
 * The Green BPM Guideline is being distilled through multiple survey rounds:
 * three AI-generated passes today (Claude rating the same 448 guidelines
 * under a general / sustainability-expert / BPM-expert framing - test data
 * exploring how much persona shifts relevance judgments), then an internal
 * expert survey (envite Consulting - BPM, architecture, and sustainability
 * practitioners), and eventually a public survey. Each round gets its own
 * analysis_<round>.json (generated the same way as data.json - see
 * data/generate_data.py) and its own tab here, so this page never looks like
 * it's presenting one pass as the final word.
 *
 * Adding a round later is: extend data/generate_data.py to emit
 * analysis_<round>.json, add one entry to ANALYSIS_ROUNDS below.
 *
 * Tabs are toggles, not a radio group: selecting exactly one round shows its
 * own panel (the original single-round view, unchanged); selecting two or
 * more switches to a comparison panel instead - see "Page: tab bar..." below.
 *
 * This file is the page controller: fetching/caching round data, tab state,
 * and hash routing - deciding *which* panel to build/mount, and when. That
 * orchestration logic (the caches/Sets/memoization keys below) stays plain
 * module state and functions, same as before - only the actual DOM-building
 * is Preact/htm now: the TabBar component here, one component-per-file for
 * each panel (round-panel.js, comparison-panel.js, source-panel.js), and the
 * chart-card/legend/heatmap/grid builders in chart-dom.js. Each panel's wrapper div
 * (built once in buildPage(), carrying its .analysis-card class/id/
 * data-round/hidden state) is never replaced - this file calls
 * preactRender(vnode, thatDiv) into it instead of the old
 * replaceWith()/replaceChildren() + attribute-mutation. Every file here
 * calls into the others as plain globals (classic <script> tags, no
 * modules, loaded in the order listed in analysis.html - this controller
 * last, since its buildPage() call at the bottom is what starts the page),
 * same as they all call into common.js's html/preactRender (and, for the
 * handful of spots that stay plain DOM shells, el()/renderApp()).
 * ANALYSIS_SOURCE_ORDER/SOURCE_SHORT_LABELS are defined in charts.js (used by
 * table labels here and in the panel files too) since most of their other
 * uses are chart-only.
 */

const ANALYSIS_ROUNDS = [
  {
    id: "claude",
    label: "AI (General)",
    file: "generated/analysis_claude.json",
    blurb: "An AI-generated preliminary pass with no persona framing: Claude rated all 448 guidelines across 10 sources for BPM relevance, ahead of the human rounds below.",
  },
  {
    id: "sustainability",
    label: "AI (Sustainability Expert)",
    file: "generated/analysis_sustainability.json",
    blurb: "Same 448 guidelines, rated by Claude framed as a sustainability/green-IT expert with only lay BPM exposure - test data exploring how a sustainability-first lens shifts relevance judgments, ahead of a real expert survey.",
  },
  {
    id: "bpm",
    label: "AI (BPM Expert)",
    file: "generated/analysis_bpm.json",
    blurb: "Same 448 guidelines, rated by Claude framed as a BPM expert with only lay sustainability exposure - test data exploring how a process-first lens shifts relevance judgments, ahead of a real expert survey.",
  },
  // Next: an internal expert survey with envite Consulting (BPM, architecture,
  // and sustainability practitioners), then a public survey.
];

function ratedRecords(records) {
  return records.filter((r) => r.relevance !== null && r.relevance !== undefined);
}

// Shared by the round tab bar and the source tab bar below - both are "a row
// of toggle buttons bound to a Set of active ids," just with a different
// data-attribute name (round() picks the per-round ramp color; source tabs
// pass sourceColor wrapped to take the same (item) shape). Re-rendered (via
// preactRender) every time render()/renderSourceBlock() runs, rather than
// owning any state of its own - activeRounds/activeSources stay plain
// module-level Sets, same as before.
function TabBar({ items, active, colorFor, dataAttr, onToggle }) {
  return items.map((item) => {
    const isActive = active.has(item.id);
    const color = colorFor(item);
    return html`
      <button type="button" class=${`tab${isActive ? " active" : ""}`} ...${{ [`data-${dataAttr}`]: item.id }}
        aria-pressed=${String(isActive)}
        style=${`--tab-accent:${color}; --tab-accent-contrast:${readableTextOn(color)};`}
        onClick=${() => onToggle(item.id)}
      >${item.label}</button>
    `;
  });
}

/* ---- Page: tab bar, single-round panels, and the multi-round comparison ----
 *
 * The hash encodes the selected round ids joined by "+" (e.g.
 * "#claude+bpm"), so a specific comparison is linkable/shareable the same
 * way a single round already was.
 */

const recordsByRound = new Map();
const loadedSinglePanels = new Set();
let comparisonCharts = [];
let lastComparisonKey = null;
let activeRounds = new Set();
let tabsEl, panelsEl, comparisonEl;

// Source block state - independent of the round hash (see docs/DATA_PIPELINE.md),
// always scoped to whichever single round is active above.
let activeSources = new Set([ANALYSIS_SOURCE_ORDER[0]]);
let sourceCharts = [];
let lastSourceKey = null;
let sourceTabsEl, sourceNoteEl, sourceResultEl;

async function ensureRoundLoaded(round) {
  if (!recordsByRound.has(round.id)) {
    recordsByRound.set(round.id, await fetchJSON(round.file));
  }
  return recordsByRound.get(round.id);
}

function roundsFromHash() {
  const ids = location.hash.replace(/^#/, "").split("+").filter(Boolean);
  const valid = ids.filter((id) => ANALYSIS_ROUNDS.some((r) => r.id === id));
  return new Set(valid.length ? valid : [ANALYSIS_ROUNDS[0].id]);
}

async function ensureSinglePanelShown(id) {
  if (!loadedSinglePanels.has(id)) {
    loadedSinglePanels.add(id);
    const round = ANALYSIS_ROUNDS.find((r) => r.id === id);
    const records = await ensureRoundLoaded(round);
    const panel = panelsEl.querySelector(`[data-round="${id}"]`);
    panel.replaceChildren(); // clear the plain-DOM "Loading…" placeholder before Preact's first mount into it
    preactRender(html`<${RoundPanelContent} round=${round} records=${records} />`, panel);
    mountRoundCharts(round, records);
  }
  panelsEl.querySelector(`[data-round="${id}"]`).hidden = false;
}

async function renderComparison(activeList) {
  const key = activeList.map((r) => r.id).sort().join(",");
  if (key === lastComparisonKey) return;
  lastComparisonKey = key;

  await Promise.all(activeList.map((round) => ensureRoundLoaded(round)));

  comparisonCharts.forEach((c) => c.destroy());
  comparisonCharts = [];

  const pal = chartPalette();
  preactRender(html`<${ComparisonPanelContent} activeList=${activeList} recordsByRound=${recordsByRound} pal=${pal} />`, comparisonEl);
  comparisonCharts = [
    ...mountMergedCharts(activeList, recordsByRound, pal),
    ...mountSmallMultiples(activeList, recordsByRound, pal),
  ];
}

async function render() {
  // Pressed state uses the same per-round color as its chart legend/series
  // (roundColor) instead of a flat accent, so the button tells you which
  // series is "yours" at a glance.
  preactRender(html`<${TabBar} items=${ANALYSIS_ROUNDS} active=${activeRounds} colorFor=${roundColor} dataAttr="round" onToggle=${toggleRound} />`, tabsEl);

  if (activeRounds.size === 1) {
    lastComparisonKey = null;
    comparisonEl.hidden = true;
    const id = [...activeRounds][0];
    [...panelsEl.children].forEach((panel) => { panel.hidden = panel.dataset.round !== id; });
    await ensureSinglePanelShown(id);
  } else {
    [...panelsEl.children].forEach((panel) => { panel.hidden = true; });
    comparisonEl.hidden = false;
    const activeList = ANALYSIS_ROUNDS.filter((r) => activeRounds.has(r.id));
    await renderComparison(activeList);
  }

  await renderSourceBlock();
}

function toggleRound(id) {
  if (activeRounds.has(id)) {
    if (activeRounds.size === 1) return; // always keep at least one round selected
    activeRounds.delete(id);
  } else {
    activeRounds.add(id);
  }
  location.hash = [...activeRounds].join("+");
  render();
}

// The source block always shows data for exactly one round - picking the
// first currently-active round in canonical ANALYSIS_ROUNDS order, so it's
// deterministic regardless of click order - rather than trying to support
// both axes of comparison (round x source) at once. See docs/DATA_PIPELINE.md.
// It never hides: selecting more rounds above just keeps it on whichever of
// them comes first, with a note explaining that.
function activeRoundForSourceBlock() {
  return ANALYSIS_ROUNDS.find((r) => activeRounds.has(r.id));
}

const SOURCE_TAB_ITEMS = ANALYSIS_SOURCE_ORDER.map((id) => ({ id, label: SOURCE_SHORT_LABELS[id] }));

async function renderSourceBlock() {
  // Pressed state uses the same per-source color as its chart legend/series
  // (sourceColor) instead of a flat accent - see the matching round-tab logic in render().
  preactRender(html`<${TabBar} items=${SOURCE_TAB_ITEMS} active=${activeSources} colorFor=${(item) => sourceColor(item.id)} dataAttr="source" onToggle=${toggleSource} />`, sourceTabsEl);

  const round = activeRoundForSourceBlock();
  const records = recordsByRound.get(round.id);
  if (!records) return; // not loaded yet - render() awaits this before calling in

  sourceResultEl.hidden = false;
  if (activeRounds.size > 1) {
    sourceNoteEl.hidden = false;
    sourceNoteEl.textContent = `Showing sources for "${round.label}" - the first of your ${activeRounds.size} selected rounds above.`;
  } else {
    sourceNoteEl.hidden = true;
  }

  const sourceIds = [...activeSources];
  const key = `${round.id}|${sourceIds.slice().sort().join(",")}`;
  if (key === lastSourceKey) return;
  lastSourceKey = key;

  sourceCharts.forEach((c) => c.destroy());
  const pal = chartPalette();

  if (sourceIds.length === 1) {
    const sourceId = sourceIds[0];
    const filtered = records.filter((r) => r.source === sourceId);
    preactRender(html`<${SourcePanelContent} sourceId=${sourceId} records=${filtered} />`, sourceResultEl);
    sourceCharts = mountSourceCharts(sourceId, filtered, pal);
  } else {
    preactRender(html`<${SourceComparisonPanelContent} activeSourceIds=${sourceIds} records=${records} />`, sourceResultEl);
    sourceCharts = mountSourceComparisonCharts(sourceIds, records, pal);
  }
}

function toggleSource(id) {
  if (activeSources.has(id)) {
    if (activeSources.size === 1) return; // always keep at least one source selected
    activeSources.delete(id);
  } else {
    activeSources.add(id);
  }
  renderSourceBlock();
}

function buildPage() {
  activeRounds = roundsFromHash();

  // Tab bars are empty shells here - render()/renderSourceBlock() (called
  // below, and on every toggle) fill them via preactRender(<${TabBar} .../>).
  tabsEl = el("div", { class: "tabs", role: "group", "aria-label": "Rounds to analyze - select one, or two or more to compare" });

  panelsEl = el("div", { class: "round-panels" },
    ANALYSIS_ROUNDS.map((round) => el("div", { class: "analysis-card", "data-round": round.id, hidden: true },
      el("p", { class: "intro-lead" }, "Loading…")
    ))
  );

  comparisonEl = el("div", { id: "comparison-panel", class: "analysis-card", hidden: true });

  sourceTabsEl = el("div", { class: "tabs", role: "group", "aria-label": "Guideline sources to analyze - select one, or two or more to compare" });
  sourceNoteEl = el("p", { id: "source-note", class: "intro-lead", hidden: true }, "");
  sourceResultEl = el("div", { id: "source-result", class: "analysis-card" });

  const introChartGridEl = el("div", { class: "analysis-grid" });

  renderApp(
    el("div", { class: "card analysis-intro" }, [
      el("h1", {}, "How relevant are the guidelines to BPM?"),
      el("p", { class: "intro-lead" },
        "The Green BPM Guideline is being distilled through multiple rounds of rating. The three " +
        "AI tabs below are Claude rating the same 448 guidelines under different framings " +
        "(general, sustainability-expert, BPM-expert) - test data previewing where those " +
        "perspectives are likely to disagree, ahead of an internal expert survey with envite " +
        "Consulting and eventually a public survey. Select one tab to see that round on its own, " +
        "or select two or more to compare them directly."),
      introChartGridEl,
    ]),
    el("div", { class: "card" }, [
      tabsEl,
      panelsEl,
      comparisonEl,
    ]),
    el("div", { class: "card" }, [
      el("h2", {}, "How do the guideline sources compare?"),
      el("p", { class: "intro-lead" },
        "Always scoped to one round - if multiple are selected above, this shows the first of " +
        "them. Select one source to see it on its own, or select two or more to compare them " +
        "directly."),
      sourceTabsEl,
      sourceNoteEl,
      sourceResultEl,
    ])
  );

  // The one chartCard() use that isn't inside a Preact-rendered panel -
  // mounted once, directly, since the intro card never changes after this.
  preactRender(chartCard(
    "Guidelines collected per source",
    "How the 448 guidelines are distributed across sources - the same regardless of which round(s) you select below.",
    "chart-per-source"
  ), introChartGridEl);

  mountIntroSourceChart();
  render();
  window.addEventListener("hashchange", () => {
    activeRounds = roundsFromHash();
    render();
  });
}

buildPage();
