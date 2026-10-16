"use strict";

/* ---------- Guidelines page: the wheel ----------
 * Six ring segments, one per LIFECYCLE_OPTIONS phase (common.js), drawn as
 * a hand-rolled inline SVG ring rather than a Chart.js doughnut - a chart
 * library's doughnut can't gap+shadow each segment independently the way
 * wheelSectorPath() below does, and per-segment click/keyboard handling is
 * simpler on a plain <path> than on a canvas chart. Each segment is a real
 * a11y button (role="button", tabindex, Enter/Space) - SVG shapes aren't
 * natively focusable/activatable like an <a> or <button>.
 *
 * Proportions (band thickness, gap width, corner kink, drop shadow) were
 * reverse-measured from two reference graphics rather than guessed.
 * examples/chevron_cycle.svg (a user-provided, PowerPoint-exported
 * circular-chevron diagram) established the shape concept: no tapered tip
 * at all - easy to miss at a glance, but present at every single corner,
 * and the main thing that reads as "chevron" rather than "pie wedge" -
 * each cut isn't a straight radial line, it's a 2-segment line that kinks
 * partway out, bulging clockwise at mid-radius, on BOTH boundaries of
 * every segment (same rotational direction both times, not mirrored). The
 * exact numbers (gap width, kink bulge, band ratio) came from
 * examples/pdca_curved_chevron_cycle.svg instead, a clean
 * programmatically-generated SVG with plain M/A/L path commands - no
 * Bezier curves to approximate - which parsed out to a thick band
 * (inner/outer radius ratio ~0.59) and a full 12 degree kink bulge.
 *
 * The gap between segments is a constant ARC LENGTH (wheelGapInsetDeg()
 * below), not a constant angle: a fixed angular gap looks narrower at the
 * inner radius than the outer radius purely because arc length shrinks
 * with radius (gap_arc = angle * r), so the two edges of a gap would
 * visibly converge toward the center instead of staying parallel. Insetting
 * by a radius-dependent angle keeps the gap the same visual width at the
 * inner edge, the kink, and the outer edge.
 */

const WHEEL_SIZE = 360;
const WHEEL_CENTER = WHEEL_SIZE / 2;
const WHEEL_OUTER_R = 166;
const WHEEL_INNER_R = 98; // thick band - inner/outer ratio ~0.59, matching the reference graphic
const WHEEL_POINT_R = (WHEEL_OUTER_R + WHEEL_INNER_R) / 2; // label radius + kink radius, mid-band
const WHEEL_GAP_ARC = 8.7; // constant visual gap width (SVG units) between adjacent segments, at any radius
const WHEEL_KINK_DEG = 12; // clockwise bulge of each corner's kink point

// Half-angle (degrees) that a radius-r edge must be inset by for its gap
// to measure WHEEL_GAP_ARC units wide along that radius's circle.
function wheelGapInsetDeg(r) {
  return (WHEEL_GAP_ARC / r) * (90 / Math.PI);
}

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

// A ring segment spanning [lo, hi] degrees, each boundary inset by its own
// radius-dependent half-gap (wheelGapInsetDeg()) so the gap to its
// neighbor is a constant width, not a constant angle. Each of the two
// corners is a 2-segment kinked line - inner corner to a bulged mid-radius
// kink to outer corner - rather than a single straight radial line,
// matching the reference graphic's chevron-fold corners.
function wheelSectorPath(lo, hi) {
  const innerGap = wheelGapInsetDeg(WHEEL_INNER_R);
  const pointGap = wheelGapInsetDeg(WHEEL_POINT_R);
  const outerGap = wheelGapInsetDeg(WHEEL_OUTER_R);
  const [ix1, iy1] = wheelPolar(WHEEL_INNER_R, lo + innerGap);
  const [kx1, ky1] = wheelPolar(WHEEL_POINT_R, lo + pointGap + WHEEL_KINK_DEG);
  const [ox1, oy1] = wheelPolar(WHEEL_OUTER_R, lo + outerGap);
  const [ox2, oy2] = wheelPolar(WHEEL_OUTER_R, hi - outerGap);
  const [kx2, ky2] = wheelPolar(WHEEL_POINT_R, hi - pointGap + WHEEL_KINK_DEG);
  const [ix2, iy2] = wheelPolar(WHEEL_INNER_R, hi - innerGap);
  return `M${ix1},${iy1} L${kx1},${ky1} L${ox1},${oy1} ` +
    `A${WHEEL_OUTER_R},${WHEEL_OUTER_R} 0 0 1 ${ox2},${oy2} ` +
    `L${kx2},${ky2} L${ix2},${iy2} ` +
    `A${WHEEL_INNER_R},${WHEEL_INNER_R} 0 0 0 ${ix1},${iy1} Z`;
}

// The wedge's label anchor: the centroid of its actual filled shape, not
// just the midpoint radius/angle of its nominal [lo, hi] slot - the kink
// bulges outward past `hi` on one side and cuts inward past `lo` on the
// other (same rotational direction, see wheelSectorPath()), so the shape
// isn't symmetric around that naive midpoint and a label placed there reads
// as visibly off-center. Approximates the outer/inner arcs with straight
// segments (ARC_STEPS each) since the shoelace centroid formula needs a
// polygon, then applies it to the full boundary (notch/kink corners
// included) for an accurate interior point.
const WHEEL_LABEL_ARC_STEPS = 8;
function wheelLabelAnchor(lo, hi) {
  const innerGap = wheelGapInsetDeg(WHEEL_INNER_R);
  const pointGap = wheelGapInsetDeg(WHEEL_POINT_R);
  const outerGap = wheelGapInsetDeg(WHEEL_OUTER_R);
  const aInner0 = lo + innerGap;
  const aInner1 = hi - innerGap;
  const aOuter0 = lo + outerGap;
  const aOuter1 = hi - outerGap;

  const pts = [wheelPolar(WHEEL_INNER_R, aInner0), wheelPolar(WHEEL_POINT_R, lo + pointGap + WHEEL_KINK_DEG), wheelPolar(WHEEL_OUTER_R, aOuter0)];
  for (let i = 1; i <= WHEEL_LABEL_ARC_STEPS; i++) {
    pts.push(wheelPolar(WHEEL_OUTER_R, aOuter0 + (aOuter1 - aOuter0) * (i / WHEEL_LABEL_ARC_STEPS)));
  }
  pts.push(wheelPolar(WHEEL_POINT_R, hi - pointGap + WHEEL_KINK_DEG));
  pts.push(wheelPolar(WHEEL_INNER_R, aInner1));
  for (let i = 1; i <= WHEEL_LABEL_ARC_STEPS; i++) {
    pts.push(wheelPolar(WHEEL_INNER_R, aInner1 - (aInner1 - aInner0) * (i / WHEEL_LABEL_ARC_STEPS)));
  }

  let area = 0, cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % pts.length];
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  area /= 2;
  return [cx / (6 * area), cy / (6 * area)];
}

function GuidelinesWheel({ activePhase, onSelect }) {
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
    const [lx, ly] = wheelLabelAnchor(lo, hi);
    const color = ramp[i];
    const isActive = activePhase === phase;
    return html`
      <g key=${phase}>
        <path
          class=${`guidelines-wedge${isActive ? " active" : ""}`}
          d=${wheelSectorPath(lo, hi)}
          fill=${color}
          role="button"
          tabindex="0"
          aria-label=${`${phase} — see the guidelines rated most relevant to this phase`}
          aria-pressed=${String(isActive)}
          onClick=${activate(phase)}
          onKeyDown=${activate(phase)}
        />
        <text x=${lx} y=${ly} text-anchor="middle" dominant-baseline="central" class="guidelines-wedge-label" fill="#FFFFFF" aria-hidden="true">${phase}</text>
      </g>
    `;
  });

  return html`
    <svg viewBox=${`0 0 ${WHEEL_SIZE} ${WHEEL_SIZE}`} class="guidelines-wheel" role="group" aria-label="BPM lifecycle phases — select one to see its most relevant guidelines">
      <defs>
        <filter id="guidelines-wedge-shadow" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="1.5" dy="1.5" stdDeviation="1.2" flood-color="#000" flood-opacity="0.4" />
        </filter>
      </defs>
      ${wedges}
      <text x=${WHEEL_CENTER} y=${WHEEL_CENTER - 4} text-anchor="middle" class="guidelines-center-title">Green BPM</text>
      <text x=${WHEEL_CENTER} y=${WHEEL_CENTER + 16} text-anchor="middle" class="guidelines-center-sub">Guidelines</text>
    </svg>
  `;
}
