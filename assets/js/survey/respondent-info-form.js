"use strict";

/* ---------- "About you" screen ----------
 * The respondent-background form shown before rating starts (or when
 * editing previously-entered answers from the rating list's "Edit your
 * info" link). survey.js owns SAMPLE_SIZE/EXPERIENCE_OPTIONS/ROLE_OPTIONS,
 * `state`, and setProgress - all referenced here as plain globals, same as
 * this file's renderRespondentInfo() is referenced from survey.js's boot()
 * and rating-list.js's RespondentSummary.
 */

// Reads a radio group's options and renders them, each pre-checked (via
// defaultChecked - uncontrolled, same as plain HTML) when it matches `prior`.
function experienceOptions(name, prior) {
  return EXPERIENCE_OPTIONS.map((opt, i) => html`
    <div class="option">
      <input type="radio" name=${name} id="${name}-${i}" value=${opt} defaultChecked=${prior === opt} />
      <label for="${name}-${i}">${opt}</label>
    </div>
  `);
}

function RespondentInfoForm() {
  const prior = state.respondent;
  const priorRoleMatches = !!(prior && ROLE_OPTIONS.includes(prior.Role));
  // `role` only drives the "Other" free-text field's visibility here - the actual
  // submitted values are still read from the live form via FormData in
  // collectRespondentInfo, same as before, so a directly-set `.value` (as the
  // test harness does, without a synthetic event) is picked up correctly.
  const [role, setRole] = useState(prior ? (priorRoleMatches ? prior.Role : "Other") : "");
  const [error, setError] = useState(null); // { field, message } | null

  function handleSubmit(e) {
    e.preventDefault();
    const data = collectRespondentInfo(e.target);
    if (!data.ok) {
      setError({ field: data.field, message: data.error });
      return;
    }
    setError(null);
    state.respondent = data.respondent;
    storeRespondent(data.respondent);
    preactRender(null, app); // unmount cleanly before the next screen's renderApp() takes over
    renderRatingList();
  }

  const errorFor = (field) => (error && error.field === field
    ? html`<p class="error-text">${error.message}</p>`
    : null);

  return html`
    <div class="card">
      <h1>About you</h1>
      <p class="intro-lead">
        A few quick questions about your background, then you'll rate ${SAMPLE_SIZE} randomly
        selected guidelines (about 10–15 minutes). This helps us understand whether BPM/sustainability
        background affects how guidelines get rated — it's not used to identify you.
      </p>
      <form onSubmit=${handleSubmit}>
        <fieldset class=${`field-group${error?.field === "bpmExperience" ? " invalid" : ""}`}>
          <legend class="sr-only">BPM experience</legend>
          <div class="field-group-title">BPM experience <span class="hint">Your own background with business process management.</span></div>
          <div class="option-row vertical">${experienceOptions("bpmExperience", prior?.["BPM Experience"])}</div>
          ${errorFor("bpmExperience")}
        </fieldset>

        <fieldset class=${`field-group${error?.field === "sustainabilityExperience" ? " invalid" : ""}`}>
          <legend class="sr-only">Sustainability / green-IT experience</legend>
          <div class="field-group-title">Sustainability / green-IT experience <span class="hint">Separate from BPM — your background with sustainability specifically.</span></div>
          <div class="option-row vertical">${experienceOptions("sustainabilityExperience", prior?.["Sustainability Experience"])}</div>
          ${errorFor("sustainabilityExperience")}
        </fieldset>

        <fieldset class=${`field-group${error && (error.field === "role" || error.field === "roleOther") ? " invalid" : ""}`}>
          <legend class="sr-only">Role</legend>
          <div class="field-group-title">Role <span class="hint">Whichever best describes you.</span></div>
          <div class="option-row vertical" onChange=${(e) => { if (e.target.name === "role") setRole(e.target.value); }}>
            ${ROLE_OPTIONS.map((opt, i) => html`
              <div class="option">
                <input type="radio" name="role" id="role-${i}" value=${opt} defaultChecked=${role === opt} />
                <label for="role-${i}">${opt}</label>
              </div>
            `)}
          </div>
          <div style="margin-top:8px" hidden=${role !== "Other"}>
            <input type="text" name="roleOther" placeholder="Please specify your role"
              defaultValue=${!priorRoleMatches && prior ? prior.Role : ""} />
          </div>
          ${errorFor("role")}
          ${errorFor("roleOther")}
        </fieldset>

        <div class="btn-row">
          <span></span>
          <button type="submit" class="btn-primary">Continue</button>
        </div>
      </form>
    </div>
  `;
}

function renderRespondentInfo() {
  setProgress(0, 0);
  preactRender(null, app); // unmount whatever screen (Preact or vanilla) was there before
  preactRender(html`<${RespondentInfoForm} />`, app);
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
