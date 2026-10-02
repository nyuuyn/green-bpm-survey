"use strict";

/* ---------- Preact + htm ----------
 * PROTOTYPE: both pages render their screens with Preact + htm instead of
 * the el()/renderApp() helpers below (el()/renderApp() now only back the
 * handful of spots noted inline where a screen stays plain DOM). preact,
 * preact/hooks, and htm are loaded as plain UMD globals from
 * assets/js/vendor/ before this file - same "classic <script>, no build
 * step" loading model as the rest of the site. debounceRendering is
 * overridden to force synchronous re-renders (Preact otherwise batches
 * setState into a microtask), which keeps the timing identical to the old
 * imperative code's immediate DOM mutation - this is a global setting, so it
 * applies to every Preact component on either page, not just one screen.
 */
const { h, render: preactRender } = window.preact;
const { useState, useRef } = window.preactHooks;
const html = window.htm.bind(h);
window.preact.options.debounceRendering = (render) => render();

/* ---------- Shared vocabulary ----------
 * Used by both survey.js (the rating form) and analysis.js (aggregating and
 * labeling those same fields) - kept here once so the two can't drift apart.
 * See SURVEY_SCHEMA.md in the private data repo for the source of truth.
 */

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

const LIFECYCLE_OPTIONS = [
  "Design",
  "Modeling",
  "Execution",
  "Monitoring",
  "Analysis",
  "Optimization",
];

/* ---------- DOM helpers ---------- */

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

function renderApp(...children) {
  app.replaceChildren(...children);
  window.scrollTo(0, 0);
}

async function fetchJSON(url) {
  const res = await fetch(url);
  return res.json();
}
