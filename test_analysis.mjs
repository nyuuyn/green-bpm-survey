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

const CHART_IDS = [
  "chart-per-source", "chart-relevance-dist", "chart-high-relevance", "chart-relevance-mix",
  "chart-scope-counts", "chart-scope-native", "chart-generic-share", "chart-lifecycle", "chart-mean-by-scope",
];

async function main() {
  const doc = window.document;

  await sleep(300); // allow fetch("analysis.json") + chart mounting to settle

  const h1 = doc.querySelector("h1");
  log("Analysis page heading present", !!h1 && h1.textContent.includes("relevant"), h1 && h1.textContent);

  const canvases = doc.querySelectorAll("canvas");
  log("9 chart canvases rendered", canvases.length === CHART_IDS.length, `got ${canvases.length}`);
  log("9 Chart instances mounted with matching canvas ids", mountedCharts.length === CHART_IDS.length &&
    mountedCharts.every((c) => doc.getElementById(c.id) === [...canvases].find((cv) => cv.id === c.id)),
    `got ${mountedCharts.length}`);
  log("Every expected canvas id is present", CHART_IDS.every((id) => !!doc.getElementById(id)));

  log("4 chart legends present", doc.querySelectorAll(".chart-legend").length === 4,
    `got ${doc.querySelectorAll(".chart-legend").length}`);

  const rows = doc.querySelectorAll(".data-table tbody tr");
  log("Top-20 table has exactly 20 rows", rows.length === 20, `got ${rows.length}`);

  const brandLink = doc.querySelector("a.brand");
  log("Brand link in the header goes to index.html", !!brandLink && brandLink.getAttribute("href") === "index.html");
  log('Breadcrumb shows "Analysis" as the current page', doc.querySelector(".crumb-current")?.textContent === "Analysis");

  const downloadLink = [...doc.querySelectorAll("a")].find((a) => a.textContent.includes("Download full dataset"));
  log("Download-full-dataset link points at analysis.json",
    !!downloadLink && downloadLink.getAttribute("href") === "analysis.json");

  console.log(`\n${failures === 0 ? "All tests passed." : failures + " test(s) FAILED."}`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error("TEST HARNESS ERROR:", e);
    process.exitCode = 1;
  })
  .finally(() => close());
