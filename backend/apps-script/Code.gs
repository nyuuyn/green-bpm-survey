/* ---------- Green BPM Survey submission backend ----------
 * Deployed as a Google Apps Script Web App. Receives the JSON payload
 * survey.js POSTs on completion and appends it to a Google Sheet, split
 * across two tabs that mirror data/SURVEY_SCHEMA.md exactly (Respondents ~
 * respondents.csv, Responses ~ guidelines/<source>/survey.csv) so a CSV
 * export of either tab can be merged into the existing pipeline with zero
 * column remapping. See README.md in this folder for deployment steps and
 * the security model (the Sheet stays private - only this script writes to
 * it; TOKEN below is a spam filter, not real access control, since this
 * file and the deployed URL are both public).
 */

// ---------- Config - fill these in after deploying (see README.md) ----------
const SHEET_ID = "PASTE_YOUR_SHEET_ID_HERE";
const TOKEN = "PASTE_A_RANDOM_TOKEN_HERE"; // must match SUBMIT_TOKEN in survey.js
const RESPONDENTS_SHEET = "Respondents";
const RESPONSES_SHEET = "Responses";

// ---------- Validation limits ----------
// SAMPLE_SIZE in survey.js is 10 - this just needs enough headroom that it
// never has to change in lockstep, not an exact match.
const MAX_RESPONSES = 30;
const MAX_FIELD_LENGTH = 2000;
const VALID_RELEVANCE = ["0", "1", "2", "3"];

function doPost(e) {
  let payload;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse({ ok: false, error: "Malformed JSON." });
  }

  const validationError = validatePayload(payload);
  if (validationError) {
    return jsonResponse({ ok: false, error: validationError });
  }

  appendSubmission(payload);
  return jsonResponse({ ok: true });
}

/* ---------- Validation ----------
 * Every check here runs before anything is written to the sheet - a bad
 * payload (wrong token, malformed shape, oversized fields) should never
 * reach appendSubmission(). This is the actual security boundary; TOKEN
 * alone is not (see the file header). */

function validatePayload(payload) {
  if (!payload || payload.token !== TOKEN) return "Invalid token.";
  if (!isNonEmptyString(payload.sessionId)) return "Missing sessionId.";
  if (!payload.submittedAt || isNaN(Date.parse(payload.submittedAt))) {
    return "Invalid submittedAt.";
  }

  const r = payload.respondent;
  if (
    !r ||
    !isNonEmptyString(r["BPM Experience"]) ||
    !isNonEmptyString(r["Sustainability Experience"]) ||
    !isNonEmptyString(r["Role"])
  ) {
    return "Missing or invalid respondent info.";
  }

  const responses = payload.responses;
  if (!Array.isArray(responses) || responses.length === 0 || responses.length > MAX_RESPONSES) {
    return "Invalid responses array.";
  }

  for (const resp of responses) {
    if (!isNonEmptyString(resp.ID)) return "Response missing ID.";
    if (!VALID_RELEVANCE.includes(String(resp["BPM Relevance"]))) {
      return "Response has invalid BPM Relevance.";
    }
  }

  if (!allFieldsWithinLengthLimit(payload)) return "A field exceeds the maximum length.";

  return null; // valid
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function allFieldsWithinLengthLimit(payload) {
  const strings = [
    payload.respondent["BPM Experience"],
    payload.respondent["Sustainability Experience"],
    payload.respondent["Role"],
  ];
  for (const resp of payload.responses) {
    strings.push(
      resp["BPM Scope"],
      resp["Generic"],
      resp["BPM Justification"],
      resp["BPM Lifecycle"],
      resp["Discussion"],
    );
  }
  return strings.every((s) => typeof s !== "string" || s.length <= MAX_FIELD_LENGTH);
}

/* ---------- Sanitization ----------
 * Range.setValues() parses strings the same way typing into the Sheets UI
 * does, so a free-text field like "BPM Justification" containing
 * '=IMPORTXML(...)' would otherwise be stored as a LIVE FORMULA, not literal
 * text - a real exfiltration vector if the sheet is ever opened. Two
 * independent layers against that: prefix any value that starts with a
 * formula-triggering character with an apostrophe (sanitizeForSheet), and
 * force the destination range to plain-text format before writing
 * (setNumberFormat('@') in appendSubmission) - either alone is the standard
 * mitigation for API-driven Sheets writes; doing both is cheap insurance. */

const FORMULA_TRIGGER_CHARS = ["=", "+", "-", "@", "\t", "\r"];

function sanitizeForSheet(value) {
  if (typeof value !== "string") return value;
  return FORMULA_TRIGGER_CHARS.includes(value.charAt(0)) ? "'" + value : value;
}

/* ---------- Writing ---------- */

function appendSubmission(payload) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const r = payload.respondent;

  appendRow(ss.getSheetByName(RESPONDENTS_SHEET), [
    payload.sessionId,
    payload.submittedAt,
    r["BPM Experience"],
    r["Sustainability Experience"],
    r["Role"],
  ]);

  const responsesSheet = ss.getSheetByName(RESPONSES_SHEET);
  for (const resp of payload.responses) {
    appendRow(responsesSheet, [
      payload.sessionId,
      resp.ID,
      resp["BPM Relevance"],
      resp["BPM Scope"],
      resp["Generic"],
      resp["BPM Justification"],
      resp["BPM Lifecycle"],
      resp["Discussion"],
    ]);
  }
}

function appendRow(sheet, values) {
  const sanitized = values.map(sanitizeForSheet);
  const row = sheet.getLastRow() + 1;
  const range = sheet.getRange(row, 1, 1, sanitized.length);
  range.setNumberFormat("@"); // plain text - second layer, see sanitizeForSheet above
  range.setValues([sanitized]);
}

function jsonResponse(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
