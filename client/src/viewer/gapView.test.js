// The gap labels the 3-D view draws must be the optimizer's numbers
// (optimizer/layout_metrics.py, via arrangement_view.gap_view) on a fixed
// arrangement. The fixture is regenerated and checked by
// tools/test_layout_view.py, so a change on the Python side fails there.
import fx from "./__fixtures__/gap_fixture.json";
import { gapLines, gapLabel, faceGapRows } from "./gapView";

const py = fx.python_face_gaps;          // layout_metrics.face_gaps, by item_idx
const pm = fx.python_gap_metrics;        // layout_metrics.gap_metrics
const tau = pm.significant_threshold_cm;
const drawn = gapLines(fx.items, fx.container);

test("the run summary the Gaps panel shows is gap_metrics()", () => {
  for (const k of ["mean_gap_cm", "max_gap_cm", "significant_gaps", "significant_threshold_cm", "n_faces"]) {
    expect(fx.gaps[k]).toBe(pm[k]);
  }
  expect([pm.mean_gap_cm, pm.max_gap_cm, pm.significant_gaps, tau]).toEqual([27.2222, 150, 18, 20]);
});

test("every drawn label is a significant face gap from face_gaps(), in cm", () => {
  for (const l of drawn.lines) {
    for (const [i, face] of l.faces) expect(py[String(i)][face]).toBe(l.gap);
    expect(l.gap).toBeGreaterThanOrEqual(tau);
    expect(gapLabel(l.gap)).toBe(`${l.gap} cm`);
  }
});

test("every significant gap except the roof is drawn exactly once; the roof is not drawn", () => {
  const covered = new Map();
  for (const l of drawn.lines) for (const [i, face] of l.faces) covered.set(`${i}${face}`, (covered.get(`${i}${face}`) || 0) + 1);
  let sig = 0, roof = 0;
  for (const [i, faces] of Object.entries(py)) {
    for (const [face, g] of Object.entries(faces)) {
      if (g < tau) { expect(covered.has(`${i}${face}`)).toBe(false); continue; }
      sig += 1;
      const isRoof = face === "z+" && fx.items.find((e) => String(e.item_idx) === i).face_gaps[face].to === "wall";
      if (isRoof) { roof += 1; expect(covered.has(`${i}${face}`)).toBe(false); }
      else expect(covered.get(`${i}${face}`)).toBe(1);
    }
  }
  expect(sig).toBe(pm.significant_gaps);     // the numbers still count every face, roof included
  expect(roof).toBe(4);
});

test("two facing boxes: one line; door side: one line per row; one door summary", () => {
  const kinds = drawn.lines.reduce((m, l) => ({ ...m, [l.kind]: (m[l.kind] || 0) + 1 }), {});
  expect(kinds).toEqual({ box: 4, wall: 2, door: 3 });
  const row150 = drawn.lines.find((l) => l.kind === "door" && l.gap === 150);
  expect(row150.faces.map(([i]) => i).sort()).toEqual([2, 6]);   // boxes 3 and 7 share a row
  expect(drawn.doorMax.gap).toBe(150);
  expect(drawn.doorRows).toBe(3);
});

test("box details list the six face gaps with what lies beyond", () => {
  const rows = faceGapRows(fx.items.find((e) => e.item_idx === 3), fx.container, (j) => `Box ${j + 1}`);
  expect(rows.map((r) => [r.name, r.gap, r.beyond])).toEqual([
    ["Across, toward x = 0", 0, "side wall (x = 0)"],
    ["Across, toward the far side", 60, "side wall (far side)"],
    ["Toward the front wall", 50, "Box 1"],
    ["Toward the door", 60, "rear door"],
    ["Below", 0, "floor"],
    ["Above", 60, "roof"],
  ]);
});
