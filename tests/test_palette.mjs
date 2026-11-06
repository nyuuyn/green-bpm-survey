// Headless unit test of assets/js/analysis/palette.js in isolation. The other
// suites (test_analysis.mjs, test_guidelines.mjs) only ever render in jsdom's
// default (no matchMedia) light-mode setup, so the dark-mode branches of
// isDarkMode()/chartPalette()/greenRamp() - and the very-low-luminance branch
// of readableTextOn() - never actually ran anywhere in the project. This file
// loads palette.js standalone (no charts.js/analysis.js needed, since
// roundColor()/sourceColor() aren't exercised here) and calls its functions
// directly to cover both branches of each.
import { JSDOM } from "jsdom";
import { runPageScripts } from "./test_server.mjs";

const dom = new JSDOM(`<!doctype html><body><div id="app"></div></body>`, {
  runScripts: "outside-only",
});
const { window } = dom;

runPageScripts(dom, [
  "assets/js/vendor/preact.min.js",
  "assets/js/vendor/preact-hooks.umd.js",
  "assets/js/vendor/htm.umd.js",
  "assets/js/common.js",
  "assets/js/analysis/palette.js",
]);

let failures = 0;
function log(label, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"} - ${label}${extra ? " :: " + extra : ""}`);
  if (!ok) failures++;
}

function setDarkMode(matches) {
  window.matchMedia = (query) => ({ matches: matches && query.includes("dark"), media: query });
}

// 1. isDarkMode(): both the "no matchMedia at all" short-circuit (the only
//    branch the rest of the suite ever hits) and the "matchMedia present"
//    branch, in both its true/false outcomes.
delete window.matchMedia;
log("isDarkMode() is falsy with no window.matchMedia at all", !window.isDarkMode());

setDarkMode(false);
log("isDarkMode() is false when the media query doesn't match", window.isDarkMode() === false);

setDarkMode(true);
log("isDarkMode() is true when the media query matches", window.isDarkMode() === true);

// 2. chartPalette(): every dark/light ternary resolves to the dark side.
const darkPalette = window.chartPalette();
log("chartPalette() ink is white in dark mode", darkPalette.ink === "#ffffff");
log("chartPalette() single/strong accent is the dark-mode teal", darkPalette.single === "#6ccbb2");
log(
  "chartPalette() relevanceSteps run low-to-high in dark mode",
  darkPalette.relevanceSteps[0] === "#173a33" && darkPalette.relevanceSteps[3] === "#6ccbb2",
);

setDarkMode(false);
const lightPalette = window.chartPalette();
log("chartPalette() ink is near-black in light mode", lightPalette.ink === "#0b0b0b");
log(
  "chartPalette() relevanceSteps run low-to-high in light mode",
  lightPalette.relevanceSteps[0] === "#d7ede7" && lightPalette.relevanceSteps[3] === "#1e7a5c",
);

// 3. greenRamp(): the single-color (count <= 1) branch, and both dark/light
//    hue-sweep branches for count > 1.
const singleColor = window.greenRamp(false, 1);
log("greenRamp(_, 1) returns exactly one color", singleColor.length === 1);

const lightRamp = window.greenRamp(false, 3);
const darkRamp = window.greenRamp(true, 3);
log("greenRamp(false, 3) returns 3 distinct colors", new Set(lightRamp).size === 3);
log(
  "greenRamp(dark) differs from greenRamp(light) for the same count",
  JSON.stringify(lightRamp) !== JSON.stringify(darkRamp),
);

// 4. readableTextOn(): both sides of the sRGB linearization threshold, and
//    both the "white reads better" and "black reads better" outcomes.
log(
  "readableTextOn() picks dark text on a near-white background",
  window.readableTextOn("#f5f5f5") === "#0b0b0b",
);
log(
  "readableTextOn() picks light text on a near-black background (below the linearization threshold)",
  window.readableTextOn("#010101") === "#ffffff",
);
log(
  "readableTextOn() picks light text on a saturated dark background",
  window.readableTextOn("#1e7a5c") === "#ffffff",
);

console.log(`\n${failures === 0 ? "All tests passed." : failures + " test(s) FAILED."}`);
if (failures > 0) process.exitCode = 1;
