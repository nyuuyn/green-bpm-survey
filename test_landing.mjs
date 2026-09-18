// index.html is fully static (no JS) - a plain fetch + DOM parse is enough,
// no jsdom script evaluation needed.
import { JSDOM } from "jsdom";
import fs from "node:fs";

let failures = 0;
function log(label, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"} - ${label}${extra ? " :: " + extra : ""}`);
  if (!ok) failures++;
}

const dom = new JSDOM(fs.readFileSync("index.html", "utf-8"));
const doc = dom.window.document;

const surveyLink = [...doc.querySelectorAll("a")].find((a) => a.getAttribute("href") === "survey.html");
log("Landing page links to survey.html", !!surveyLink, surveyLink && surveyLink.textContent.trim());

const analysisLink = [...doc.querySelectorAll("a")].find((a) => a.getAttribute("href") === "analysis.html");
log("Landing page links to analysis.html", !!analysisLink, analysisLink && analysisLink.textContent.trim());

log("Both CTAs are styled as dominant buttons", !!surveyLink?.classList.contains("btn-hero") && !!analysisLink?.classList.contains("btn-hero"));
log("No <script> tags on the landing page (fully static)", doc.querySelectorAll("script").length === 0);

console.log(`\n${failures === 0 ? "All tests passed." : failures + " test(s) FAILED."}`);
if (failures > 0) process.exitCode = 1;
