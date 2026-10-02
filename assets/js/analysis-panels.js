"use strict";

/* ---------- Analysis page: panel & table builders ----------
 * The non-chart DOM for each of the page's results views - the single-round
 * panel, the multi-round comparison panel (plus its heatmap and disagreement
 * table), and the source block's single-source/multi-source panels. Each
 * builder lays out chartCard() placeholders (from charts.js) for its charts
 * and builds any plain data tables itself. analysis.js owns the page
 * controller that decides *which* of these to build and mount, when, and
 * calls into these as plain globals - same as these call into charts.js and
 * common.js's el().
 */

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
    el("p", { class: "intro-lead" }, `${round.blurb} ${totalRated} of ${records.length} guidelines have a rating in this round.`),

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

/* ---- Comparison panel (2+ rounds selected) ----
 *
 * Two kinds of chart, plus two cross-analysis views that don't exist in
 * single-round mode at all - see charts.js for the merged-chart/small-
 * multiple/heatmap implementations this panel assembles:
 *
 * 1. Merged charts (charts.js's mountMergedCharts): the four single-series
 *    charts from the round panel become grouped bars with one dataset per
 *    selected round.
 * 2. Small multiples (charts.js's mountSmallMultiples): the four
 *    already-multi-series charts get one copy per selected round instead.
 * 3. Relevance agreement heatmap (buildHeatmapSection below, using charts.js's
 *    heatmapTable): guideline-level, one heatmap per pair of selected rounds.
 * 4. Disagreement table (spreadTableCard below): guidelines ranked by how far
 *    apart the selected rounds' scores land, for spotting outliers.
 */

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

// Per-guideline relevance spread across N selected rounds (joined on id),
// restricted to guidelines every selected round actually rated - feeds
// spreadTableCard below.
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

function buildComparisonPanel(activeList, recordsByRound, pal) {
  const downloadRow = el("div", { class: "btn-row btn-row-end" },
    activeList.map((round) => el("a", { class: "ref-link", href: round.file, download: round.file.replace(/^generated\//, "") }, `${round.label} data ↓`))
  );

  return el("div", { class: "analysis-card" }, [
    el("h2", {}, `Comparing ${activeList.map((r) => r.label).join(", ")}`),
    downloadRow,

    el("h2", { class: "top-table-heading" }, "Combined charts"),
    el("p", { class: "chart-desc" }, "The same aggregate charts as a single round, with one series per selected round."),
    buildMergedGrid(activeList),

    buildSmallMultiples(activeList, pal),
    buildHeatmapSection(activeList, recordsByRound, pal),
    spreadTableCard(activeList, recordsByRound),
  ]);
}

/* ---- Source block ----
 *
 * Drills into specific sources, scoped to whichever single round is active
 * above (see currentRoundRecordsIfSingle). Unlike the round comparison
 * above, sources partition the 448 guidelines rather than re-rating the same
 * set, so there's no guideline-level "did these two sources agree" question
 * to ask - no heatmap, no disagreement table. Instead: a single-source panel
 * (reusing the same per-record aggregations as a round panel, minus the
 * charts that are inherently cross-source) and a comparison panel that
 * reuses mountMergedBarCharts with one series per selected source, plus a
 * guideline-level top-rated table restricted to the selected sources.
 */

const SOURCE_TOP_N_SINGLE = 10;
const SOURCE_TOP_N_COMPARISON = 15;

function topGuidelinesTable(rows, { includeSourceColumn }) {
  const headers = [...(includeSourceColumn ? ["Source"] : []), "Guideline", "Relevance", "Scope", "Generic"];
  return el("div", { class: "table-wrap" }, [
    el("table", { class: "data-table" }, [
      el("thead", {}, el("tr", {}, headers.map((h) => el("th", {}, h)))),
      el("tbody", {}, rows.map((r) => el("tr", {}, [
        ...(includeSourceColumn ? [el("td", {}, SOURCE_SHORT_LABELS[r.source] || r.source)] : []),
        el("td", {}, r.name),
        el("td", {}, String(r.relevance)),
        el("td", {}, r.scope.join(", ")),
        el("td", {}, r.generic || ""),
      ]))),
    ]),
  ]);
}

function buildSourcePanel(sourceId, records) {
  const pal = chartPalette();
  const id = (name) => `src-chart-${name}-${sourceId}`;
  const totalRated = ratedRecords(records).length;
  const top = records.filter((r) => r.relevance !== null && r.relevance !== undefined)
    .slice().sort((a, b) => b.relevance - a.relevance).slice(0, SOURCE_TOP_N_SINGLE);

  return el("div", { class: "analysis-card" }, [
    el("h2", {}, `${SOURCE_SHORT_LABELS[sourceId] || sourceId} results`),
    el("p", { class: "intro-lead" }, `${totalRated} of ${records.length} guidelines from this source have a rating in the active round.`),

    el("div", { class: "analysis-grid" }, [
      chartCard("BPM Relevance", "0 = not relevant to BPM at all, 3 = highly relevant.", id("relevance-dist")),
      chartCard("Which BPM layer do these guidelines touch?", "Count of guidelines acting on each layer (a guideline can touch more than one).", id("scope-counts")),
      chartCard("BPM Lifecycle phases touched", "Phase mentions across this source's guidelines.", id("lifecycle")),
      chartCard("Average relevance by BPM layer", "Mean BPM Relevance (0–3) among this source's guidelines that touch each layer.", id("mean-by-scope")),
      chartCard(
        "Generic best practice vs. BPM-specific",
        "Among rated guidelines from this source: would the same advice apply outside BPM, or is the reasoning process-specific?",
        id("generic-split"),
        [el("div", { class: "chart-legend" }, [legendDot(pal.muted, "Generic practice"), legendDot(pal.strong, "BPM-specific")])]
      ),
    ]),

    el("h2", { class: "top-table-heading" }, "Top-rated guidelines"),
    el("p", { class: "chart-desc" }, "The highest-scoring guidelines in this source, in the active round."),
    topGuidelinesTable(top, { includeSourceColumn: false }),
  ]);
}

function topTableForSources(activeSourceIds, records) {
  const idSet = new Set(activeSourceIds);
  const rows = records
    .filter((r) => idSet.has(r.source) && r.relevance !== null && r.relevance !== undefined)
    .slice().sort((a, b) => b.relevance - a.relevance).slice(0, SOURCE_TOP_N_COMPARISON);

  return el("div", { class: "comparison-section" }, [
    el("h2", { class: "top-table-heading" }, "Top-rated guidelines among selected sources"),
    el("p", { class: "chart-desc" }, `The ${SOURCE_TOP_N_COMPARISON} highest-scoring guidelines among the selected sources, in the active round.`),
    topGuidelinesTable(rows, { includeSourceColumn: true }),
  ]);
}

function buildSourceComparisonPanel(activeSourceIds, records) {
  const labels = activeSourceIds.map((id) => SOURCE_SHORT_LABELS[id] || id);
  return el("div", { class: "analysis-card" }, [
    el("h2", {}, `Comparing ${labels.join(", ")}`),
    el("h2", { class: "top-table-heading" }, "Combined charts"),
    el("p", { class: "chart-desc" }, "The same aggregate charts as a single source, with one series per selected source."),
    buildSourceMergedGrid(),
    topTableForSources(activeSourceIds, records),
  ]);
}
