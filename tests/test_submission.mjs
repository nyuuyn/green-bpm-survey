// Headless functional test of survey.js's LIVE-submission branch (SUBMIT_ENDPOINT
// set), using jsdom - complements test_flow.mjs, which only ever exercises the
// test-mode (SUBMIT_ENDPOINT === null) branch. Loads
// tests/fixtures/submit-config.live-mode.js in place of the real
// assets/js/survey/submit-config.js, so this test never depends on, or
// submits to, the real deployed backend. TEST_ENDPOINT/TEST_TOKEN below must
// match that fixture's values exactly.
import { JSDOM } from "jsdom";
import fs from "node:fs";
import { startServer, sleep, runPageScripts } from "./test_server.mjs";

const TEST_ENDPOINT = "https://example.test/exec";
const TEST_TOKEN = "test-token-123";

const { base: BASE, close } = await startServer();

let failures = 0;
function log(label, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"} - ${label}${extra ? " :: " + extra : ""}`);
  if (!ok) failures++;
}

// Fills respondent info + all 10 rating rows with a valid default answer, then
// clicks Finish - the minimal path to the completion screen. Mirrors
// test_flow.mjs's fillDefault()/submit(), condensed since this file isn't
// re-testing per-field validation, just what happens once SUBMIT_ENDPOINT is set.
async function completeSurvey(doc, window) {
  function check(name, value) {
    const input = [...doc.querySelectorAll(`input[name="${name}"]`)].find((i) => i.value === value);
    input.checked = true;
    input.dispatchEvent(new window.Event("change", { bubbles: true }));
  }
  function submit() {
    doc
      .querySelector("form")
      .dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  }

  await sleep(300); // initial data.json fetch + shuffle
  check("bpmExperience", "None");
  check("sustainabilityExperience", "None");
  check("role", "Student");
  submit();
  await sleep(20);

  for (let i = 0; i < 10; i++) {
    check(`relevance-${i}`, "3");
    check(`scope-${i}`, "Organizational/Governance");
    check(`generic-${i}`, "Yes");
    check(`lifecycle-${i}`, "Not Applicable");
  }
  submit();
  await sleep(50);
}

// Runs one full flow in a fresh JSDOM/window, with window.fetch routing
// relative URLs (data.json) through the local server as usual, and capturing
// any call to TEST_ENDPOINT instead of letting it hit the network -
// `fetchBehavior` controls whether that capture resolves or rejects, to cover
// both the success and error-handling branches in renderComplete().
async function runScenario(fetchBehavior) {
  const dom = new JSDOM(fs.readFileSync("survey.html", "utf-8"), {
    url: `${BASE}/survey.html`,
    runScripts: "outside-only",
    resources: "usable",
  });
  const { window } = dom;

  const submitCalls = [];
  window.fetch = (url, init) => {
    const urlStr = String(url);
    if (urlStr === TEST_ENDPOINT) {
      submitCalls.push({ url: urlStr, init });
      return fetchBehavior === "reject"
        ? Promise.reject(new Error("simulated network failure"))
        : Promise.resolve(new Response("", { status: 200 }));
    }
    return fetch(new URL(urlStr, BASE + "/"), init);
  };

  runPageScripts(dom, [
    "assets/js/vendor/preact.min.js",
    "assets/js/vendor/preact-hooks.umd.js",
    "assets/js/vendor/htm.umd.js",
    "assets/js/common.js",
    "assets/js/survey/rating-row.js",
    "assets/js/survey/respondent-info-form.js",
    "assets/js/survey/rating-list.js",
    "tests/fixtures/submit-config.live-mode.js",
    "assets/js/survey/survey.js",
  ]);

  await completeSurvey(dom.window.document, window);
  return { doc: dom.window.document, submitCalls };
}

async function main() {
  // 1. Happy path: fetch resolves - should POST to SUBMIT_ENDPOINT with the
  //    token + full payload, and render the success message, not test-mode.
  const ok = await runScenario("resolve");
  log(
    "Exactly one submission POST was made",
    ok.submitCalls.length === 1,
    `got ${ok.submitCalls.length}`,
  );

  const call = ok.submitCalls[0];
  log("POST sent to SUBMIT_ENDPOINT", call?.url === TEST_ENDPOINT, call?.url);
  log("POST uses method POST", call?.init?.method === "POST");

  const body = call ? JSON.parse(call.init.body) : null;
  log("Payload includes the matching token", body?.token === TEST_TOKEN, body?.token);
  log("Payload includes sessionId and submittedAt", !!body?.sessionId && !!body?.submittedAt);
  log("Payload includes all 10 responses", body?.responses?.length === 10, body?.responses?.length);

  log(
    "Success message shown, not the test-mode note",
    ok.doc.body.textContent.includes("Submitted") && !ok.doc.querySelector(".test-mode-note"),
  );

  // 2. Network failure: fetch rejects - should still POST once, but render the
  //    error branch instead (previously untested).
  const failed = await runScenario("reject");
  log("Submission still attempted once on failure", failed.submitCalls.length === 1);
  log(
    "Error message shown on a failed submission",
    !!failed.doc.querySelector(".error-text") &&
      failed.doc.querySelector(".error-text").textContent.includes("went wrong"),
  );

  console.log(`\n${failures === 0 ? "All tests passed." : failures + " test(s) FAILED."}`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error("TEST HARNESS ERROR:", e);
    process.exitCode = 1;
  })
  .finally(() => close());
