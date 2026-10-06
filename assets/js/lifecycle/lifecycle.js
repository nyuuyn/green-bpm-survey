"use strict";

/* ---------- Lifecycle page ----------
 * Distills the survey's per-guideline BPM Lifecycle tagging into one view: a
 * six-phase wheel (LIFECYCLE_OPTIONS, in common.js) that doubles as
 * navigation - clicking a phase opens a popup of the guidelines rated most
 * relevant to it (see issue: "a cycle graphic the user can click, popup
 * shows the mostly relevant guidelines for each phase").
 *
 * "Most relevant" is computed across all three AI rating rounds at once
 * (this page doesn't load analysis.js, so it keeps its own small
 * ROUND_FILES list rather than reusing ANALYSIS_ROUNDS) instead of picking
 * one round, since no single round is meant to be read as the final word yet
 * (see analysis.js's intro blurb). A guideline counts as touching a phase if
 * ANY round tagged it with that phase - union, not intersection - since this
 * page is about surfacing candidates per phase, not about rounds agreeing on
 * the tag. Its relevance score is the mean of whichever rounds actually
 * rated it (nulls excluded): the one number every round rates on the same
 * 0-3 scale regardless of how it tagged lifecycle.
 *
 * generated/analysis_<round>.json (ratings: relevance/lifecycle, no
 * guideline text) and generated/data.json (guideline text, no ratings) are
 * otherwise never joined by any existing code (see data/generate_data.py) -
 * mergeRoundRecords()/topGuidelinesForPhase() below are that join, scoped to
 * just this page.
 */

const LIFECYCLE_ROUND_FILES = [
  "generated/analysis_claude.json",
  "generated/analysis_sustainability.json",
  "generated/analysis_bpm.json",
];

const TOP_GUIDELINES_PER_PHASE = 6;

function mergeRoundRecords(roundRecordSets) {
  const merged = new Map();
  roundRecordSets.forEach((records) => {
    records.forEach((r) => {
      if (!merged.has(r.id)) merged.set(r.id, { id: r.id, relevances: [], phases: new Set() });
      const entry = merged.get(r.id);
      if (r.relevance !== null && r.relevance !== undefined) entry.relevances.push(r.relevance);
      r.lifecycle.forEach((p) => { if (p !== "Not Applicable") entry.phases.add(p); });
    });
  });
  return merged;
}

function averageRelevance(relevances) {
  if (!relevances.length) return null;
  return relevances.reduce((sum, v) => sum + v, 0) / relevances.length;
}

function topGuidelinesForPhase(phase, merged, guidelinesById, limit = TOP_GUIDELINES_PER_PHASE) {
  return [...merged.values()]
    .filter((entry) => entry.phases.has(phase))
    .map((entry) => ({ ...entry, avgRelevance: averageRelevance(entry.relevances), guideline: guidelinesById.get(entry.id) }))
    .filter((entry) => entry.avgRelevance !== null && entry.guideline)
    .sort((a, b) => b.avgRelevance - a.avgRelevance || a.guideline.name.localeCompare(b.guideline.name))
    .slice(0, limit);
}

let merged = null;
let guidelinesById = null;
let wheelEl, popupEl;

function phaseFromHash() {
  const id = location.hash.replace(/^#/, "");
  return LIFECYCLE_OPTIONS.includes(id) ? id : null;
}

function selectPhase(phase) {
  location.hash = phase;
}

function closePopup() {
  location.hash = "";
}

function render() {
  const activePhase = phaseFromHash();
  preactRender(html`<${LifecycleWheel} activePhase=${activePhase} onSelect=${selectPhase} />`, wheelEl);

  if (activePhase && merged) {
    const items = topGuidelinesForPhase(activePhase, merged, guidelinesById);
    preactRender(html`<${GuidelinePopup} phase=${activePhase} items=${items} onClose=${closePopup} />`, popupEl);
    popupEl.hidden = false;
  } else {
    popupEl.hidden = true;
    preactRender(null, popupEl);
  }
}

async function loadData() {
  const [guidelines, ...roundRecordSets] = await Promise.all([
    fetchJSON("generated/data.json"),
    ...LIFECYCLE_ROUND_FILES.map((file) => fetchJSON(file)),
  ]);
  guidelinesById = new Map(guidelines.map((g) => [g.id, g]));
  merged = mergeRoundRecords(roundRecordSets);
}

function buildPage() {
  wheelEl = el("div", { class: "lifecycle-wheel-wrap" });
  popupEl = el("div", { id: "lifecycle-popup-root" });
  popupEl.hidden = true;

  renderApp(
    el("div", { class: "card lifecycle-intro" }, [
      el("h1", {}, "Where in the BPM lifecycle do these guidelines apply?"),
      el("p", { class: "intro-lead" }, [
        "Each phase below is one stage of the BPM lifecycle. Click a phase to see the " +
        "sustainability guidelines rated most relevant to it, averaged across every AI rating " +
        "round so far. For the full breakdown of charts and tables behind this, see the ",
        el("a", { class: "ref-link", href: "analysis.html" }, "analysis page"),
        ".",
      ]),
    ]),
    el("div", { class: "card lifecycle-card" }, [wheelEl]),
    popupEl
  );

  window.addEventListener("hashchange", render);
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && phaseFromHash()) closePopup();
  });

  render(); // mounts the wheel immediately - it needs no data; the popup (if hash
  // already names a phase on direct load) stays hidden until loadData resolves
  loadData().then(render);
}

buildPage();
