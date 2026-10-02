"use strict";

/* ---------- Comparison panel (2+ rounds selected) ----------
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
 *
 * Renders only the panel's CONTENT - comparisonEl (built once in
 * analysis.js's buildPage()) already carries the .analysis-card class and
 * id, and gets fully re-rendered (via preactRender) every time the
 * selected-round set changes.
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
  return html`
    <div class="comparison-section">
      <h2 class="top-table-heading">Relevance agreement between rounds</h2>
      <p class="chart-desc">
        Each cell counts guidelines that got that pair of relevance scores from both rounds. The
        diagonal (top-left to bottom-right) is where the two rounds agree exactly; cells further
        off it are bigger disagreements.
      </p>
      <div class="analysis-grid">
        ${pairs.map(([a, b]) => html`
          <div class="chart-card">
            <h2>${a.label} vs ${b.label}</h2>
            <p class="chart-desc">Rows: ${a.label} score. Columns: ${b.label} score.</p>
            ${heatmapTable(a, b, recordsByRound, pal)}
          </div>
        `)}
      </div>
    </div>
  `;
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
  return html`
    <div class="comparison-section">
      <h2 class="top-table-heading">Guidelines where these rounds disagree most</h2>
      <p class="chart-desc">
        Among guidelines rated in all ${activeList.length} selected rounds, ranked by the largest
        gap between the highest and lowest relevance score given.
      </p>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Source</th><th>Guideline</th>
              ${activeList.map((round) => html`<th>${round.label}</th>`)}
              <th>Spread</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => html`
              <tr>
                <td>${SOURCE_SHORT_LABELS[row.source] || row.source}</td>
                <td>${row.name}</td>
                ${activeList.map((round) => html`<td>${row.perRound[round.id]}</td>`)}
                <td>${row.spread}</td>
              </tr>
            `)}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function ComparisonPanelContent({ activeList, recordsByRound, pal }) {
  return html`
    <h2>Comparing ${activeList.map((r) => r.label).join(", ")}</h2>
    <div class="btn-row btn-row-end">
      ${activeList.map((round) => html`<a class="ref-link" href=${round.file} download=${round.file.replace(/^generated\//, "")}>${round.label} data ↓</a>`)}
    </div>

    <h2 class="top-table-heading">Combined charts</h2>
    <p class="chart-desc">The same aggregate charts as a single round, with one series per selected round.</p>
    ${buildMergedGrid(activeList)}

    ${buildSmallMultiples(activeList, pal)}
    ${buildHeatmapSection(activeList, recordsByRound, pal)}
    ${spreadTableCard(activeList, recordsByRound)}
  `;
}
