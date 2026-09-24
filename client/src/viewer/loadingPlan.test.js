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
