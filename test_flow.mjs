// Headless functional test of app.js using jsdom. Spins up its own static file
// server (no external tooling needed) so `npm test` is fully self-contained.
import { JSDOM } from "jsdom";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const MIME = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".css": "text/css" };

const server = http.createServer((req, res) => {
  const file = req.url === "/" ? "/index.html" : req.url;
  const filePath = path.join(process.cwd(), file);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  });
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const PORT = server.address().port;
const BASE = `http://127.0.0.1:${PORT}`;

const dom = new JSDOM(fs.readFileSync("index.html", "utf-8"), {
  url: BASE + "/",
  runScripts: "outside-only",
  resources: "usable",
});

const { window } = dom;
window.fetch = (url, ...rest) => fetch(new URL(url, BASE + "/"), ...rest);

const appJs = fs.readFileSync("app.js", "utf-8");
dom.window.eval(appJs);

let failures = 0;
function log(label, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"} - ${label}${extra ? " :: " + extra : ""}`);
  if (!ok) failures++;
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const doc = window.document;

  function check(name, value, checked = true) {
    const input = [...doc.querySelectorAll(`input[name="${name}"]`)].find((i) => i.value === value);
    if (!input) throw new Error(`input not found: ${name}=${value}`);
    input.checked = checked;
    input.dispatchEvent(new window.Event("change", { bubbles: true }));
    return input;
  }

  function isChecked(name, value) {
    const input = [...doc.querySelectorAll(`input[name="${name}"]`)].find((i) => i.value === value);
    return !!input && input.checked;
  }

  function submit() {
    const form = doc.querySelector("form");
    form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  }

  function progressLabel() {
    return doc.getElementById("progressLabel").textContent.trim();
  }

  function fillDefault(i) {
    check(`relevance-${i}`, "3");
    check(`scope-${i}`, "Organizational/Governance");
    check(`generic-${i}`, "Yes");
    check(`lifecycle-${i}`, "Not Applicable");
  }

  // 1. Intro screen renders with a Start button.
  await sleep(50);
  const startBtn = [...doc.querySelectorAll("button")].find((b) => b.textContent === "Start");
  log("Intro screen has Start button", !!startBtn);

  // 2. Click Start -> should fetch data.json and render the "About you" screen first.
  startBtn.click();
  await sleep(300); // allow the fetch + render to complete

  let h1 = doc.querySelector("h1");
  log('Routes to "About you" screen before the rating list', !!h1 && h1.textContent === "About you", h1 && h1.textContent);

  // 2a. Submitting with nothing filled should block with an error.
  submit();
  await sleep(20);
  log("Empty respondent-info submit blocked with error", doc.querySelector(".error-text").textContent.includes("BPM experience"));

  // 2b. Selecting role = Other should reveal the free-text field, and block submit until it's filled.
  check("role", "Other");
  const roleOtherInput = doc.querySelector('input[name="roleOther"]');
  log("Role=Other reveals the free-text input", !!roleOtherInput && !roleOtherInput.closest("div").hidden);
  check("bpmExperience", "Practitioner, 5+ years");
  check("sustainabilityExperience", "None");
  submit();
  await sleep(20);
  log("Role=Other without text is blocked", doc.querySelector(".error-text").textContent.includes("specify your role"));

  roleOtherInput.value = "Sustainability Officer";
  submit();
  await sleep(20);

  h1 = doc.querySelector("h1");
  log("Advances to the rating list after respondent info completed", !!h1 && h1.textContent === "Rate each guideline", h1 && h1.textContent);

  const rows = doc.querySelectorAll(".rating-row");
  log("All 25 guidelines rendered as rows", rows.length === 25, `got ${rows.length}`);
  log("Progress starts at 0 / 25", progressLabel() === "0 / 25", progressLabel());
  log("No Keywords field present", !doc.querySelector('input[name="keywords"]'));

  // 3. Clicking Finish with nothing filled should block with an error, not advance.
  submit();
  await sleep(20);
  log("Empty Finish blocked with error", doc.querySelector(".error-text").textContent.includes("25 guideline"));
  log("Still on the rating list after a blocked Finish", doc.querySelector("h1").textContent === "Rate each guideline");

  // 4. Row 0: BPM Scope is multi-select - checking two scope boxes should both stay checked,
  //    even before Relevance has been touched (Scope/Generic/Lifecycle must not be disabled
  //    just because Relevance happens to still be blank).
  check("scope-0", "Process Model");
  check("scope-0", "Worker/Task");
  log("Scope allows multiple selections", isChecked("scope-0", "Process Model") && isChecked("scope-0", "Worker/Task"));
  log("Touching Scope before Relevance doesn't disable other fields",
    ![...doc.querySelectorAll('input[name="generic-0"]')].some((i) => i.disabled));

  check("relevance-0", "2");
  const row0Body = doc.querySelector('.rating-row[data-index="0"] .rating-row-body');
  log("Picking a relevance score expands the row", row0Body.hidden === false);
  check("generic-0", "Yes");
  check("lifecycle-0", "Design");
  const row0 = doc.querySelector('.rating-row[data-index="0"]');
  log("Row 0 marked complete once all fields are set", row0.classList.contains("complete"));
  log("Progress shows 1 / 25 after completing row 0", progressLabel() === "1 / 25", progressLabel());

  // 5. Row 1: Relevance=0 means there's nothing left to classify - Scope, Generic, and
  //    Lifecycle all get disabled and cleared (mirroring the existing Generic-at-0 behavior),
  //    and the row is immediately complete with no further input required.
  check("relevance-1", "0");
  const row1 = doc.querySelector('.rating-row[data-index="1"]');
  log("Relevance=0 disables Scope, Generic, and Lifecycle", ["scope-1", "generic-1", "lifecycle-1"].every(
    (name) => [...doc.querySelectorAll(`input[name="${name}"]`)].every((i) => i.disabled)
  ));
  log("Relevance=0 clears any prior selections in those fields",
    !doc.querySelector('input[name="scope-1"]:checked') &&
    !doc.querySelector('input[name="generic-1"]:checked') &&
    !doc.querySelector('input[name="lifecycle-1"]:checked'));
  log("Row 1 marked complete immediately at Relevance=0", row1.classList.contains("complete"));
  log("Progress shows 2 / 25 after Relevance=0 alone completes row 1", progressLabel() === "2 / 25", progressLabel());

  // 6. Row 2: switching Relevance away from 0 re-enables Scope, Generic, and Lifecycle together.
  check("relevance-2", "0");
  log("Row 2 Relevance=0 disables Scope", [...doc.querySelectorAll('input[name="scope-2"]')].every((i) => i.disabled));
  check("relevance-2", "2");
  log("Row 2 non-zero Relevance re-enables Scope, Generic, and Lifecycle", ["scope-2", "generic-2", "lifecycle-2"].every(
    (name) => [...doc.querySelectorAll(`input[name="${name}"]`)].every((i) => !i.disabled)
  ));
  check("scope-2", "Process Data");
  check("generic-2", "No");
  check("lifecycle-2", "Design");
  log("Row 2 marked complete once all required fields are set",
    row1.parentElement.querySelector('.rating-row[data-index="2"]').classList.contains("complete"));

  // 7. Row 4: Not Applicable mutual exclusivity in BPM Lifecycle (needs a non-zero Relevance
  //    first, since Lifecycle is disabled at Relevance=0).
  check("relevance-4", "3");
  check("lifecycle-4", "Design");
  check("lifecycle-4", "Not Applicable");
  log("Checking Not Applicable unchecks Design", !isChecked("lifecycle-4", "Design") && isChecked("lifecycle-4", "Not Applicable"));
  check("lifecycle-4", "Monitoring");
  log("Picking a phase after NA unchecks Not Applicable", !isChecked("lifecycle-4", "Not Applicable"));
  check("scope-4", "Worker/Task");
  check("generic-4", "No");

  // 8. Row 3: header click toggles the collapsed/expanded body independent of field values.
  const row3Header = doc.querySelector('.rating-row[data-index="3"] .rating-row-header');
  const row3Body = doc.querySelector('.rating-row[data-index="3"] .rating-row-body');
  log("Row 3 starts collapsed", row3Body.hidden === true);
  row3Header.click();
  log("Clicking the header expands row 3", row3Body.hidden === false);
  row3Header.click();
  log("Clicking the header again collapses row 3", row3Body.hidden === true);

  // 9. Fill every remaining row with a default valid answer.
  for (let i = 3; i < rows.length; i++) fillDefault(i);
  log("Progress shows 25 / 25 once every row is answered", progressLabel() === "25 / 25", progressLabel());

  // 10. Finish -> completion screen.
  submit();
  await sleep(50);

  h1 = doc.querySelector("h1");
  log("Reached completion screen", !!h1 && h1.textContent.includes("Thank you"), h1 && h1.textContent);
  log("Test-mode note shown (no backend configured)", !!doc.querySelector(".test-mode-note"));

  const pre = doc.querySelector("pre.summary-box");
  const parsed = JSON.parse(pre.textContent);
  log("Final payload has 25 responses", parsed.responses.length === 25, `got ${parsed.responses.length}`);
  log("Payload has sessionId and submittedAt", !!parsed.sessionId && !!parsed.submittedAt);
  log("Payload has respondent info with the values entered", !!parsed.respondent
    && parsed.respondent["BPM Experience"] === "Practitioner, 5+ years"
    && parsed.respondent["Sustainability Experience"] === "None"
    && parsed.respondent.Role === "Sustainability Officer",
    parsed.respondent && JSON.stringify(parsed.respondent));
  log("Each response has an ID field", parsed.responses.every((r) => !!r.ID));
  log("No response has a Keywords field", parsed.responses.every((r) => !("Keywords" in r)));

  const zeroRelevanceResponse = parsed.responses.find((r) => r["BPM Relevance"] === "0");
  log("Relevance=0 response has blank Scope, Generic, and Lifecycle", !!zeroRelevanceResponse
    && zeroRelevanceResponse["BPM Scope"] === ""
    && zeroRelevanceResponse.Generic === ""
    && zeroRelevanceResponse["BPM Lifecycle"] === "",
    zeroRelevanceResponse && JSON.stringify(zeroRelevanceResponse));

  const multiScopeResponse = parsed.responses.find((r) => r["BPM Scope"].includes(","));
  log("A multi-select Scope response is stored comma-joined", !!multiScopeResponse,
    multiScopeResponse && multiScopeResponse["BPM Scope"]);

  console.log(`\n${failures === 0 ? "All tests passed." : failures + " test(s) FAILED."}`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error("TEST HARNESS ERROR:", e);
    process.exitCode = 1;
  })
  .finally(() => server.close());
