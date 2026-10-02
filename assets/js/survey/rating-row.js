"use strict";

/* ---------- Rating row component ----------
 * One row of the rating list's BPM Relevance/Scope/Generic/Lifecycle/
 * Justification fields. `answer` is owned by the RatingList parent
 * (rating-list.js) - lifted state, standard Preact/React list pattern - this
 * component is purely about rendering it and reporting changes back via
 * onChange/onToggle. validateRowAnswer (survey.js) decides the "complete"
 * class; RatingList owns "invalid" (only set after a failed Finish attempt).
 */

const GENERIC_OPTIONS = [
  { value: "Yes", label: "General practice" },
  { value: "No", label: "BPM-specific" },
];

function RatingRow({ item, index: i, answer, expanded, invalid, onChange, onToggle }) {
  const enabled = answer.relevance !== "0";
  const relevanceName = `relevance-${i}`;
  const scopeName = `scope-${i}`;
  const genericName = `generic-${i}`;
  const lifecycleName = `lifecycle-${i}`;
  const justificationName = `justification-${i}`;

  function setRelevance(value) {
    // Relevance 0 means nothing else is classifiable - clear whatever was
    // selected in the fields we're about to hide, same as the original
    // setFieldsetEnabled(fs, false) clearing behavior.
    onChange(i, (prev) => (value === "0"
      ? { ...prev, relevance: value, scope: [], generic: "", lifecycle: [] }
      : { ...prev, relevance: value }));
  }
  function toggleScope(value, checked) {
    onChange(i, (prev) => ({ ...prev, scope: checked ? [...prev.scope, value] : prev.scope.filter((v) => v !== value) }));
  }
  function setGeneric(value) {
    onChange(i, (prev) => ({ ...prev, generic: value }));
  }
  function toggleLifecycle(value, checked) {
    onChange(i, (prev) => {
      if (!checked) return { ...prev, lifecycle: prev.lifecycle.filter((v) => v !== value) };
      // Enforce mutual exclusivity live, same as the original lifecycleField listener.
      if (value === "Not Applicable") return { ...prev, lifecycle: ["Not Applicable"] };
      return { ...prev, lifecycle: [...prev.lifecycle.filter((v) => v !== "Not Applicable"), value] };
    });
  }
  function setJustification(value) {
    onChange(i, (prev) => ({ ...prev, justification: value }));
  }

  const rowClasses = ["rating-row"];
  if (expanded) rowClasses.push("expanded");
  if (invalid) rowClasses.push("invalid");
  else if (validateRowAnswer(answer) === null) rowClasses.push("complete");

  return html`
    <div class=${rowClasses.join(" ")} data-index=${String(i)}>
      <div class="rating-row-header" onClick=${() => onToggle(i)}>
        <div class="rating-row-top">
          <span class="rating-row-num">${i + 1}.</span>
          <span class="row-status"></span>
          <span class="badge">${item.sourceLabel}</span>
          <span class="chevron">${expanded ? "▴" : "▾"}</span>
        </div>
        <span class="rating-row-label">${item.name}</span>
        <p class="rating-row-guideline">${item.guideline}</p>
        ${item.context ? html`<p class="rating-row-context">${item.context}</p>` : null}
        <a class="ref-link" href=${item.reference} target="_blank" rel="noopener" onClick=${(e) => e.stopPropagation()}>
          This is a condensed summary — read the full guideline ↗
        </a>
        <div class="relevance-dots-row" onClick=${(e) => e.stopPropagation()}>
          <span class="relevance-dots-label">BPM Relevance</span>
          <div class="relevance-dots">
            ${RELEVANCE_OPTIONS.map((opt, oi) => html`
              <div class="option dot">
                <input type="radio" name=${relevanceName} id="${relevanceName}-${oi}" value=${opt.value}
                  checked=${answer.relevance === opt.value} onChange=${() => setRelevance(opt.value)} />
                <label for="${relevanceName}-${oi}" title=${opt.label}>${opt.value}</label>
              </div>
            `)}
          </div>
        </div>
      </div>
      <div class="rating-row-body" hidden=${!expanded}>
        <fieldset data-role="scope-fieldset" hidden=${!enabled}>
          <legend>BPM Scope <span class="hint">Select every layer this guideline actually acts on — often more than one.</span></legend>
          <div class="option-row">
            ${SCOPE_OPTIONS.map((opt, oi) => html`
              <div class="option">
                <input type="checkbox" name=${scopeName} id="${scopeName}-${oi}" value=${opt}
                  checked=${answer.scope.includes(opt)} disabled=${!enabled}
                  onChange=${(e) => toggleScope(opt, e.target.checked)} />
                <label for="${scopeName}-${oi}">${opt}</label>
              </div>
            `)}
          </div>
        </fieldset>
        <fieldset data-role="generic-fieldset" hidden=${!enabled}>
          <legend>General practice, or BPM-specific? <span class="hint">Would this guideline make just as much sense outside of BPM, or is the argument specific to business processes?</span></legend>
          <div class="option-row">
            ${GENERIC_OPTIONS.map((opt, oi) => html`
              <div class="option">
                <input type="radio" name=${genericName} id="${genericName}-${oi}" value=${opt.value}
                  checked=${answer.generic === opt.value} disabled=${!enabled}
                  onChange=${() => setGeneric(opt.value)} />
                <label for="${genericName}-${oi}">${opt.label}</label>
              </div>
            `)}
          </div>
        </fieldset>
        <fieldset data-role="lifecycle-fieldset" hidden=${!enabled}>
          <legend>BPM Lifecycle <span class="hint">Select every phase that applies, or Not Applicable alone.</span></legend>
          <div class="option-row">
            ${[...LIFECYCLE_OPTIONS, "Not Applicable"].map((opt, oi) => html`
              <div class="option">
                <input type="checkbox" name=${lifecycleName} id="${lifecycleName}-${oi}" value=${opt}
                  checked=${answer.lifecycle.includes(opt)} disabled=${!enabled}
                  onChange=${(e) => toggleLifecycle(opt, e.target.checked)} />
                <label for="${lifecycleName}-${oi}">${opt}</label>
              </div>
            `)}
          </div>
        </fieldset>
        <fieldset>
          <legend>Justification <span class="hint">Optional — briefly explain your rating.</span></legend>
          <textarea name=${justificationName} placeholder="Why did you rate it this way?"
            value=${answer.justification} onInput=${(e) => setJustification(e.target.value)}></textarea>
        </fieldset>
      </div>
    </div>
  `;
}
