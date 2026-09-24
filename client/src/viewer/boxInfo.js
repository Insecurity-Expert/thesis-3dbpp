// Shared box vocabulary for the 3-D viewer, the loading plan and history.
// Nothing here computes a constraint: C3-C6 per box come from the optimizer
// (optimizer/arrangement_view.py). This file only formats and classifies.

// ── Heavy: ONE definition, used by the colour mode AND the Heavy filter ─────
// A box is heavy when its mass is at or above the 75th percentile of the
// load's masses (linear interpolation, the same as numpy.percentile).
export const HEAVY_PERCENTILE = 75;

export function percentile(values, p) {
  const a = values.filter((v) => Number.isFinite(v)).slice().sort((x, y) => x - y);
  if (a.length === 0) return null;
  const pos = (a.length - 1) * (p / 100);
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return a[lo] + (a[hi] - a[lo]) * (pos - lo);
}

// masses: every box in the load when the run lists its unloaded boxes
// (result.problem_view.unplaced), else only the placed ones. `scope` says which.
export function heavyRule(result) {
  const items = (result && result.items) || [];
  const placed = items.map((it) => Number(it.mass ?? it.weight)).filter(Number.isFinite);
  const pv = result && result.problem_view;
  const all = pv ? placed.concat(pv.unplaced.map((u) => Number(u.mass))) : placed;
  const threshold = percentile(all, HEAVY_PERCENTILE);
  return { threshold, scope: pv ? "whole load" : "placed boxes only", n: all.length };
}

export const isHeavy = (mass, rule) =>
  rule && rule.threshold !== null && Number.isFinite(Number(mass)) && Number(mass) >= rule.threshold;

// ── Rules ────────────────────────────────────────────────────────────────────
export const RULES = ["C3", "C4", "C5", "C6"];
export const RULE_NAME = {
  C3: "Too much weight on top",
  C4: "Something rests on a fragile box",
  C5: "Not supported enough underneath",
  C6: "Blocked by a later stop",
};
export const RULE_SHORT = { C3: "Weight on top", C4: "Fragile", C5: "Support", C6: "Unload order" };
export const RULE_COLOR = { C3: "#e11d48", C4: "#f97316", C5: "#06b6d4", C6: "#a855f7" };

// ── Physics view of a render item ────────────────────────────────────────────
// The optimizer's render boundary maps physics (x across, y depth from the
// rear door, z height) to render (x, y = height, z = depth). Undo it here.
export function physics(it) {
  return {
    x: Number(it.x), y: Number(it.z), z: Number(it.y),
    dx: Number(it.dx ?? it.length), dy: Number(it.dz ?? it.width), dz: Number(it.dy ?? it.height),
  };
}

// Orientation codes (preprocessing/loader.py): which side of the box is up,
// and which way its length runs.
const ORIENT = {
  1: ["tall side up (as listed)", "length across the truck"],
  2: ["tall side up (as listed)", "length toward the cab"],
  3: ["on its side (width up)", "length across the truck"],
  4: ["on its side (width up)", "length toward the cab"],
  5: ["on its end (length up)", "width across the truck"],
  6: ["on its end (length up)", "width toward the cab"],
};
export function orientationText(code) {
  const o = ORIENT[Number(code)];
  return o ? `${o[0]}, ${o[1]}` : null;
}

export const fmtNum = (v, d = 1) =>
  v === null || v === undefined || !Number.isFinite(Number(v)) ? "—" : Number(v).toLocaleString(undefined, { maximumFractionDigits: d });
