// Smoke test for the deployed submission backend (Code.gs). Run this after
// every deploy/redeploy - see README.md's "Smoke test after deploying".
//
// Usage:
//   node backend/apps-script/smoketest.mjs
//     Reads SUBMIT_ENDPOINT/SUBMIT_TOKEN straight out of
//     assets/js/survey/submit-config.js (the ones currently wired up to the
//     site).
//
//   node backend/apps-script/smoketest.mjs --url <url> --token <token>
//     Test a different deployment (e.g. a scratch project) without touching
//     submit-config.js. Env vars SUBMIT_ENDPOINT/SUBMIT_TOKEN also work.
//
// Every check below runs against the REAL deployed Sheet - checks 1 and 5
// each add one row. Delete them (search the Responses tab for the
// "smoketest-" sessionId prefix) when done.

import fs from "node:fs";

function readConfiguredSurveyConfig() {
  const source = fs.readFileSync("assets/js/survey/submit-config.js", "utf-8");
  return {
    endpoint: source.match(/const SUBMIT_ENDPOINT\s*=\s*"([^"]*)"/)?.[1],
    token: source.match(/const SUBMIT_TOKEN\s*=\s*"([^"]*)"/)?.[1],
  };
}

function parseArgs(argv) {
  const get = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return { url: get("--url"), token: get("--token") };
}

const cli = parseArgs(process.argv.slice(2));
const configured = readConfiguredSurveyConfig();
const SUBMIT_ENDPOINT = cli.url || process.env.SUBMIT_ENDPOINT || configured.endpoint;
const SUBMIT_TOKEN = cli.token ?? process.env.SUBMIT_TOKEN ?? configured.token;

if (!SUBMIT_ENDPOINT) {
  console.error(
    "No endpoint to test: submit-config.js still has SUBMIT_ENDPOINT = null (test mode), and " +
      "no --url/SUBMIT_ENDPOINT override was given.",
  );
  process.exit(1);
}

let failures = 0;
function log(label, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"} - ${label}${extra ? " :: " + extra : ""}`);
  if (!ok) failures++;
}

async function post(body) {
  const res = await fetch(SUBMIT_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // non-JSON response - json stays null, callers fall back to raw text
  }
  return { status: res.status, json, text };
}

function defaultResponse(overrides = {}) {
  return {
    ID: "smoketest-1",
    "BPM Relevance": "1",
    "BPM Scope": "Process Model",
    Generic: "Yes",
    "BPM Justification": "smoke test",
    "BPM Lifecycle": "Design",
    Discussion: "",
    ...overrides,
  };
}

function validPayload(overrides = {}) {
  return {
    token: SUBMIT_TOKEN,
    sessionId: `smoketest-${Date.now()}`,
    submittedAt: new Date().toISOString(),
    respondent: {
      "BPM Experience": "None",
      "Sustainability Experience": "None",
      Role: "Student",
    },
    responses: [defaultResponse()],
    ...overrides,
  };
}

async function main() {
  console.log(`Smoke-testing ${SUBMIT_ENDPOINT}\n`);

  // 1. Valid payload - accepted, adds one row to each Sheet tab.
  const valid = await post(validPayload());
  log("Valid payload accepted", valid.json?.ok === true, JSON.stringify(valid.json ?? valid.text));

  // 2. Wrong token - rejected, nothing written.
  const wrongToken = await post(validPayload({ token: "wrong" }));
  log(
    "Wrong token rejected",
    wrongToken.json?.ok === false,
    JSON.stringify(wrongToken.json ?? wrongToken.text),
  );

  // 3. Malformed JSON - rejected.
  const malformed = await post("not json");
  log(
    "Malformed JSON rejected",
    malformed.json?.ok === false,
    JSON.stringify(malformed.json ?? malformed.text),
  );

  // 4. Oversized responses array (31 > MAX_RESPONSES) - rejected.
  const oversized = await post(
    validPayload({
      responses: Array.from({ length: 31 }, (_, i) => defaultResponse({ ID: `bulk-${i}` })),
    }),
  );
  log(
    "Oversized responses array rejected",
    oversized.json?.ok === false,
    JSON.stringify(oversized.json ?? oversized.text),
  );

  // 5. Formula-injection attempt - validation doesn't block this (it's a
  // well-formed payload), so it's accepted; the sanitization happens at
  // write time and can't be checked over HTTP, so this step is a manual
  // follow-up, not an automated pass/fail.
  const injectionSessionId = `smoketest-injection-${Date.now()}`;
  const injection = await post(
    validPayload({
      sessionId: injectionSessionId,
      responses: [
        defaultResponse({
          ID: "smoketest-injection",
          "BPM Justification": '=HYPERLINK("http://example.com","click me")',
        }),
      ],
    }),
  );
  log(
    "Formula-injection payload accepted (expected - validation isn't meant to block this)",
    injection.json?.ok === true,
  );
  if (injection.json?.ok) {
    console.log(
      `  MANUAL CHECK: open the Responses tab, find sessionId "${injectionSessionId}", and ` +
        "confirm its BPM Justification cell shows as literal text (likely with a leading '), " +
        "not a working link/formula.",
    );
  }

  console.log(
    `\n${failures === 0 ? "All automated checks passed." : `${failures} check(s) FAILED.`}`,
  );
  console.log(
    'Cleanup: delete the "smoketest-*" rows this run added to the Sheet when you\'re done.',
  );
  if (failures > 0) process.exit(1);
}

main().catch((e) => {
  console.error("SMOKETEST ERROR:", e);
  process.exit(1);
});
