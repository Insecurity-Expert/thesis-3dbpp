// Automated check for the printable loading plan: on every stored study
// arrangement (Study A + Study B, 440 runs), each box's supporting boxes
// must be loaded before it. Run: npx react-scripts test --watchAll=false loadingPlan
import fs from "fs";
import path from "path";
import { buildPlan, checkPlan, supportersOf } from "./loadingPlan";

const STUDIES = path.join(__dirname, "..", "..", "..", "experiments", "results", "studies");

// Study files store physics placements [x, y, z, dx, dy, dz]; the viewer's
// items carry the render axes (y = height, z = depth). Build those.
const toItems = (placements) => Object.entries(placements).map(([k, [x, y, z, dx, dy, dz]]) => ({
  item_idx: Number(k), id: String(k), x, y: z, z: y, dx, dy: dz, dz: dy,
}));

const files = fs.existsSync(STUDIES)
  ? fs.readdirSync(STUDIES).filter((f) => /^study[AB]_.*\.json$/.test(f) && !f.endsWith(".progress.json"))
  : [];

test("the stored studies are present", () => {
  expect(files.length).toBe(2);
});

for (const f of files) {
  test(`${f}: every box is loaded after the boxes it rests on`, () => {
    const doc = JSON.parse(fs.readFileSync(path.join(STUDIES, f), "utf8"));
    let checked = 0, supported = 0;
    for (const run of doc.runs) {
      const plan = buildPlan(toItems(run.placements));
      expect(plan.steps.length).toBe(run.placed);
      const res = checkPlan(plan);
      if (!res.ok) throw new Error(`${run.configuration} instance ${run.instance_id} seed ${run.seed}: ${res.problems[0]}`);
      checked += 1;
      supported += plan.steps.filter((s) => supportersOf(s, plan.steps).length > 0).length;
    }
    expect(checked).toBe(doc.runs.length);
    expect(supported).toBeGreaterThan(0);   // the check is not vacuous
  });
}

test("a plan that loads a box before its support is rejected", () => {
  const items = [
    { item_idx: 0, id: "floor", x: 0, y: 0, z: 0, dx: 10, dy: 10, dz: 10 },   // render: y = height
    { item_idx: 1, id: "top", x: 0, y: 10, z: 0, dx: 10, dy: 10, dz: 10 },
  ];
  const plan = buildPlan(items);
  expect(checkPlan(plan).ok).toBe(true);
  const swapped = { ...plan, steps: plan.steps.slice().reverse().map((s, i) => ({ ...s, step: i + 1 })) };
  expect(checkPlan(swapped).ok).toBe(false);
});

// ── The shared loading order (animation and printed guide) ──────────────────
import fx from "./__fixtures__/gap_fixture.json";
import { inPath } from "./loadingPlan";

const ids = (plan) => plan.steps.map((s) => s.it.item_idx);

test("stop order: last stop first, front wall first, bottom-up, left to right; supporters always first", () => {
  // Fixture: box idx 6 (stop 3) rests on idx 1 (stop 2); stop 2 = idx 0, 1; stop 1 = idx 2 (on 0), 3, 4.
  const plan = buildPlan(fx.items, fx.container);
  expect(checkPlan(plan).ok).toBe(true);
  // Pure stop order would put idx 6 first, before its supporter: it waits for idx 1, then goes.
  expect(ids(plan)).toEqual([0, 1, 6, 2, 4, 3]);
  expect(plan.fixes.map((f) => f.it.item_idx)).toEqual([6]);
  expect(plan.fixes[0].missing).toEqual([1]);
  expect(plan.deferred).toEqual([6]);
  for (const s of plan.steps) for (const sup of supportersOf(s, plan.steps)) expect(sup.step).toBeLessThan(s.step);
});

const box = (item_idx, stop, x, y, z, dx, dy, dz) => ({ item_idx, id: String(item_idx + 1), stop, x, y: z, z: y, dx, dy: dz, dz: dy });
const C = { L: 100, H: 100, D: 200 };

test("a box is never loaded behind a box already standing between it and the door", () => {
  // A (stop 2) near the door; B (stop 1) deeper, same x and height: stop order loads A
  // first and B would have to pass through it, so B goes first.
  const A = box(0, 2, 0, 0, 0, 50, 50, 50), B = box(1, 1, 0, 100, 0, 50, 50, 50);
  const plan = buildPlan([A, B], C);
  expect(ids(plan)).toEqual([1, 0]);
  expect(plan.fixes.map((f) => [f.it.item_idx, f.blockedBy])).toEqual([[1, [0]]]);
  expect(checkPlan(plan).ok).toBe(true);
  // The pure stop order fails the check.
  expect(checkPlan({ ...plan, steps: [{ step: 1, it: A, p: plan.steps[1].p }, { step: 2, it: B, p: plan.steps[0].p }], stuck: [] }).ok).toBe(false);
});

test("the order is the same physical sequence whichever end y = 0 is", () => {
  const mirror = (it) => ({ ...it, z: fx.container.D - it.z - it.dz });     // render z = physics y
  const a = buildPlan(fx.items, { ...fx.container, y_origin: "door" });
  const b = buildPlan(fx.items.map(mirror), { ...fx.container, y_origin: "front_wall" });
  expect(ids(b)).toEqual(ids(a));
  expect(b.steps.map((s) => b.frame.fromFront(s.p))).toEqual(a.steps.map((s) => a.frame.fromFront(s.p)));
});

test("inPath uses the door helper, not a hard-coded door at y = 0", () => {
  const near = { p: { x: 0, y: 0, z: 0, dx: 10, dy: 10, dz: 10 } }, deep = { p: { x: 0, y: 50, z: 0, dx: 10, dy: 10, dz: 10 } };
  expect(inPath(deep, near, buildPlan([], { D: 100, y_origin: "door" }).frame)).toBe(true);
  expect(inPath(near, deep, buildPlan([], { D: 100, y_origin: "front_wall" }).frame)).toBe(true);
  expect(inPath(deep, near, buildPlan([], { D: 100, y_origin: "front_wall" }).frame)).toBe(false);
});
