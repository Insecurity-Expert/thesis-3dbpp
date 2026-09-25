// Acceptance 5: the Loading Guide on instance 350, recommended run.
// The recommendation comes from experiments/recommend.py (Study B holds
// instance 350 with serial timing, so a recommendation exists); the guide is
// built from experiments/run_view.py's payload exactly as the app builds it,
// and checked against tools/guide_reference.py, which uses only the
// independent validator (tools/validate_arrangement.py).
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { buildGuide } from "./guidePlan";
import { checkPlan, buildPlan } from "./loadingPlan";

const ROOT = path.join(__dirname, "..", "..", "..");
const STUDY = path.join(ROOT, "experiments", "results", "studies", "studyB_sample8_quick_s1-10_serial.json");
const PY = process.env.PYTHON || "python3";
const py = (args) => JSON.parse(execFileSync(PY, args, { cwd: ROOT, maxBuffer: 64 << 20 }).toString());

let load, view, ref, guide;
beforeAll(() => {
  const rec = py([path.join(ROOT, "experiments", "recommend.py"), STUDY]);
  load = rec.loads.find((l) => l.instance_id === 350);
  const idx = load.representative[load.top].run_index;
  view = py([path.join(ROOT, "experiments", "run_view.py"), "--study", STUDY, "--run", String(idx)]);
  ref = py([path.join(ROOT, "tools", "guide_reference.py"), "--study", STUDY, "--run", String(idx)]);
  guide = buildGuide(view);
}, 120000);

const idxOf = () => {
  const m = new Map();
  for (const it of view.items) m.set(String(it.id), it.item_idx);
  for (const u of view.problem_view.unplaced) m.set(String(u.id), u.item_idx);
  return m;
};

test("instance 350 has a recommendation and the guide uses its representative run", () => {
  expect(load.available).toBe(true);
  expect(view.strategy).toBe(load.top);
  expect(view.seed).toBe(load.representative[load.top].seed);
  expect(guide.steps.length).toBe(view.items.length);
});

test('every "on top of" instruction equals the real support contacts', () => {
  const m = idxOf();
  let stacked = 0;
  for (const s of guide.steps) {
    const got = s.supporters.map((id) => m.get(String(id))).sort((a, b) => a - b);
    expect(got).toEqual(ref.supporters[String(s.it.item_idx)]);
    if (got.length) { stacked += 1; expect(s.instruction.startsWith("Place on top of ")).toBe(true); }
    else expect(s.instruction).toBe("Place on the floor");
  }
  expect(stacked).toBeGreaterThan(0);
});

test("the loading order passes the support-order check", () => {
  expect(guide.check.ok).toBe(true);
  expect(checkPlan(buildPlan(view.items)).ok).toBe(true);
});

test("the unloading order lists exactly the validator's C6 blockers, grouped by stop", () => {
  const m = idxOf();
  // per box (the appendix's unload-order column): the validator's blockers
  const perBox = {};
  for (const st of guide.steps) {
    if (st.blockers.length) perBox[String(st.it.item_idx)] = st.blockers.map((b) => m.get(String(b.id))).sort((a, b) => a - b);
  }
  expect(perBox).toEqual(ref.c6_blockers);
  expect(Object.keys(perBox).length).toBeGreaterThan(0);
  // per stop (Page 1): the union of the blockers of that stop's boxes, listed once
  for (const g of guide.unloadStops) {
    const want = new Set();
    for (const bx of g.boxes) for (const j of ref.c6_blockers[String(m.get(String(bx.id)))] || []) want.add(j);
    const got = g.blockers.map((b) => m.get(String(b.id)));
    expect(new Set(got).size).toBe(got.length);          // each blocker once
    expect(got.slice().sort((a, b) => a - b)).toEqual(Array.from(want).sort((a, b) => a - b));
    expect(g.blockedCount).toBe(g.boxes.filter((bx) => ref.c6_blockers[String(m.get(String(bx.id)))]).length);
  }
  // every loaded box is unloaded exactly once, stop 1 first
  expect(guide.unloadStops.flatMap((g) => g.boxes).length).toBe(guide.steps.length);
  const order = guide.unloadStops.map((g) => g.stop);
  expect(order).toEqual(order.slice().sort((a, b) => a - b));
});

test("page 3's rehandling count equals the validator's C6-blocked boxes", () => {
  expect(guide.rehandling).toBe(Object.keys(ref.c6_blockers).length);
});

test("the not-loaded list equals the run's unplaced boxes", () => {
  const m = idxOf();
  expect(guide.notLoaded.map((b) => m.get(String(b.id))).sort((a, b) => a - b)).toEqual(ref.unplaced);
  for (const b of guide.notLoaded) expect(b.size).not.toBeNull();
});

test("page 3's per-rule counts equal the validator's", () => {
  expect(guide.pv.violating).toEqual(ref.counts);
});
