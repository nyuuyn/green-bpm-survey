# Submission backend (Google Apps Script + Sheet)

`Code.gs` is the live backend for the survey. It receives the JSON payload
`survey.js` POSTs when a respondent finishes, validates and sanitizes it, and
appends it to a Google Sheet. This folder is the source of truth for that
script - the deployed copy at script.google.com should always match it.

## Why Apps Script

The rest of this site is static (no build step, no server) - see the main
README. Apps Script Web Apps are the one piece that needs to run somewhere
with write access to a Sheet, without standing up any actual infrastructure.

## Deploy it

1. **Create the Sheet.** A new Google Sheet, with two tabs:
   - `Respondents`, header row: `RespondentID, SubmittedAt, BPM Experience, Sustainability Experience, Role`
   - `Responses`, header row: `RespondentID, ID, BPM Relevance, BPM Scope, Generic, BPM Justification, BPM Lifecycle, Discussion`

   These match `data/SURVEY_SCHEMA.md` exactly, so either tab can later be
   exported to CSV and merged into `data/respondents.csv` /
   `data/guidelines/<source>/survey.csv` with no column remapping.

2. Copy the Sheet's ID out of its URL (`.../d/<SHEET_ID>/edit`).
3. **Create the Apps Script project.** From the Sheet: Extensions → Apps
   Script. This binds the script to the Sheet, so `SpreadsheetApp` calls
   don't need their own auth flow.
4. Replace the default `Code.gs` with this folder's `Code.gs`, and add
   `appsscript.json` (Project Settings → "Show appsscript.json" to edit it
   directly) with this folder's contents.
5. In `Code.gs`, set:
   - `SHEET_ID` to the ID from step 2.
   - `TOKEN` to a random string (e.g. `openssl rand -hex 16`, or any
     password generator). See **Security model** below for what this is
     and isn't protecting against.
6. **Deploy → New deployment → Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
7. Copy the resulting `/exec` URL.
8. In `assets/js/survey/submit-config.js`, set `SUBMIT_ENDPOINT` to that URL and
   `SUBMIT_TOKEN` to the same value as `TOKEN` above.

Redeploying after editing `Code.gs` requires **Deploy → Manage deployments →
edit (pencil) → New version** - just saving the script doesn't update the
live `/exec` endpoint.

## Security model

The deployed URL is not a secret - it's going into public client-side JS, so
anyone can find it and POST to it directly, not just people who load the
survey page. Apps Script Web Apps have no built-in auth beyond the
deploy-time "who has access" setting, and "Anyone" is required here since
real respondents aren't logged into anything.

What that means in practice:

- **The Sheet itself stays private.** It is never shared with anyone. The
  script runs "as Me" (the deploying account), so it can write to the Sheet
  regardless of who called it - the public surface is the script, not the
  Sheet's sharing settings.
- **`TOKEN` is a spam filter, not access control.** It's a plain string
  comparison against a value sitting in a public file - anyone who reads
  this repo can find it. It exists to filter out generic bots that hit
  random URLs without inspecting payloads; it does nothing against anyone
  who actually looks at the request `doPost` expects.
- **The real protection is server-side validation and sanitization**, both
  done before anything is written:
  - `validatePayload()` rejects malformed JSON, wrong token, missing/empty
    required fields, out-of-range `BPM Relevance`, oversized `responses`
    arrays (bounds quota abuse from flooding), and overlong strings.
  - `sanitizeForSheet()` + `setNumberFormat('@')` neutralize **formula
    injection**: `Range.setValues()` parses strings the same way typing into
    the Sheets UI does, so an unsanitized free-text field (e.g. "BPM
    Justification") containing `=IMPORTXML(...)` would be stored as a _live
    formula_, not literal text - and could exfiltrate other rows' data to an
    attacker's server if the sheet is ever opened. Both layers address that.
- **Not handled, deliberately:** rate limiting and CAPTCHA. This is a small
  academic survey, not a high-value target: the validation above already
  blocks the cheap/automated abuse, and a CAPTCHA would add real friction
  (and a Google dependency) to a flow designed to be anonymous and
  frictionless. Worth revisiting only if spam actually shows up.

## Smoke test after deploying

`smoketest.mjs` in this folder is a reusable script covering the same five
cases - run it after every deploy or redeploy:

```bash
node backend/apps-script/smoketest.mjs
```

With no arguments it reads `SUBMIT_ENDPOINT`/`SUBMIT_TOKEN` straight out of
`assets/js/survey/submit-config.js` (i.e. whatever's currently live on the
site). To point it at a different deployment instead (e.g. testing a scratch
project before flipping `submit-config.js` over to it), pass
`--url`/`--token`, or set the `SUBMIT_ENDPOINT`/`SUBMIT_TOKEN` env vars.

It posts: a valid payload (expect accepted, one row added to each tab), a
wrong token, malformed JSON, and an oversized `responses` array (all expect
rejected, nothing written) - plus a formula-injection attempt
(`=HYPERLINK(...)` in a free-text field), which the script can't verify over
HTTP, so it prints a manual follow-up: open the Sheet and confirm that cell
landed as literal text, not a working formula. The valid payload and the
injection attempt each add a row tagged with a `smoketest-` sessionId prefix;
delete those from the Sheet once you've checked them.
