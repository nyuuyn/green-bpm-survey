"use strict";

/* ---------- Single-round panel ----------
 * Canvas ids are suffixed per round (chart-relevance-dist-claude, ...) since
 * every round's panel stays in the DOM at once (hidden, not destroyed) so
 * switching tabs back and forth doesn't need to re-fetch or re-mount
 * Chart.js instances. Renders only the panel's CONTENT - the stable
 * `.analysis-card[data-round]` wrapper itself is built once in analysis.js's
 * buildPage() and never replaced; ensureSinglePanelShown() mounts this into
 * it (once, the first time that round becomes active).
 */

function RoundPanelContent({ round, records }) {
  const pal = chartPalette();
  const id = (name) => `${name}-${round.id}`;
  const totalRated = ratedRecords(records).length;

  const top20 = records
    .filter((r) => r.relevance !== null)
    .slice()
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 20);

  return html`
    <h2>${round.label} results</h2>
    <div class="btn-row btn-row-end">
      <a class="ref-link" href=${round.file} download=${round.file.replace(/^generated\//, "")}>Download full dataset (JSON) ↓</a>
    </div>
    <p class="intro-lead">${round.blurb} ${totalRated} of ${records.length} guidelines have a rating in this round.</p>

    <div class="analysis-grid">
      ${chartCard("BPM Relevance — overall", "0 = not relevant to BPM at all, 3 = highly relevant.", id("chart-relevance-dist"))}

      ${chartCard(
        "Share rated highly relevant, by source",
        "Percent of each source's guidelines scoring 3 (highly relevant).",
        id("chart-high-relevance"),
        [html`<div class="chart-legend">${[legendDot(pal.muted, "General source"), legendDot(pal.strong, "BPM-native source")]}</div>`]
      )}

      ${chartCard(
        "Relevance mix per source",
        "Full 0–3 breakdown per source, normalized to 100%.",
        id("chart-relevance-mix"),
        [html`<div class="chart-legend">${RELEVANCE_OPTIONS.map((o, i) => legendDot(pal.relevanceSteps[i], o.label))}</div>`]
      )}

      ${chartCard("Which BPM layer do these guidelines touch?", "Count of guidelines acting on each layer (a guideline can touch more than one).", id("chart-scope-counts"))}

      ${chartCard(
        "BPM Scope emphasis — BPM-native vs. general sources",
        "Percent of each group's rated guidelines touching each layer.",
        id("chart-scope-native"),
        [html`<div class="chart-legend">${[legendDot(pal.muted, "General source"), legendDot(pal.strong, "BPM-native source")]}</div>`]
      )}

      ${chartCard(
        "Generic best practice vs. BPM-specific, by source",
        "Among rated guidelines: would the same advice apply outside BPM, or is the reasoning process-specific?",
        id("chart-generic-share"),
        [html`<div class="chart-legend">${[legendDot(pal.muted, "Generic practice"), legendDot(pal.strong, "BPM-specific")]}</div>`]
      )}

      ${chartCard("BPM Lifecycle phases touched", "Phase mentions across all guidelines (a guideline can span multiple phases).", id("chart-lifecycle"))}

      ${chartCard("Average relevance by BPM layer", "Mean BPM Relevance (0–3) among guidelines that touch each layer.", id("chart-mean-by-scope"))}
    </div>

    <h2 class="top-table-heading">Top-rated guidelines</h2>
    <p class="chart-desc">The 20 highest-scoring guidelines across all sources, in this round.</p>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr>${["Source", "Guideline", "Relevance", "Scope", "Generic"].map((h) => html`<th>${h}</th>`)}</tr></thead>
        <tbody>
          ${top20.map((r) => html`
            <tr>
              <td>${SOURCE_SHORT_LABELS[r.source] || r.source}</td>
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
