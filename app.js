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
        "opposed to being general cloud/software advice."),
      el("ul", { class: "intro-facts" }, [
        el("li", {}, [el("span", { class: "ico" }, "📝"), el("span", {}, `A few quick questions about your background, then you'll rate ${SAMPLE_SIZE} randomly selected guidelines.`)]),
        el("li", {}, [el("span", { class: "ico" }, "⏱️"), el("span", {}, "About 10–15 minutes.")]),
        el("li", {}, [el("span", { class: "ico" }, "🔒"), el("span", {}, "Anonymous — no account, no personal data collected.")]),
      ]),
      el("div", { class: "intro-sources" }, [
        el("p", { class: "intro-sources-label" }, "Guidelines are drawn from:"),
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
    renderApp(card);
    return;
  }

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

  renderApp(card);
}

/* ---------- Boot ---------- */

renderIntro();
