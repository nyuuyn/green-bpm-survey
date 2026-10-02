"use strict";

/* ---------- Survey page controller ----------
 * Config, shared state, validation, the completion screen, and boot() - the
 * pieces every screen needs or that tie them together. The screens
 * themselves live in their own files (loaded before this one, since this
 * file's boot() call at the bottom is what actually starts the app):
 * respondent-info-form.js ("About you"), rating-row.js + rating-list.js
 * (the 25-guideline list). h/html/preactRender/useState/useRef are globals
 * from common.js/preact - see that file for the synchronous-rendering setup
 * shared by this page and analysis.js.
 */

/* ---------- Config ---------- */

const SAMPLE_SIZE = 25;

// Set this to your deployed Google Apps Script Web App URL to go live.
// While null, the app runs in test mode: responses are shown on-screen and
// downloadable as JSON instead of being submitted anywhere.
const SUBMIT_ENDPOINT = null;

const EXPERIENCE_OPTIONS = [
  "None",
  "Studied it, not in practice",
  "Practitioner, < 2 years",
  "Practitioner, 2-5 years",
  "Practitioner, 5+ years",
  "Prefer not to say",
];

const ROLE_OPTIONS = [
  "Process Analyst / Business Analyst",
  "Process Owner / Manager",
  "Developer / Implementer",
  "Consultant",
  "Researcher / Academic",
  "Student",
  "Other",
  "Prefer not to say",
];

// Remembers the "About you" answers across rounds in the same browser, so
// "Start another round" doesn't make someone re-enter their background every
// time - only the sampled guidelines and sessionId are fresh per round.
const RESPONDENT_STORAGE_KEY = "greenBpmSurvey.respondentInfo";

function loadStoredRespondent() {
  try {
    const raw = localStorage.getItem(RESPONDENT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null; // private browsing / storage disabled - just ask again
  }
}

function storeRespondent(respondent) {
  try {
    localStorage.setItem(RESPONDENT_STORAGE_KEY, JSON.stringify(respondent));
  } catch {
    // storage unavailable - next round will simply ask again
  }
}

/* ---------- State ---------- */

const state = {
  sessionId: crypto.randomUUID(),
  items: [],
  responses: [], // one object per answered item, same order as state.items
  respondent: null, // filled in by renderRespondentInfo before rating starts
};

/* ---------- Utilities ---------- */

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const progressBar = document.getElementById("progressBar");
const progressFill = document.getElementById("progressFill");
const progressLabel = document.getElementById("progressLabel");

function setProgress(current, total) {
  if (total === 0) {
    progressBar.hidden = true;
    progressLabel.hidden = true;
    return;
  }
  progressBar.hidden = false;
  progressLabel.hidden = false;
  progressFill.style.width = `${(current / total) * 100}%`;
  progressLabel.textContent = `${current} / ${total}`;
}

/* ---------- Collecting & validating ----------
 * Shared by rating-row.js (the "complete" class) and rating-list.js
 * (Finish) - kept here rather than in either, since both need it. */

function validateRowAnswer(a) {
  if (!a.relevance) return "Please select a BPM Relevance score.";
  // Relevance 0 means "not relevant to BPM at all" - there's no scope, generic-vs-specific,
  // or lifecycle argument left to classify, so nothing further is required.
  if (a.relevance === "0") return null;
  if (a.scope.length === 0) return "Please select at least one BPM Scope.";
  if (!a.generic) return "Please select Yes or No for Generic.";
  if (a.lifecycle.length === 0) return "Please select at least one BPM Lifecycle phase, or Not Applicable.";
  if (a.lifecycle.includes("Not Applicable") && a.lifecycle.length > 1) {
    return "Not Applicable can't be combined with other lifecycle phases.";
  }
  return null;
}

function buildAnswerRecord(item, a) {
  const zero = a.relevance === "0";
  return {
    ID: item.id,
    "BPM Relevance": a.relevance,
    "BPM Scope": zero ? "" : a.scope.join(", "),
    Generic: zero ? "" : a.generic,
    "BPM Justification": a.justification,
    "BPM Lifecycle": zero ? "" : a.lifecycle.join(", "),
    Discussion: "",
  };
}

/* ---------- Completion / submission ---------- */

async function renderComplete() {
  preactRender(null, app); // no-op if the caller already unmounted Preact - safe either way
  setProgress(state.items.length, state.items.length);

  const payload = {
    sessionId: state.sessionId,
    submittedAt: new Date().toISOString(),
    respondent: state.respondent,
    responses: state.responses,
  };

  const card = el("div", { class: "card" }, [
    el("h1", {}, "Thank you! 🎉"),
    el("p", { class: "intro-lead" }, `You rated ${state.responses.length} guidelines.`),
  ]);

  if (SUBMIT_ENDPOINT) {
    card.append(el("p", {}, "Submitting your responses…"));
    renderApp(card);
    try {
      await fetch(SUBMIT_ENDPOINT, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(payload),
      });
      card.append(el("p", {}, "✅ Submitted. You can close this tab."));
    } catch (err) {
      card.append(el("p", { class: "error-text" }, "Something went wrong submitting your responses. Please try again shortly."));
    }
  } else {
    // Test mode: no backend wired up yet.
    const json = JSON.stringify(payload, null, 2);
    card.append(
      el("div", { class: "test-mode-note" },
        "Test mode — no backend is connected yet, so nothing was actually submitted. " +
        "Your responses are shown below and can be downloaded."),
      el("div", { class: "btn-row" }, [
        el("button", {
          class: "btn-secondary",
          onclick: () => {
            const blob = new Blob([json], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = el("a", { href: url, download: `survey-response-${state.sessionId}.json` });
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
          },
        }, "Download responses (JSON)"),
        el("button", { class: "btn-primary", onclick: () => location.reload() }, "Start another round"),
      ]),
      el("pre", { class: "summary-box" }, json)
    );
  }

  card.append(
    el("div", { class: "btn-row analysis-link-row" }, [
      el("span"),
      el("a", { class: "btn-secondary", href: "analysis.html" }, "See the guideline analysis →"),
    ])
  );

  renderApp(card);
}

/* ---------- Boot ---------- */

async function boot() {
  const all = await fetchJSON("generated/data.json");
  state.items = shuffle(all).slice(0, Math.min(SAMPLE_SIZE, all.length));

  const stored = loadStoredRespondent();
  if (stored) {
    // Returning for another round in this browser - skip straight to rating
    // with the remembered background instead of asking again.
    state.respondent = stored;
    renderRatingList();
  } else {
    renderRespondentInfo();
  }
}

boot();
