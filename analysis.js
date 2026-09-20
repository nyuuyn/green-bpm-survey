"use strict";

/* ---------- Analysis page ----------
 * The Green BPM Guideline is being distilled through multiple survey rounds:
 * three AI-generated passes today (Claude rating the same 425 guidelines
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
 */

const ANALYSIS_ROUNDS = [
  {
    id: "claude",
    label: "AI (General)",
    file: "generated/analysis_claude.json",
    blurb: "An AI-generated preliminary pass with no persona framing: Claude rated all 425 guidelines across 8 sources for BPM relevance, ahead of the human rounds below.",
  },
  {
    id: "sustainability",
    label: "AI (Sustainability Expert)",
    file: "generated/analysis_sustainability.json",
    blurb: "Same 425 guidelines, rated by Claude framed as a sustainability/green-IT expert with only lay BPM exposure - test data exploring how a sustainability-first lens shifts relevance judgments, ahead of a real expert survey.",
  },
  {
    id: "bpm",
    label: "AI (BPM Expert)",
    file: "generated/analysis_bpm.json",
    blurb: "Same 425 guidelines, rated by Claude framed as a BPM expert with only lay sustainability exposure - test data exploring how a process-first lens shifts relevance judgments, ahead of a real expert survey.",
  },
  // Next: an internal expert survey with envite Consulting (BPM, architecture,
  // and sustainability practitioners), then a public survey.
];

const ANALYSIS_SOURCE_ORDER = ["aws", "azure", "gcp", "gsf", "w3c", "gbpp", "ppatterns", "lean"];
const SOURCE_SHORT_LABELS = {
  aws: "AWS", azure: "Azure", gcp: "GCP", gsf: "GSF", w3c: "W3C",
  gbpp: "GBPP", ppatterns: "ppatterns.app", lean: "Lean",
};

function isDarkMode() {
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

// Chart colors. Every chart draws from the same green family as the site's own
// --accent (the envite brand color) rather than an unrelated categorical palette,
// so the analysis page reads as one system with the rest of the site. Two-way
// splits (native/general, generic/specific) use a strong vs. muted step of that
// same green rather than a second hue - each chart's legend/labels carry the
// identity, so a shared hue doesn't cost distinguishability. The comparison
// panel's per-round series reuse relevanceSteps too (see roundColor below),
// for the same reason.
function chartPalette() {
  const dark = isDarkMode();
  return {
    ink: dark ? "#ffffff" : "#0b0b0b",
    inkSecondary: dark ? "#c3c2b7" : "#52514e",
    grid: dark ? "#2c2c2a" : "#e1e0d9",
    axis: dark ? "#383835" : "#c3c2b7",
    tooltipBg: dark ? "#eef0ee" : "#1f1f1f",
    tooltipText: dark ? "#0f1b16" : "#ffffff",
    single: dark ? "#6ccbb2" : "#1e7a5c", // reuses the site's own --accent
    strong: dark ? "#6ccbb2" : "#1e7a5c", // same accent - the "highlighted" side of a 2-way split
    muted: dark ? "#317e6d" : "#a8d9cb", // a lighter/dimmer step of the same green - the baseline side
    relevanceSteps: dark
      ? ["#173a33", "#1f5148", "#317e6d", "#6ccbb2"] // low relevance recedes toward the dark surface
      : ["#d7ede7", "#a8d9cb", "#5fb59b", "#1e7a5c"], // low relevance stays pale on the light surface
  };
}

// Color for one round's series in a merged multi-round chart, or one round's
// heatmap intensity - the darkest/most-saturated relevanceSteps entry first,
// so the round selected first (canonical ANALYSIS_ROUNDS order) reads as the
// most prominent. Keeps the same green family rather than adding new hues.
function roundColor(pal, round) {
  const steps = [...pal.relevanceSteps].reverse();
  const globalIndex = ANALYSIS_ROUNDS.findIndex((r) => r.id === round.id);
  return steps[globalIndex % steps.length];
}

function baseScaleOptions(pal) {
  return {
    grid: { color: pal.grid, drawTicks: false },
    ticks: { color: pal.inkSecondary, font: { size: 11.5 } },
    border: { color: pal.axis },
  };
}

function baseTooltip(pal) {
  return { backgroundColor: pal.tooltipBg, titleColor: pal.tooltipText, bodyColor: pal.tooltipText, padding: 8, cornerRadius: 6 };
}

function mountChart(canvasId, config) {
  return new Chart(document.getElementById(canvasId), config);
}

/* ---- Aggregations (mirrors analysis.ipynb's pandas groupbys) ---- */

function ratedRecords(records) {
  return records.filter((r) => r.relevance !== null && r.relevance !== undefined);
}

function countsPerSource(records) {
  const counts = Object.fromEntries(ANALYSIS_SOURCE_ORDER.map((s) => [s, 0]));
  records.forEach((r) => { counts[r.source] = (counts[r.source] || 0) + 1; });
  return ANALYSIS_SOURCE_ORDER.map((s) => counts[s]);
}

function relevanceDistribution(records) {
  const counts = [0, 0, 0, 0];
  ratedRecords(records).forEach((r) => { counts[r.relevance] += 1; });
  return counts;
}

function highRelevanceShareBySource(records) {
  return ANALYSIS_SOURCE_ORDER.map((source) => {
    const inSource = ratedRecords(records.filter((r) => r.source === source));
    const high = inSource.filter((r) => r.relevance >= 3).length;
    return inSource.length ? (high / inSource.length) * 100 : 0;
  });
}

function relevanceDistributionPerSource(records) {
  // Returns one array per relevance value 0..3, each holding one % per source (stacked-to-100 layout).
  const perRelevance = [[], [], [], []];
  ANALYSIS_SOURCE_ORDER.forEach((source) => {
    const inSource = ratedRecords(records.filter((r) => r.source === source));
    const total = inSource.length || 1;
    for (let rel = 0; rel <= 3; rel++) {
      perRelevance[rel].push((inSource.filter((r) => r.relevance === rel).length / total) * 100);
    }
  });
  return perRelevance;
}

function scopeCounts(records) {
  const counts = Object.fromEntries(SCOPE_OPTIONS.map((s) => [s, 0]));
  records.forEach((r) => r.scope.forEach((s) => { counts[s] += 1; }));
  return SCOPE_OPTIONS.map((s) => counts[s]);
}

function scopeShareByNative(records) {
  const groups = { general: records.filter((r) => !r.bpmNative), native: records.filter((r) => r.bpmNative) };
  const result = {};
  for (const [key, group] of Object.entries(groups)) {
    const rated = ratedRecords(group);
    const denom = rated.length || 1;
    result[key] = SCOPE_OPTIONS.map((scope) => (rated.filter((r) => r.scope.includes(scope)).length / denom) * 100);
  }
  return result;
}

function genericShareBySource(records) {
  const yes = [];
  const no = [];
  ANALYSIS_SOURCE_ORDER.forEach((source) => {
    const rated = records.filter((r) => r.source === source && r.generic);
    const total = rated.length || 1;
    yes.push((rated.filter((r) => r.generic === "Yes").length / total) * 100);
    no.push((rated.filter((r) => r.generic === "No").length / total) * 100);
  });
  return { yes, no };
}

function lifecycleCounts(records) {
  const phases = [...LIFECYCLE_OPTIONS, "Not Applicable"];
  const counts = Object.fromEntries(phases.map((p) => [p, 0]));
  records.forEach((r) => r.lifecycle.forEach((p) => { counts[p] += 1; }));
  return { phases, counts: phases.map((p) => counts[p]) };
}

function meanRelevanceByScope(records) {
  return SCOPE_OPTIONS.map((scope) => {
    const withScope = records.filter((r) => r.scope.includes(scope));
    if (withScope.length === 0) return 0;
    return withScope.reduce((sum, r) => sum + r.relevance, 0) / withScope.length;
  });
}

// Guideline-level cross-tab between two rounds: matrix[a][b] = number of
// guidelines (joined on id) rated "a" by roundA and "b" by roundB. Only
// counts guidelines both rounds actually rated. Feeds the comparison panel's
// agreement heatmap - the diagonal is exact agreement, everything else is a
// disagreement sized by how far off the diagonal it lands.
function relevanceCrossTab(recordsA, recordsB) {
  const byIdB = new Map(recordsB.map((r) => [r.id, r]));
  const matrix = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  recordsA.forEach((ra) => {
    if (ra.relevance === null || ra.relevance === undefined) return;
    const rb = byIdB.get(ra.id);
    if (!rb || rb.relevance === null || rb.relevance === undefined) return;
    matrix[ra.relevance][rb.relevance] += 1;
  });
  return matrix;
}

// Per-guideline relevance spread across N selected rounds (joined on id),
// restricted to guidelines every selected round actually rated - feeds the
// comparison panel's "where these rounds disagree most" table.
function relevanceSpread(activeList, recordsByRound) {
  const byId = new Map();
  activeList.forEach((round) => {
    recordsByRound.get(round.id).forEach((r) => {
      if (!byId.has(r.id)) byId.set(r.id, { id: r.id, name: r.name, source: r.source, perRound: {} });
      byId.get(r.id).perRound[round.id] = r.relevance;
    });
  });
  return [...byId.values()]
    .filter((row) => activeList.every((round) => {
      const v = row.perRound[round.id];
      return v !== null && v !== undefined;
    }))
    .map((row) => {
      const values = activeList.map((round) => row.perRound[round.id]);
      return { ...row, spread: Math.max(...values) - Math.min(...values) };
    })
    .sort((a, b) => b.spread - a.spread)
    .slice(0, 20);
}

/* ---- Chart building blocks shared by a single round's panel and the
 * comparison panel's per-round small multiples ---- */

function chartCard(title, description, canvasId, extra = []) {
  return el("div", { class: "chart-card" }, [
    el("h2", {}, title),
    description ? el("p", { class: "chart-desc" }, description) : null,
    el("div", { class: "chart-wrap" }, el("canvas", { id: canvasId })),
    ...extra,
  ]);
}

function legendDot(color, label) {
  return el("span", { class: "legend-item" }, [
    el("span", { class: "legend-dot", style: `background:${color}` }),
    el("span", {}, label),
  ]);
}

// These four chart types are already two- or four-series (native/general,
// relevance mix, generic/specific) - see docs/DATA_PIPELINE.md's "Analysis
// page" section for why the comparison panel renders them as one small
// chart per round (small multiples) instead of bolting a 3rd series dimension
// onto an already-busy chart. Factored out so both the single-round panel
// (mountRoundCharts) and the comparison panel (mountSmallMultiples) share one
// implementation.

function mountHighRelevanceChart(canvasId, records, pal) {
  const shortLabels = ANALYSIS_SOURCE_ORDER.map((s) => SOURCE_SHORT_LABELS[s]);
  const nativeSet = new Set(["gbpp", "ppatterns", "lean"]);
  return mountChart(canvasId, {
    type: "bar",
    data: {
      labels: shortLabels,
      datasets: [{
        data: highRelevanceShareBySource(records),
        backgroundColor: ANALYSIS_SOURCE_ORDER.map((s) => (nativeSet.has(s) ? pal.strong : pal.muted)),
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { ...baseTooltip(pal), callbacks: { label: (ctx) => `${ctx.parsed.y.toFixed(0)}%` } } },
      scales: { x: baseScaleOptions(pal), y: { ...baseScaleOptions(pal), beginAtZero: true, max: 100 } },
    },
  });
}

function mountRelevanceMixChart(canvasId, records, pal) {
  const shortLabels = ANALYSIS_SOURCE_ORDER.map((s) => SOURCE_SHORT_LABELS[s]);
  const mixPerRelevance = relevanceDistributionPerSource(records);
  return mountChart(canvasId, {
    type: "bar",
    data: {
      labels: shortLabels,
      datasets: RELEVANCE_OPTIONS.map((o, i) => ({
        label: o.label, data: mixPerRelevance[i], backgroundColor: pal.relevanceSteps[i], stack: "mix",
      })),
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { ...baseTooltip(pal), callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(0)}%` } } },
      scales: {
        x: { ...baseScaleOptions(pal), stacked: true },
        y: { ...baseScaleOptions(pal), stacked: true, beginAtZero: true, max: 100 },
      },
    },
  });
}

function mountScopeNativeChart(canvasId, records, pal) {
  const scopeByNative = scopeShareByNative(records);
  return mountChart(canvasId, {
    type: "bar",
    data: {
      labels: SCOPE_OPTIONS,
      datasets: [
        { label: "General source", data: scopeByNative.general, backgroundColor: pal.muted, borderRadius: 3 },
        { label: "BPM-native source", data: scopeByNative.native, backgroundColor: pal.strong, borderRadius: 3 },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { ...baseTooltip(pal), callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.x.toFixed(0)}%` } } },
      scales: { x: { ...baseScaleOptions(pal), beginAtZero: true, max: 100 }, y: baseScaleOptions(pal) },
    },
  });
}

function mountGenericShareChart(canvasId, records, pal) {
  const genericShare = genericShareBySource(records);
  const shortLabels = ANALYSIS_SOURCE_ORDER.map((s) => SOURCE_SHORT_LABELS[s]);
  return mountChart(canvasId, {
    type: "bar",
    data: {
      labels: shortLabels,
      datasets: [
        { label: "Generic practice", data: genericShare.yes, backgroundColor: pal.muted, stack: "gen" },
        { label: "BPM-specific", data: genericShare.no, backgroundColor: pal.strong, stack: "gen" },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { ...baseTooltip(pal), callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(0)}%` } } },
      scales: {
        x: { ...baseScaleOptions(pal), stacked: true },
        y: { ...baseScaleOptions(pal), stacked: true, beginAtZero: true, max: 100 },
      },
    },
  });
}

// "Guidelines collected per source" is a fact about the guideline corpus
// (data.json), not about any round's ratings - every analysis_<round>.json
// would report the exact same counts, since every round rates the same 425
// guidelines. So it isn't part of any round panel or the comparison panel;
// it's mounted once, here, into the intro card, fetched straight from
// data.json rather than piggybacking on whichever round happens to load
// first - it stays correct even before any round has loaded.
async function mountIntroSourceChart() {
  const pal = chartPalette();
  const res = await fetch("generated/data.json");
  const guidelines = await res.json();
  mountChart("chart-per-source", {
    type: "bar",
    data: {
      labels: ANALYSIS_SOURCE_ORDER.map((s) => SOURCE_SHORT_LABELS[s]),
      datasets: [{ data: countsPerSource(guidelines), backgroundColor: pal.single, borderRadius: 4 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: baseTooltip(pal) },
      scales: { x: baseScaleOptions(pal), y: { ...baseScaleOptions(pal), beginAtZero: true } },
    },
  });
}

/* ---- Single-round panel ---- */

// Canvas ids are suffixed per round (chart-relevance-dist-claude, ...) since every
// round's panel stays in the DOM at once (hidden, not destroyed) so switching
// tabs back and forth doesn't need to re-fetch or re-mount Chart.js instances.
function buildRoundPanel(round, records) {
  const pal = chartPalette();
  const id = (name) => `${name}-${round.id}`;
  const totalRated = ratedRecords(records).length;

  const top20 = records
    .filter((r) => r.relevance !== null)
    .slice()
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 20);

  const table = el("div", { class: "table-wrap" }, [
    el("table", { class: "data-table" }, [
      el("thead", {}, el("tr", {}, ["Source", "Guideline", "Relevance", "Scope", "Generic"].map((h) => el("th", {}, h)))),
      el("tbody", {}, top20.map((r) => el("tr", {}, [
        el("td", {}, SOURCE_SHORT_LABELS[r.source] || r.source),
        el("td", {}, r.name),
        el("td", {}, String(r.relevance)),
        el("td", {}, r.scope.join(", ")),
        el("td", {}, r.generic || ""),
      ]))),
    ]),
  ]);

  return el("div", { class: "analysis-card", "data-round": round.id, hidden: true }, [
    el("h2", {}, `${round.label} results`),
    el("div", { class: "btn-row btn-row-end" }, [
      el("a", { class: "ref-link", href: round.file, download: round.file.replace(/^generated\//, "") }, "Download full dataset (JSON) ↓"),
    ]),
    el("p", { class: "intro-lead" }, `${round.blurb} ${totalRated} of 425 guidelines have a rating in this round.`),

    el("div", { class: "analysis-grid" }, [
      chartCard("BPM Relevance — overall", "0 = not relevant to BPM at all, 3 = highly relevant.", id("chart-relevance-dist")),

      chartCard(
        "Share rated highly relevant, by source",
        "Percent of each source's guidelines scoring 3 (highly relevant).",
        id("chart-high-relevance"),
        [el("div", { class: "chart-legend" }, [legendDot(pal.muted, "General source"), legendDot(pal.strong, "BPM-native source")])]
      ),

      chartCard(
        "Relevance mix per source",
        "Full 0–3 breakdown per source, normalized to 100%.",
        id("chart-relevance-mix"),
        [el("div", { class: "chart-legend" }, RELEVANCE_OPTIONS.map((o, i) => legendDot(pal.relevanceSteps[i], o.label)))]
      ),

      chartCard("Which BPM layer do these guidelines touch?", "Count of guidelines acting on each layer (a guideline can touch more than one).", id("chart-scope-counts")),

      chartCard(
        "BPM Scope emphasis — BPM-native vs. general sources",
        "Percent of each group's rated guidelines touching each layer.",
        id("chart-scope-native"),
        [el("div", { class: "chart-legend" }, [legendDot(pal.muted, "General source"), legendDot(pal.strong, "BPM-native source")])]
      ),

      chartCard(
        "Generic best practice vs. BPM-specific, by source",
        "Among rated guidelines: would the same advice apply outside BPM, or is the reasoning process-specific?",
        id("chart-generic-share"),
        [el("div", { class: "chart-legend" }, [legendDot(pal.muted, "Generic practice"), legendDot(pal.strong, "BPM-specific")])]
      ),

      chartCard("BPM Lifecycle phases touched", "Phase mentions across all guidelines (a guideline can span multiple phases).", id("chart-lifecycle")),

      chartCard("Average relevance by BPM layer", "Mean BPM Relevance (0–3) among guidelines that touch each layer.", id("chart-mean-by-scope")),
    ]),

    el("h2", { class: "top-table-heading" }, "Top-rated guidelines"),
    el("p", { class: "chart-desc" }, "The 20 highest-scoring guidelines across all sources, in this round."),
    table,
  ]);
}

function mountRoundCharts(round, records) {
  const pal = chartPalette();
  const id = (name) => `${name}-${round.id}`;
  const legend = { display: false };
  const tooltip = baseTooltip(pal);

  mountChart(id("chart-relevance-dist"), {
    type: "bar",
    data: {
      labels: RELEVANCE_OPTIONS.map((o) => o.label),
      datasets: [{ data: relevanceDistribution(records), backgroundColor: pal.relevanceSteps, borderRadius: 4 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend, tooltip },
      scales: { x: baseScaleOptions(pal), y: { ...baseScaleOptions(pal), beginAtZero: true } },
    },
  });

  mountHighRelevanceChart(id("chart-high-relevance"), records, pal);
  mountRelevanceMixChart(id("chart-relevance-mix"), records, pal);

  mountChart(id("chart-scope-counts"), {
    type: "bar",
    data: { labels: SCOPE_OPTIONS, datasets: [{ data: scopeCounts(records), backgroundColor: pal.single, borderRadius: 4 }] },
    options: {
      indexAxis: "y",
      responsive: true, maintainAspectRatio: false,
      plugins: { legend, tooltip },
      scales: { x: { ...baseScaleOptions(pal), beginAtZero: true }, y: baseScaleOptions(pal) },
    },
  });

  mountScopeNativeChart(id("chart-scope-native"), records, pal);
  mountGenericShareChart(id("chart-generic-share"), records, pal);

  const lc = lifecycleCounts(records);
  mountChart(id("chart-lifecycle"), {
    type: "bar",
    data: { labels: lc.phases, datasets: [{ data: lc.counts, backgroundColor: pal.single, borderRadius: 4 }] },
    options: {
      indexAxis: "y",
      responsive: true, maintainAspectRatio: false,
      plugins: { legend, tooltip },
      scales: { x: { ...baseScaleOptions(pal), beginAtZero: true }, y: baseScaleOptions(pal) },
    },
  });

  mountChart(id("chart-mean-by-scope"), {
    type: "bar",
    data: { labels: SCOPE_OPTIONS, datasets: [{ data: meanRelevanceByScope(records), backgroundColor: pal.single, borderRadius: 4 }] },
    options: {
      indexAxis: "y",
      responsive: true, maintainAspectRatio: false,
      plugins: { legend, tooltip },
      scales: { x: { ...baseScaleOptions(pal), beginAtZero: true, max: 3 }, y: baseScaleOptions(pal) },
    },
  });
}

/* ---- Comparison panel (2+ rounds selected) ----
 *
 * Two kinds of chart here, plus two cross-analysis views that don't exist in
 * single-round mode at all:
 *
 * 1. Merged charts (mountMergedCharts): the four single-series charts from
 *    the round panel (relevance distribution, scope counts, lifecycle
 *    counts, mean relevance by scope) become grouped bars with one dataset
 *    per selected round - a direct "add a series" merge. ("Guidelines
 *    collected per source" isn't here: it's a fact about the guideline
 *    corpus, not about anyone's ratings, so it's identical across every
 *    round - it lives once in the intro card instead, see
 *    mountIntroSourceChart below.)
 * 2. Small multiples (mountSmallMultiples): the four charts that are already
 *    two- or four-series (native/general split, relevance mix, generic
 *    split) would need a 3rd dimension to merge, which doesn't fit in a bar
 *    chart - so each selected round gets its own copy instead, reusing the
 *    exact same mount functions as the single-round panel.
 * 3. Relevance agreement heatmap (buildHeatmapSection): guideline-level,
 *    one heatmap per pair of selected rounds - only expressible pairwise.
 * 4. Disagreement table (spreadTableCard): guidelines ranked by how far
 *    apart the selected rounds' scores land, for spotting outliers.
 */

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function heatCellStyle(pal, t) {
  const [r, g, b] = hexToRgb(pal.single);
  const alpha = t === 0 ? 0 : 0.15 + t * 0.75;
  const color = t > 0.5 ? pal.tooltipText : pal.ink;
  return `background: rgba(${r}, ${g}, ${b}, ${alpha}); color: ${color};`;
}

function heatmapTable(roundA, roundB, recordsByRound, pal) {
  const matrix = relevanceCrossTab(recordsByRound.get(roundA.id), recordsByRound.get(roundB.id));
  const max = Math.max(1, ...matrix.flat());
  const header = el("tr", {}, [el("th", {}, ""), ...RELEVANCE_OPTIONS.map((o) => el("th", {}, o.label))]);
  const rows = RELEVANCE_OPTIONS.map((rowOpt, i) => el("tr", {}, [
    el("th", {}, rowOpt.label),
    ...matrix[i].map((count) => el("td", { style: heatCellStyle(pal, count / max) }, String(count))),
  ]));
  return el("div", { class: "table-wrap" }, el("table", { class: "data-table heatmap-table" }, [el("thead", {}, header), el("tbody", {}, rows)]));
}

function combinations2(list) {
  const pairs = [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) pairs.push([list[i], list[j]]);
  }
  return pairs;
}

function buildHeatmapSection(activeList, recordsByRound, pal) {
  const pairs = combinations2(activeList);
  return el("div", { class: "comparison-section" }, [
    el("h2", { class: "top-table-heading" }, "Relevance agreement between rounds"),
    el("p", { class: "chart-desc" },
      "Each cell counts guidelines that got that pair of relevance scores from both rounds. The " +
      "diagonal (top-left to bottom-right) is where the two rounds agree exactly; cells further " +
      "off it are bigger disagreements."),
    el("div", { class: "analysis-grid" }, pairs.map(([a, b]) => el("div", { class: "chart-card" }, [
      el("h2", {}, `${a.label} vs ${b.label}`),
      el("p", { class: "chart-desc" }, `Rows: ${a.label} score. Columns: ${b.label} score.`),
      heatmapTable(a, b, recordsByRound, pal),
    ]))),
  ]);
}

function spreadTableCard(activeList, recordsByRound) {
  const rows = relevanceSpread(activeList, recordsByRound);
  const table = el("div", { class: "table-wrap" }, [
    el("table", { class: "data-table" }, [
      el("thead", {}, el("tr", {}, [
        el("th", {}, "Source"), el("th", {}, "Guideline"),
        ...activeList.map((round) => el("th", {}, round.label)),
        el("th", {}, "Spread"),
      ])),
      el("tbody", {}, rows.map((row) => el("tr", {}, [
        el("td", {}, SOURCE_SHORT_LABELS[row.source] || row.source),
        el("td", {}, row.name),
        ...activeList.map((round) => el("td", {}, String(row.perRound[round.id]))),
        el("td", {}, String(row.spread)),
      ]))),
    ]),
  ]);

  return el("div", { class: "comparison-section" }, [
    el("h2", { class: "top-table-heading" }, "Guidelines where these rounds disagree most"),
    el("p", { class: "chart-desc" },
      `Among guidelines rated in all ${activeList.length} selected rounds, ranked by the largest ` +
      "gap between the highest and lowest relevance score given."),
    table,
  ]);
}

function buildMergedGrid(activeList) {
  return el("div", { class: "analysis-grid" }, [
    chartCard("BPM Relevance — overall", "0 = not relevant to BPM at all, 3 = highly relevant, compared across the selected rounds.", "cmp-chart-relevance-dist"),
    chartCard("Which BPM layer do these guidelines touch?", "Count of guidelines acting on each layer, compared across the selected rounds.", "cmp-chart-scope-counts"),
    chartCard("BPM Lifecycle phases touched", "Phase mentions across all guidelines, compared across the selected rounds.", "cmp-chart-lifecycle"),
    chartCard("Average relevance by BPM layer", "Mean BPM Relevance (0–3) among guidelines that touch each layer, compared across the selected rounds.", "cmp-chart-mean-by-scope"),
  ]);
}

function mountMergedCharts(activeList, recordsByRound, pal) {
  const legend = { display: true, labels: { color: pal.inkSecondary, boxWidth: 12, font: { size: 11.5 } } };
  const tooltip = baseTooltip(pal);
  const datasetsFor = (getter) => activeList.map((round) => ({
    label: round.label, data: getter(recordsByRound.get(round.id)), backgroundColor: roundColor(pal, round), borderRadius: 4,
  }));

  return [
    mountChart("cmp-chart-relevance-dist", {
      type: "bar",
      data: { labels: RELEVANCE_OPTIONS.map((o) => o.label), datasets: datasetsFor(relevanceDistribution) },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend, tooltip },
        scales: { x: baseScaleOptions(pal), y: { ...baseScaleOptions(pal), beginAtZero: true } },
      },
    }),
    mountChart("cmp-chart-scope-counts", {
      type: "bar",
      data: { labels: SCOPE_OPTIONS, datasets: datasetsFor(scopeCounts) },
      options: {
        indexAxis: "y",
        responsive: true, maintainAspectRatio: false,
        plugins: { legend, tooltip },
        scales: { x: { ...baseScaleOptions(pal), beginAtZero: true }, y: baseScaleOptions(pal) },
      },
    }),
    mountChart("cmp-chart-lifecycle", {
      type: "bar",
      data: { labels: [...LIFECYCLE_OPTIONS, "Not Applicable"], datasets: datasetsFor((records) => lifecycleCounts(records).counts) },
      options: {
        indexAxis: "y",
        responsive: true, maintainAspectRatio: false,
        plugins: { legend, tooltip },
        scales: { x: { ...baseScaleOptions(pal), beginAtZero: true }, y: baseScaleOptions(pal) },
      },
    }),
    mountChart("cmp-chart-mean-by-scope", {
      type: "bar",
      data: { labels: SCOPE_OPTIONS, datasets: datasetsFor(meanRelevanceByScope) },
      options: {
        indexAxis: "y",
        responsive: true, maintainAspectRatio: false,
        plugins: { legend, tooltip },
        scales: { x: { ...baseScaleOptions(pal), beginAtZero: true, max: 3 }, y: baseScaleOptions(pal) },
      },
    }),
  ];
}

function buildSmallMultiples(activeList) {
  const section = (title, description, kind) => el("div", { class: "comparison-section" }, [
    el("h2", { class: "top-table-heading" }, title),
    el("p", { class: "chart-desc" }, description),
    el("div", { class: "analysis-grid" }, activeList.map((round) => chartCard(round.label, null, `cmp-chart-${kind}-${round.id}`))),
  ]);

  return el("div", {}, [
    section("Share rated highly relevant, by source", "Percent of each source's guidelines scoring 3 (highly relevant) - one chart per selected round.", "high-relevance"),
    section("Relevance mix per source", "Full 0–3 breakdown per source, normalized to 100% - one chart per selected round.", "relevance-mix"),
    section("BPM Scope emphasis — BPM-native vs. general sources", "Percent of each group's rated guidelines touching each layer - one chart per selected round.", "scope-native"),
    section("Generic best practice vs. BPM-specific, by source", "Among rated guidelines: would the same advice apply outside BPM, or is the reasoning process-specific? One chart per selected round.", "generic-share"),
  ]);
}

function mountSmallMultiples(activeList, recordsByRound, pal) {
  return activeList.flatMap((round) => {
    const records = recordsByRound.get(round.id);
    return [
      mountHighRelevanceChart(`cmp-chart-high-relevance-${round.id}`, records, pal),
      mountRelevanceMixChart(`cmp-chart-relevance-mix-${round.id}`, records, pal),
      mountScopeNativeChart(`cmp-chart-scope-native-${round.id}`, records, pal),
      mountGenericShareChart(`cmp-chart-generic-share-${round.id}`, records, pal),
    ];
  });
}

function buildComparisonPanel(activeList, recordsByRound, pal) {
  const downloadRow = el("div", { class: "btn-row btn-row-end" },
    activeList.map((round) => el("a", { class: "ref-link", href: round.file, download: round.file.replace(/^generated\//, "") }, `${round.label} data ↓`))
  );

  return el("div", { class: "analysis-card" }, [
    el("h2", {}, `Comparing ${activeList.length} rounds`),
    downloadRow,
    el("p", { class: "intro-lead" }, `${activeList.map((r) => r.label).join(", ")}.`),

    el("h2", { class: "top-table-heading" }, "Combined charts"),
    el("p", { class: "chart-desc" }, "The same aggregate charts as a single round, with one series per selected round."),
    buildMergedGrid(activeList),

    buildSmallMultiples(activeList),
    buildHeatmapSection(activeList, recordsByRound, pal),
    spreadTableCard(activeList, recordsByRound),
  ]);
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

async function ensureRoundLoaded(round) {
  if (!recordsByRound.has(round.id)) {
    const res = await fetch(round.file);
    recordsByRound.set(round.id, await res.json());
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
    panel.replaceWith(buildRoundPanel(round, records));
    mountRoundCharts(round, records);
    // Re-query since replaceWith swapped the panel node out from under panelsEl's children.
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
  comparisonEl.replaceChildren(buildComparisonPanel(activeList, recordsByRound, pal));
  comparisonCharts = [
    ...mountMergedCharts(activeList, recordsByRound, pal),
    ...mountSmallMultiples(activeList, recordsByRound, pal),
  ];
}

async function render() {
  [...tabsEl.children].forEach((tab) => {
    const active = activeRounds.has(tab.dataset.round);
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-pressed", String(active));
  });

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

function buildPage() {
  activeRounds = roundsFromHash();

  tabsEl = el("div", { class: "tabs", role: "group", "aria-label": "Rounds to analyze - select one, or two or more to compare" },
    ANALYSIS_ROUNDS.map((round) =>
      el("button", {
        class: "tab", type: "button", "data-round": round.id, "aria-pressed": "false",
        onclick: () => toggleRound(round.id),
      }, round.label)
    )
  );

  panelsEl = el("div", { class: "round-panels" },
    ANALYSIS_ROUNDS.map((round) => el("div", { class: "analysis-card", "data-round": round.id, hidden: true },
      el("p", { class: "intro-lead" }, "Loading…")
    ))
  );

  comparisonEl = el("div", { id: "comparison-panel", class: "analysis-card", hidden: true });

  renderApp(
    el("div", { class: "card analysis-intro" }, [
      el("h1", {}, "How relevant is this guidance to BPM?"),
      el("p", { class: "intro-lead" },
        "The Green BPM Guideline is being distilled through multiple rounds of rating. The three " +
        "AI tabs below are Claude rating the same 425 guidelines under different framings " +
        "(general, sustainability-expert, BPM-expert) - test data previewing where those " +
        "perspectives are likely to disagree, ahead of an internal expert survey with envite " +
        "Consulting and eventually a public survey. Select one tab to see that round on its own, " +
        "or select two or more to compare them directly."),
      el("div", { class: "analysis-grid" }, [
        chartCard(
          "Guidelines collected per source",
          "How the 425 guidelines are distributed across sources - the same regardless of which round(s) you select below.",
          "chart-per-source"
        ),
      ]),
    ]),
    el("div", { class: "card" }, [
      tabsEl,
      panelsEl,
      comparisonEl,
    ])
  );

  mountIntroSourceChart();
  render();
  window.addEventListener("hashchange", () => {
    activeRounds = roundsFromHash();
    render();
  });
}

buildPage();
