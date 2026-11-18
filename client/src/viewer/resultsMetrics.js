// client/src/viewer/resultsMetrics.js — the numbers behind the Results page
// ("Performance Overview"). Pure functions over a study's per-run records for
// ONE load; nothing here is a statistical test (those are in Technical
// Details / Studies, from experiments/stats.py).
//
// Run record fields used (written by experiments/study.py): configuration,
// su_pct, compliant_su_pct (M-1b, the SP1 measure; older study files get it
// from tools/add_compliant_su.py), csr_pct (over placed boxes), C3_pct /
// C6_pct (over placed boxes), placed, n_items, exec_time_ms, peak_mem_mb.

export const METHOD_ORDER = ["SEQ", "REP", "DGWO", "MOGWO"];
// Repair-Based is the proposed hybrid; the other three are what it is compared with.
export const HYBRID_METHODS = ["REP"];
export const BASELINE_METHODS = ["DGWO", "MOGWO", "SEQ"];

// Display name and the tag pill of each method (mechanism, never a result).
export const METHOD_INFO = {
  SEQ:   { name: "Sequential Hybrid",   tag: "two-stage",             swatch: "var(--method-seq)" },
  REP:   { name: "Repair-Based Hybrid", tag: "fixes every placement", swatch: "var(--method-rep)" },
  DGWO:  { name: "DGWO",                tag: "discrete search",       swatch: "var(--method-dgwo)" },
  MOGWO: { name: "MOGWO",               tag: "multi-objective",       swatch: "var(--method-mogwo)" },
};

const allBox = (r, pct) => (r.n_items ? (pct * r.placed) / r.n_items : 0);

const fmtPct = (v) => `${v.toFixed(1)}%`;
const fmtMs = (v) => `${Math.round(v).toLocaleString("en-US")} ms`;
const fmtMb = (v) => `${v.toFixed(1)} MB`;
const fmtPp = (v) => `${v.toFixed(1)} pp`;

// One entry per metric; both views and every tab are driven from this list.
//   value(runs)   -> the method's number (mean over runs, or the SD for spread)
//   bar           -> "pct": bar length = the value; "relative": value / largest
//                    value among the methods; "share": barValue(runs) in percent
//   higher        -> true when higher is better
//   decimals      -> precision at which two methods count as tied
// Compliant fill of every run, or null when a run predates the field (then the
// fill-based fallbacks below apply, so older study files still read sensibly).
const csuOf = (rs) => (rs.every((r) => r.compliant_su_pct != null) ? rs.map((r) => r.compliant_su_pct) : null);

export const METRICS = [
  { key: "csu", tab: ["overall", "sp1"], label: "Compliant fill (rule-following boxes)", unit: "%", higher: true, bar: "pct", decimals: 1,
    aria: "percent", value: (rs) => { const v = csuOf(rs); return v ? mean(v) : null; }, format: fmtPct },
  { key: "fill", tab: ["overall", "sp1"], label: "Container fill", unit: "%", higher: true, bar: "pct", decimals: 1,
    aria: "percent", value: (rs) => mean(rs.map((r) => r.su_pct)), format: fmtPct },
  // Robustness (M-5): run-to-run SD of compliant fill, as in the thesis; of fill for older files.
  { key: "spread", tab: ["sp1"], label: "Run-to-run spread (SD)", unit: "pp", higher: false, bar: "relative", decimals: 1,
    aria: "percentage points", value: (rs) => sd(csuOf(rs) || rs.map((r) => r.su_pct)), format: fmtPp, minRuns: 2 },
  { key: "boxes", tab: ["sp1"], label: "Boxes loaded", unit: "boxes", higher: true, bar: "share", decimals: 1,
    aria: "boxes", value: (rs) => mean(rs.map((r) => r.placed)),
    barValue: (rs) => mean(rs.map((r) => (r.n_items ? (100 * r.placed) / r.n_items : 0))),
    format: (v, rs) => `${v.toFixed(1)} / ${rs[0].n_items}` },
  { key: "csr_all", tab: ["overall", "sp2"], label: "Rule compliance (all boxes)", unit: "%", higher: true, bar: "pct", decimals: 1,
    aria: "percent", value: (rs) => mean(rs.map((r) => allBox(r, r.csr_pct))), format: fmtPct },
  { key: "c3_all", tab: ["overall", "sp2"], label: "Load-bearing rule", unit: "%", higher: true, bar: "pct", decimals: 1,
    aria: "percent", value: (rs) => mean(rs.map((r) => allBox(r, r.C3_pct))), format: fmtPct },
  { key: "c6_all", tab: ["sp2"], label: "Unloading-order rule", unit: "%", higher: true, bar: "pct", decimals: 1,
    aria: "percent", value: (rs) => mean(rs.map((r) => allBox(r, r.C6_pct))), format: fmtPct },
  { key: "csr_loaded", tab: ["sp2"], label: "Rule compliance (loaded boxes only)", unit: "%", higher: true, bar: "pct", decimals: 1,
    aria: "percent", value: (rs) => mean(rs.map((r) => r.csr_pct)), format: fmtPct },
  { key: "time", tab: ["sp3"], label: "Execution time", unit: "ms", higher: false, bar: "relative", decimals: 0, timing: true,
    aria: "milliseconds", value: (rs) => mean(rs.map((r) => r.exec_time_ms)), format: fmtMs },
  { key: "memory", tab: ["sp3"], label: "Peak memory", unit: "MB", higher: false, bar: "relative", decimals: 1, timing: true,
    aria: "megabytes", value: (rs) => mean(rs.map((r) => r.peak_mem_mb)), format: fmtMb },
];

export const TABS = [
  { id: "overall", label: "Overall" },
  { id: "sp1", label: "Packing Efficiency" },
  { id: "sp2", label: "Safety & Delivery Order" },
  { id: "sp3", label: "Computational Resources" },
];

export const metricsFor = (tab) => METRICS.filter((m) => m.tab.includes(tab));
export const metricByKey = (key) => METRICS.find((m) => m.key === key);

export function mean(xs) {
  const v = xs.filter((x) => x != null && Number.isFinite(Number(x))).map(Number);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export function sd(xs) {
  const v = xs.filter((x) => x != null && Number.isFinite(Number(x))).map(Number);
  if (v.length < 2) return null;
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(v.reduce((a, b) => a + (b - m) * (b - m), 0) / (v.length - 1));
}

// Per method: its runs and every metric's value; a method with no runs is "not run".
export function methodValues(runs, methods = METHOD_ORDER) {
  // Compliant fill counts only when EVERY run of the load records it (a study
  // mixing older runs would otherwise rank, mark and spread on different measures).
  if ((runs || []).some((r) => r.compliant_su_pct == null)) {
    runs = (runs || []).map(({ compliant_su_pct, ...r }) => r);
  }
  const out = {};
  for (const c of methods) {
    const rs = (runs || []).filter((r) => r.configuration === c);
    const values = {}, bars = {};
    for (const m of METRICS) {
      const v = rs.length >= (m.minRuns || 1) ? m.value(rs) : null;
      values[m.key] = v;
      bars[m.key] = v == null ? null : m.bar === "share" ? m.barValue(rs) : v;
    }
    out[c] = { code: c, ran: rs.length > 0, nRuns: rs.length, runs: rs, values, bars };
  }
  return out;
}

const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

// Best value of one metric over the methods that ran: the codes that share it
// (at display precision, so ties are what the reader sees). Empty when fewer
// than two methods have a value — one method is never "best".
export function bestFor(metric, vals) {
  const have = Object.values(vals).filter((v) => v.ran && v.values[metric.key] != null);
  if (have.length < 2) return [];
  const r = have.map((v) => [v.code, round(v.values[metric.key], metric.decimals)]);
  const target = metric.higher ? Math.max(...r.map(([, x]) => x)) : Math.min(...r.map(([, x]) => x));
  return r.filter(([, x]) => x === target).map(([c]) => c);
}

// Bar length in percent (0-100).
export function barPercent(metric, code, vals) {
  const v = vals[code] && vals[code].bars[metric.key];
  if (v == null) return 0;
  if (metric.bar === "pct" || metric.bar === "share") return Math.max(0, Math.min(100, v));
  const max = Math.max(...Object.values(vals).map((x) => x.bars[metric.key] ?? 0));
  return max > 0 ? (100 * v) / max : 0;
}

// Min-max over the methods that ran; equal values -> 0.5 (neutral).
function normalize(codes, get) {
  const xs = codes.map(get);
  const lo = Math.min(...xs), hi = Math.max(...xs);
  return Object.fromEntries(codes.map((c, i) => [c, hi === lo ? 0.5 : (xs[i] - lo) / (hi - lo)]));
}

// Equal-weighted composite (Chapter 3): 0.25 fill + 0.25 compliance (all boxes)
// + 0.25 (1 - cost) + 0.25 (1 - spread); cost = mean of the normalised time and
// memory. The fill term is compliant fill (M-1b, as in the thesis) when every
// method has it, container fill otherwise. With timing invalid (parallel runs)
// or a term missing for some method, that term is left out and the rest are
// weighted equally.
export function compositeScores(vals, { timingOk = true } = {}) {
  const codes = Object.values(vals).filter((v) => v.ran).map((v) => v.code);
  if (codes.length < 2) return { scores: {}, terms: [] };
  const has = (k) => codes.every((c) => vals[c].values[k] != null);
  const terms = [];
  if (has("csu")) terms.push({ key: "csu", n: normalize(codes, (c) => vals[c].values.csu), invert: false });
  else if (has("fill")) terms.push({ key: "fill", n: normalize(codes, (c) => vals[c].values.fill), invert: false });
  if (has("csr_all")) terms.push({ key: "csr_all", n: normalize(codes, (c) => vals[c].values.csr_all), invert: false });
  if (timingOk && has("time") && has("memory")) {
    const t = normalize(codes, (c) => vals[c].values.time), mm = normalize(codes, (c) => vals[c].values.memory);
    terms.push({ key: "cost", n: Object.fromEntries(codes.map((c) => [c, (t[c] + mm[c]) / 2])), invert: true });
  }
  if (has("spread")) terms.push({ key: "spread", n: normalize(codes, (c) => vals[c].values.spread), invert: true });
  const scores = Object.fromEntries(codes.map((c) => [c,
    terms.reduce((a, t) => a + (t.invert ? 1 - t.n[c] : t.n[c]), 0) / terms.length]));
  return { scores, terms: terms.map((t) => t.key) };
}

// Competition ranking (1, 1, 3): ties share a rank. score(code) -> number or null.
export function rankBy(codes, score, higher) {
  const have = codes.filter((c) => score(c) != null);
  const out = {};
  for (const c of have) {
    const s = score(c);
    out[c] = 1 + have.filter((o) => (higher ? score(o) > s : score(o) < s)).length;
  }
  return out;
}

// Ranks for a tab. Overall: the composite score; other tabs: the tab's first
// metric in its direction. No ranking with fewer than two methods.
export function ranksFor(tab, vals, { timingOk = true } = {}) {
  const codes = Object.values(vals).filter((v) => v.ran).map((v) => v.code);
  if (codes.length < 2) return { ranks: {}, criterion: null };
  if (tab === "overall") {
    const { scores, terms } = compositeScores(vals, { timingOk });
    const r = (x) => Math.round(x * 1e9) / 1e9;
    return { ranks: rankBy(codes, (c) => (scores[c] == null ? null : r(scores[c])), true), criterion: "composite", terms, scores };
  }
  // The tab's first metric that every method has (compliant fill on SP1; an
  // older study file without it falls back to container fill).
  const m = metricsFor(tab).find((x) => codes.every((c) => vals[c].values[x.key] != null)) || metricsFor(tab)[0];
  if (m.timing && !timingOk) return { ranks: {}, criterion: null };
  return { ranks: rankBy(codes, (c) => (vals[c].values[m.key] == null ? null : round(vals[c].values[m.key], m.decimals)), m.higher),
           criterion: m.key };
}

// "Means over 5 runs per method" / "Means over 3–5 runs per method".
export function runCountText(vals) {
  const ns = Object.values(vals).filter((v) => v.ran).map((v) => v.nRuns);
  if (!ns.length) return "";
  const lo = Math.min(...ns), hi = Math.max(...ns);
  return lo === hi ? `Means over ${lo} run${lo === 1 ? "" : "s"} per method.` : `Means over ${lo}–${hi} runs per method.`;
}

export function criterionText(rank) {
  if (!rank || !rank.criterion) return null;
  if (rank.criterion === "composite") {
    const names = { csu: "compliant fill", fill: "container fill", csr_all: "rule compliance (all boxes)", cost: "time and memory", spread: "run-to-run spread" };
    return `the equal-weighted composite score (${rank.terms.map((t) => names[t]).join("; ")})`;
  }
  return metricByKey(rank.criterion).label.toLowerCase();
}
