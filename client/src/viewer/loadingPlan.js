// Printable LOADING order for a rear-door truck (door at y = 0, cab at y = W).
//
// Boxes go in from the cab end toward the door, and bottom-up inside each
// depth band. A depth band is a maximal group of boxes whose depth ranges
// [y, y + dy) overlap, directly or through a chain of boxes: a box and the
// boxes it rests on always overlap in depth, so they share a band, and the
// supporters sit lower, so bottom-up puts them first. checkPlan() verifies
// that for every plan instead of trusting the argument.
import { physics } from "./boxInfo";

const EPS = 1e-6;
// C5's tolerances, as tools/validate_arrangement.py uses them: a base within
// TOL of the floor stands on the floor; a top face within TOL of the base is
// coplanar; any positive footprint overlap is a contact (touching edges are not).
const TOL = 1e-5;
const ov = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

// Boxes b rests on: their top face is at b's base height and their
// footprint overlaps b's (the validator's C5 contact test).
export function supportersOf(b, boxes) {
  if (Math.abs(b.p.z) < TOL) return [];
  return boxes.filter((o) => o !== b
    && Math.abs(o.p.z + o.p.dz - b.p.z) < TOL
    && ov(b.p.x, b.p.x + b.p.dx, o.p.x, o.p.x + o.p.dx) > 0
    && ov(b.p.y, b.p.y + b.p.dy, o.p.y, o.p.y + o.p.dy) > 0);
}

export function buildPlan(items) {
  const boxes = (items || []).map((it) => ({ it, p: physics(it) }));
  // Depth bands: sweep from the cab end (largest far edge) toward the door.
  const bySweep = boxes.slice().sort((a, b) => (b.p.y + b.p.dy) - (a.p.y + a.p.dy));
  const bands = [];
  for (const b of bySweep) {
    const cur = bands[bands.length - 1];
    if (cur && b.p.y + b.p.dy > cur.lo + EPS) {          // overlaps the band's depth range
      cur.boxes.push(b); cur.lo = Math.min(cur.lo, b.p.y);
    } else {
      bands.push({ boxes: [b], lo: b.p.y, hi: b.p.y + b.p.dy });
    }
  }
  const steps = [];
  bands.forEach((band, bi) => {
    band.boxes
      .slice()
      .sort((a, b) => a.p.z - b.p.z || (b.p.y + b.p.dy) - (a.p.y + a.p.dy) || a.p.x - b.p.x)
      .forEach((b) => steps.push({ step: steps.length + 1, band: bi + 1, bandRange: [band.lo, band.hi], ...b }));
  });
  return { steps, nBands: bands.length };
}

// Every box's supporting boxes must appear earlier in the plan.
export function checkPlan(plan) {
  const order = new Map(plan.steps.map((s) => [s.it.item_idx, s.step]));
  const boxes = plan.steps;
  const problems = [];
  for (const s of boxes) {
    for (const sup of supportersOf(s, boxes)) {
      if (order.get(sup.it.item_idx) >= s.step) {
        problems.push(`step ${s.step} (box ${s.it.id}) rests on box ${sup.it.id}, which is loaded later (step ${order.get(sup.it.item_idx)})`);
      }
    }
  }
  return { ok: problems.length === 0, problems };
}
