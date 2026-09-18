"use strict";

/* ---------- Config ---------- */

const SAMPLE_SIZE = 25;

// Set this to your deployed Google Apps Script Web App URL to go live.
// While null, the app runs in test mode: responses are shown on-screen and
// downloadable as JSON instead of being submitted anywhere.
const SUBMIT_ENDPOINT = null;

const RELEVANCE_OPTIONS = [
  { value: "0", label: "0 — not relevant" },
  { value: "1", label: "1 — low" },
  { value: "2", label: "2 — moderate" },
  { value: "3", label: "3 — high" },
];

const SCOPE_OPTIONS = [
  "Process Model",
  "Worker/Task",
  "Process Data",
  "Infrastructure/Platform",
  "Organizational/Governance",
];

const GENERIC_OPTIONS = [
  { value: "Yes", label: "General practice" },
  { value: "No", label: "BPM-specific" },
];

const LIFECYCLE_OPTIONS = [
  "Design",
  "Modeling",
  "Execution",
  "Monitoring",
  "Analysis",
  "Optimization",
];

const EXPERIENCE_OPTIONS = [
  "None",
  "Studied it, not in practice",
  "Practitioner, < 2 years",
  "Practitioner, 2-5 years",
  "Practitioner, 5+ years",
  "Prefer not to say",
];

const GUIDELINE_SOURCES = [
  { label: "AWS Well-Architected Framework — Sustainability Pillar", url: "https://docs.aws.amazon.com/wellarchitected/latest/sustainability-pillar/sustainability-pillar.html" },
  { label: "Azure Well-Architected Framework — Sustainability", url: "https://learn.microsoft.com/en-us/azure/well-architected/sustainability/" },
  { label: "Google Cloud Well-Architected Framework — Sustainability", url: "https://cloud.google.com/architecture/framework/sustainability" },
  { label: "Green Software Foundation Patterns Catalog", url: "https://patterns.greensoftware.foundation/" },
  { label: "W3C Web Sustainability Guidelines", url: "https://www.w3.org/TR/web-sustainability-guidelines/" },
  { label: "Green Business Process Patterns (Nowak et al., 2011)", url: "https://www.iaas.uni-stuttgart.de/publications/INPROC-2011-65-Green_Business_Process_Patterns_web.pdf" },
  { label: "process-pattern.app", url: "https://process-pattern.app/" },
  { label: "EPA Lean & Environment Toolkit", url: "https://www.epa.gov/sustainability/lean-environment-toolkit-preface" },
  { label: "Lean Enterprise Institute — sustainability articles", url: "https://www.lean.org/the-lean-post/articles/how-lean-can-help-you-go-green/" },
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

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (v !== false && v !== null && v !== undefined) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

const app = document.getElementById("app");
const progressBar = document.getElementById("progressBar");
const progressFill = document.getElementById("progressFill");
const progressLabel = document.getElementById("progressLabel");

function renderApp(...children) {
  app.replaceChildren(...children);
  window.scrollTo(0, 0);
}

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

/* ---------- Screens ---------- */

function renderIntro() {
  setProgress(0, 0);
  renderApp(
    el("div", { class: "card" }, [
      el("p", { class: "intro-eyebrow" }, [
        el("img", { src: "assets/img/envite-icon.svg", alt: "", class: "eyebrow-icon" }),
        el("span", {}, "A research initiative by "),
        el("a", { class: "ref-link", href: "https://envite.de", target: "_blank", rel: "noopener" }, "envite Consulting"),
      ]),
      el("h1", {}, "Is sustainability guidance actually relevant to Business Process Management?"),
      el("p", { class: "intro-lead" },
        "We collected 425 sustainability guidelines from cloud providers, the Green Software " +
        "Foundation, W3C, and academic BPM/lean literature. We'd like your judgment on how relevant " +
        "each one is to designing, modeling, executing, and monitoring business processes — as " +
        "opposed to being general cloud/software advice. Your ratings, together with an existing " +
        "AI-generated pass, will help distill a focused Green BPM Guideline out of all this raw guidance."),
      el("ul", { class: "intro-facts" }, [
        el("li", {}, [el("span", { class: "ico" }, "📝"), el("span", {}, `A few quick questions about your background, then you'll rate ${SAMPLE_SIZE} randomly selected guidelines.`)]),
        el("li", {}, [el("span", { class: "ico" }, "📊"), el("span", {}, "For each one: how relevant it is (0–3), which part of the process it touches, and which BPM lifecycle phase it applies to.")]),
        el("li", {}, [el("span", { class: "ico" }, "⏱️"), el("span", {}, "About 10–15 minutes.")]),
        el("li", {}, [el("span", { class: "ico" }, "🔒"), el("span", {}, "Anonymous — no account, no personal data collected.")]),
      ]),
      el("div", { class: "intro-sources" }, [
        el("p", { class: "intro-sources-label" }, "Guidelines are drawn from cloud frameworks, web standards, and BPM-specific pattern catalogs:"),
        el("ul", { class: "source-list" },
          GUIDELINE_SOURCES.map((s) =>
            el("li", {}, el("a", { class: "ref-link", href: s.url, target: "_blank", rel: "noopener" }, s.label))
          )
        ),
      ]),
      el("div", { class: "btn-row" }, [
        el("span"),
        el("button", { class: "btn-primary", onclick: startSurvey }, "Start"),
      ]),
    ])
  );
}

async function startSurvey() {
  if (state.items.length === 0) {
    const res = await fetch("data.json");
    const all = await res.json();
    state.items = shuffle(all).slice(0, Math.min(SAMPLE_SIZE, all.length));
  }
  renderRespondentInfo();
}

function renderRespondentInfo() {
  setProgress(0, 0);

  const errorEl = el("p", { class: "error-text" });
  errorEl.hidden = true;
  const roleOtherWrap = el("div", { style: "margin-top:8px" }, [
    el("input", { type: "text", name: "roleOther", placeholder: "Please specify your role" }),
  ]);
  roleOtherWrap.hidden = true;

  const roleGroup = radioGroup("role", ROLE_OPTIONS, { vertical: true });
  roleGroup.addEventListener("change", (e) => {
    if (e.target.name !== "role") return;
    roleOtherWrap.hidden = e.target.value !== "Other";
    if (roleOtherWrap.hidden) roleOtherWrap.querySelector("input").value = "";
  });

  const bpmFieldset = el("fieldset", { class: "field-group" }, [
    el("legend", { class: "sr-only" }, "BPM experience"),
    el("div", { class: "field-group-title" }, ["BPM experience", el("span", { class: "hint" }, "Your own background with business process management.")]),
    radioGroup("bpmExperience", EXPERIENCE_OPTIONS, { vertical: true }),
  ]);
  const sustainabilityFieldset = el("fieldset", { class: "field-group" }, [
    el("legend", { class: "sr-only" }, "Sustainability / green-IT experience"),
    el("div", { class: "field-group-title" }, ["Sustainability / green-IT experience", el("span", { class: "hint" }, "Separate from BPM — your background with sustainability specifically.")]),
    radioGroup("sustainabilityExperience", EXPERIENCE_OPTIONS, { vertical: true }),
  ]);
  const roleFieldset = el("fieldset", { class: "field-group" }, [
    el("legend", { class: "sr-only" }, "Role"),
    el("div", { class: "field-group-title" }, ["Role", el("span", { class: "hint" }, "Whichever best describes you.")]),
    roleGroup,
    roleOtherWrap,
  ]);

  const allFieldsets = [bpmFieldset, sustainabilityFieldset, roleFieldset];
  const fieldsetByName = {
    bpmExperience: bpmFieldset,
    sustainabilityExperience: sustainabilityFieldset,
    role: roleFieldset,
    roleOther: roleFieldset,
  };

  const form = el("form", {
    onsubmit: (e) => {
      e.preventDefault();
      const data = collectRespondentInfo(form);
      allFieldsets.forEach((fs) => fs.classList.remove("invalid"));
      if (!data.ok) {
        errorEl.hidden = false;
        errorEl.textContent = data.error;
        const target = fieldsetByName[data.field] || roleFieldset;
        target.classList.add("invalid");
        target.parentNode.insertBefore(errorEl, target);
        errorEl.scrollIntoView?.({ behavior: "smooth", block: "center" });
        return;
      }
      errorEl.hidden = true;
      state.respondent = data.respondent;
      renderRatingList();
    },
  });

  form.append(
    bpmFieldset,
    sustainabilityFieldset,
    roleFieldset,
    errorEl,
    el("div", { class: "btn-row" }, [
      el("span"),
      el("button", { type: "submit", class: "btn-primary" }, "Continue"),
    ])
  );

  renderApp(
    el("div", { class: "card" }, [
      el("h1", {}, "About you"),
      el("p", { class: "intro-lead" }, "This helps us understand whether BPM/sustainability background affects how guidelines get rated — it's not used to identify you."),
      form,
    ])
  );
}

function collectRespondentInfo(form) {
  const fd = new FormData(form);
  const bpmExperience = fd.get("bpmExperience");
  const sustainabilityExperience = fd.get("sustainabilityExperience");
  const role = fd.get("role");
  const roleOther = (fd.get("roleOther") || "").trim();

  if (!bpmExperience) return { ok: false, field: "bpmExperience", error: "Please select your BPM experience." };
  if (!sustainabilityExperience) return { ok: false, field: "sustainabilityExperience", error: "Please select your sustainability/green-IT experience." };
  if (!role) return { ok: false, field: "role", error: "Please select a role." };
  if (role === "Other" && !roleOther) return { ok: false, field: "roleOther", error: "Please specify your role, or choose a different option." };

  return {
    ok: true,
    respondent: {
      "BPM Experience": bpmExperience,
      "Sustainability Experience": sustainabilityExperience,
      Role: role === "Other" ? roleOther : role,
    },
  };
}

function renderRatingList() {
  const total = state.items.length;
  const errorEl = el("p", { class: "error-text" });
  errorEl.hidden = true;
  const rows = state.items.map((item, i) => buildRatingRow(item, i));

  function refreshProgress() {
    setProgress(rows.filter((rowEl) => rowEl.classList.contains("complete")).length, total);
  }

  const form = el("form", {
    onsubmit: (e) => {
      e.preventDefault();
      handleFinish(form, rows, errorEl);
    },
  });

  form.append(
    el("div", { class: "rating-list" }, rows),
    errorEl,
    el("div", { class: "btn-row" }, [
      el("span"),
      el("button", { type: "submit", class: "btn-primary" }, "Finish"),
    ])
  );

  form.addEventListener("change", (e) => {
    const i = rowIndexFromName(e.target.name);
    if (i === null) return;
    const rowEl = rows[i];
    const a = readRowAnswer(form, i);
    const enabled = a.relevance !== "0";
    ["scope-fieldset", "generic-fieldset", "lifecycle-fieldset"].forEach((role) => {
      const fs = rowEl.querySelector(`[data-role="${role}"]`);
      if (fs) setFieldsetEnabled(fs, enabled);
    });
    if (a.relevance !== "") toggleRow(rowEl, true);
    rowEl.classList.toggle("complete", validateRowAnswer(a) === null);
    rowEl.classList.remove("invalid");
    refreshProgress();
  });

  renderApp(
    el("div", { class: "card" }, [
      el("h1", {}, "Rate each guideline"),
      el("p", { class: "intro-lead" },
        "Click a guideline to rate it — picking a relevance score opens the rest of its fields. " +
        "You can jump between guidelines in any order and come back to finish later."),
      form,
    ])
  );

  refreshProgress();
}

function buildRatingRow(item, i) {
  const relevanceName = `relevance-${i}`;

  const bodyEl = el("div", { class: "rating-row-body" }, [
    scopeField(`scope-${i}`),
    genericField(`generic-${i}`),
    lifecycleField(`lifecycle-${i}`),
    justificationField(`justification-${i}`),
  ]);
  bodyEl.hidden = true;

  const headerEl = el("div", { class: "rating-row-header", onclick: () => toggleRow(rowEl) }, [
    el("div", { class: "rating-row-top" }, [
      el("span", { class: "rating-row-num" }, `${i + 1}.`),
      el("span", { class: "row-status" }),
      el("span", { class: "badge" }, item.sourceLabel),
      el("span", { class: "chevron" }, "▾"),
    ]),
    el("span", { class: "rating-row-label" }, item.name),
    el("p", { class: "rating-row-guideline" }, item.guideline),
    el("a", {
      class: "ref-link", href: item.reference, target: "_blank", rel: "noopener",
      onclick: (e) => e.stopPropagation(),
    }, "For more details, view the original source ↗"),
    el("div", { class: "relevance-dots-row", onclick: (e) => e.stopPropagation() }, [
      el("span", { class: "relevance-dots-label" }, "BPM Relevance"),
      relevanceDots(relevanceName),
    ]),
  ]);

  const rowEl = el("div", { class: "rating-row", "data-index": String(i) }, [headerEl, bodyEl]);
  return rowEl;
}

function toggleRow(rowEl, force) {
  const bodyEl = rowEl.querySelector(".rating-row-body");
  const expand = force !== undefined ? force : bodyEl.hidden;
  bodyEl.hidden = !expand;
  rowEl.querySelector(".chevron").textContent = expand ? "▴" : "▾";
  rowEl.classList.toggle("expanded", expand);
}

function rowIndexFromName(name) {
  const m = /-(\d+)$/.exec(name || "");
  return m ? Number(m[1]) : null;
}

function handleFinish(form, rows, errorEl) {
  let firstInvalid = null;
  let invalidCount = 0;
  const responses = new Array(state.items.length);

  state.items.forEach((item, i) => {
    const a = readRowAnswer(form, i);
    const err = validateRowAnswer(a);
    const rowEl = rows[i];
    rowEl.classList.toggle("invalid", !!err);
    rowEl.classList.toggle("complete", !err);
    if (err) {
      invalidCount += 1;
      if (!firstInvalid) firstInvalid = rowEl;
    } else {
      responses[i] = buildAnswerRecord(item, a);
    }
  });

  if (invalidCount > 0) {
    errorEl.hidden = false;
    errorEl.textContent = `${invalidCount} guideline(s) still need an answer — see the highlighted row(s) below.`;
    firstInvalid.parentNode.insertBefore(errorEl, firstInvalid);
    toggleRow(firstInvalid, true);
    errorEl.scrollIntoView?.({ behavior: "smooth", block: "center" });
    return;
  }

  errorEl.hidden = true;
  errorEl.textContent = "";
  state.responses = responses;
  renderComplete();
}

/* ---------- Form field builders ---------- */

function radioGroup(name, options, { vertical = false } = {}) {
  return el("div", { class: `option-row${vertical ? " vertical" : ""}` },
    options.map((opt, i) => {
      const value = typeof opt === "string" ? opt : opt.value;
      const label = typeof opt === "string" ? opt : opt.label;
      const id = `${name}-${i}`;
      return el("div", { class: "option" }, [
        el("input", { type: "radio", name, id, value }),
        el("label", { for: id }, label),
      ]);
    })
  );
}

function checkboxGroup(name, options, { vertical = false } = {}) {
  return el("div", { class: `option-row${vertical ? " vertical" : ""}` },
    options.map((opt, i) => {
      const id = `${name}-${i}`;
      return el("div", { class: "option" }, [
        el("input", { type: "checkbox", name, id, value: opt }),
        el("label", { for: id }, opt),
      ]);
    })
  );
}

function relevanceDots(name) {
  return el("div", { class: "relevance-dots" },
    RELEVANCE_OPTIONS.map((opt, i) => {
      const id = `${name}-${i}`;
      return el("div", { class: "option dot" }, [
        el("input", { type: "radio", name, id, value: opt.value }),
        el("label", { for: id, title: opt.label }, opt.value),
      ]);
    })
  );
}

function scopeField(name) {
  return el("fieldset", { "data-role": "scope-fieldset" }, [
    el("legend", {}, ["BPM Scope", el("span", { class: "hint" }, "Select every layer this guideline actually acts on — often more than one.")]),
    checkboxGroup(name, SCOPE_OPTIONS),
  ]);
}

function genericField(name) {
  return el("fieldset", { "data-role": "generic-fieldset" }, [
    el("legend", {}, ["General practice, or BPM-specific?", el("span", { class: "hint" }, "Would this guideline make just as much sense outside of BPM, or is the argument specific to business processes?")]),
    radioGroup(name, GENERIC_OPTIONS),
  ]);
}

// Relevance=0 means there's nothing left to classify, so Scope/Generic/Lifecycle are hidden
// entirely rather than just disabled - fewer fields to scroll past for the common case where
// most sampled guidelines score low.
function setFieldsetEnabled(fieldset, enabled) {
  fieldset.querySelectorAll("input").forEach((input) => {
    input.disabled = !enabled;
    if (!enabled) input.checked = false;
  });
  fieldset.hidden = !enabled;
}

function lifecycleField(name) {
  const fieldset = el("fieldset", { "data-role": "lifecycle-fieldset" }, [
    el("legend", {}, ["BPM Lifecycle", el("span", { class: "hint" }, "Select every phase that applies, or Not Applicable alone.")]),
    checkboxGroup(name, [...LIFECYCLE_OPTIONS, "Not Applicable"]),
  ]);

  // Enforce mutual exclusivity live, rather than only on submit.
  fieldset.addEventListener("change", (e) => {
    if (e.target.name !== name || !e.target.checked) return;
    const all = fieldset.querySelectorAll(`input[name="${name}"]`);
    if (e.target.value === "Not Applicable") {
      all.forEach((cb) => { if (cb !== e.target) cb.checked = false; });
    } else {
      const na = fieldset.querySelector('input[value="Not Applicable"]');
      if (na) na.checked = false;
    }
  });

  return fieldset;
}

function justificationField(name) {
  return el("fieldset", {}, [
    el("legend", {}, ["Justification", el("span", { class: "hint" }, "Optional — briefly explain your rating.")]),
    el("textarea", { name, placeholder: "Why did you rate it this way?" }),
  ]);
}

/* ---------- Collecting & validating ---------- */

function readRowAnswer(form, i) {
  const fd = new FormData(form);
  return {
    relevance: fd.get(`relevance-${i}`) || "",
    scope: fd.getAll(`scope-${i}`),
    generic: fd.get(`generic-${i}`) || "", // absent when the fieldset is disabled (Relevance = 0)
    lifecycle: fd.getAll(`lifecycle-${i}`),
    justification: (fd.get(`justification-${i}`) || "").trim(),
  };
}

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

  // Kept so the analysis screen's "Back" button can restore this exact card
  // without re-running the submission logic below (which must fire at most once).
  state.completeCard = card;

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
      el("button", { class: "btn-secondary", onclick: renderAnalysisScreen }, "See the guideline analysis →"),
    ])
  );

  renderApp(card);
}

/* ---------- Analysis screen ---------- */
//
// Shows the existing Claude AI-rating pass across all 425 guidelines (from
// analysis.json, generated by the private data repo's generate_analysis_json.py -
// same pattern as data.json). Once a submission backend exists, human responses
// collected "up to that point" can be merged into the same aggregation functions
// below without changing their shape - they already take a plain array of
// { source, bpmNative, relevance, scope, generic, lifecycle } records.

const ANALYSIS_SOURCE_ORDER = ["aws", "azure", "gcp", "gsf", "w3c", "gbpp", "ppatterns", "lean"];
const SOURCE_SHORT_LABELS = {
  aws: "AWS", azure: "Azure", gcp: "GCP", gsf: "GSF", w3c: "W3C",
  gbpp: "GBPP", ppatterns: "ppatterns.app", lean: "Lean",
};

let analysisRecords = null;
let analysisCharts = [];

async function loadAnalysisRecords() {
  if (!analysisRecords) {
    const res = await fetch("analysis.json");
    analysisRecords = await res.json();
  }
  return analysisRecords;
}

function destroyAnalysisCharts() {
  analysisCharts.forEach((c) => c.destroy());
  analysisCharts = [];
}

function isDarkMode() {
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

// Chart colors. Every chart draws from the same green family as the site's own
// --accent (the envite brand color) rather than an unrelated categorical palette,
// so the analysis screen reads as one system with the rest of the site. Two-way
// splits (native/general, generic/specific) use a strong vs. muted step of that
// same green rather than a second hue - each chart's legend/labels carry the
// identity, so a shared hue doesn't cost distinguishability.
function chartPalette() {
  const dark = isDarkMode();
  return {
    ink: dark ? "#ffffff" : "#0b0b0b",
    inkSecondary: dark ? "#c3c2b7" : "#52514e",
    grid: dark ? "#2c2c2a" : "#e1e0d9",
    axis: dark ? "#383835" : "#c3c2b7",
    tooltipBg: dark ? "#eef0ee" : "#1f1f1f",
    tooltipText: dark ? "#0f1b16" : "#ffffff",
    single: dark ? "#6ccbb2" : "#1e7a5c", // reuses the site's own --accent
    strong: dark ? "#6ccbb2" : "#1e7a5c", // same accent - the "highlighted" side of a 2-way split
    muted: dark ? "#317e6d" : "#a8d9cb", // a lighter/dimmer step of the same green - the baseline side
    relevanceSteps: dark
      ? ["#173a33", "#1f5148", "#317e6d", "#6ccbb2"] // low relevance recedes toward the dark surface
      : ["#d7ede7", "#a8d9cb", "#5fb59b", "#1e7a5c"], // low relevance stays pale on the light surface
  };
}

function baseScaleOptions(pal) {
  return {
    grid: { color: pal.grid, drawTicks: false },
    ticks: { color: pal.inkSecondary, font: { size: 11.5 } },
    border: { color: pal.axis },
  };
}

function baseTooltip(pal) {
  return { backgroundColor: pal.tooltipBg, titleColor: pal.tooltipText, bodyColor: pal.tooltipText, padding: 8, cornerRadius: 6 };
}

function mountChart(canvasId, config) {
  const chart = new Chart(document.getElementById(canvasId), config);
  analysisCharts.push(chart);
  return chart;
}

/* ---- Aggregations (mirrors analysis.ipynb's pandas groupbys) ---- */

function ratedRecords(records) {
  return records.filter((r) => r.relevance !== null && r.relevance !== undefined);
}

function countsPerSource(records) {
  const counts = Object.fromEntries(ANALYSIS_SOURCE_ORDER.map((s) => [s, 0]));
  records.forEach((r) => { counts[r.source] = (counts[r.source] || 0) + 1; });
  return ANALYSIS_SOURCE_ORDER.map((s) => counts[s]);
}

function relevanceDistribution(records) {
  const counts = [0, 0, 0, 0];
  ratedRecords(records).forEach((r) => { counts[r.relevance] += 1; });
  return counts;
}

function highRelevanceShareBySource(records) {
  return ANALYSIS_SOURCE_ORDER.map((source) => {
    const inSource = ratedRecords(records.filter((r) => r.source === source));
    const high = inSource.filter((r) => r.relevance >= 3).length;
    return inSource.length ? (high / inSource.length) * 100 : 0;
  });
}

function relevanceDistributionPerSource(records) {
  // Returns one array per relevance value 0..3, each holding one % per source (stacked-to-100 layout).
  const perRelevance = [[], [], [], []];
  ANALYSIS_SOURCE_ORDER.forEach((source) => {
    const inSource = ratedRecords(records.filter((r) => r.source === source));
    const total = inSource.length || 1;
    for (let rel = 0; rel <= 3; rel++) {
      perRelevance[rel].push((inSource.filter((r) => r.relevance === rel).length / total) * 100);
    }
  });
  return perRelevance;
}

function scopeCounts(records) {
  const counts = Object.fromEntries(SCOPE_OPTIONS.map((s) => [s, 0]));
  records.forEach((r) => r.scope.forEach((s) => { counts[s] += 1; }));
  return SCOPE_OPTIONS.map((s) => counts[s]);
}

function scopeShareByNative(records) {
  const groups = { general: records.filter((r) => !r.bpmNative), native: records.filter((r) => r.bpmNative) };
  const result = {};
  for (const [key, group] of Object.entries(groups)) {
    const rated = ratedRecords(group);
    const denom = rated.length || 1;
    result[key] = SCOPE_OPTIONS.map((scope) => (rated.filter((r) => r.scope.includes(scope)).length / denom) * 100);
  }
  return result;
}

function genericShareBySource(records) {
  const yes = [];
  const no = [];
  ANALYSIS_SOURCE_ORDER.forEach((source) => {
    const rated = records.filter((r) => r.source === source && r.generic);
    const total = rated.length || 1;
    yes.push((rated.filter((r) => r.generic === "Yes").length / total) * 100);
    no.push((rated.filter((r) => r.generic === "No").length / total) * 100);
  });
  return { yes, no };
}

function lifecycleCounts(records) {
  const phases = [...LIFECYCLE_OPTIONS, "Not Applicable"];
  const counts = Object.fromEntries(phases.map((p) => [p, 0]));
  records.forEach((r) => r.lifecycle.forEach((p) => { counts[p] += 1; }));
  return { phases, counts: phases.map((p) => counts[p]) };
}

function meanRelevanceByScope(records) {
  return SCOPE_OPTIONS.map((scope) => {
    const withScope = records.filter((r) => r.scope.includes(scope));
    if (withScope.length === 0) return 0;
    return withScope.reduce((sum, r) => sum + r.relevance, 0) / withScope.length;
  });
}

/* ---- Screen ---- */

function chartCard(title, description, canvasId, extra = []) {
  return el("div", { class: "chart-card" }, [
    el("h2", {}, title),
    description ? el("p", { class: "chart-desc" }, description) : null,
    el("div", { class: "chart-wrap" }, el("canvas", { id: canvasId })),
    ...extra,
  ]);
}

function legendDot(color, label) {
  return el("span", { class: "legend-item" }, [
    el("span", { class: "legend-dot", style: `background:${color}` }),
    el("span", {}, label),
  ]);
}

async function renderAnalysisScreen() {
  setProgress(0, 0);
  renderApp(el("div", { class: "card" }, el("p", { class: "intro-lead" }, "Loading analysis…")));

  const records = await loadAnalysisRecords();
  destroyAnalysisCharts();

  const screen = buildAnalysisScreen(records);
  renderApp(screen);
  mountAnalysisCharts(records);
}

function buildAnalysisScreen(records) {
  const pal = chartPalette();
  const totalRated = ratedRecords(records).length;

  const top20 = records
    .filter((r) => r.relevance !== null)
    .slice()
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 20);

  const table = el("div", { class: "table-wrap" }, [
    el("table", { class: "data-table" }, [
      el("thead", {}, el("tr", {}, ["Source", "Guideline", "Relevance", "Scope", "Generic"].map((h) => el("th", {}, h)))),
      el("tbody", {}, top20.map((r) => el("tr", {}, [
        el("td", {}, SOURCE_SHORT_LABELS[r.source] || r.source),
        el("td", {}, r.name),
        el("td", {}, String(r.relevance)),
        el("td", {}, r.scope.join(", ")),
        el("td", {}, r.generic || ""),
      ]))),
    ]),
  ]);

  return el("div", { class: "card analysis-card" }, [
    el("div", { class: "btn-row" }, [
      el("button", { class: "btn-secondary", onclick: () => renderApp(state.completeCard) }, "← Back"),
      el("a", { class: "ref-link", href: "analysis.json", download: "analysis.json" }, "Download full dataset (JSON) ↓"),
    ]),
    el("h1", {}, "How relevant is this guidance to BPM?"),
    el("p", { class: "intro-lead" },
      `An AI-generated first pass (Claude) rated all 425 guidelines across ${ANALYSIS_SOURCE_ORDER.length} sources ` +
      `for BPM relevance. ${totalRated} have a rating so far. Once real survey responses come in, this page is ` +
      "meant to show them here too, alongside this baseline."),

    el("div", { class: "analysis-grid" }, [
      chartCard("Guidelines collected per source", "How the 425 guidelines are distributed across sources.", "chart-per-source"),

      chartCard("BPM Relevance — overall", "0 = not relevant to BPM at all, 3 = highly relevant.", "chart-relevance-dist"),

      chartCard(
        "Share rated highly relevant, by source",
        "Percent of each source's guidelines scoring 3 (highly relevant).",
        "chart-high-relevance",
        [el("div", { class: "chart-legend" }, [legendDot(pal.muted, "General source"), legendDot(pal.strong, "BPM-native source")])]
      ),

      chartCard(
        "Relevance mix per source",
        "Full 0–3 breakdown per source, normalized to 100%.",
        "chart-relevance-mix",
        [el("div", { class: "chart-legend" }, RELEVANCE_OPTIONS.map((o, i) => legendDot(pal.relevanceSteps[i], o.label)))]
      ),

      chartCard("Which BPM layer do these guidelines touch?", "Count of guidelines acting on each layer (a guideline can touch more than one).", "chart-scope-counts"),

      chartCard(
        "BPM Scope emphasis — BPM-native vs. general sources",
        "Percent of each group's rated guidelines touching each layer.",
        "chart-scope-native",
        [el("div", { class: "chart-legend" }, [legendDot(pal.muted, "General source"), legendDot(pal.strong, "BPM-native source")])]
      ),

      chartCard(
        "Generic best practice vs. BPM-specific, by source",
        "Among rated guidelines: would the same advice apply outside BPM, or is the reasoning process-specific?",
        "chart-generic-share",
        [el("div", { class: "chart-legend" }, [legendDot(pal.muted, "Generic practice"), legendDot(pal.strong, "BPM-specific")])]
      ),

      chartCard("BPM Lifecycle phases touched", "Phase mentions across all guidelines (a guideline can span multiple phases).", "chart-lifecycle"),

      chartCard("Average relevance by BPM layer", "Mean BPM Relevance (0–3) among guidelines that touch each layer.", "chart-mean-by-scope"),
    ]),

    el("h2", { class: "top-table-heading" }, "Top-rated guidelines"),
    el("p", { class: "chart-desc" }, "The 20 highest-scoring guidelines across all sources."),
    table,
  ]);
}

function mountAnalysisCharts(records) {
  const pal = chartPalette();
  const shortLabels = ANALYSIS_SOURCE_ORDER.map((s) => SOURCE_SHORT_LABELS[s]);
  const legend = { display: false };
  const tooltip = baseTooltip(pal);

  mountChart("chart-per-source", {
    type: "bar",
    data: { labels: shortLabels, datasets: [{ data: countsPerSource(records), backgroundColor: pal.single, borderRadius: 4 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend, tooltip },
      scales: { x: baseScaleOptions(pal), y: { ...baseScaleOptions(pal), beginAtZero: true } },
    },
  });

  mountChart("chart-relevance-dist", {
    type: "bar",
    data: {
      labels: RELEVANCE_OPTIONS.map((o) => o.label),
      datasets: [{ data: relevanceDistribution(records), backgroundColor: pal.relevanceSteps, borderRadius: 4 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend, tooltip },
      scales: { x: baseScaleOptions(pal), y: { ...baseScaleOptions(pal), beginAtZero: true } },
    },
  });

  const nativeSet = new Set(["gbpp", "ppatterns", "lean"]);
  mountChart("chart-high-relevance", {
    type: "bar",
    data: {
      labels: shortLabels,
      datasets: [{
        data: highRelevanceShareBySource(records),
        backgroundColor: ANALYSIS_SOURCE_ORDER.map((s) => (nativeSet.has(s) ? pal.strong : pal.muted)),
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend, tooltip: { ...tooltip, callbacks: { label: (ctx) => `${ctx.parsed.y.toFixed(0)}%` } } },
      scales: { x: baseScaleOptions(pal), y: { ...baseScaleOptions(pal), beginAtZero: true, max: 100 } },
    },
  });

  const mixPerRelevance = relevanceDistributionPerSource(records);
  mountChart("chart-relevance-mix", {
    type: "bar",
    data: {
      labels: shortLabels,
      datasets: RELEVANCE_OPTIONS.map((o, i) => ({
        label: o.label, data: mixPerRelevance[i], backgroundColor: pal.relevanceSteps[i], stack: "mix",
      })),
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend, tooltip: { ...tooltip, callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(0)}%` } } },
      scales: {
        x: { ...baseScaleOptions(pal), stacked: true },
        y: { ...baseScaleOptions(pal), stacked: true, beginAtZero: true, max: 100 },
      },
    },
  });

  mountChart("chart-scope-counts", {
    type: "bar",
    data: { labels: SCOPE_OPTIONS, datasets: [{ data: scopeCounts(records), backgroundColor: pal.single, borderRadius: 4 }] },
    options: {
      indexAxis: "y",
      responsive: true, maintainAspectRatio: false,
      plugins: { legend, tooltip },
      scales: { x: { ...baseScaleOptions(pal), beginAtZero: true }, y: baseScaleOptions(pal) },
    },
  });

  const scopeByNative = scopeShareByNative(records);
  mountChart("chart-scope-native", {
    type: "bar",
    data: {
      labels: SCOPE_OPTIONS,
      datasets: [
        { label: "General source", data: scopeByNative.general, backgroundColor: pal.muted, borderRadius: 3 },
        { label: "BPM-native source", data: scopeByNative.native, backgroundColor: pal.strong, borderRadius: 3 },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true, maintainAspectRatio: false,
      plugins: { legend, tooltip: { ...tooltip, callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.x.toFixed(0)}%` } } },
      scales: { x: { ...baseScaleOptions(pal), beginAtZero: true, max: 100 }, y: baseScaleOptions(pal) },
    },
  });

  const genericShare = genericShareBySource(records);
  mountChart("chart-generic-share", {
    type: "bar",
    data: {
      labels: shortLabels,
      datasets: [
        { label: "Generic practice", data: genericShare.yes, backgroundColor: pal.muted, stack: "gen" },
        { label: "BPM-specific", data: genericShare.no, backgroundColor: pal.strong, stack: "gen" },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend, tooltip: { ...tooltip, callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(0)}%` } } },
      scales: {
        x: { ...baseScaleOptions(pal), stacked: true },
        y: { ...baseScaleOptions(pal), stacked: true, beginAtZero: true, max: 100 },
      },
    },
  });

  const lc = lifecycleCounts(records);
  mountChart("chart-lifecycle", {
    type: "bar",
    data: { labels: lc.phases, datasets: [{ data: lc.counts, backgroundColor: pal.single, borderRadius: 4 }] },
    options: {
      indexAxis: "y",
      responsive: true, maintainAspectRatio: false,
      plugins: { legend, tooltip },
      scales: { x: { ...baseScaleOptions(pal), beginAtZero: true }, y: baseScaleOptions(pal) },
    },
  });

  mountChart("chart-mean-by-scope", {
    type: "bar",
    data: { labels: SCOPE_OPTIONS, datasets: [{ data: meanRelevanceByScope(records), backgroundColor: pal.single, borderRadius: 4 }] },
    options: {
      indexAxis: "y",
      responsive: true, maintainAspectRatio: false,
      plugins: { legend, tooltip },
      scales: { x: { ...baseScaleOptions(pal), beginAtZero: true, max: 3 }, y: baseScaleOptions(pal) },
    },
  });
}

/* ---------- Boot ---------- */

renderIntro();
