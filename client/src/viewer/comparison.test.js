// The Results page's neutral comparison rules (viewer/comparison.js).
import { positions, profiles, pairText, byDesign, baselineNote, MEASURES, ordered, CONFIG_ORDER } from "./comparison";

const M = Object.fromEntries(MEASURES.map((m) => [m.key, m]));
const name = (c) => ({ DGWO: "DGWO", MOGWO: "MOGWO", SEQ: "Sequential", REP: "Repair-Based" }[c]);

// Study A means (instance 350, 30 seeds)
const A = {
  DGWO: { su_pct: 70.75, csr_all_pct: 31.29, csr_placed_pct: 44.97, placed: 89.9 },
  MOGWO: { su_pct: 66.60, csr_all_pct: 28.19, csr_placed_pct: 41.59, placed: 87.6 },
  SEQ: { su_pct: 69.60, csr_all_pct: 26.87, csr_placed_pct: 38.65, placed: 89.8 },
  REP: { su_pct: 31.95, csr_all_pct: 31.50, csr_placed_pct: 100.0, placed: 40.6 },
};

test("fixed configuration order", () => {
  expect(ordered(["REP", "DGWO", "SEQ", "MOGWO"])).toEqual(CONFIG_ORDER);
  expect(ordered(["REP", "SEQ"])).toEqual(["SEQ", "REP"]);
});

test("level when every gap is under the threshold (2 pp, 2 boxes)", () => {
  expect(positions({ SEQ: { su_pct: 50 }, REP: { su_pct: 51.99 } }, ["SEQ", "REP"], M.su_pct)).toEqual({ SEQ: "level", REP: "level" });
  expect(positions({ SEQ: { su_pct: 50 }, REP: { su_pct: 52 } }, ["SEQ", "REP"], M.su_pct)).toEqual({ SEQ: "lowest", REP: "highest" });
  expect(positions({ SEQ: { placed: 80 }, REP: { placed: 81.5 } }, ["SEQ", "REP"], M.placed)).toEqual({ SEQ: "level", REP: "level" });
});

test("four-way positions on Study A", () => {
  // SU: DGWO 70.75 and SEQ 69.60 are within 2 pp of the top; REP lowest; MOGWO in between
  expect(positions(A, CONFIG_ORDER, M.su_pct)).toEqual({ DGWO: "highest", MOGWO: "between", SEQ: "highest", REP: "lowest" });
  // all-box compliance: 26.87 .. 31.50 -> DGWO and REP within 2 pp of the top,
  // SEQ and MOGWO (28.19, 1.32 above the bottom) within 2 pp of the bottom
  expect(positions(A, CONFIG_ORDER, M.csr_all_pct)).toEqual({ DGWO: "highest", MOGWO: "lowest", SEQ: "lowest", REP: "highest" });
});

test("profiles list highest / lowest / level per configuration", () => {
  const p = profiles(A, ["SEQ", "REP"]);
  expect(p.SEQ.highest).toEqual(["Container fill", "Boxes loaded"]);
  expect(p.REP.highest).toEqual(["Rule compliance, all boxes", "Rule compliance, loaded boxes (by design)"]);
  expect(p.SEQ.lowest).toEqual(["Rule compliance, all boxes", "Rule compliance, loaded boxes"]);
  expect(p.SEQ.level).toEqual([]);
});

test("pair text: level or who is higher, by how much", () => {
  expect(pairText(A, "SEQ", "REP", M.su_pct, name)).toBe("Sequential higher by 37.6 percentage points");
  expect(pairText({ SEQ: { csr_all_pct: 30 }, REP: { csr_all_pct: 31.5 } }, "SEQ", "REP", M.csr_all_pct, name)).toBe("level");
  expect(pairText(A, "SEQ", "REP", M.placed, name)).toBe("Sequential higher by 49.2 boxes");
});

test("by-design labels", () => {
  expect(byDesign("REP", A.REP).csr_placed_pct).toMatch(/^by design/);
  expect(byDesign("REP", { csr_placed_pct: 99.5 }).csr_placed_pct).toBeUndefined();
  expect(byDesign("SEQ", A.SEQ, { dgwo_iters: 150, mogwo_iters: 150 }).card).toBe("by design: the iteration budget is split, 150 DGWO then 150 MOGWO iterations");
  expect(byDesign("DGWO", A.DGWO)).toEqual({});
});

test("one neutral line when a baseline is higher than both hybrids", () => {
  // Study A: DGWO 70.75 vs max(SEQ 69.60, REP 31.95) -> gap 1.15 < 2 -> level, no note for SU;
  // placed: DGWO 89.9 vs 89.8 -> under 2 boxes; compliance: REP is the top hybrid.
  expect(baselineNote(A, name)).toBeNull();
  const B = { ...A, DGWO: { ...A.DGWO, su_pct: 75 }, MOGWO: { ...A.MOGWO, su_pct: 72 } };
  expect(baselineNote(B, name)).toBe("A baseline configuration is higher than both hybrids on: container fill (DGWO, MOGWO). See the full comparison.");
  expect(baselineNote(B, name)).not.toMatch(/better|best|recommend|outperform/i);
});
