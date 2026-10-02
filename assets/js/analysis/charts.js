"use strict";

/* ---------- Chart layer for the analysis page ----------
 * Everything here exists to feed Chart.js: the record -> chart-data
 * aggregations, and the mount- functions that actually construct and
 * instantiate Chart.js configs (mountChart() and everything built on it).
 * No DOM-building lives in this file anymore - chart-dom.js owns the
 * chart-adjacent Preact/htm markup (chartCard, legendDot, the heatmap table,
 * the comparison-panel placeholder grids) that these mounts attach to by
 * canvas id; round-panel.js/comparison-panel.js/source-panel.js build the
 * rest of each panel's non-chart DOM. The color system lives in palette.js
 * (loaded before this file) - this file consumes chartPalette()/
 * roundColor()/sourceColor()/etc. as plain globals rather than making any
 * color decisions of its own. analysis.js is the page controller (fetching/
 * caching round data, tab state, routing). All of them call into each other
 * as plain globals (classic <script> tags, no modules, loaded in the order
 * listed in analysis.html).
 */

const ANALYSIS_SOURCE_ORDER = ["aws", "azure", "gcp", "gsf", "w3c", "ghgprotocol", "gbpp", "ppatterns", "lean", "gbpmbook"];
const SOURCE_SHORT_LABELS = {
  aws: "AWS", azure: "Azure", gcp: "GCP", gsf: "GSF", w3c: "W3C", ghgprotocol: "GHG Protocol",
  gbpp: "GBPP", ppatterns: "ppatterns.app", lean: "Lean", gbpmbook: "Green BPM Book",
};

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

/* ---- Aggregations (mirrors analysis.ipynb's pandas groupbys) - each of
 * these only exists to shape one or more charts' datasets, so they live here
 * rather than in analysis.js/analysis-panels.js (ratedRecords stays in
 * analysis.js and relevanceSpread in analysis-panels.js instead - they feed
 * non-chart display text/tables). ---- */

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

// Single-group version of genericShareBySource - used by the source block,
// where each "group" is already one specific source (or, in the comparison
// panel, one dataset per selected source) rather than all 10 at once.
function genericSplit(records) {
  const rated = records.filter((r) => r.generic);
  const total = rated.length || 1;
  return {
    yes: (rated.filter((r) => r.generic === "Yes").length / total) * 100,
    no: (rated.filter((r) => r.generic === "No").length / total) * 100,
  };
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

/* ---- Chart building blocks shared by a single round's panel and the
 * comparison panel's per-round small multiples ---- */

// These four chart types are already two- or four-series (native/general,
// relevance mix, generic/specific) - see docs/DATA_PIPELINE.md's "Analysis
// page" section for why the comparison panel renders them as one small
// chart per round (small multiples) instead of bolting a 3rd series dimension
// onto an already-busy chart. Factored out so both the single-round panel
// (mountRoundCharts) and the comparison panel (mountSmallMultiples) share one
// implementation.

function mountHighRelevanceChart(canvasId, records, pal) {
  const shortLabels = ANALYSIS_SOURCE_ORDER.map((s) => SOURCE_SHORT_LABELS[s]);
  const nativeSet = new Set(["gbpp", "ppatterns", "lean", "gbpmbook"]);
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
// would report the exact same counts, since every round rates the same 448
// guidelines. So it isn't part of any round panel or the comparison panel;
// it's mounted once, here, into the intro card, fetched straight from
// data.json rather than piggybacking on whichever round happens to load
// first - it stays correct even before any round has loaded.
async function mountIntroSourceChart() {
  const pal = chartPalette();
  const guidelines = await fetchJSON("generated/data.json");
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

// Canvas ids are suffixed per round (chart-relevance-dist-claude, ...) since every
// round's panel stays in the DOM at once (hidden, not destroyed) so switching
// tabs back and forth doesn't need to re-fetch or re-mount Chart.js instances.
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

/* ---- Comparison panel chart/heatmap pieces (2+ rounds selected) ----
 *
 * 1. Merged charts (mountMergedCharts): the four single-series charts from
 *    the round panel (relevance distribution, scope counts, lifecycle
 *    counts, mean relevance by scope) become grouped bars with one dataset
 *    per selected round - a direct "add a series" merge.
 * 2. Small multiples (mountSmallMultiples): the four charts that are already
 *    two- or four-series (native/general split, relevance mix, generic
 *    split) would need a 3rd dimension to merge, which doesn't fit in a bar
 *    chart - so each selected round gets its own copy instead, reusing the
 *    exact same mount functions as the single-round panel.
 * 3. Relevance agreement heatmap (chart-dom.js's heatmapTable, used by
 *    comparison-panel.js's buildHeatmapSection): guideline-level, one
 *    heatmap per pair of selected rounds - only expressible pairwise.
 *
 * (The disagreement table - spreadTableCard - isn't here: it's a plain
 * ranked list, not a chart or a color-coded view, so it lives in
 * comparison-panel.js alongside the rest of the page's non-chart DOM.)
 */

// Shared by the round-comparison panel and the source block's comparison
// panel: both need "the same aggregate charts as a single [round|source],
// with one series per selected [round|source]" - this takes a generic list
// of { id, label } targets plus a recordsFor/colorFor lookup instead of
// assuming rounds, so neither caller needs its own copy of the four chart
// configs. idPrefix keeps each caller's canvas ids distinct (so both panels
// can coexist in the DOM, hidden or not, without id collisions).
// includeGeneric adds a fifth chart (Generic vs. BPM-specific split) - only
// the source panel uses this, since that split is exactly the kind of
// "compare these groups side by side" view the round panel already shows
// per-round elsewhere (mountGenericShareChart, by source).
function mountMergedBarCharts(targets, recordsFor, colorFor, idPrefix, pal, includeGeneric) {
  const legend = { display: true, labels: { color: pal.inkSecondary, boxWidth: 12, font: { size: 11.5 } } };
  const tooltip = baseTooltip(pal);
  const datasetsFor = (getter) => targets.map((t) => ({
    label: t.label, data: getter(recordsFor(t.id)), backgroundColor: colorFor(t), borderRadius: 4,
  }));

  const charts = [
    mountChart(`${idPrefix}-relevance-dist`, {
      type: "bar",
      data: { labels: RELEVANCE_OPTIONS.map((o) => o.label), datasets: datasetsFor(relevanceDistribution) },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend, tooltip },
        scales: { x: baseScaleOptions(pal), y: { ...baseScaleOptions(pal), beginAtZero: true } },
      },
    }),
    mountChart(`${idPrefix}-scope-counts`, {
      type: "bar",
      data: { labels: SCOPE_OPTIONS, datasets: datasetsFor(scopeCounts) },
      options: {
        indexAxis: "y",
        responsive: true, maintainAspectRatio: false,
        plugins: { legend, tooltip },
        scales: { x: { ...baseScaleOptions(pal), beginAtZero: true }, y: baseScaleOptions(pal) },
      },
    }),
    mountChart(`${idPrefix}-lifecycle`, {
      type: "bar",
      data: { labels: [...LIFECYCLE_OPTIONS, "Not Applicable"], datasets: datasetsFor((records) => lifecycleCounts(records).counts) },
      options: {
        indexAxis: "y",
        responsive: true, maintainAspectRatio: false,
        plugins: { legend, tooltip },
        scales: { x: { ...baseScaleOptions(pal), beginAtZero: true }, y: baseScaleOptions(pal) },
      },
    }),
    mountChart(`${idPrefix}-mean-by-scope`, {
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

  if (includeGeneric) {
    charts.push(mountChart(`${idPrefix}-generic-split`, {
      type: "bar",
      data: {
        labels: ["Generic practice", "BPM-specific"],
        datasets: datasetsFor((records) => { const g = genericSplit(records); return [g.yes, g.no]; }),
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend, tooltip: { ...tooltip, callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(0)}%` } } },
        scales: { x: baseScaleOptions(pal), y: { ...baseScaleOptions(pal), beginAtZero: true, max: 100 } },
      },
    }));
  }

  return charts;
}

function mountMergedCharts(activeList, recordsByRound, pal) {
  return mountMergedBarCharts(
    activeList,
    (id) => recordsByRound.get(id),
    (t) => roundColor(t),
    "cmp-chart",
    pal,
    false
  );
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

/* ---- Source block chart pieces -----------------------------------------
 * Drills into specific sources, scoped to whichever single round is active
 * above (see analysis.js's activeRoundForSourceBlock). Reuses the same
 * per-record aggregations as a round panel (minus the charts that are
 * inherently cross-source), plus mountMergedBarCharts for the multi-source
 * comparison case. */

function mountSourceCharts(sourceId, records, pal) {
  const id = (name) => `src-chart-${name}-${sourceId}`;
  const legend = { display: false };
  const tooltip = baseTooltip(pal);

  const relevanceDist = mountChart(id("relevance-dist"), {
    type: "bar",
    data: { labels: RELEVANCE_OPTIONS.map((o) => o.label), datasets: [{ data: relevanceDistribution(records), backgroundColor: pal.relevanceSteps, borderRadius: 4 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend, tooltip },
      scales: { x: baseScaleOptions(pal), y: { ...baseScaleOptions(pal), beginAtZero: true } },
    },
  });

  const scope = mountChart(id("scope-counts"), {
    type: "bar",
    data: { labels: SCOPE_OPTIONS, datasets: [{ data: scopeCounts(records), backgroundColor: pal.single, borderRadius: 4 }] },
    options: {
      indexAxis: "y",
      responsive: true, maintainAspectRatio: false,
      plugins: { legend, tooltip },
      scales: { x: { ...baseScaleOptions(pal), beginAtZero: true }, y: baseScaleOptions(pal) },
    },
  });

  const lc = lifecycleCounts(records);
  const lifecycle = mountChart(id("lifecycle"), {
    type: "bar",
    data: { labels: lc.phases, datasets: [{ data: lc.counts, backgroundColor: pal.single, borderRadius: 4 }] },
    options: {
      indexAxis: "y",
      responsive: true, maintainAspectRatio: false,
      plugins: { legend, tooltip },
      scales: { x: { ...baseScaleOptions(pal), beginAtZero: true }, y: baseScaleOptions(pal) },
    },
  });

  const meanByScope = mountChart(id("mean-by-scope"), {
    type: "bar",
    data: { labels: SCOPE_OPTIONS, datasets: [{ data: meanRelevanceByScope(records), backgroundColor: pal.single, borderRadius: 4 }] },
    options: {
      indexAxis: "y",
      responsive: true, maintainAspectRatio: false,
      plugins: { legend, tooltip },
      scales: { x: { ...baseScaleOptions(pal), beginAtZero: true, max: 3 }, y: baseScaleOptions(pal) },
    },
  });

  const split = genericSplit(records);
  const genericChart = mountChart(id("generic-split"), {
    type: "bar",
    data: { labels: ["Generic practice", "BPM-specific"], datasets: [{ data: [split.yes, split.no], backgroundColor: [pal.muted, pal.strong], borderRadius: 4 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend, tooltip: { ...tooltip, callbacks: { label: (ctx) => `${ctx.parsed.y.toFixed(0)}%` } } },
      scales: { x: baseScaleOptions(pal), y: { ...baseScaleOptions(pal), beginAtZero: true, max: 100 } },
    },
  });

  return [relevanceDist, scope, lifecycle, meanByScope, genericChart];
}

function mountSourceComparisonCharts(activeSourceIds, records, pal) {
  const targets = activeSourceIds.map((id) => ({ id, label: SOURCE_SHORT_LABELS[id] || id }));
  const recordsFor = (id) => records.filter((r) => r.source === id);
  return mountMergedBarCharts(targets, recordsFor, (t) => sourceColor(t.id), "cmp-src-chart", pal, true);
}
