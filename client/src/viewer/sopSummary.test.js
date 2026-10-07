// The SOP Summary's best-pick and wording rules (viewer/sopSummary.js).
import { pickBest, descriptiveModel, testedModel, testedVerdict, modelText, runValue, meanSd, NEVER_BEST, SOP_ROWS } from "./sopSummary";

const name = (c) => ({ DGWO: "DGWO", MOGWO: "MOGWO", SEQ: "Sequential", REP: "Repair-Based" }[c]);
const FORBIDDEN = /recommend|winner|overall best/i;

// A study run (experiments/study.py fields only).
const run = (configuration, seed, o = {}) => ({
  configuration, seed, instance_id: 350, n_items: 100, placed: 90, su_pct: 60, csr_pct: 50,
  C3_pct: 80, C4_pct: 100, C5_pct: 100, C6_pct: 70, exec_time_ms: 1000, cpu_time_ms: 900, peak_mem_mb: 100, ...o,
});

describe("pickBest", () => {
  test("higher is better: the largest mean is Best", () => {
    const r = pickBest([{ code: "SEQ", mean: 64.3, sd: 0.5 }, { code: "REP", mean: 35.8, sd: 1 }], { higherIsBetter: true });
    expect(r.status).toEqual({ SEQ: "best" });
  });

  test("lower is better: the smallest mean is Best", () => {
    const r = pickBest([{ code: "SEQ", mean: 1200, sd: 10 }, { code: "REP", mean: 900, sd: 10 }, { code: "DGWO", mean: 2000, sd: 10 }], { higherIsBetter: false });
    expect(r.status).toEqual({ REP: "best" });
    expect(r.order).toEqual(["REP", "SEQ", "DGWO"]);
  });

  test("tie rule: gap under the larger SD marks best and runner-up 'tie'", () => {
    // gap 1.0 < max(0.4, 1.5) -> tie
    expect(pickBest([{ code: "DGWO", mean: 70, sd: 0.4 }, { code: "SEQ", mean: 69, sd: 1.5 }, { code: "REP", mean: 30, sd: 1 }]).status)
      .toEqual({ DGWO: "tie", SEQ: "tie" });
    // gap 1.0 >= max(0.4, 0.9) -> a single Best
    expect(pickBest([{ code: "DGWO", mean: 70, sd: 0.4 }, { code: "SEQ", mean: 69, sd: 0.9 }]).status).toEqual({ DGWO: "best" });
    // exactly equal with no spread is a tie, not an arbitrary pick
    expect(pickBest([{ code: "DGWO", mean: 100, sd: 0 }, { code: "SEQ", mean: 100, sd: 0 }]).status).toEqual({ DGWO: "tie", SEQ: "tie" });
    // lower-is-better ties the same way
    expect(pickBest([{ code: "A", mean: 1000, sd: 50 }, { code: "B", mean: 1030, sd: 10 }], { higherIsBetter: false }).status).toEqual({ A: "tie", B: "tie" });
  });

  test("placed-box compliance is never highlighted", () => {
    expect(NEVER_BEST.has("csr_placed_pct")).toBe(true);
    const r = pickBest([{ code: "REP", mean: 100, sd: 0 }, { code: "SEQ", mean: 39.6, sd: 2 }], { key: "csr_placed_pct" });
    expect(r.status).toEqual({});
  });

  test("fewer than two values: nothing to compare", () => {
    expect(pickBest([{ code: "SEQ", mean: 50, sd: 1 }]).status).toEqual({});
    expect(pickBest([{ code: "SEQ", mean: 50, sd: 1 }, { code: "REP", mean: null, sd: null }]).status).toEqual({});
  });
});

test("all-box values count unloaded boxes as non-compliant", () => {
  const r = run("SEQ", 1, { placed: 50, n_items: 100, csr_pct: 80, C3_pct: 90, C6_pct: 60 });
  expect(runValue(r, "csr_all")).toBeCloseTo(40);
  expect(runValue(r, "c3_all")).toBeCloseTo(45);
  expect(runValue(r, "c6_all")).toBeCloseTo(30);
  expect(meanSd([1, 2, 3])).toEqual({ mean: 2, sd: 1, n: 3 });
});

describe("descriptiveModel (one instance)", () => {
  // SEQ fills clearly more; REP keeps the rules for every loaded box but loads fewer.
  const runs = [1, 2, 3].flatMap((s) => [
    run("SEQ", s, { su_pct: 64 + s * 0.1, csr_pct: 40, placed: 92, exec_time_ms: 1000 + s, peak_mem_mb: 100 }),
    run("REP", s, { su_pct: 35 + s * 0.1, csr_pct: 100, placed: 44, exec_time_ms: 3000 + s, peak_mem_mb: 100 + s }),
  ]);
  const m = descriptiveModel({ runs, codes: ["SEQ", "REP"], nameOf: name });
  const row = (id) => m.rows.find((r) => r.id === id);
  const meas = (id, k) => row(id).measures.find((x) => x.key === k);

  test("three rows, one per specific problem, with their direction", () => {
    expect(m.rows.map((r) => [r.id, r.better])).toEqual([["SP1", "Higher"], ["SP2", "Higher"], ["SP3", "Lower"]]);
    expect(row("SP2").measures.map((x) => x.key)).toEqual(["csr_all", "c3_all", "c6_all"]);
    expect(row("SP2").note).toBe("Fragility and stability are guaranteed for every loaded box by the decoder.");
  });

  test("best per measure and one generated sentence per row", () => {
    expect(meas("SP1", "su").cells.SEQ.status).toBe("best");
    expect(meas("SP1", "su").cells.REP.status).toBeNull();
    expect(row("SP1").sentence).toBe("Sequential filled the container most (64.2%).");
    expect(meas("SP3", "time").cells.SEQ.status).toBe("best");
    // memory: 100 vs 102 with REP sd 1 -> gap 2 >= 1 -> SEQ best
    expect(meas("SP3", "mem").cells.SEQ.status).toBe("best");
    expect(row("SP3").sentence).toMatch(/^Sequential ran in the least time \(1\.0 s\); Sequential used the least peak memory \(100\.0 MB\)\.$/);
  });

  test("placed-box compliance is not a summary measure, so REP's 100% is never marked", () => {
    const keys = m.rows.flatMap((r) => r.measures.map((x) => x.key));
    expect(keys.some((k) => /placed/.test(k))).toBe(false);
    expect(SOP_ROWS.flatMap((r) => r.measures).some((k) => NEVER_BEST.has(k))).toBe(false);
    // all-box compliance: SEQ 40*0.92 = 36.8 vs REP 100*0.44 = 44 -> REP, on the all-box basis
    expect(meas("SP2", "csr_all").cells.REP.status).toBe("best");
    expect(meas("SP2", "csr_all").cells.REP.text).toBe("44.0%");
  });

  test("tie rule in the sentence: 'about the same', nobody named best", () => {
    const tied = [1, 2, 3, 4].flatMap((s) => [
      run("DGWO", s, { su_pct: [70, 72, 68, 71][s - 1] }),
      run("SEQ", s, { su_pct: [70.5, 69, 71, 70][s - 1] }),
    ]);
    const t = descriptiveModel({ runs: tied, codes: ["DGWO", "SEQ"], nameOf: name });
    const su = t.rows[0].measures[0];
    expect(su.cells.DGWO.status).toBe("tie");
    expect(su.cells.SEQ.status).toBe("tie");
    expect(t.rows[0].sentence).toMatch(/about the same/);
    expect(t.rows[0].sentence).not.toMatch(/most/);
  });

  test("single instance: never 'significant'; the not-tested note is shown", () => {
    const text = modelText(m);
    expect(text).not.toMatch(/\bsignificant(ly)?\b/i);
    expect(text).not.toMatch(FORBIDDEN);
    expect(m.note).toBe("One instance, 3 runs each; differences are not tested for significance. Every statistic is under Show all numbers.");
  });

  test("parallel timing: time and memory shown but not compared", () => {
    const p = descriptiveModel({ runs, codes: ["SEQ", "REP"], nameOf: name, timingOk: false });
    const sp3 = p.rows.find((r) => r.id === "SP3");
    expect(sp3.measures.every((x) => Object.values(x.cells).every((c) => c.status === null))).toBe(true);
    expect(sp3.sentence).toMatch(/not compared/);
  });
});

describe("testedModel (stats.py verdicts)", () => {
  const pair = (a, b, outperforms) => ({ a, b, outperforms });
  const cmp = (pairs) => ({ omnibus: { testable: true }, pairs });
  const desc = (o) => Object.fromEntries(Object.entries(o).map(([c, mean]) => [c, { mean, sd: 1 }]));
  const stats = {
    primary_compliance: "all_boxes",
    provenance: { n_instances: 8 },
    descriptives: {
      SU: desc({ SEQ: 65, REP: 30, DGWO: 64 }),
      CSR: { all_boxes: desc({ SEQ: 30, REP: 35, DGWO: 31 }) },
      C3: { all_boxes: desc({ SEQ: 80, REP: 40, DGWO: 81 }) },
      C6: { all_boxes: desc({ SEQ: 50, REP: 50.5, DGWO: 49 }) },
      ET: desc({ SEQ: 1000, REP: 3000, DGWO: 900 }),
      PM: desc({ SEQ: 100, REP: 101, DGWO: 99 }),
    },
    SP1: { comparison: cmp([pair("DGWO", "SEQ", "SEQ"), pair("DGWO", "REP", "DGWO"), pair("SEQ", "REP", "SEQ")]) },
    SP2: { by_definition: { all_boxes: { per_measure: {
      CSR: cmp([pair("DGWO", "SEQ", null), pair("DGWO", "REP", "REP"), pair("SEQ", "REP", "REP")]),
      C3: cmp([pair("DGWO", "SEQ", null), pair("DGWO", "REP", "DGWO"), pair("SEQ", "REP", "SEQ")]),
      C6: cmp([pair("DGWO", "SEQ", null), pair("DGWO", "REP", null), pair("SEQ", "REP", null)]),
    } } } },
    SP3: { available: true, profiles: [{ friedman: { ET: { omnibus: { testable: false } }, PM: { omnibus: { testable: false } } } }] },
  };
  const m = testedModel({ stats, codes: ["DGWO", "SEQ", "REP"], nameOf: name });
  const meas = (id, k) => m.rows.find((r) => r.id === id).measures.find((x) => x.key === k);

  test("Best only when every pair's verdict (Holm + effect size) favours it", () => {
    expect(meas("SP1", "su").cells.SEQ.status).toBe("best");
    expect(m.rows[0].sentence).toBe("Sequential had significantly higher container fill than DGWO and Repair-Based.");
    expect(meas("SP2", "csr_all").cells.REP.status).toBe("best");
  });

  test("not separated from the top: marked together, 'no significant difference'", () => {
    // C3: DGWO top, beats REP, not separated from SEQ
    expect(meas("SP2", "c3_all").cells.DGWO.status).toBe("tie");
    expect(meas("SP2", "c3_all").cells.SEQ.status).toBe("tie");
    expect(meas("SP2", "c3_all").cells.REP.status).toBeNull();
    // C6: nothing significant -> nothing marked
    expect(Object.values(meas("SP2", "c6_all").cells).every((c) => c.status === null)).toBe(true);
    const v = testedVerdict({ cmps: [stats.SP2.by_definition.all_boxes.per_measure.C6], codes: ["DGWO", "SEQ", "REP"],
      means: { DGWO: 49, SEQ: 50, REP: 50.5 }, higherIsBetter: true });
    expect(v.beaten).toEqual([]);
  });

  test("untestable measures are not marked and say so", () => {
    expect(Object.values(meas("SP3", "time").cells).every((c) => c.status === null)).toBe(true);
    expect(m.rows[2].sentence).toMatch(/not tested/);
    expect(modelText(m)).not.toMatch(FORBIDDEN);
  });
});
