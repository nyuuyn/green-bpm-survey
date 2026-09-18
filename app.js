"use strict";

/* ---------- Config ---------- */

const SAMPLE_SIZE = 25;

// Set this to your deployed Google Apps Script Web App URL to go live.
// While null, the app runs in test mode: responses are shown on-screen and
// downloadable as JSON instead of being submitted anywhere.
const SUBMIT_ENDPOINT = null;

const RELEVANCE_OPTIONS = [
  { value: "0", label: "0 — not relevant" },
  { value: "1", label: "1 — barely relevant" },
  { value: "2", label: "2 — weak / indirect" },
  { value: "3", label: "3 — moderate" },
  { value: "4", label: "4 — high" },
  { value: "5", label: "5 — directly relevant" },
];

const SCOPE_OPTIONS = [
  "Process Model",
  "Worker/Task",
  "Process Data",
  "Infrastructure/Platform",
  "Organizational/Governance",
];

const GENERIC_OPTIONS = ["No", "Yes"];

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
  index: 0,
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
  const roleOtherWrap = el("div", { style: "margin-top:8px" }, [
    el("input", { type: "text", name: "roleOther", placeholder: "Please specify your role" }),
  ]);
  roleOtherWrap.hidden = true;

  const form = el("form", {
    onsubmit: (e) => {
      e.preventDefault();
      const data = collectRespondentInfo(form);
      if (!data.ok) {
        errorEl.textContent = data.error;
        return;
      }
      state.respondent = data.respondent;
      state.index = 0;
      renderQuestion();
    },
  });

  const roleGroup = radioGroup("role", ROLE_OPTIONS, { vertical: true });
  roleGroup.addEventListener("change", (e) => {
    if (e.target.name !== "role") return;
    roleOtherWrap.hidden = e.target.value !== "Other";
    if (roleOtherWrap.hidden) roleOtherWrap.querySelector("input").value = "";
  });

  form.append(
    el("fieldset", {}, [
      el("legend", {}, ["BPM experience", el("span", { class: "hint" }, "Your own background with business process management.")]),
      radioGroup("bpmExperience", EXPERIENCE_OPTIONS, { vertical: true }),
    ]),
    el("fieldset", {}, [
      el("legend", {}, ["Sustainability / green-IT experience", el("span", { class: "hint" }, "Separate from BPM — your background with sustainability specifically.")]),
      radioGroup("sustainabilityExperience", EXPERIENCE_OPTIONS, { vertical: true }),
    ]),
    el("fieldset", {}, [
      el("legend", {}, ["Role", el("span", { class: "hint" }, "Whichever best describes you.")]),
      roleGroup,
      roleOtherWrap,
    ]),
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

  if (!bpmExperience) return { ok: false, error: "Please select your BPM experience." };
  if (!sustainabilityExperience) return { ok: false, error: "Please select your sustainability/green-IT experience." };
  if (!role) return { ok: false, error: "Please select a role." };
  if (role === "Other" && !roleOther) return { ok: false, error: "Please specify your role, or choose a different option." };

  return {
    ok: true,
    respondent: {
      "BPM Experience": bpmExperience,
      "Sustainability Experience": sustainabilityExperience,
      Role: role === "Other" ? roleOther : role,
    },
  };
}

function renderQuestion() {
  const item = state.items[state.index];
  const total = state.items.length;
  setProgress(state.index + 1, total);

  const errorEl = el("p", { class: "error-text" });

  const form = el("form", {
    onsubmit: (e) => {
      e.preventDefault();
      const data = collectAnswer(form);
      if (!data.ok) {
        errorEl.textContent = data.error;
        return;
      }
      state.responses[state.index] = data.answer;
      if (state.index + 1 < total) {
        state.index += 1;
        renderQuestion();
      } else {
        renderComplete();
      }
    },
  });

  const genericFs = genericField();
  const relevanceFs = relevanceField((value) => setGenericEnabled(genericFs, value !== "0"));

  form.append(
    relevanceFs,
    scopeField(),
    genericFs,
    lifecycleField(),
    justificationField(),
    errorEl,
    el("div", { class: "btn-row" }, [
      state.index > 0
        ? el("button", { type: "button", class: "btn-secondary", onclick: goBack }, "Back")
        : el("span"),
      el("button", { type: "submit", class: "btn-primary" }, state.index + 1 < total ? "Next" : "Finish"),
    ])
  );

  renderApp(
    el("div", { class: "card" }, [
      el("div", { class: "badges" }, [
        el("span", { class: "badge" }, item.sourceLabel),
        item.category ? el("span", { class: "badge" }, item.category) : null,
      ]),
      el("h2", {}, item.name),
      el("p", { class: "guideline-text" }, item.guideline),
      el("a", { class: "ref-link", href: item.reference, target: "_blank", rel: "noopener" }, "View original source ↗"),
      form,
    ])
  );

  // restore previously entered answer if navigating back/forward
  const prior = state.responses[state.index];
  if (prior) {
    fillForm(form, prior);
    setGenericEnabled(genericFs, prior["BPM Relevance"] !== "0");
  }
}

function goBack() {
  state.index -= 1;
  renderQuestion();
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

function relevanceField(onChange) {
  const group = radioGroup("relevance", RELEVANCE_OPTIONS);
  group.addEventListener("change", (e) => {
    if (e.target.name === "relevance") onChange(e.target.value);
  });
  return el("fieldset", {}, [
    el("legend", {}, ["BPM Relevance", el("span", { class: "hint" }, "How relevant is this guideline to business process design, modeling, execution, or monitoring?")]),
    group,
  ]);
}

function scopeField() {
  return el("fieldset", {}, [
    el("legend", {}, ["BPM Scope", el("span", { class: "hint" }, "Select every layer this guideline actually acts on — often more than one.")]),
    checkboxGroup("scope", SCOPE_OPTIONS, { vertical: true }),
  ]);
}

function genericField() {
  const naNote = el("p", { class: "hint", "data-role": "generic-na-note", hidden: true },
    "Not applicable — this guideline scored 0 on BPM Relevance, so there's no BPM argument left to classify.");
  return el("fieldset", { "data-role": "generic-fieldset" }, [
    el("legend", {}, ["Generic?", el("span", { class: "hint" }, "Is this just general good practice, or a BPM-specific argument?")]),
    radioGroup("generic", GENERIC_OPTIONS),
    naNote,
  ]);
}

function setGenericEnabled(fieldset, enabled) {
  fieldset.querySelectorAll('input[name="generic"]').forEach((input) => {
    input.disabled = !enabled;
    if (!enabled) input.checked = false;
  });
  fieldset.classList.toggle("fieldset-disabled", !enabled);
  const note = fieldset.querySelector('[data-role="generic-na-note"]');
  if (note) note.hidden = enabled;
}

function lifecycleField() {
  const naRow = el("div", { style: "margin-top:8px" }, [
    el("div", { class: "option" }, [
      el("input", { type: "checkbox", name: "lifecycle", id: "lifecycle-na", value: "Not Applicable" }),
      el("label", { for: "lifecycle-na" }, "Not Applicable"),
    ]),
  ]);

  const fieldset = el("fieldset", {}, [
    el("legend", {}, ["BPM Lifecycle", el("span", { class: "hint" }, "Select every phase that applies, or Not Applicable alone.")]),
    checkboxGroup("lifecycle", LIFECYCLE_OPTIONS),
    naRow,
  ]);

  // Enforce mutual exclusivity live, rather than only on submit.
  fieldset.addEventListener("change", (e) => {
    if (e.target.name !== "lifecycle" || !e.target.checked) return;
    const all = fieldset.querySelectorAll('input[name="lifecycle"]');
    if (e.target.value === "Not Applicable") {
      all.forEach((cb) => { if (cb !== e.target) cb.checked = false; });
    } else {
      const na = fieldset.querySelector('input[value="Not Applicable"]');
      if (na) na.checked = false;
    }
  });

  return fieldset;
}

function justificationField() {
  return el("fieldset", {}, [
    el("legend", {}, ["Justification", el("span", { class: "hint" }, "Optional — briefly explain your rating.")]),
    el("textarea", { name: "justification", placeholder: "Why did you rate it this way?" }),
  ]);
}

/* ---------- Collecting & validating ---------- */

function collectAnswer(form) {
  const fd = new FormData(form);
  const relevance = fd.get("relevance");
  const scope = fd.getAll("scope");
  const generic = fd.get("generic") || ""; // absent when the fieldset is disabled (Relevance = 0)
  const lifecycle = fd.getAll("lifecycle");
  const justification = (fd.get("justification") || "").trim();

  if (!relevance) return { ok: false, error: "Please select a BPM Relevance score." };
  if (scope.length === 0) return { ok: false, error: "Please select at least one BPM Scope." };
  if (relevance !== "0" && !generic) return { ok: false, error: "Please select Yes or No for Generic." };
  if (lifecycle.length === 0) return { ok: false, error: "Please select at least one BPM Lifecycle phase, or Not Applicable." };
  if (lifecycle.includes("Not Applicable") && lifecycle.length > 1) {
    return { ok: false, error: "Not Applicable can't be combined with other lifecycle phases." };
  }

  const item = state.items[state.index];
  return {
    ok: true,
    answer: {
      ID: item.id,
      "BPM Relevance": relevance,
      "BPM Scope": scope.join(", "),
      Generic: relevance === "0" ? "" : generic,
      "BPM Justification": justification,
      "BPM Lifecycle": lifecycle.join(", "),
      Discussion: "",
    },
  };
}

function fillForm(form, answer) {
  const setRadio = (name, value) => {
    form.querySelectorAll(`input[name="${name}"]`).forEach((input) => {
      input.checked = input.value === value;
    });
  };
  const setChecklist = (name, values) => {
    form.querySelectorAll(`input[name="${name}"]`).forEach((input) => {
      input.checked = values.includes(input.value);
    });
  };
  setRadio("relevance", answer["BPM Relevance"]);
  const scopes = answer["BPM Scope"] ? answer["BPM Scope"].split(",").map((s) => s.trim()) : [];
  setChecklist("scope", scopes);
  setRadio("generic", answer.Generic);
  const lifecycles = answer["BPM Lifecycle"] ? answer["BPM Lifecycle"].split(",").map((s) => s.trim()) : [];
  setChecklist("lifecycle", lifecycles);
  form.querySelector('textarea[name="justification"]').value = answer["BPM Justification"] || "";
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
