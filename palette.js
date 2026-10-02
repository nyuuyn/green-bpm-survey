"use strict";

/* ---------- Color system for the analysis page ----------
 * Every chart draws from the same green family as the site's own --accent
 * (the envite brand color) rather than an unrelated categorical palette, so
 * the analysis page reads as one system with the rest of the site. This file
 * is the whole of that system - dark-mode detection, the fixed chartPalette()
 * used by every single chart, and the generated ramp (greenRamp/roundColor/
 * sourceColor) used for open-ended lists of series (rounds, sources).
 * charts.js consumes these as plain globals to build actual Chart.js configs
 * and color-coded DOM; it owns no color decisions of its own.
 */

function isDarkMode() {
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

// Two-way splits (native/general, generic/specific) use a strong vs. muted
// step of the green rather than a second hue - each chart's legend/labels
// carry the identity, so a shared hue doesn't cost distinguishability.
function chartPalette() {
  const dark = isDarkMode();
  return {
    ink: dark ? "#ffffff" : "#0b0b0b",
    inkSecondary: dark ? "#c3c2b7" : "#52514e",
    grid: dark ? "#2c2c2a" : "#e1e0d9",
    axis: dark ? "#383835" : "#c3c2b7",
    tooltipBg: dark ? "#eef0ee" : "#1f1f1f",
    tooltipText: dark ? "#0f1b16" : "#ffffff",
    single: dark ? "#6ccbb2" : "#1e7a5c", // reuses the site's own --accent
    strong: dark ? "#6ccbb2" : "#1e7a5c", // same accent - the "highlighted" side of a 2-way split
    muted: dark ? "#317e6d" : "#a8d9cb", // a lighter/dimmer step of the same green - the baseline side
    relevanceSteps: dark
      ? ["#173a33", "#1f5148", "#317e6d", "#6ccbb2"] // low relevance recedes toward the dark surface
      : ["#d7ede7", "#a8d9cb", "#5fb59b", "#1e7a5c"], // low relevance stays pale on the light surface
  };
}

function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x) => Math.round(255 * x).toString(16).padStart(2, "0");
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

// A sequential multi-hue ramp (hue sweeps a narrow forest-green-to-teal band
// together with lightness, rather than lightness alone) sized to `count`.
// Used anywhere the page needs one color per item from an open-ended,
// selectable list (rounds, sources) - pal.relevanceSteps only has 4 fixed
// steps, built for the 0-3 relevance scale, so cycling through it (as both
// roundColor and sourceColor used to) collides once the list is selected
// past 4 items. Varying only lightness for many steps isn't enough either -
// adjacent steps become too close to tell apart - so this covaries hue too,
// the same trick ColorBrewer's multi-hue sequential schemes use for larger
// category counts. The hue stays within green-to-teal so it still reads as
// "the site's own green family," just not a single flat hue.
function greenRamp(dark, count) {
  const hueFrom = 150, hueTo = 186;
  const sat = dark ? 50 : 48;
  const lightFrom = dark ? 30 : 76; // pale/dim end
  const lightTo = dark ? 74 : 26; // saturated end
  if (count <= 1) return [hslToHex((hueFrom + hueTo) / 2, sat, (lightFrom + lightTo) / 2)];
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    return hslToHex(hueFrom + (hueTo - hueFrom) * t, sat, lightFrom + (lightTo - lightFrom) * t);
  });
}

// Color for one round's series in a merged multi-round chart, or one round's
// heatmap intensity - indexed by position in canonical ANALYSIS_ROUNDS order,
// so a given round keeps a stable color no matter which others are selected
// alongside it. Only 3 rounds exist today, well under the 4-step
// relevanceSteps array this used to cycle through, but the roadmap already
// plans a 4th (internal expert survey) and 5th (public survey) round, which
// would start colliding the same way sourceColor used to for 10 sources -
// using the generated ramp here too avoids hitting that again later.
function roundColor(round) {
  const ramp = greenRamp(isDarkMode(), ANALYSIS_ROUNDS.length);
  return ramp[ANALYSIS_ROUNDS.findIndex((r) => r.id === round.id)];
}

// Indexed by position in ANALYSIS_SOURCE_ORDER so a given source keeps a
// stable color regardless of which other sources are selected alongside it.
function sourceColor(sourceId) {
  const ramp = greenRamp(isDarkMode(), ANALYSIS_SOURCE_ORDER.length);
  return ramp[ANALYSIS_SOURCE_ORDER.indexOf(sourceId)];
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Black or white, whichever reads better on `hex` - greenRamp spans pale to
// dark, so a single fixed contrast color (like pal.accent-contrast) doesn't
// work across the whole ramp. Used to pick each active round/source tab's
// text color to match its own ramp swatch (see --tab-accent in analysis.css).
function readableTextOn(hex) {
  const [r, g, b] = hexToRgb(hex).map((c) => c / 255);
  const toLinear = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  return luminance > 0.4 ? "#0b0b0b" : "#ffffff";
}
