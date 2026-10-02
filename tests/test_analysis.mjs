// Headless functional test of analysis.js using jsdom. Independent of the survey
// flow entirely now that analysis.html is its own standalone page.
import { JSDOM } from "jsdom";
import fs from "node:fs";
import { startServer, sleep } from "./test_server.mjs";

const { base: BASE, close } = await startServer();

const dom = new JSDOM(fs.readFileSync("analysis.html", "utf-8"), {
  url: `${BASE}/analysis.html`,
  runScripts: "outside-only",
  resources: "usable",
});

const { window } = dom;
window.fetch = (url, ...rest) => fetch(new URL(url, BASE + "/"), ...rest);

// Stub Chart.js: jsdom has no <canvas> 2D context backing, so this only exercises
// analysis.js's DOM-building and aggregation logic, not actual pixel rendering
// (that's covered by the Playwright suite in tests_e2e/).
const mountedCharts = [];
window.Chart = class {
  constructor(canvas, config) {
    if (!canvas) throw new Error("Chart constructed with no canvas element (bad canvas id?)");
    this.config = config;
    mountedCharts.push({ id: canvas.id, config });
  }
  destroy() {}
};

// See test_flow.mjs for why these must be eval'd together in one call.
dom.window.eval([fs.readFileSync("common.js", "utf-8"), fs.readFileSync("analysis.js", "utf-8")].join("\n"));

let failures = 0;
function log(label, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"} - ${label}${extra ? " :: " + extra : ""}`);
  if (!ok) failures++;
}

const CHART_NAMES = [
  "chart-relevance-dist", "chart-high-relevance", "chart-relevance-mix",
  "chart-scope-counts", "chart-scope-native", "chart-generic-share", "chart-lifecycle", "chart-mean-by-scope",
];
const chartIdsFor = (roundId) => CHART_NAMES.map((n) => `${n}-${roundId}`);

const MERGED_CHART_IDS = [
  "cmp-chart-relevance-dist", "cmp-chart-scope-counts", "cmp-chart-lifecycle", "cmp-chart-mean-by-scope",
];
const SMALL_MULTIPLE_KINDS = ["high-relevance", "relevance-mix", "scope-native", "generic-share"];
const smallMultipleIdsFor = (roundId) => SMALL_MULTIPLE_KINDS.map((k) => `cmp-chart-${k}-${roundId}`);

async function main() {
  const doc = window.document;

  await sleep(300); // allow fetch("generated/analysis_claude.json") + chart mounting to settle

  const h1 = doc.querySelector("h1");
  log("Analysis page heading present", !!h1 && h1.textContent.includes("relevant"), h1 && h1.textContent);

  // Tab bar: one toggle button per round in ANALYSIS_ROUNDS - 3 today (general/
  // sustainability/bpm personas), "AI (General)" active by default with no hash present.
  // Scoped to [data-round] since the page now also has a second tab bar for
  // sources (see the "Source block" section below) using the same .tab class.
  const tabs = doc.querySelectorAll(".tab[data-round]");
  log("One tab per survey round (3 today)", tabs.length === 3, `got ${tabs.length}`);
  log('"AI (General)" tab is active by default', doc.querySelector(".tab.active")?.textContent === "AI (General)");
  log("Exactly one tab is pressed by default", [...tabs].filter((t) => t.getAttribute("aria-pressed") === "true").length === 1);
  // Tabs sit at the top of the same card as the results (round panels /
  // comparison panel) rather than in the intro card or floating unstyled
  // between cards - they stay visible no matter which result is showing.
  const resultsCard = doc.querySelector(".tabs")?.closest(".card");
  log("Tab bar lives in the same card as the results, not the intro card",
    !!resultsCard && !resultsCard.classList.contains("analysis-intro") &&
    resultsCard.contains(doc.querySelector(".round-panels")) &&
    resultsCard.contains(doc.getElementById("comparison-panel")));

  const claudeHeading = doc.querySelector('.analysis-card[data-round="claude"] h2');
  log('Claude round panel has a "{round} results" heading', claudeHeading?.textContent === "AI (General) results",
    claudeHeading?.textContent);

  // "Guidelines collected per source" lives once in the intro card, fetched
  // from data.json directly - it's a fact about the corpus, not about any
  // round's ratings, so it doesn't belong to (or vary with) the active round.
  log("Intro card's per-source chart is present, outside any round panel",
    !!doc.getElementById("chart-per-source") && !doc.getElementById("chart-per-source").closest(".analysis-card"));

  // The page also mounts the source block's default single-source panel
  // (AWS, 5 canvases) alongside the intro chart and the active round's 8 -
  // see the "Source block" section below for its own dedicated assertions.
  const claudeChartIds = chartIdsFor("claude");
  const SOURCE_SINGLE_COUNT = 5;
  const canvases = doc.querySelectorAll("canvas");
  log("14 canvases in the document (1 intro + 8 for the active round + 5 for the default source)",
    canvases.length === 1 + claudeChartIds.length + SOURCE_SINGLE_COUNT, `got ${canvases.length}`);
  log("14 Chart instances mounted (1 intro + 8 for the active round + 5 for the default source)",
    mountedCharts.length === 1 + claudeChartIds.length + SOURCE_SINGLE_COUNT, `got ${mountedCharts.length}`);
  log("Every expected canvas id is present, suffixed by round", claudeChartIds.every((id) => !!doc.getElementById(id)));

  const claudePanel = doc.querySelector('.analysis-card[data-round="claude"]');
  log("The claude round's panel is visible", !!claudePanel && claudePanel.hidden === false);

  const comparisonPanel = doc.getElementById("comparison-panel");
  log("Comparison panel exists and starts hidden", !!comparisonPanel && comparisonPanel.hidden === true);

  // 4 in the claude round panel + 1 in the default source panel (generic-split).
  log("5 chart legends present", doc.querySelectorAll(".chart-legend").length === 5,
    `got ${doc.querySelectorAll(".chart-legend").length}`);

  const rows = claudePanel.querySelectorAll(".data-table tbody tr");
  log("Top-20 table has exactly 20 rows", rows.length === 20, `got ${rows.length}`);

  const brandLink = doc.querySelector("a.brand");
  log("Brand link in the header goes to index.html", !!brandLink && brandLink.getAttribute("href") === "index.html");
  log('Breadcrumb shows "Analysis" as the current page', doc.querySelector(".crumb-current")?.textContent === "Analysis");

  const downloadLink = [...doc.querySelectorAll("a")].find((a) => a.textContent.includes("Download full dataset"));
  log("Download-full-dataset link points at this round's own JSON file",
    !!downloadLink && downloadLink.getAttribute("href") === "generated/analysis_claude.json");

  // --- Selecting a 2nd round switches from the single-round view to the
  // comparison panel, without destroying the still-loaded claude panel. ---
  const sustainabilityTab = [...tabs].find((t) => t.textContent === "AI (Sustainability Expert)");
  const bpmTab = [...tabs].find((t) => t.textContent === "AI (BPM Expert)");
  sustainabilityTab.click();
  await sleep(300);

  log('Hash becomes "#claude+sustainability" (insertion order)', window.location.hash === "#claude+sustainability",
    window.location.hash);
  log("Both claude and sustainability tabs are now pressed",
    [...tabs].filter((t) => t.getAttribute("aria-pressed") === "true").length === 2);
  log("bpm tab is still unpressed", bpmTab.getAttribute("aria-pressed") === "false");

  log("Single-round panels (claude) are hidden while comparing", claudePanel.hidden === true);
  log("Comparison panel is now visible", comparisonPanel.hidden === false);
  log('Comparison panel heading names the compared rounds',
    comparisonPanel.querySelector("h2")?.textContent === "Comparing AI (General), AI (Sustainability Expert)",
    comparisonPanel.querySelector("h2")?.textContent);

  log("4 merged chart canvases present", MERGED_CHART_IDS.every((id) => !!doc.getElementById(id)));
  log("4 small-multiple canvases present for claude", smallMultipleIdsFor("claude").every((id) => !!doc.getElementById(id)));
  log("4 small-multiple canvases present for sustainability", smallMultipleIdsFor("sustainability").every((id) => !!doc.getElementById(id)));
  log("Intro chart is untouched by entering comparison mode (still exactly one)",
    doc.querySelectorAll("#chart-per-source").length === 1 && !comparisonPanel.querySelector("#chart-per-source"));

  const comparisonCanvasesAt2 = comparisonPanel.querySelectorAll("canvas");
  log("Comparison panel has 12 canvases at 2 rounds (4 merged + 4x2 small multiples)",
    comparisonCanvasesAt2.length === 12, `got ${comparisonCanvasesAt2.length}`);

  const heatmapsAt2 = comparisonPanel.querySelectorAll(".heatmap-table");
  log("One agreement heatmap for 2 selected rounds", heatmapsAt2.length === 1, `got ${heatmapsAt2.length}`);
  log("Heatmap is a 4x4 relevance grid", heatmapsAt2[0]?.querySelectorAll("tbody td").length === 16,
    `got ${heatmapsAt2[0]?.querySelectorAll("tbody td").length}`);

  const spreadTable = [...comparisonPanel.querySelectorAll(".data-table")].find((t) => !t.classList.contains("heatmap-table"));
  const spreadHeaders = [...(spreadTable?.querySelectorAll("thead th") ?? [])].map((th) => th.textContent);
  log("Disagreement table has one column per selected round plus Source/Guideline/Spread",
    JSON.stringify(spreadHeaders) === JSON.stringify(["Source", "Guideline", "AI (General)", "AI (Sustainability Expert)", "Spread"]),
    spreadHeaders.join(", "));

  const comparisonDownloadLinks = [...comparisonPanel.querySelectorAll("a.ref-link")].map((a) => a.getAttribute("href"));
  log("Comparison panel links to both rounds' JSON files",
    comparisonDownloadLinks.includes("generated/analysis_claude.json") && comparisonDownloadLinks.includes("generated/analysis_sustainability.json"),
    comparisonDownloadLinks.join(", "));

  // --- Selecting a 3rd round rebuilds the comparison panel around all three. ---
  bpmTab.click();
  await sleep(300);

  log('Hash becomes "#claude+sustainability+bpm"', window.location.hash === "#claude+sustainability+bpm", window.location.hash);
  log("All three tabs are now pressed",
    [...tabs].filter((t) => t.getAttribute("aria-pressed") === "true").length === 3);
  log('Comparison heading updates to name all three compared rounds',
    comparisonPanel.querySelector("h2")?.textContent === "Comparing AI (General), AI (Sustainability Expert), AI (BPM Expert)",
    comparisonPanel.querySelector("h2")?.textContent);

  const comparisonCanvasesAt3 = comparisonPanel.querySelectorAll("canvas");
  log("Comparison panel has 16 canvases at 3 rounds (4 merged + 4x3 small multiples)",
    comparisonCanvasesAt3.length === 16, `got ${comparisonCanvasesAt3.length}`);

  const heatmapsAt3 = comparisonPanel.querySelectorAll(".heatmap-table");
  log("Three pairwise agreement heatmaps for 3 selected rounds (3 choose 2)", heatmapsAt3.length === 3, `got ${heatmapsAt3.length}`);

  // --- Deselecting back down to one round returns to the single-round view,
  // reusing the already-loaded claude panel instead of re-fetching/re-mounting it. ---
  sustainabilityTab.click();
  await sleep(300);
  bpmTab.click();
  await sleep(300);

  log('Hash is back to "#claude"', window.location.hash === "#claude", window.location.hash);
  log("Comparison panel is hidden again", comparisonPanel.hidden === true);
  log("Claude panel is visible again", claudePanel.hidden === false);
  log("Claude's 8 canvases are still exactly the original elements (no re-mount)",
    chartIdsFor("claude").every((id) => !!doc.getElementById(id)));

  // --- The last remaining active tab can't be deselected down to zero. ---
  const claudeTab = [...tabs].find((t) => t.textContent === "AI (General)");
  claudeTab.click();
  await sleep(50);
  log("Clicking the only active tab again is a no-op (stays selected)",
    window.location.hash === "#claude" && claudeTab.classList.contains("active"));

  // --- Source block: a second, independent tab bar below the round results,
  // scoped to whichever single round is active above (not part of the hash -
  // see docs/DATA_PIPELINE.md). Default: "AWS" (first in ANALYSIS_SOURCE_ORDER). ---
  const sourceTabs = doc.querySelectorAll(".tab[data-source]");
  log("One tab per guideline source (10 today)", sourceTabs.length === 10, `got ${sourceTabs.length}`);

  const awsTab = [...sourceTabs].find((t) => t.textContent === "AWS");
  const azureTab = [...sourceTabs].find((t) => t.textContent === "Azure");
  log('"AWS" source tab is active by default', awsTab?.classList.contains("active"));
  log("Exactly one source tab is pressed by default",
    [...sourceTabs].filter((t) => t.getAttribute("aria-pressed") === "true").length === 1);

  const sourceResult = doc.getElementById("source-result");
  log('Source result panel heading is "AWS results" by default',
    sourceResult.querySelector("h2")?.textContent === "AWS results", sourceResult.querySelector("h2")?.textContent);

  const SOURCE_CHART_NAMES = ["relevance-dist", "scope-counts", "lifecycle", "mean-by-scope", "generic-split"];
  const sourceChartIdsFor = (sourceId) => SOURCE_CHART_NAMES.map((n) => `src-chart-${n}-${sourceId}`);
  log("All 5 single-source canvases present for AWS", sourceChartIdsFor("aws").every((id) => !!doc.getElementById(id)));

  const sourceNote = doc.getElementById("source-note");
  log("Source note exists and starts hidden (single round active)", !!sourceNote && sourceNote.hidden === true);
  log("Source result panel starts visible", sourceResult.hidden === false);

  // --- Selecting a 2nd source switches to the source comparison panel
  // (merged charts with one series per source, no heatmap/disagreement table -
  // sources partition the guidelines, so there's no per-guideline "agreement" to show). ---
  azureTab.click();
  await sleep(300);

  log("AWS and Azure source tabs are both pressed",
    [...sourceTabs].filter((t) => t.getAttribute("aria-pressed") === "true").length === 2);
  log('Source comparison heading names the compared sources',
    sourceResult.querySelector("h2")?.textContent === "Comparing AWS, Azure", sourceResult.querySelector("h2")?.textContent);

  const SOURCE_MERGED_IDS = [
    "cmp-src-chart-relevance-dist", "cmp-src-chart-scope-counts", "cmp-src-chart-lifecycle",
    "cmp-src-chart-mean-by-scope", "cmp-src-chart-generic-split",
  ];
  log("5 merged source-comparison canvases present", SOURCE_MERGED_IDS.every((id) => !!doc.getElementById(id)));
  log("No heatmap in the source comparison panel (sources partition guidelines, not re-rate them)",
    sourceResult.querySelectorAll(".heatmap-table").length === 0);

  const sourceCompRows = sourceResult.querySelectorAll(".data-table tbody tr");
  log("Top-rated-among-selected-sources table has at most 15 rows",
    sourceCompRows.length > 0 && sourceCompRows.length <= 15, `got ${sourceCompRows.length}`);

  // --- Deselecting back to one source returns to the single-source panel. ---
  azureTab.click();
  await sleep(300);
  log('Source result panel returns to "AWS results"', sourceResult.querySelector("h2")?.textContent === "AWS results");

  // --- The last remaining active source tab can't be deselected down to zero. ---
  awsTab.click();
  await sleep(50);
  log("Clicking the only active source tab again is a no-op (stays selected)", awsTab.classList.contains("active"));

  // --- Selecting a 2nd round does NOT hide or empty the source block - it
  // keeps showing data for whichever selected round comes first in
  // ANALYSIS_ROUNDS order, with a note naming it. (Regression test: this used
  // to hide the block entirely, making its charts disappear - see the "fix
  // the disappearing source-block charts" bug report.) ---
  sustainabilityTab.click();
  await sleep(300); // 2 rounds active: claude, sustainability
  log("Source note becomes visible once 2+ rounds are active", sourceNote.hidden === false);
  log('Source note names the round being shown and how many are selected',
    sourceNote.textContent === 'Showing sources for "AI (General)" - the first of your 2 selected rounds above.',
    sourceNote.textContent);
  log("Source result panel stays visible while 2+ rounds are active (does not disappear)", sourceResult.hidden === false);
  log('Source result panel still shows "AWS results" (claude is still the first active round)',
    sourceResult.querySelector("h2")?.textContent === "AWS results", sourceResult.querySelector("h2")?.textContent);
  log("Source block's charts are still mounted while comparing rounds",
    sourceChartIdsFor("aws").every((id) => !!doc.getElementById(id)));

  // --- Deselecting the round the source block was showing (claude), while a
  // 2nd round (bpm) is also still active, switches it to the next-first
  // active round (sustainability) instead of disappearing. ---
  bpmTab.click();
  await sleep(300); // 3 rounds active: claude, sustainability, bpm
  log('Source note still names "AI (General)" as first of 3 selected rounds',
    sourceNote.textContent === 'Showing sources for "AI (General)" - the first of your 3 selected rounds above.',
    sourceNote.textContent);

  claudeTab.click();
  await sleep(300); // claude deselected -> sustainability, bpm remain (2 active)
  log('Source note switches to "AI (Sustainability Expert)" once claude (the prior first) is deselected',
    sourceNote.textContent === 'Showing sources for "AI (Sustainability Expert)" - the first of your 2 selected rounds above.',
    sourceNote.textContent);
  log("Source result panel is still visible (not hidden) after switching representative round",
    sourceResult.hidden === false);

  // --- Returning to a single round hides the note again (no ambiguity left to explain). ---
  sustainabilityTab.click();
  await sleep(300); // sustainability deselected -> bpm remains (1 round)
  log("Source note hides again once back to a single round", sourceNote.hidden === true);
  log("Source result panel is visible", sourceResult.hidden === false);

  console.log(`\n${failures === 0 ? "All tests passed." : failures + " test(s) FAILED."}`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error("TEST HARNESS ERROR:", e);
    process.exitCode = 1;
  })
  .finally(() => close());
