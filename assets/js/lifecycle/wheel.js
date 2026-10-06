"use strict";

/* ---------- Lifecycle page: the wheel ----------
 * Six chevron-shaped segments, one per LIFECYCLE_OPTIONS phase (common.js),
 * drawn as a hand-rolled inline SVG ring rather than a Chart.js doughnut - a
 * chart library's doughnut can't express each segment's own pointed tip/
 * notch (wheelChevronPath() below is the "this is a flow" cue, replacing a
 * separate arrow glyph between segments), and per-segment click/keyboard
 * handling is simpler on a plain <path> than on a canvas chart. Each segment
 * is a real a11y button (role="button", tabindex, Enter/Space) - SVG shapes
 * aren't natively focusable/activatable like an <a> or <button>.
 */

const WHEEL_SIZE = 360;
const WHEEL_CENTER = WHEEL_SIZE / 2;
const WHEEL_OUTER_R = 166;
const WHEEL_INNER_R = 116; // a slender band (not a thick donut) - matches a classic chevron-circle diagram's proportions
const WHEEL_POINT_R = (WHEEL_OUTER_R + WHEEL_INNER_R) / 2; // tip apex radius - inside the ring's own band, not beyond it
const WHEEL_POINT_DEG = 10; // angular size of the arrowhead taper at each segment's end

const PHASE_ICONS = {
  Design: "✏️",
  Modeling: "🧩",
  Execution: "▶️",
  Monitoring: "📈",
  Analysis: "🔍",
  Optimization: "🛠️",
};

function wheelPolar(r, angleDeg) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return [WHEEL_CENTER + r * Math.cos(a), WHEEL_CENTER + r * Math.sin(a)];
}

// A chevron/arrow ring segment spanning [lo, hi] degrees, traced from a
// real circular-chevron reference graphic rather than guessed: the start
// (`lo`) is a plain straight radial edge - full band width immediately, no
// taper - and the arrowhead lives entirely at the end (`hi`), where the
// outer and inner edges converge over WHEEL_POINT_DEG to a point at
// WHEEL_POINT_R. The "notch" look at a segment's start isn't its own cut -
// it's empty background next to the PREVIOUS segment's own tapered tip
// (including Optimization's tip next to Design's straight edge, closing
// the loop).
function wheelChevronPath(lo, hi) {
  const [ox1, oy1] = wheelPolar(WHEEL_OUTER_R, lo);
  const [ox2, oy2] = wheelPolar(WHEEL_OUTER_R, hi - WHEEL_POINT_DEG);
  const [tx, ty] = wheelPolar(WHEEL_POINT_R, hi); // tip
  const [ix2, iy2] = wheelPolar(WHEEL_INNER_R, hi - WHEEL_POINT_DEG);
  const [ix1, iy1] = wheelPolar(WHEEL_INNER_R, lo);
  return `M${ox1},${oy1} A${WHEEL_OUTER_R},${WHEEL_OUTER_R} 0 0 1 ${ox2},${oy2} ` +
    `L${tx},${ty} L${ix2},${iy2} ` +
    `A${WHEEL_INNER_R},${WHEEL_INNER_R} 0 0 0 ${ix1},${iy1} Z`;
}

function LifecycleWheel({ activePhase, onSelect }) {
  const n = LIFECYCLE_OPTIONS.length;
  const step = 360 / n;
  const ramp = greenRamp(isDarkMode(), n);

  const activate = (phase) => (e) => {
    if (e.type === "keydown" && e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    onSelect(phase);
  };

  const wedges = LIFECYCLE_OPTIONS.map((phase, i) => {
    const lo = i * step;
    const hi = (i + 1) * step;
    const [lx, ly] = wheelPolar(WHEEL_POINT_R, lo + step / 2);
    const color = ramp[i];
    const isActive = activePhase === phase;
    return html`
      <g key=${phase}>
        <path
          class=${`lifecycle-wedge${isActive ? " active" : ""}`}
          d=${wheelChevronPath(lo, hi)}
          fill=${color}
          role="button"
          tabindex="0"
          aria-label=${`${phase} — see the guidelines rated most relevant to this phase`}
          aria-pressed=${String(isActive)}
          onClick=${activate(phase)}
          onKeyDown=${activate(phase)}
        />
        <text x=${lx} y=${ly + 4} text-anchor="middle" class="lifecycle-wedge-label" fill=${readableTextOn(color)} aria-hidden="true">${phase}</text>
      </g>
    `;
  });

  return html`
    <svg viewBox=${`0 0 ${WHEEL_SIZE} ${WHEEL_SIZE}`} class="lifecycle-wheel" role="group" aria-label="BPM lifecycle phases — select one to see its most relevant guidelines">
      ${wedges}
      <text x=${WHEEL_CENTER} y=${WHEEL_CENTER - 4} text-anchor="middle" class="lifecycle-center-title">BPM</text>
      <text x=${WHEEL_CENTER} y=${WHEEL_CENTER + 16} text-anchor="middle" class="lifecycle-center-sub">Lifecycle</text>
    </svg>
  `;
}
