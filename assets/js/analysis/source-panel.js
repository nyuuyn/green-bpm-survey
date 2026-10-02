"use strict";

/* ---------- Source block ----------
 * Drills into specific sources, scoped to whichever single round is active
 * above (see analysis.js's activeRoundForSourceBlock). Unlike the round
 * comparison, sources partition the 448 guidelines rather than re-rating the
 * same set, so there's no guideline-level "did these two sources agree"
 * question to ask - no heatmap, no disagreement table. Instead: a
 * single-source panel (reusing the same per-record aggregations as a round
 * panel, minus the charts that are inherently cross-source) and a comparison
 * panel that reuses mountMergedBarCharts with one series per selected
 * source, plus a guideline-level top-rated table restricted to the selected
 * sources. Both *Content components render only a panel's CONTENT -
 * sourceResultEl (built once in analysis.js's buildPage()) already carries
 * the .analysis-card class, and gets fully re-rendered (via preactRender)
 * every time the selected-source set (or the round the block is scoped to)
 * changes.
 */

const SOURCE_TOP_N_SINGLE = 10;
const SOURCE_TOP_N_COMPARISON = 15;

function topGuidelinesTable(rows, { includeSourceColumn }) {
  const headers = [...(includeSourceColumn ? ["Source"] : []), "Guideline", "Relevance", "Scope", "Generic"];
  return html`
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr>${headers.map((h) => html`<th>${h}</th>`)}</tr></thead>
        <tbody>
          ${rows.map((r) => html`
            <tr>
              ${includeSourceColumn ? html`<td>${SOURCE_SHORT_LABELS[r.source] || r.source}</td>` : null}
              <td>${r.name}</td>
              <td>${r.relevance}</td>
              <td>${r.scope.join(", ")}</td>
              <td>${r.generic || ""}</td>
            </tr>
          `)}
        </tbody>
      </table>
    </div>
  `;
}

function SourcePanelContent({ sourceId, records }) {
  const pal = chartPalette();
  const id = (name) => `src-chart-${name}-${sourceId}`;
  const totalRated = ratedRecords(records).length;
  const top = records.filter((r) => r.relevance !== null && r.relevance !== undefined)
    .slice().sort((a, b) => b.relevance - a.relevance).slice(0, SOURCE_TOP_N_SINGLE);

  return html`
    <h2>${SOURCE_SHORT_LABELS[sourceId] || sourceId} results</h2>
    <p class="intro-lead">${totalRated} of ${records.length} guidelines from this source have a rating in the active round.</p>

    <div class="analysis-grid">
      ${chartCard("BPM Relevance", "0 = not relevant to BPM at all, 3 = highly relevant.", id("relevance-dist"))}
      ${chartCard("Which BPM layer do these guidelines touch?", "Count of guidelines acting on each layer (a guideline can touch more than one).", id("scope-counts"))}
      ${chartCard("BPM Lifecycle phases touched", "Phase mentions across this source's guidelines.", id("lifecycle"))}
      ${chartCard("Average relevance by BPM layer", "Mean BPM Relevance (0–3) among this source's guidelines that touch each layer.", id("mean-by-scope"))}
      ${chartCard(
        "Generic best practice vs. BPM-specific",
        "Among rated guidelines from this source: would the same advice apply outside BPM, or is the reasoning process-specific?",
        id("generic-split"),
        [html`<div class="chart-legend">${[legendDot(pal.muted, "Generic practice"), legendDot(pal.strong, "BPM-specific")]}</div>`]
      )}
    </div>

    <h2 class="top-table-heading">Top-rated guidelines</h2>
    <p class="chart-desc">The highest-scoring guidelines in this source, in the active round.</p>
    ${topGuidelinesTable(top, { includeSourceColumn: false })}
  `;
}

function topTableForSources(activeSourceIds, records) {
  const idSet = new Set(activeSourceIds);
  const rows = records
    .filter((r) => idSet.has(r.source) && r.relevance !== null && r.relevance !== undefined)
    .slice().sort((a, b) => b.relevance - a.relevance).slice(0, SOURCE_TOP_N_COMPARISON);

  return html`
    <div class="comparison-section">
      <h2 class="top-table-heading">Top-rated guidelines among selected sources</h2>
      <p class="chart-desc">The ${SOURCE_TOP_N_COMPARISON} highest-scoring guidelines among the selected sources, in the active round.</p>
      ${topGuidelinesTable(rows, { includeSourceColumn: true })}
    </div>
  `;
}

function SourceComparisonPanelContent({ activeSourceIds, records }) {
  const labels = activeSourceIds.map((id) => SOURCE_SHORT_LABELS[id] || id);
  return html`
    <h2>Comparing ${labels.join(", ")}</h2>
    <h2 class="top-table-heading">Combined charts</h2>
    <p class="chart-desc">The same aggregate charts as a single source, with one series per selected source.</p>
    ${buildSourceMergedGrid()}
    ${topTableForSources(activeSourceIds, records)}
  `;
}
