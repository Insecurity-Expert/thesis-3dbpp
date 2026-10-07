import { methodValues, bestFor, barPercent, compositeScores, ranksFor, rankBy, runCountText,
  metricByKey, metricsFor, sd, criterionText } from "./resultsMetrics";

// One run record as experiments/study.py writes it.
const run = (configuration, o = {}) => ({
  configuration, su_pct: 60, csr_pct: 50, C3_pct: 80, C6_pct: 40, placed: 80, n_items: 100,
  exec_time_ms: 1000, peak_mem_mb: 150, ...o,
});

test("means over runs; all-box rates use placed / n_items", () => {
  const v = methodValues([run("SEQ", { su_pct: 60 }), run("SEQ", { su_pct: 70, csr_pct: 40, placed: 50 })]);
  expect(v.SEQ.nRuns).toBe(2);
  expect(v.SEQ.values.fill).toBe(65);
  // (50*80/100 + 40*50/100) / 2 = (40 + 20) / 2
  expect(v.SEQ.values.csr_all).toBe(30);
  expect(v.SEQ.values.csr_loaded).toBe(45);
  expect(v.SEQ.values.boxes).toBe(65);
  expect(v.SEQ.bars.boxes).toBe(65);              // placed / total in percent
  expect(v.SEQ.values.spread).toBeCloseTo(sd([60, 70]));
  expect(v.REP.ran).toBe(false);
});

test("ties: every tied method is best (at display precision)", () => {
  const v = methodValues([run("SEQ", { su_pct: 61.21 }), run("REP", { su_pct: 61.24 }), run("DGWO", { su_pct: 55 }), run("MOGWO", { su_pct: 50 })]);
  expect(bestFor(metricByKey("fill"), v).sort()).toEqual(["REP", "SEQ"]);
  const ranks = rankBy(["SEQ", "REP", "DGWO", "MOGWO"], (c) => Math.round(v[c].values.fill * 10) / 10, true);
  expect(ranks).toEqual({ SEQ: 1, REP: 1, DGWO: 3, MOGWO: 4 });
});

test("lower-is-better metrics: the smallest time is best and ranked first", () => {
  const v = methodValues([run("SEQ", { exec_time_ms: 3000 }), run("REP", { exec_time_ms: 9000 }),
                          run("DGWO", { exec_time_ms: 1000 }), run("MOGWO", { exec_time_ms: 2000 })]);
  expect(bestFor(metricByKey("time"), v)).toEqual(["DGWO"]);
  expect(ranksFor("sp3", v).ranks).toEqual({ DGWO: 1, MOGWO: 2, SEQ: 3, REP: 4 });
  // relative bar: largest value = 100 %
  expect(barPercent(metricByKey("time"), "REP", v)).toBe(100);
  expect(barPercent(metricByKey("time"), "DGWO", v)).toBeCloseTo(100 / 9);
});

test("a method that was not run is excluded from best and rank", () => {
  const v = methodValues([run("SEQ", { su_pct: 50 }), run("REP", { su_pct: 40 }), run("DGWO", { su_pct: 45 })]);
  expect(v.MOGWO.ran).toBe(false);
  expect(v.MOGWO.values.fill).toBeNull();
  expect(bestFor(metricByKey("fill"), v)).toEqual(["SEQ"]);
  const { ranks } = ranksFor("sp1", v);
  expect(ranks).toEqual({ SEQ: 1, DGWO: 2, REP: 3 });
  expect(ranks.MOGWO).toBeUndefined();
  expect(barPercent(metricByKey("fill"), "MOGWO", v)).toBe(0);
});

test("only one method run: no best value and no ranking", () => {
  const v = methodValues([run("SEQ"), run("SEQ", { su_pct: 70 })]);
  expect(bestFor(metricByKey("fill"), v)).toEqual([]);
  expect(ranksFor("overall", v).ranks).toEqual({});
  expect(ranksFor("sp2", v).ranks).toEqual({});
});

test("composite ranking: 0.25 fill + 0.25 compliance + 0.25 (1 - cost) + 0.25 (1 - spread)", () => {
  // Two runs each so the spread exists. SEQ: best fill, worst cost; REP: best
  // compliance; DGWO: cheapest; MOGWO: steadiest.
  const runs = [
    run("SEQ", { su_pct: 70, csr_pct: 30, exec_time_ms: 4000, peak_mem_mb: 200 }), run("SEQ", { su_pct: 74, csr_pct: 30, exec_time_ms: 4000, peak_mem_mb: 200 }),
    run("REP", { su_pct: 40, csr_pct: 100, exec_time_ms: 3000, peak_mem_mb: 180 }), run("REP", { su_pct: 44, csr_pct: 100, exec_time_ms: 3000, peak_mem_mb: 180 }),
    run("DGWO", { su_pct: 60, csr_pct: 40, exec_time_ms: 1000, peak_mem_mb: 100 }), run("DGWO", { su_pct: 66, csr_pct: 40, exec_time_ms: 1000, peak_mem_mb: 100 }),
    run("MOGWO", { su_pct: 55, csr_pct: 50, exec_time_ms: 2000, peak_mem_mb: 150 }), run("MOGWO", { su_pct: 56, csr_pct: 50, exec_time_ms: 2000, peak_mem_mb: 150 }),
  ];
  const v = methodValues(runs);
  const { scores, terms } = compositeScores(v);
  expect(terms).toEqual(["fill", "csr_all", "cost", "spread"]);
  // hand computation, csr_all = csr_pct * 0.8
  const fill = { SEQ: 72, REP: 42, DGWO: 63, MOGWO: 55.5 };
  const csr = { SEQ: 24, REP: 80, DGWO: 32, MOGWO: 40 };
  const nt = { SEQ: 1, REP: 2 / 3, DGWO: 0, MOGWO: 1 / 3 }, nm = { SEQ: 1, REP: 0.8, DGWO: 0, MOGWO: 0.5 };
  const spr = { SEQ: sd([70, 74]), REP: sd([40, 44]), DGWO: sd([60, 66]), MOGWO: sd([55, 56]) };
  const mm = (o) => { const xs = Object.values(o); const lo = Math.min(...xs), hi = Math.max(...xs); return (c) => (o[c] - lo) / (hi - lo); };
  const f = mm(fill), k = mm(csr), s = mm(spr);
  for (const c of ["SEQ", "REP", "DGWO", "MOGWO"]) {
    const expected = 0.25 * f(c) + 0.25 * k(c) + 0.25 * (1 - (nt[c] + nm[c]) / 2) + 0.25 * (1 - s(c));
    expect(scores[c]).toBeCloseTo(expected, 10);
  }
  const ranked = ranksFor("overall", v);
  expect(ranked.criterion).toBe("composite");
  const order = Object.entries(ranked.ranks).sort((a, b) => a[1] - b[1]).map(([c]) => c);
  expect(order).toEqual(Object.entries(scores).sort((a, b) => b[1] - a[1]).map(([c]) => c));
  expect(criterionText(ranked)).toBe("the equal-weighted composite score (container fill; rule compliance (all boxes); time and memory; run-to-run spread)");
});

test("composite leaves out time and memory when timing is invalid (parallel runs)", () => {
  const v = methodValues([run("SEQ", { su_pct: 70 }), run("SEQ", { su_pct: 71 }), run("REP", { su_pct: 40 }), run("REP", { su_pct: 42 })]);
  expect(compositeScores(v, { timingOk: false }).terms).toEqual(["fill", "csr_all", "spread"]);
  expect(ranksFor("sp3", v, { timingOk: false }).ranks).toEqual({});
});

test("run-count wording and tab metric order", () => {
  expect(runCountText(methodValues([run("SEQ"), run("SEQ"), run("REP")]))).toBe("Means over 1–2 runs per method.");
  expect(runCountText(methodValues([run("SEQ"), run("REP")]))).toBe("Means over 1 run per method.");
  expect(metricsFor("overall").map((m) => m.key)).toEqual(["fill", "csr_all", "c3_all"]);
  expect(metricsFor("sp1").map((m) => m.key)).toEqual(["fill", "spread", "boxes"]);
  expect(metricsFor("sp2").map((m) => m.key)).toEqual(["csr_all", "c3_all", "c6_all", "csr_loaded"]);
  expect(metricsFor("sp3").map((m) => m.key)).toEqual(["time", "memory"]);
});

test("number formats: one decimal for %, thousands separators for ms, one decimal for MB", () => {
  expect(metricByKey("fill").format(61.234)).toBe("61.2%");
  expect(metricByKey("time").format(31618.4)).toBe("31,618 ms");
  expect(metricByKey("memory").format(204.44)).toBe("204.4 MB");
});
