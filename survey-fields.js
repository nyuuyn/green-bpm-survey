"use strict";

/* ---------- Form field builders ----------
 * The reusable widgets the rating form is built from - generic radio/checkbox
 * groups, the per-row BPM Scope/Generic/Lifecycle/Justification fieldsets,
 * and the small helpers that operate on them (checking a matching radio for
 * prefill, enabling/disabling a fieldset). survey.js owns the screens that
 * assemble these into "About you" and the rating list, and the
 * collecting/validating logic that reads values back out of them.
 */

const GENERIC_OPTIONS = [
  { value: "Yes", label: "General practice" },
  { value: "No", label: "BPM-specific" },
];

// Checks the radio in `container` whose value matches, for prefilling a
// previously-answered "About you" form. Returns whether a match was found.
function checkMatchingRadio(container, value) {
  if (!value) return false;
  for (const input of container.querySelectorAll('input[type="radio"]')) {
    if (input.value === value) {
      input.checked = true;
      return true;
    }
  }
  return false;
}

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
