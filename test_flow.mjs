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

function log(label, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"} - ${label}${extra ? " :: " + extra : ""}`);
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const doc = window.document;

  // 1. Intro screen renders with a Start button.
  await sleep(50);
  const startBtn = [...doc.querySelectorAll("button")].find((b) => b.textContent === "Start");
  log("Intro screen has Start button", !!startBtn);

  // 2. Click Start -> should fetch data.json and render question 1.
  startBtn.click();
  await sleep(300); // allow the fetch + render to complete

  let h2 = doc.querySelector("h2");
  log("Question 1 rendered (h2 present)", !!h2, h2 && h2.textContent.slice(0, 50));

  const progressLabel = doc.getElementById("progressLabel");
  log("Progress label shows 1 / 25", progressLabel.textContent.trim() === "1 / 25", progressLabel.textContent);

  // 3. Try submitting with nothing filled -> should show validation error, not advance.
  let form = doc.querySelector("form");
  form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await sleep(20);
  let errorText = doc.querySelector(".error-text").textContent;
  log("Empty submit blocked with error", errorText.includes("Relevance"), errorText);

  // 4. Fill required fields, submit -> should advance to question 2.
  function check(name, value) {
    const input = [...doc.querySelectorAll(`input[name="${name}"]`)].find((i) => i.value === value);
    if (!input) throw new Error(`input not found: ${name}=${value}`);
    input.checked = true;
    input.dispatchEvent(new window.Event("change", { bubbles: true }));
  }
  check("relevance", "5");
  check("scope", "Process Model");
  check("generic", "No");
  check("lifecycle", "Design");
  check("lifecycle", "Modeling");

  form = doc.querySelector("form");
  form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await sleep(20);

  h2 = doc.querySelector("h2");
  log("Advanced to question 2", doc.getElementById("progressLabel").textContent.trim() === "2 / 25");

  // 5. Not Applicable mutual exclusivity: check Design, then Not Applicable -> Design should uncheck.
  check("lifecycle", "Design");
  check("lifecycle", "Not Applicable");
  const designChecked = [...doc.querySelectorAll('input[name="lifecycle"]')].find((i) => i.value === "Design").checked;
  const naChecked = [...doc.querySelectorAll('input[name="lifecycle"]')].find((i) => i.value === "Not Applicable").checked;
  log("Checking Not Applicable unchecks Design", !designChecked && naChecked);

  // pick a valid combo again and re-check NA gets cleared when picking a real phase
  check("lifecycle", "Monitoring");
  const naStillChecked = [...doc.querySelectorAll('input[name="lifecycle"]')].find((i) => i.value === "Not Applicable").checked;
  log("Picking a phase after NA unchecks Not Applicable", !naStillChecked);

  // fill rest and go back to question 1, verify answer persisted
  check("relevance", "3");
  check("scope", "Worker/Task");
  check("generic", "Yes");
  form = doc.querySelector("form");
  const backBtn = [...doc.querySelectorAll("button")].find((b) => b.textContent === "Back");
  log("Back button present on question 2", !!backBtn);
  backBtn.click();
  await sleep(20);

  const relevance5Checked = [...doc.querySelectorAll('input[name="relevance"]')].find((i) => i.value === "5").checked;
  log("Going back restores question 1's prior answer", relevance5Checked);

  // 6. Fast-forward: answer all remaining questions to reach the completion screen.
  // go forward again through question 2 (already filled above before going back... but going back doesn't
  // clear question 2's state; re-submit it via Next since it's index 1 already answered)
  form = doc.querySelector("form");
  form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await sleep(20);

  let guard = 0;
  while (!doc.querySelector("h1") && guard < 30) {
    check("relevance", "0");
    check("scope", "Infrastructure/Platform");
    check("generic", "Yes");
    check("lifecycle", "Not Applicable");
    form = doc.querySelector("form");
    if (!form) break;
    form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    await sleep(15);
    guard++;
  }

  const h1 = doc.querySelector("h1");
  log("Reached completion screen", !!h1 && h1.textContent.includes("Thank you"), h1 && h1.textContent);

  const testModeNote = doc.querySelector(".test-mode-note");
  log("Test-mode note shown (no backend configured)", !!testModeNote);

  const pre = doc.querySelector("pre.summary-box");
  const parsed = JSON.parse(pre.textContent);
  log("Final payload has 25 responses", parsed.responses.length === 25, `got ${parsed.responses.length}`);
  log("Payload has sessionId and submittedAt", !!parsed.sessionId && !!parsed.submittedAt);
  log("Each response has an ID field", parsed.responses.every((r) => !!r.ID));

  console.log("\nDone.");
}

main()
  .catch((e) => {
    console.error("TEST HARNESS ERROR:", e);
    process.exitCode = 1;
  })
  .finally(() => server.close());
