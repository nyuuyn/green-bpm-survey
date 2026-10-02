"use strict";

/* ---------- Analysis page: chart-adjacent DOM ----------
 * The Preact/htm builders that lay out a chart's surrounding markup -
 * chartCard() (the canvas + title/description/legend wrapper every chart
 * sits in), legendDot(), the relevance-agreement heatmap table, and the
 * placeholder grids for the comparison panel's merged charts and small
 * multiples. None of these touch Chart.js itself - charts.js owns every
 * actual `new Chart(...)` mount and the record-aggregation functions that
 * feed them; this file only builds the DOM those mounts attach to
 * (by canvas id) and the couple of chart-adjacent views (the heatmap) that
 * are just a color-coded <table>, not a Chart.js instance. round-panel.js/
 * comparison-panel.js/source-panel.js call into these as plain globals,
 * same as they call into charts.js and common.js's html/preactRender.
 */

function chartCard(title, description, canvasId, extra = []) {
  return html`
    <div class="chart-card">
      <h2>${title}</h2>
      ${description ? html`<p class="chart-desc">${description}</p>` : null}
      <div class="chart-wrap"><canvas id=${canvasId}></canvas></div>
      ${extra}
    </div>
  `;
}

function legendDot(color, label) {
  return html`
    <span class="legend-item">
      <span class="legend-dot" style=${`background:${color}`}></span>
      <span>${label}</span>
    </span>
  `;
}

// Background/text color for one heatmapTable cell, scaled by t (0..1 = that
// cell's count relative to the matrix's max) - reuses pal.single (the site's
// own accent) rather than a separate heatmap palette, so this still reads as
// part of the same green system as every other chart.
function heatCellStyle(pal, t) {
  const [r, g, b] = hexToRgb(pal.single);
  const alpha = t === 0 ? 0 : 0.15 + t * 0.75;
  const color = t > 0.5 ? pal.tooltipText : pal.ink;
  return `background: rgba(${r}, ${g}, ${b}, ${alpha}); color: ${color};`;
}

function heatmapTable(roundA, roundB, recordsByRound, pal) {
  const matrix = relevanceCrossTab(recordsByRound.get(roundA.id), recordsByRound.get(roundB.id));
  const max = Math.max(1, ...matrix.flat());
  return html`
    <div class="table-wrap">
      <table class="data-table heatmap-table">
        <thead>
          <tr><th></th>${RELEVANCE_OPTIONS.map((o) => html`<th>${o.label}</th>`)}</tr>
        </thead>
        <tbody>
          ${RELEVANCE_OPTIONS.map((rowOpt, i) => html`
            <tr>
              <th>${rowOpt.label}</th>
              ${matrix[i].map((count) => html`<td style=${heatCellStyle(pal, count / max)}>${count}</td>`)}
            </tr>
          `)}
        </tbody>
      </table>
    </div>
  `;
}

function buildMergedGrid(activeList) {
  return html`
    <div class="analysis-grid">
      ${chartCard("BPM Relevance — overall", "0 = not relevant to BPM at all, 3 = highly relevant, compared across the selected rounds.", "cmp-chart-relevance-dist")}
      ${chartCard("Which BPM layer do these guidelines touch?", "Count of guidelines acting on each layer, compared across the selected rounds.", "cmp-chart-scope-counts")}
      ${chartCard("BPM Lifecycle phases touched", "Phase mentions across all guidelines, compared across the selected rounds.", "cmp-chart-lifecycle")}
      ${chartCard("Average relevance by BPM layer", "Mean BPM Relevance (0–3) among guidelines that touch each layer, compared across the selected rounds.", "cmp-chart-mean-by-scope")}
    </div>
  `;
}

function buildSmallMultiples(activeList, pal) {
  // One legend per section (not repeated per round's small chart) - same
  // colors/meaning across every chart in the section, so a single legend row
  // under the section description covers all of them.
  const section = (title, description, kind, legend) => html`
    <div class="comparison-section">
      <h2 class="top-table-heading">${title}</h2>
      <p class="chart-desc">${description}</p>
      <div class="chart-legend">${legend}</div>
      <div class="analysis-grid">${activeList.map((round) => chartCard(round.label, null, `cmp-chart-${kind}-${round.id}`))}</div>
    </div>
  `;

  return html`<div>
    ${section(
      "Share rated highly relevant, by source",
      "Percent of each source's guidelines scoring 3 (highly relevant) - one chart per selected round.",
      "high-relevance",
      [legendDot(pal.muted, "General source"), legendDot(pal.strong, "BPM-native source")]
    )}
    ${section(
      "Relevance mix per source",
      "Full 0–3 breakdown per source, normalized to 100% - one chart per selected round.",
      "relevance-mix",
      RELEVANCE_OPTIONS.map((o, i) => legendDot(pal.relevanceSteps[i], o.label))
    )}
    ${section(
      "BPM Scope emphasis — BPM-native vs. general sources",
      "Percent of each group's rated guidelines touching each layer - one chart per selected round.",
      "scope-native",
      [legendDot(pal.muted, "General source"), legendDot(pal.strong, "BPM-native source")]
    )}
    ${section(
      "Generic best practice vs. BPM-specific, by source",
      "Among rated guidelines: would the same advice apply outside BPM, or is the reasoning process-specific? One chart per selected round.",
      "generic-share",
      [legendDot(pal.muted, "Generic practice"), legendDot(pal.strong, "BPM-specific")]
    )}
  </div>`;
}

function buildSourceMergedGrid() {
  return html`
    <div class="analysis-grid">
      ${chartCard("BPM Relevance", "0 = not relevant to BPM at all, 3 = highly relevant, compared across the selected sources.", "cmp-src-chart-relevance-dist")}
      ${chartCard("Which BPM layer do these guidelines touch?", "Count of guidelines acting on each layer, compared across the selected sources.", "cmp-src-chart-scope-counts")}
      ${chartCard("BPM Lifecycle phases touched", "Phase mentions, compared across the selected sources.", "cmp-src-chart-lifecycle")}
      ${chartCard("Average relevance by BPM layer", "Mean BPM Relevance (0–3) among guidelines that touch each layer, compared across the selected sources.", "cmp-src-chart-mean-by-scope")}
      ${chartCard("Generic best practice vs. BPM-specific", "Among rated guidelines: would the same advice apply outside BPM, or is the reasoning process-specific - compared across the selected sources.", "cmp-src-chart-generic-split")}
    </div>
  `;
}
