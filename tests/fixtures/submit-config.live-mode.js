"use strict";

// Test fixture: substituted for assets/js/survey/submit-config.js wherever a
// test needs survey.js's LIVE-submission branch, without ever touching the
// real deployed backend. Used by tests/test_submission.mjs, which asserts
// against these exact values - keep the two in sync if either changes.
const SUBMIT_ENDPOINT = "https://example.test/exec";
const SUBMIT_TOKEN = "test-token-123";
