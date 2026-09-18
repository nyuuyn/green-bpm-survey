"use strict";

/* ---------- Analysis page ----------
 * The Green BPM Guideline is being distilled through multiple survey rounds:
 * three AI-generated passes today (Claude rating the same 425 guidelines
 * under a general / sustainability-expert / BPM-expert framing - test data
 * exploring how much persona shifts relevance judgments), then an internal
 * expert survey (envite Consulting - BPM, architecture, and sustainability
 * practitioners), and eventually a public survey. Each round gets its own
 * analysis_<round>.json (generated the same way as data.json - see the
 * private repo's generate_analysis_json.py) and its own tab here, so this
 * page never looks like it's presenting one pass as the final word.
 *
 * Adding a round later is: generate analysis_<round>.json, copy it into this
 * repo, add one entry to ANALYSIS_ROUNDS below.
 */

const ANALYSIS_ROUNDS = [
  {
    id: "claude",
    label: "AI (General)",
    file: "analysis_claude.json",
    blurb: "An AI-generated preliminary pass with no persona framing: Claude rated all 425 guidelines across 8 sources for BPM relevance, ahead of the human rounds below.",
  },
  {
    id: "sustainability",
    label: "AI (Sustainability Expert)",
    file: "analysis_sustainability.json",
    blurb: "Same 425 guidelines, rated by Claude framed as a sustainability/green-IT expert with only lay BPM exposure - test data exploring how a sustainability-first lens shifts relevance judgments, ahead of a real expert survey.",
  },
  {
    id: "bpm",
    label: "AI (BPM Expert)",
    file: "analysis_bpm.json",
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
// identity, so a shared hue doesn't cost distinguishability.
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

/* ---- Per-round panel ---- */

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

// Canvas ids are suffixed per round (chart-per-source-claude, ...) since every
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

  return el("div", { class: "card analysis-card", "data-round": round.id, hidden: true }, [
    el("div", { class: "btn-row btn-row-end" }, [
      el("a", { class: "ref-link", href: round.file, download: round.file }, "Download full dataset (JSON) ↓"),
    ]),
    el("p", { class: "intro-lead" }, `${round.blurb} ${totalRated} of 425 guidelines have a rating in this round.`),

    el("div", { class: "analysis-grid" }, [
      chartCard("Guidelines collected per source", "How the 425 guidelines are distributed across sources.", id("chart-per-source")),

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
  const shortLabels = ANALYSIS_SOURCE_ORDER.map((s) => SOURCE_SHORT_LABELS[s]);
  const legend = { display: false };
  const tooltip = baseTooltip(pal);

  mountChart(id("chart-per-source"), {
    type: "bar",
    data: { labels: shortLabels, datasets: [{ data: countsPerSource(records), backgroundColor: pal.single, borderRadius: 4 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend, tooltip },
      scales: { x: baseScaleOptions(pal), y: { ...baseScaleOptions(pal), beginAtZero: true } },
    },
  });

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

  const nativeSet = new Set(["gbpp", "ppatterns", "lean"]);
  mountChart(id("chart-high-relevance"), {
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
      plugins: { legend, tooltip: { ...tooltip, callbacks: { label: (ctx) => `${ctx.parsed.y.toFixed(0)}%` } } },
      scales: { x: baseScaleOptions(pal), y: { ...baseScaleOptions(pal), beginAtZero: true, max: 100 } },
    },
  });

  const mixPerRelevance = relevanceDistributionPerSource(records);
  mountChart(id("chart-relevance-mix"), {
    type: "bar",
    data: {
      labels: shortLabels,
      datasets: RELEVANCE_OPTIONS.map((o, i) => ({
        label: o.label, data: mixPerRelevance[i], backgroundColor: pal.relevanceSteps[i], stack: "mix",
      })),
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend, tooltip: { ...tooltip, callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(0)}%` } } },
      scales: {
        x: { ...baseScaleOptions(pal), stacked: true },
        y: { ...baseScaleOptions(pal), stacked: true, beginAtZero: true, max: 100 },
      },
    },
  });

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

  const scopeByNative = scopeShareByNative(records);
  mountChart(id("chart-scope-native"), {
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
      plugins: { legend, tooltip: { ...tooltip, callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.x.toFixed(0)}%` } } },
      scales: { x: { ...baseScaleOptions(pal), beginAtZero: true, max: 100 }, y: baseScaleOptions(pal) },
    },
  });

  const genericShare = genericShareBySource(records);
  mountChart(id("chart-generic-share"), {
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
      plugins: { legend, tooltip: { ...tooltip, callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(0)}%` } } },
      scales: {
        x: { ...baseScaleOptions(pal), stacked: true },
        y: { ...baseScaleOptions(pal), stacked: true, beginAtZero: true, max: 100 },
      },
    },
  });

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

/* ---- Page: tab bar + lazy-loaded round panels ---- */

const loadedRounds = new Set();

function roundFromHash() {
  const id = location.hash.replace(/^#/, "");
  return ANALYSIS_ROUNDS.find((r) => r.id === id) ? id : ANALYSIS_ROUNDS[0].id;
}

async function activateRound(id, tabsEl, panelsEl) {
  [...tabsEl.children].forEach((tab) => tab.classList.toggle("active", tab.dataset.round === id));
  [...panelsEl.children].forEach((panel) => { panel.hidden = panel.dataset.round !== id; });

  if (loadedRounds.has(id)) return;
  loadedRounds.add(id);

  const round = ANALYSIS_ROUNDS.find((r) => r.id === id);
  const panel = panelsEl.querySelector(`[data-round="${id}"]`);
  const res = await fetch(round.file);
  const records = await res.json();

  panel.replaceWith(buildRoundPanel(round, records));
  mountRoundCharts(round, records);
  // Re-query since replaceWith swapped the panel node out from under panelsEl's children.
  panelsEl.querySelector(`[data-round="${id}"]`).hidden = false;
}

function buildPage() {
  const tabsEl = el("div", { class: "tabs", role: "tablist" },
    ANALYSIS_ROUNDS.map((round) =>
      el("button", {
        class: "tab", type: "button", "data-round": round.id,
        onclick: () => {
          location.hash = round.id;
          activateRound(round.id, tabsEl, panelsEl);
        },
      }, round.label)
    )
  );

  const panelsEl = el("div", { class: "round-panels" },
    ANALYSIS_ROUNDS.map((round) => el("div", { class: "card analysis-card", "data-round": round.id, hidden: true },
      el("p", { class: "intro-lead" }, "Loading…")
    ))
  );

  renderApp(
    el("div", { class: "card analysis-intro" }, [
      el("h1", {}, "How relevant is this guidance to BPM?"),
      el("p", { class: "intro-lead" },
        "The Green BPM Guideline is being distilled through multiple rounds of rating. The three " +
        "AI tabs below are Claude rating the same 425 guidelines under different framings " +
        "(general, sustainability-expert, BPM-expert) - test data previewing where those " +
        "perspectives are likely to disagree, ahead of an internal expert survey with envite " +
        "Consulting and eventually a public survey. Each tab is rated and analyzed " +
        "independently - switch between them to compare."),
    ]),
    tabsEl,
    panelsEl
  );

  activateRound(roundFromHash(), tabsEl, panelsEl);
  window.addEventListener("hashchange", () => activateRound(roundFromHash(), tabsEl, panelsEl));
}

buildPage();
