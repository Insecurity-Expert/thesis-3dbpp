// Acceptance 6: the Trade-offs chart on Study A, MOGWO — its dots are the
// stored runs' values, and the circled runs equal a non-dominated set computed
// here independently (by sorting, not by pairwise comparison).
import fs from "fs";
import path from "path";
import { tradeoffPoints, nonDominated, allBoxPct } from "./tradeoffs";

const FILE = path.join(__dirname, "..", "..", "..", "experiments", "results", "studies", "studyA_i350_standard_s1-30_parallel.json");

test("Study A, MOGWO: dots and the best-of-both runs", () => {
  const runs = JSON.parse(fs.readFileSync(FILE, "utf8")).runs.filter((r) => r.configuration === "MOGWO");
  expect(runs.length).toBe(30);
  const pts = tradeoffPoints(runs);
  // the dots are the stored values
  pts.forEach((p, i) => {
    expect(p.x).toBe(runs[i].su_pct);
    expect(p.y).toBeCloseTo((runs[i].csr_pct * runs[i].placed) / runs[i].n_items, 12);
    expect(p.seed).toBe(runs[i].seed);
  });
  // independent skyline: sort by fill (desc), then rule-following (desc); keep
  // a run when its rule-following beats every run with at least its fill.
  const sorted = runs.map((r) => ({ seed: r.seed, x: r.su_pct, y: allBoxPct(r) }))
    .sort((a, b) => b.x - a.x || b.y - a.y);
  const sky = [];
  let bestY = -Infinity, lastX = null, lastY = null;
  for (const p of sorted) {
    if (p.y > bestY || (p.x === lastX && p.y === lastY && sky.length && sky[sky.length - 1].y === p.y)) { sky.push(p); }
    if (p.y > bestY) bestY = p.y;
    lastX = p.x; lastY = p.y;
  }
  const want = sky.map((p) => p.seed).sort((a, b) => a - b);
  const got = nonDominated(pts).map((p) => p.seed).sort((a, b) => a - b);
  expect(got).toEqual(want);
  expect(got.length).toBeGreaterThan(0);
  console.log(`Study A MOGWO: best-of-both runs ${got.length} out of ${pts.length} (seeds ${got.join(", ")})`);
});
