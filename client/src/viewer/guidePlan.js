// The Loading & Unloading Guide, built from ONE stored solution: only what can
// be determined from the run's own placements and its per-box rule outcomes
// (optimizer/arrangement_view.py via experiments/run_view.py). No geographic
// destinations, no invented instructions.
import { buildPlan, checkPlan, supportersOf } from "./loadingPlan";
import { orientationText, fmtNum } from "./boxInfo";

// Short orientation words for the printed table (same codes as boxInfo).
const ORIENT_SHORT = { 1: "upright, length across", 2: "upright, length toward cab", 3: "on its side, length across",
                       4: "on its side, length toward cab", 5: "on its end, width across", 6: "on its end, width toward cab" };

// "Box 017" for numeric ids; other ids as they are.
export const boxLabel = (id) => (/^\d+$/.test(String(id)) ? `Box ${String(id).padStart(3, "0")}` : `Box ${id}`);

const andList = (xs) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

export function buildGuide(view) {
  const items = (view && Array.isArray(view.items)) ? view.items : [];
  const pv = view ? view.problem_view : null;
  const plan = buildPlan(items);
  const check = checkPlan(plan);
  const byId = new Map(items.map((it) => [String(it.id ?? it.item_idx), it]));
  const stops = Array.from(new Set(items.map((i) => Number(i.stop)).concat(pv ? pv.unplaced.map((u) => Number(u.stop)) : [])))
    .sort((a, b) => a - b);
  const firstStop = stops.length ? stops[0] : null;

  const steps = plan.steps.map((s) => {
    const it = s.it;
    const on = supportersOf(s, plan.steps);
    const fragile = it.fragile === 1 || it.fragile === true || it.type === "Fragile";
    const hasChecks = Array.isArray(it.violations);
    const over = hasChecks && it.violations.includes("C3") ? Number(it.load_above_kg) - Number(it.max_load_kg) : null;
    const support = it.support_ratio == null ? null : Number(it.support_ratio);
    const blockers = (it.c6_blocked_by || []).map((id) => byId.get(String(id))).filter(Boolean);
    return {
      step: s.step, it, p: s.p,
      id: it.id ?? it.item_idx, label: boxLabel(it.id ?? it.item_idx), stop: Number(it.stop),
      size: `${fmtNum(s.p.dx)} × ${fmtNum(s.p.dy)} × ${fmtNum(s.p.dz)}`,
      orientation: orientationText(it.orientation),
      orientationShort: ORIENT_SHORT[Number(it.orientation)] || null,
      mass: Number(it.mass ?? it.weight),
      fragile,
      position: `(${fmtNum(s.p.x)}, ${fmtNum(s.p.y)}, ${fmtNum(s.p.z)})`,
      supporters: on.map((o) => o.it.id ?? o.it.item_idx),
      instruction: on.length === 0 ? "Place on the floor" : `Place on top of ${andList(on.map((o) => boxLabel(o.it.id ?? o.it.item_idx)))}`,
      reachable: firstStop !== null && Number(it.stop) === firstStop ? `Keep reachable — unloaded at stop ${firstStop}` : null,
      c3: !hasChecks ? null : over === null ? "OK" : `over by ${fmtNum(over, 1)} kg`,
      c5: !hasChecks ? null : support === null ? "floor · OK"
        : `${fmtNum(100 * support, 0)}% · ${it.violations.includes("C5") ? "below 80%" : "OK"}`,
      // The table names two blockers at most; the unloading order lists all of them.
      c6: !hasChecks ? null : blockers.length === 0 ? "OK"
        : blockers.length <= 2 ? `blocked by ${andList(blockers.map((b) => boxLabel(b.id ?? b.item_idx)))}`
        : `blocked by ${blockers.slice(0, 2).map((b) => boxLabel(b.id ?? b.item_idx)).join(", ")} and ${blockers.length - 2} more`,
      blockers: blockers.map((b) => ({ id: b.id ?? b.item_idx, label: boxLabel(b.id ?? b.item_idx), stop: Number(b.stop) })),
    };
  });

  // Unloading, grouped by stop (stop 1 first). Within a stop, the reverse of
  // the loading order (nearest the door and topmost first). The later-stop
  // boxes that block any of the stop's boxes under C6 are listed once for the
  // stop: move them first, then unload the stop's boxes.
  const unloadStops = stops.map((st) => {
    const mine = steps.filter((s) => s.stop === st).slice().reverse();
    const seen = new Map();
    for (const s of mine) for (const b of s.blockers) if (!seen.has(String(b.id))) seen.set(String(b.id), b);
    const blockers = Array.from(seen.values()).sort((a, b) => a.stop - b.stop || String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
    return {
      stop: st,
      boxes: mine.map((s) => ({ id: s.id, label: s.label, loadStep: s.step, blocked: s.blockers.length > 0 })),
      blockers,
      blockedCount: mine.filter((s) => s.blockers.length > 0).length,
    };
  });
  // Boxes that need other boxes moved before they can be unloaded (C6).
  const rehandling = steps.filter((s) => s.blockers.length > 0).length;

  const notLoaded = pv ? pv.unplaced.map((u) => ({
    id: u.id, label: boxLabel(u.id), stop: Number(u.stop), mass: Number(u.mass), fragile: !!u.fragile,
    size: u.l != null ? `${fmtNum(u.l)} × ${fmtNum(u.w)} × ${fmtNum(u.h)}` : null,
  })) : [];

  return { steps, unloadStops, rehandling, notLoaded, stops, check, nBands: plan.nBands, pv };
}

// "Box 031, 044, 052" — the first with "Box", the rest by number.
export function boxList(ids) {
  const nums = ids.map((id) => (/^\d+$/.test(String(id)) ? String(id).padStart(3, "0") : String(id)));
  return nums.length ? `Box ${nums.join(", ")}` : "";
}

// Height layers for the top views: boxes grouped by the height of their base.
export function layersOf(steps) {
  const key = (z) => Math.round(z * 1000) / 1000;
  const m = new Map();
  for (const s of steps) {
    const k = key(s.p.z);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(s);
  }
  return Array.from(m.entries()).sort((a, b) => a[0] - b[0]).map(([z, boxes], i) => ({ n: i + 1, z, boxes }));
}

// Page 1 as CSV (a custom load carries its label on every row).
export function guideCsv(guide, customLabel = null) {
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["Step", "Box", "Stop", "Size as placed (across x deep x high, cm)", "Orientation", "Weight (kg)", "Fragile",
    "Position x, y from door, z (cm)", "Placement", "Reachability", "Load on top (C3)", "Base support (C5)", "Unload order (C6)"]
    .concat(customLabel ? ["Dataset"] : []);
  const rows = guide.steps.map((s) => [s.step, s.label, s.stop, s.size, s.orientation ?? "not recorded", fmtNum(s.mass, 2),
    s.fragile ? "yes" : "no", s.position, s.instruction, s.reachable ?? "", s.c3 ?? "not recorded", s.c5 ?? "not recorded",
    s.c6 ?? "not recorded"].concat(customLabel ? [customLabel] : []));
  return [head, ...rows].map((r) => r.map(q).join(",")).join("\n") + "\n";
}
