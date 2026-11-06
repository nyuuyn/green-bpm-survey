"use strict";

/* ---------- Submission backend config ----------
 * Deliberately its own file, loaded as its own <script> tag before
 * survey.js (same "classic <script>, shared global scope" loading model as
 * every other file here) - so tests can swap in their own copy of this one
 * file in place of this one, rather than text-patching survey.js's source.
 * See tests/fixtures/submit-config.*.js and backend/apps-script/README.md
 * for deployment steps and the security model (SUBMIT_TOKEN is a spam
 * filter, not real access control, since this file - and whatever's
 * deployed at SUBMIT_ENDPOINT - are both public). While SUBMIT_ENDPOINT is
 * null, survey.js runs in test mode: responses are shown on-screen and
 * downloadable as JSON instead of being submitted anywhere.
 */
const SUBMIT_ENDPOINT =
  "https://script.google.com/macros/s/AKfycbxlHp_E8D753oV1e8CJXJJSPc7d7PYewH2qQlifW5JfKMdY_DzKq7znoOPM196YSnI/exec";
const SUBMIT_TOKEN = "0ed38eaa1476e1670820bc9fe512869d";
