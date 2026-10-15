// Which of the optimizer's face gaps the 3-D view draws, and how they read.
// No gap is computed here: every value, dimension line and empty block comes
// from optimizer/arrangement_view.gap_view (layout_metrics.face_gaps, M-6), so
// the labels are the paper's numbers. This file only CHOOSES what to draw:
//   - significant gaps only (the optimizer sends a line only for gap >= tau);
//   - not the gap above a box to the roof (it stays in the numbers);
//   - a gap between two facing boxes once, not once from each box;
//   - door-side gaps once per row: boxes whose door-facing faces stand at the
//     same distance from the door form one row, drawn with one line.
import { truckFrame } from "./truckFrame";
import { fmtNum } from "./boxInfo";

const OPP = { "x-": "x+", "x+": "x-", "y-": "y+", "y+": "y-", "z-": "z+", "z+": "z-" };
const FACES = ["x-", "x+", "y-", "y+", "z-", "z+"];
const same = (a, b) => Math.abs(a - b) < 1e-6;

export const gapLabel = (cm) => `${fmtNum(cm, 1)} cm`;

export function gapLines(items, container) {
  const frame = truckFrame(container);
  const byIdx = new Map((items || []).map((it) => [Number(it.item_idx), it]));
  const lines = [];
  const blocks = [];
  const pairs = new Set();
  const doorRows = new Map();
  let doorMax = null;
  for (const it of items || []) {
    const fg = it.face_gaps;
    if (!fg) continue;
    const i = Number(it.item_idx);
    for (const face of FACES) {
      const f = fg[face];
      if (!f) continue;
      if (face === frame.doorFace && f.to === "wall" && (!doorMax || f.gap_cm > doorMax.gap)) doorMax = { gap: f.gap_cm, item_idx: i };
      if (!f.line) continue;                                    // not significant
      if (face === "z+" && f.to === "wall") continue;           // roof: in the numbers, not drawn
      blocks.push({ key: `${i}${face}`, block: f.block, gap: f.gap_cm });
      if (f.to === "box") {
        const j = Number(f.box);
        const back = byIdx.get(j)?.face_gaps?.[OPP[face]];
        const mutual = back && back.to === "box" && Number(back.box) === i && same(back.gap_cm, f.gap_cm);
        const key = mutual ? `${Math.min(i, j)}-${Math.max(i, j)}-${face[0]}` : `${i}${face}`;
        if (pairs.has(key)) continue;
        pairs.add(key);
        lines.push({ key, a: f.line[0], b: f.line[1], gap: f.gap_cm, kind: "box", faces: mutual ? [[i, face], [j, OPP[face]]] : [[i, face]] });
      } else if (face === frame.doorFace) {
        const k = Math.round(f.gap_cm * 1000);
        if (!doorRows.has(k)) doorRows.set(k, []);
        doorRows.get(k).push({ i, face, f, it });
      } else {
        lines.push({ key: `${i}${face}`, a: f.line[0], b: f.line[1], gap: f.gap_cm, kind: "wall", wall: frame.wallName(face), faces: [[i, face]] });
      }
    }
  }
  // One line per door row, from the box in the middle of the row (by x, then height).
  for (const [k, row] of doorRows) {
    row.sort((a, b) => Number(a.it.x) - Number(b.it.x) || Number(a.it.y) - Number(b.it.y));
    const m = row[Math.floor((row.length - 1) / 2)];
    lines.push({ key: `door-${k}`, a: m.f.line[0], b: m.f.line[1], gap: m.f.gap_cm, kind: "door", wall: "rear door",
      faces: row.map((r) => [r.i, r.face]) });
  }
  return { lines, blocks, doorMax, doorRows: doorRows.size, frame };
}

// The six face gaps of one box, for the box details panel.
export function faceGapRows(it, container, idToName = (j) => `Box ${j}`) {
  const fg = it && it.face_gaps;
  if (!fg) return null;
  const frame = truckFrame(container);
  const order = ["x-", "x+", frame.frontFace, frame.doorFace, "z-", "z+"];
  return order.map((face) => {
    const f = fg[face];
    return { face, name: frame.faceName(face), gap: f.gap_cm, significant: !!f.line,
      beyond: f.to === "wall" ? frame.wallName(face) : idToName(f.box) };
  });
}
