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
  const tabs = doc.querySelectorAll(".tab");
  log("One tab per survey round (3 today)", tabs.length === 3, `got ${tabs.length}`);
  log('"AI (General)" tab is active by default', doc.querySelector(".tab.active")?.textContent === "AI (General)");
  log("Exactly one tab is pressed by default", [...tabs].filter((t) => t.getAttribute("aria-pressed") === "true").length === 1);

  // "Guidelines collected per source" lives once in the intro card, fetched
  // from data.json directly - it's a fact about the corpus, not about any
  // round's ratings, so it doesn't belong to (or vary with) the active round.
  log("Intro card's per-source chart is present, outside any round panel",
    !!doc.getElementById("chart-per-source") && !doc.getElementById("chart-per-source").closest(".analysis-card"));

  const claudeChartIds = chartIdsFor("claude");
  const canvases = doc.querySelectorAll("canvas");
  log("9 canvases in the document (1 intro + 8 for the active round)", canvases.length === 1 + claudeChartIds.length, `got ${canvases.length}`);
  log("9 Chart instances mounted (1 intro + 8 for the active round)", mountedCharts.length === 1 + claudeChartIds.length,
    `got ${mountedCharts.length}`);
  log("Every expected canvas id is present, suffixed by round", claudeChartIds.every((id) => !!doc.getElementById(id)));

  const claudePanel = doc.querySelector('.analysis-card[data-round="claude"]');
  log("The claude round's panel is visible", !!claudePanel && claudePanel.hidden === false);

  const comparisonPanel = doc.getElementById("comparison-panel");
  log("Comparison panel exists and starts hidden", !!comparisonPanel && comparisonPanel.hidden === true);

  log("4 chart legends present", doc.querySelectorAll(".chart-legend").length === 4,
    `got ${doc.querySelectorAll(".chart-legend").length}`);

  const rows = doc.querySelectorAll(".data-table tbody tr");
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

  console.log(`\n${failures === 0 ? "All tests passed." : failures + " test(s) FAILED."}`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error("TEST HARNESS ERROR:", e);
    process.exitCode = 1;
  })
  .finally(() => close());
