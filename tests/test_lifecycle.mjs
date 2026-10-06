// Headless functional test of lifecycle.js using jsdom. Independent of the
// survey/analysis flows - lifecycle.html is its own standalone page.
import { JSDOM } from "jsdom";
import fs from "node:fs";
import { startServer, sleep } from "./test_server.mjs";

const { base: BASE, close } = await startServer();

const dom = new JSDOM(fs.readFileSync("lifecycle.html", "utf-8"), {
  url: `${BASE}/lifecycle.html`,
  runScripts: "outside-only",
  resources: "usable",
});

const { window } = dom;
window.fetch = (url, ...rest) => fetch(new URL(url, BASE + "/"), ...rest);

// See test_flow.mjs for why these must be eval'd together in one call.
dom.window.eval([
  fs.readFileSync("assets/js/vendor/preact.min.js", "utf-8"),
  fs.readFileSync("assets/js/vendor/preact-hooks.umd.js", "utf-8"),
  fs.readFileSync("assets/js/vendor/htm.umd.js", "utf-8"),
  fs.readFileSync("assets/js/common.js", "utf-8"),
  fs.readFileSync("assets/js/analysis/palette.js", "utf-8"),
  fs.readFileSync("assets/js/lifecycle/wheel.js", "utf-8"),
  fs.readFileSync("assets/js/lifecycle/guideline-popup.js", "utf-8"),
  fs.readFileSync("assets/js/lifecycle/lifecycle.js", "utf-8"),
].join("\n"));

let failures = 0;
function log(label, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"} - ${label}${extra ? " :: " + extra : ""}`);
  if (!ok) failures++;
}

// Preact's onClick is a plain "click" event listener - dispatching a
// MouseEvent works on an SVG <path> the same way .click() works on an
// HTMLElement (which jsdom doesn't implement .click() for SVG elements).
function clickEl(elNode) {
  elNode.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
}

const PHASES = ["Design", "Modeling", "Execution", "Monitoring", "Analysis", "Optimization"];

async function main() {
  const doc = window.document;

  await sleep(300); // allow fetch(data.json + 3x analysis_<round>.json) + first render to settle

  const h1 = doc.querySelector("h1");
  log("Lifecycle page heading present", !!h1 && h1.textContent.includes("lifecycle"), h1 && h1.textContent);

  const svg = doc.querySelector("svg.lifecycle-wheel");
  log("Wheel SVG is mounted", !!svg);

  const wedges = doc.querySelectorAll("path.lifecycle-wedge");
  log("Six wedges, one per lifecycle phase", wedges.length === 6, `got ${wedges.length}`);

  const labels = [...doc.querySelectorAll(".lifecycle-wedge-label")].map((n) => n.textContent);
  log("Wedge labels match LIFECYCLE_OPTIONS in order", JSON.stringify(labels) === JSON.stringify(PHASES), labels.join(", "));

  const popupRoot = doc.getElementById("lifecycle-popup-root");
  log("Popup starts hidden", popupRoot.hidden === true);
  log("No popup-card in the document yet", !doc.querySelector(".popup-card"));

  log("Intro links to the full analysis page",
    [...doc.querySelectorAll("a.ref-link")].some((a) => a.getAttribute("href") === "analysis.html"));

  // --- Clicking a wedge opens the popup for that phase, linked via the hash. ---
  const designWedge = [...wedges].find((w) => w.getAttribute("aria-label").startsWith("Design"));
  clickEl(designWedge);
  await sleep(50);

  log('Hash becomes "#Design"', window.location.hash === "#Design", window.location.hash);
  log("Popup is now visible", popupRoot.hidden === false);
  const popupCard = doc.querySelector(".popup-card");
  log("Popup heading names the phase", popupCard?.querySelector("h2")?.textContent.includes("Design"), popupCard?.querySelector("h2")?.textContent);
  log("Clicked wedge is marked active", designWedge.classList.contains("active"));

  const items = popupRoot.querySelectorAll(".popup-guideline");
  log("Popup lists between 1 and 6 guidelines", items.length > 0 && items.length <= 6, `got ${items.length}`);
  log("Every listed guideline has a name, a relevance score, and a source link", [...items].every((li) =>
    !!li.querySelector(".popup-guideline-name")?.textContent &&
    !!li.querySelector(".popup-guideline-score")?.textContent &&
    !!li.querySelector("a.ref-link")?.getAttribute("href")
  ));

  // Scores should be sorted highest-first.
  const scores = [...items].map((li) => parseFloat(li.querySelector(".popup-guideline-score").textContent));
  log("Guidelines are sorted by relevance, highest first", scores.every((s, i) => i === 0 || scores[i - 1] >= s), scores.join(", "));

  // --- Switching to a different phase updates the popup in place. ---
  const monitoringWedge = [...wedges].find((w) => w.getAttribute("aria-label").startsWith("Monitoring"));
  clickEl(monitoringWedge);
  await sleep(50);

  log('Hash becomes "#Monitoring"', window.location.hash === "#Monitoring", window.location.hash);
  log("Popup heading updates to the new phase", doc.querySelector(".popup-card h2")?.textContent.includes("Monitoring"));
  log("Previously active wedge is no longer marked active", !designWedge.classList.contains("active"));

  // --- Closing the popup (close button) clears the hash and hides it again. ---
  doc.querySelector(".popup-close").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await sleep(50);

  log("Hash is cleared after closing", window.location.hash === "", window.location.hash);
  log("Popup is hidden again", popupRoot.hidden === true);

  // --- Clicking the overlay (outside the card) also closes it. ---
  clickEl(monitoringWedge);
  await sleep(50);
  doc.querySelector(".popup-overlay").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await sleep(50);
  log("Clicking the overlay outside the card also closes the popup", popupRoot.hidden === true);

  const brandLink = doc.querySelector("a.brand");
  log("Brand link in the header goes to index.html", !!brandLink && brandLink.getAttribute("href") === "index.html");
  log('Breadcrumb shows "Lifecycle" as the current page', doc.querySelector(".crumb-current")?.textContent === "Lifecycle");

  console.log(`\n${failures === 0 ? "All tests passed." : failures + " test(s) FAILED."}`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error("TEST HARNESS ERROR:", e);
    process.exitCode = 1;
  })
  .finally(() => close());
