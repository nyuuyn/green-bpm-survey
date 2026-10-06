"use strict";

/* ---------- Lifecycle page: the per-phase popup ----------
 * Rendered into a stable wrapper div (lifecycle.js's popupEl) whenever
 * location.hash names a valid phase - closing (overlay click, close button,
 * or Escape - wired up in lifecycle.js) clears the hash rather than toggling
 * local component state, so an open popup is itself linkable/shareable the
 * same way a single analysis round already is (see analysis.js).
 */

function GuidelinePopup({ phase, items, onClose }) {
  return html`
    <div class="popup-overlay" onClick=${onClose}>
      <div
        class="popup-card"
        role="dialog"
        aria-modal="true"
        aria-label=${`Guidelines most relevant to ${phase}`}
        onClick=${(e) => e.stopPropagation()}
      >
        <div class="popup-header">
          <h2>${PHASE_ICONS[phase]} ${phase}</h2>
          <button type="button" class="popup-close" aria-label="Close" onClick=${onClose}>✕</button>
        </div>
        ${items.length === 0
          ? html`<p class="intro-lead">No rated guidelines are tagged with this phase yet.</p>`
          : html`
            <ul class="popup-guideline-list">
              ${items.map((item) => html`
                <li class="popup-guideline" key=${item.id}>
                  <div class="popup-guideline-head">
                    <span class="popup-guideline-name">${item.guideline.name}</span>
                    <span class="popup-guideline-score" title="Average BPM Relevance across AI rating rounds (0–3)">${item.avgRelevance.toFixed(1)}</span>
                  </div>
                  <p class="popup-guideline-text">${item.guideline.guideline}</p>
                  <a class="ref-link" href=${item.guideline.reference} target="_blank" rel="noopener">${item.guideline.sourceLabel} ↗</a>
                </li>
              `)}
            </ul>
          `}
      </div>
    </div>
  `;
}
