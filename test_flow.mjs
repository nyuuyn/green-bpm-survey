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

  // 1. Intro screen renders with a Start button.
  await sleep(50);
  const startBtn = [...doc.querySelectorAll("button")].find((b) => b.textContent === "Start");
  log("Intro screen has Start button", !!startBtn);

  // 2. Click Start -> should fetch data.json and render the "About you" screen first.
  startBtn.click();
  await sleep(300); // allow the fetch + render to complete

  let h1 = doc.querySelector("h1");
  log('Routes to "About you" screen before question 1', !!h1 && h1.textContent === "About you", h1 && h1.textContent);

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
  log("Advances to question 1 after respondent info completed", !h1 || h1.textContent !== "About you");

  let h2 = doc.querySelector("h2");
  log("Question 1 rendered (h2 present)", !!h2, h2 && h2.textContent.slice(0, 50));
  log("Progress label shows 1 / 25", doc.getElementById("progressLabel").textContent.trim() === "1 / 25");
  log("No Keywords field present", !doc.querySelector('input[name="keywords"]'));

  // 3. Try submitting with nothing filled -> should show validation error, not advance.
  submit();
  await sleep(20);
  log("Empty submit blocked with error", doc.querySelector(".error-text").textContent.includes("Relevance"));

  // 4. BPM Scope is multi-select: checking two scope boxes should both stay checked (not radio behavior).
  check("scope", "Process Model");
  check("scope", "Worker/Task");
  log("Scope allows multiple selections", isChecked("scope", "Process Model") && isChecked("scope", "Worker/Task"));

  // 5. Selecting Relevance = 0 disables and clears Generic.
  check("generic", "No");
  check("relevance", "0");
  const genericInputsDisabled = [...doc.querySelectorAll('input[name="generic"]')].every((i) => i.disabled);
  const genericCleared = ![...doc.querySelectorAll('input[name="generic"]')].some((i) => i.checked);
  log("Relevance=0 disables Generic inputs", genericInputsDisabled);
  log("Relevance=0 clears any prior Generic selection", genericCleared);

  // 6. Submitting with Relevance=0 should NOT require Generic (it's blank, not missing).
  check("lifecycle", "Not Applicable");
  submit();
  await sleep(20);
  log("Advanced to question 2 despite Generic being unset at Relevance=0",
    doc.getElementById("progressLabel").textContent.trim() === "2 / 25");

  // 7. Switching relevance away from 0 re-enables Generic.
  check("relevance", "4");
  const genericReenabled = [...doc.querySelectorAll('input[name="generic"]')].every((i) => !i.disabled);
  log("Non-zero Relevance re-enables Generic inputs", genericReenabled);

  // 8. Not Applicable mutual exclusivity: check Design, then Not Applicable -> Design should uncheck.
  check("scope", "Infrastructure/Platform");
  check("lifecycle", "Design");
  check("lifecycle", "Not Applicable");
  log("Checking Not Applicable unchecks Design", !isChecked("lifecycle", "Design") && isChecked("lifecycle", "Not Applicable"));
  check("lifecycle", "Monitoring");
  log("Picking a phase after NA unchecks Not Applicable", !isChecked("lifecycle", "Not Applicable"));

  // fill rest, go back to question 1, verify answer persisted (including multi-select scope)
  check("generic", "Yes");
  const backBtn = [...doc.querySelectorAll("button")].find((b) => b.textContent === "Back");
  log("Back button present on question 2", !!backBtn);
  backBtn.click();
  await sleep(20);
  log("Going back restores question 1's prior Relevance", isChecked("relevance", "0"));
  log("Going back restores question 1's multi-select Scope", isChecked("scope", "Process Model") && isChecked("scope", "Worker/Task"));

  // go forward again through question 1 (still valid as filled) to question 2
  submit();
  await sleep(20);

  // 9. Fast-forward: answer all remaining questions to reach the completion screen.
  let guard = 0;
  while (!doc.querySelector("h1") && guard < 30) {
    check("relevance", "3");
    check("scope", "Organizational/Governance");
    check("generic", "Yes");
    check("lifecycle", "Not Applicable");
    if (!doc.querySelector("form")) break;
    submit();
    await sleep(15);
    guard++;
  }

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
  log("Relevance=0 response has blank Generic", !!zeroRelevanceResponse && zeroRelevanceResponse.Generic === "",
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
