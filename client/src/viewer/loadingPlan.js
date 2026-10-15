// The LOADING order: one order for the 3-D entry animation and the printed
// Loading Guide. Where the door is comes from truckFrame (never assumed here).
//
// 1. Stop order: last stop first. Within a stop, by position: front wall
//    first, then bottom-up, then increasing x (left to right).
// 2. Every step is checked: the boxes it rests on must already be in, and
//    its path from the door must not pass through a box already loaded (a
//    box between it and the door that overlaps it across and in height, the
//    same corridor as C6).
// 3. When a box fails in that order, the order is repaired: a priority
//    topological sort keeps the stop order wherever it can, and a box waits
//    only until what it needs is in (its supporters; for a path, the deeper
//    box behind it). The boxes that failed are listed in `fixes`, the boxes
//    that had to wait in `deferred`.
// checkPlan() re-verifies the final order instead of trusting the argument.
import { physics } from "./boxInfo";
import { truckFrame } from "./truckFrame";

// C5's tolerances, as tools/validate_arrangement.py uses them: a base within
// TOL of the floor stands on the floor; a top face within TOL of the base is
// coplanar; any positive footprint overlap is a contact (touching edges are not).
const TOL = 1e-5;
const ov = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
const r6 = (v) => Math.round(v * 1e6) / 1e6;
const stopOf = (it) => (Number.isFinite(Number(it.stop)) ? Number(it.stop) : 0);

// Boxes b rests on: their top face is at b's base height and their
// footprint overlaps b's (the validator's C5 contact test).
export function supportersOf(b, boxes) {
  if (Math.abs(b.p.z) < TOL) return [];
  return boxes.filter((o) => o !== b
    && Math.abs(o.p.z + o.p.dz - b.p.z) < TOL
    && ov(b.p.x, b.p.x + b.p.dx, o.p.x, o.p.x + o.p.dx) > 0
    && ov(b.p.y, b.p.y + b.p.dy, o.p.y, o.p.y + o.p.dy) > 0);
}

// Box j stands between box b and the door: entirely doorward of b, and
// overlapping b across (x) and in height (z) with positive area.
export function inPath(b, j, frame) {
  const B = frame.fromDoor(b.p), J = frame.fromDoor(j.p);
  return J.far <= B.near + TOL
    && ov(b.p.x, b.p.x + b.p.dx, j.p.x, j.p.x + j.p.dx) > 0
    && ov(b.p.z, b.p.z + b.p.dz, j.p.z, j.p.z + j.p.dz) > 0;
}

// Stop order: last stop first; front wall first; bottom-up; left to right.
export function stopOrderKey(frame) {
  return (a, b) => stopOf(b.it) - stopOf(a.it)
    || r6(frame.fromFront(a.p)) - r6(frame.fromFront(b.p))
    || r6(a.p.z) - r6(b.p.z)
    || r6(a.p.x) - r6(b.p.x)
    || Number(a.it.item_idx) - Number(b.it.item_idx);
}

const boxName = (b) => `Box ${b.it.id ?? b.it.item_idx}`;

export function buildPlan(items, container) {
  const frame = truckFrame(container);
  const boxes = (items || []).map((it) => ({ it, p: physics(it) }));
  const sorted = boxes.slice().sort(stopOrderKey(frame));

  // What must be in before each box: its supporters, and every box it would
  // have to slide past (b must go in before any box between it and the door).
  const sup = new Map(boxes.map((b) => [b, supportersOf(b, boxes)]));
  const before = new Map(boxes.map((b) => [b, new Set(sup.get(b))]));
  for (const b of boxes) for (const j of boxes) if (j !== b && inPath(b, j, frame)) before.get(j).add(b);

  // Which boxes fail in pure stop order.
  const fixes = [];
  const seen = new Set();
  for (const b of sorted) {
    const missing = sup.get(b).filter((s) => !seen.has(s));
    const blocked = sorted.filter((j) => seen.has(j) && inPath(b, j, frame));
    if (missing.length || blocked.length) {
      const why = [];
      if (missing.length) why.push(`rests on ${missing.map(boxName).join(", ")}, not yet loaded`);
      if (blocked.length) why.push(`its path from the door passes ${blocked.map(boxName).join(", ")}`);
      fixes.push({ it: b.it, stop: stopOf(b.it), missing: missing.map((s) => s.it.item_idx), blockedBy: blocked.map((s) => s.it.item_idx),
        text: `${boxName(b)} (stop ${stopOf(b.it)}): ${why.join("; ")}` });
    }
    seen.add(b);
  }

  // The order: always the first box in stop order whose prerequisites are in.
  const done = new Set();
  const steps = [];
  const deferred = [];
  const left = sorted.slice();
  while (left.length) {
    const k = left.findIndex((b) => [...before.get(b)].every((q) => done.has(q)));
    if (k < 0) break;                                         // a cycle: no box can go next
    if (k > 0) for (const w of left.slice(0, k)) if (!deferred.includes(w)) deferred.push(w);
    const b = left.splice(k, 1)[0];
    done.add(b);
    steps.push({ step: steps.length + 1, ...b });
  }
  const stuck = left.map((b) => ({ it: b.it, text: `${boxName(b)} (stop ${stopOf(b.it)}): no step satisfies its supports and door path` }));
  return { steps, frame, fixes, deferred: deferred.map((b) => b.it.item_idx), stuck, n: boxes.length };
}

// Every box's supporting boxes must appear earlier in the plan, no box may
// pass a box already loaded on its way from the door, and every box is in it.
export function checkPlan(plan) {
  const order = new Map(plan.steps.map((s) => [s.it.item_idx, s.step]));
  const boxes = plan.steps;
  const frame = plan.frame || truckFrame(null);
  const problems = (plan.stuck || []).map((s) => s.text);
  for (const s of boxes) {
    for (const sup of supportersOf(s, boxes)) {
      if (order.get(sup.it.item_idx) >= s.step) {
        problems.push(`step ${s.step} (box ${s.it.id}) rests on box ${sup.it.id}, which is loaded later (step ${order.get(sup.it.item_idx)})`);
      }
    }
    for (const j of boxes) {
      if (j.step < s.step && inPath(s, j, frame)) {
        problems.push(`step ${s.step} (box ${s.it.id}) would pass box ${j.it.id} on its way in, loaded earlier (step ${j.step})`);
      }
    }
  }
  return { ok: problems.length === 0, problems };
}
