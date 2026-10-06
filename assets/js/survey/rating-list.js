"use strict";

/* ---------- Rating list screen ----------
 * The sampled-guideline rating list, built from RatingRow (rating-row.js).
 * validateRowAnswer/buildAnswerRecord and renderComplete live in survey.js
 * (the page controller) since Finish needs them too; this file owns the
 * list's own lifted state (answers/expandedRows/invalidRows/errorMessage).
 */

// Shown above the rating list whenever "About you" was skipped or answered
// this round, so the remembered background stays visible (and correctable)
// rather than silently applying in the background.
function RespondentSummary() {
  const r = state.respondent;
  return html`
    <p class="respondent-summary">
      Role: ${r.Role} · BPM experience: ${r["BPM Experience"]} · Sustainability experience: ${r["Sustainability Experience"]}.
      <a href="#" class="respondent-edit-link" onClick=${(e) => { e.preventDefault(); renderRespondentInfo(); }}>Not you? Edit your info</a>
    </p>
  `;
}

function RatingList() {
  const total = state.items.length;
  const [answers, setAnswers] = useState(() => state.items.map(() => (
    { relevance: "", scope: [], generic: "", lifecycle: [], justification: "" }
  )));
  const [expandedRows, setExpandedRows] = useState(() => state.items.map(() => false));
  const [invalidRows, setInvalidRows] = useState(() => new Set());
  const [errorMessage, setErrorMessage] = useState(null);
  const errorRef = useRef(null);

  // Called directly in the render body (not a useEffect) - rendering is forced
  // synchronous above, so this runs exactly once per state change, same timing
  // as the original's explicit refreshProgress() calls.
  const completeCount = answers.filter((a) => validateRowAnswer(a) === null).length;
  setProgress(completeCount, total);

  function updateAnswer(i, updater) {
    const nextAnswer = updater(answers[i]);
    setAnswers((prev) => { const next = prev.slice(); next[i] = nextAnswer; return next; });
    if (invalidRows.has(i)) {
      setInvalidRows((prev) => { const next = new Set(prev); next.delete(i); return next; });
    }
    // Picking a relevance score (or touching any field once it has one) opens
    // the row's remaining fields, same as the original's per-change toggleRow(rowEl, true).
    if (nextAnswer.relevance !== "" && !expandedRows[i]) {
      setExpandedRows((prev) => { const next = prev.slice(); next[i] = true; return next; });
    }
  }

  function toggleRow(i) {
    setExpandedRows((prev) => { const next = prev.slice(); next[i] = !next[i]; return next; });
  }

  function handleFinish(e) {
    e.preventDefault();
    const invalid = new Set();
    const responses = new Array(total);
    state.items.forEach((item, i) => {
      const err = validateRowAnswer(answers[i]);
      if (err) invalid.add(i);
      else responses[i] = buildAnswerRecord(item, answers[i]);
    });

    if (invalid.size > 0) {
      setInvalidRows(invalid);
      setExpandedRows((prev) => { const next = prev.slice(); next[Math.min(...invalid)] = true; return next; });
      setErrorMessage(`${invalid.size} guideline(s) still need an answer — see the highlighted row(s) below.`);
      // Rendering is forced synchronous, so the error <p> (and its ref) already exist in the DOM here.
      errorRef.current?.scrollIntoView?.({ behavior: "smooth", block: "center" });
      return;
    }

    setErrorMessage(null);
    state.responses = responses;
    preactRender(null, app); // unmount before the completion screen's renderApp() takes over
    renderComplete();
  }

  return html`
    <div class="card">
      <h1>Rate each guideline</h1>
      <p class="intro-lead">
        Click a guideline to rate it — picking a relevance score opens the rest of its fields.
        You can jump between guidelines in any order and come back to finish later.
      </p>
      <${RespondentSummary} />
      <form onSubmit=${handleFinish}>
        <div class="rating-list">
          ${state.items.map((item, i) => html`
            <${RatingRow} key=${item.id} item=${item} index=${i} answer=${answers[i]}
              expanded=${expandedRows[i]} invalid=${invalidRows.has(i)}
              onChange=${updateAnswer} onToggle=${toggleRow} />
          `)}
        </div>
        ${errorMessage ? html`<p class="error-text" ref=${errorRef}>${errorMessage}</p>` : null}
        <div class="btn-row">
          <span></span>
          <button type="submit" class="btn-primary">Finish</button>
        </div>
      </form>
    </div>
  `;
}

function renderRatingList() {
  preactRender(null, app); // unmount whatever screen (Preact or vanilla) was there before
  preactRender(html`<${RatingList} />`, app);
}
