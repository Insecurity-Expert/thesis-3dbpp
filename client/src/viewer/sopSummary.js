// client/src/viewer/sopSummary.js — the SOP Summary (SP1–SP3) at the top of
// Technical Details.
//
// Two models, one shape:
//   descriptiveModel — one load, N runs per configuration. Per measure the
//     configuration with the best mean is marked "Best"; when it and the
//     runner-up differ by less than the larger of their run-to-run standard
//     deviations, both are marked "About the same". Nothing is tested, so the
//     text never says "significant".
//   testedModel — a study with >= 2 test cases and stats attached. A
//     configuration is marked "Best" only when stats.py's verdict for every pair
//     (Holm-corrected test AND the practical effect-size threshold, the pair's
//     `outperforms` field) favours it; otherwise "no significant difference".
//
// Placed-box compliance is never a summary measure and is never marked best:
// Repair-Based's 100% there holds by construction.
//
// Words never used here: "recommended", "winner", "overall best".

export const SOP_MEASURES = {
  su:      { key: "su",      label: "Container fill (SU)",              unit: "%",  higher: true },
  csr_all: { key: "csr_all", label: "Rule compliance, all boxes (CSR)", unit: "%",  higher: true, primary: true },
  c3_all:  { key: "c3_all",  label: "Load-bearing (C3), all boxes",     unit: "%",  higher: true },
  c6_all:  { key: "c6_all",  label: "Stop order (C6), all boxes",       unit: "%",  higher: true },
  time:    { key: "time",    label: "Execution time",                   unit: "ms", higher: false },
  mem:     { key: "mem",     label: "Peak memory",                      unit: "MB", higher: false },
};

// Measures that are never highlighted, whatever their values.
export const NEVER_BEST = new Set(["csr_placed", "csr_placed_pct"]);

export const SOP_ROWS = [
  { id: "SP1", title: "Packing efficiency", better: "Higher", measures: ["su"] },
  { id: "SP2", title: "Safety and delivery-order compliance", better: "Higher", measures: ["csr_all", "c3_all", "c6_all"],
    note: "Fragility and stability are guaranteed for every loaded box by the decoder." },
  { id: "SP3", title: "Computational resources", better: "Lower", measures: ["time", "mem"] },
];

export const singleInstanceNote = (runsEach) =>
  `One instance, ${runsEach ?? "N"} runs each; differences are not tested for significance. Every statistic is under Show all numbers.`;

// ── values ───────────────────────────────────────────────────────────────────
const share = (r) => (r.n_items ? r.placed / r.n_items : 0);

// One study run (experiments/study.py) -> the summary measure. All-box values
// count an unloaded box as not following the rule (experiments/stats.py).
export function runValue(r, key) {
  switch (key) {
    case "su": return r.su_pct;
    case "csr_all": return r.csr_pct * share(r);
    case "c3_all": return r.C3_pct * share(r);
    case "c6_all": return r.C6_pct * share(r);
    case "time": return r.exec_time_ms;
    case "mem": return r.peak_mem_mb;
    default: return undefined;
  }
}

export function meanSd(xs) {
  const v = xs.filter((x) => x != null && Number.isFinite(Number(x))).map(Number);
  if (!v.length) return { mean: null, sd: null, n: 0 };
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const sd = v.length > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (v.length - 1)) : 0;
  return { mean, sd, n: v.length };
}

export function fmtValue(unit, v) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  if (unit === "%") return `${Number(v).toFixed(1)}%`;
  if (unit === "ms") return v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v)} ms`;
  if (unit === "MB") return `${Number(v).toFixed(1)} MB`;
  return String(v);
}

// ── the best pick ────────────────────────────────────────────────────────────
// entries: [{ code, mean, sd }]. Returns { status: { code: "best" | "tie" },
// order: codes best-first }. Tie rule: the best and the runner-up differ by
// less than the larger of their two run-to-run SDs (or not at all) -> both are
// "tie"; any further configuration within that distance of the best joins them.
export function pickBest(entries, { higherIsBetter = true, key } = {}) {
  const out = { status: {}, order: [] };
  if (key && NEVER_BEST.has(key)) return out;
  const vals = entries.filter((e) => e && e.mean != null && Number.isFinite(Number(e.mean)));
  if (vals.length < 2) return out;
  const sorted = vals.slice().sort((a, b) => (higherIsBetter ? b.mean - a.mean : a.mean - b.mean));
  out.order = sorted.map((e) => e.code);
  const top = sorted[0];
  const close = (e) => {
    const gap = Math.abs(top.mean - e.mean);
    return gap < 1e-9 || gap < Math.max(top.sd || 0, e.sd || 0);
  };
  if (close(sorted[1])) {
    for (const e of sorted) if (e === top || close(e)) out.status[e.code] = "tie";
  } else {
    out.status[top.code] = "best";
  }
  return out;
}

const list = (xs) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

// ── descriptive model (one load) ─────────────────────────────────────────────
const PHRASE = {
  su:      { best: (n, v) => `${n} filled the container most (${v}).`,
             tie: (ns) => `${ns} filled the container about the same; the gap is within their run-to-run variation.` },
  csr_all: { best: (n, v) => `${n} kept the loading rules for the largest share of all boxes (${v}).`,
             tie: (ns) => `${ns} kept the loading rules for about the same share of all boxes; the gap is within their run-to-run variation.` },
  time:    { best: (n, v) => `${n} ran in the least time (${v})`, tie: (ns) => `${ns} took about the same time` },
  mem:     { best: (n, v) => `${n} used the least peak memory (${v})`, tie: (ns) => `${ns} used about the same peak memory` },
};

function phrase(key, measure, cells, nameOf) {
  const marked = Object.keys(cells).filter((c) => cells[c].status);
  if (!marked.length) return null;
  if (marked.length === 1 && cells[marked[0]].status === "best") return PHRASE[key].best(nameOf(marked[0]), cells[marked[0]].text);
  return PHRASE[key].tie(list(marked.map((c) => `${nameOf(c)} (${cells[c].text})`)));
}

function sp3Sentence(parts) {
  const ps = parts.filter(Boolean);
  return ps.length ? `${ps.join("; ")}.` : null;
}

export const TIMING_NOT_COMPARED =
  "Time and memory are not compared: these runs ran in parallel and shared the CPU (see Technical Details).";

// runs: the study runs of one load; codes: the configurations shown, in order.
export function descriptiveModel({ runs, codes, nameOf = (c) => c, timingOk = true }) {
  const stats = {};
  for (const c of codes) {
    const mine = runs.filter((r) => r.configuration === c);
    stats[c] = Object.fromEntries(Object.keys(SOP_MEASURES).map((k) => [k, meanSd(mine.map((r) => runValue(r, k)))]));
  }
  const runsEach = codes.length ? Math.min(...codes.map((c) => stats[c].su.n)) : 0;
  const rows = SOP_ROWS.map((row) => {
    const measures = row.measures.map((k) => {
      const m = SOP_MEASURES[k];
      const comparable = row.id !== "SP3" || timingOk;
      const pick = comparable ? pickBest(codes.map((c) => ({ code: c, ...stats[c][k] })), { higherIsBetter: m.higher, key: k }) : { status: {} };
      const cells = Object.fromEntries(codes.map((c) => [c, {
        value: stats[c][k].mean, sd: stats[c][k].sd, text: fmtValue(m.unit, stats[c][k].mean), status: pick.status[c] || null,
      }]));
      return { ...m, cells, invalid: !comparable };
    });
    let sentence;
    if (row.id === "SP3") {
      sentence = timingOk ? sp3Sentence(measures.map((m) => phrase(m.key, m, m.cells, nameOf))) : TIMING_NOT_COMPARED;
    } else {
      const lead = measures[0];
      sentence = phrase(lead.key, lead, lead.cells, nameOf);
    }
    return { ...row, measures, sentence };
  });
  return { kind: "descriptive", codes, rows, runsEach, note: singleInstanceNote(runsEach),
           statusText: { best: "Best", tie: "About the same" } };
}

// ── tested model (study with stats, >= 2 test cases) ─────────────────────────
// cmps: the stats.py comparisons this measure is judged on (one, or one per
// heterogeneity class for SP3). top: the configuration with the best mean.
// It is "significantly higher/lower" than another only when that pair's
// `outperforms` names it in every comparison.
export function testedVerdict({ cmps, codes, means, higherIsBetter }) {
  const usable = (cmps || []).filter((c) => c && c.omnibus && c.omnibus.testable && Array.isArray(c.pairs));
  if (!usable.length) return { tested: false, status: {} };
  const vals = codes.filter((c) => means[c] != null);
  if (vals.length < 2) return { tested: true, status: {}, top: null, beaten: [], notSep: [] };
  const top = vals.slice().sort((a, b) => (higherIsBetter ? means[b] - means[a] : means[a] - means[b]))[0];
  const pairOf = (cmp, x, y) => cmp.pairs.find((p) => (p.a === x && p.b === y) || (p.a === y && p.b === x));
  const beaten = [], notSep = [];
  for (const o of vals) {
    if (o === top) continue;
    const wins = usable.every((cmp) => { const p = pairOf(cmp, top, o); return !!p && p.outperforms === top; });
    (wins ? beaten : notSep).push(o);
  }
  const status = {};
  if (!notSep.length) status[top] = "best";
  else if (beaten.length) { status[top] = "tie"; for (const o of notSep) status[o] = "tie"; }
  return { tested: true, status, top, beaten, notSep, vals };
}

const WHAT = { su: "container fill", csr_all: "rule compliance over all boxes", time: "execution time", mem: "peak memory" };

export function testedSentence(key, v, nameOf, higherIsBetter, untestedReason) {
  const what = WHAT[key];
  if (!v.tested) return `${what[0].toUpperCase()}${what.slice(1)} was not tested${untestedReason ? `: ${untestedReason}` : ""}.`;
  if (!v.top) return null;
  const dir = higherIsBetter ? "higher" : "lower";
  if (!v.beaten.length) return `No significant difference in ${what} between ${list(v.vals.map(nameOf))}.`;
  let s = `${nameOf(v.top)} had significantly ${dir} ${what} than ${list(v.beaten.map(nameOf))}`;
  if (v.notSep.length) s += `; no significant difference from ${list(v.notSep.map(nameOf))}`;
  return `${s}.`;
}

// stats: the block experiments/stats.py attached to the study file.
export function testedModel({ stats, codes, nameOf = (c) => c, timingOk = true }) {
  const d = stats.descriptives;
  const primary = stats.primary_compliance || "all_boxes";
  const sp2 = stats.SP2 && stats.SP2.by_definition && stats.SP2.by_definition[primary];
  const sp3 = stats.SP3;
  const sp3Classes = sp3 && sp3.available ? (sp3.profiles || []) : [];
  const sp3All = sp3 && sp3.available ? sp3.all_instances : null;
  const src = {
    su:      { desc: d.SU, cmps: [stats.SP1 && stats.SP1.comparison] },
    csr_all: { desc: d.CSR && d.CSR[primary], cmps: [sp2 && sp2.per_measure.CSR] },
    c3_all:  { desc: d.C3 && d.C3[primary], cmps: [sp2 && sp2.per_measure.C3] },
    c6_all:  { desc: d.C6 && d.C6[primary], cmps: [sp2 && sp2.per_measure.C6] },
    // SP3 is judged on the all-instance tests of the six-test family; files
    // analysed before that fall back to the per-class Friedman verdicts.
    time:    { desc: d.ET, cmps: sp3All ? [sp3All.ET] : sp3Classes.map((p) => p.friedman && p.friedman.ET) },
    mem:     { desc: d.PM, cmps: sp3All ? [sp3All.PM] : sp3Classes.map((p) => p.friedman && p.friedman.PM) },
  };
  const nInst = stats.provenance ? stats.provenance.n_instances : null;
  const rows = SOP_ROWS.map((row) => {
    const verdicts = {};
    const measures = row.measures.map((k) => {
      const m = SOP_MEASURES[k];
      const desc = src[k].desc || {};
      const means = Object.fromEntries(codes.map((c) => [c, desc[c] ? desc[c].mean : null]));
      const comparable = row.id !== "SP3" || (timingOk && sp3 && sp3.available);
      const v = comparable ? testedVerdict({ cmps: src[k].cmps, codes, means, higherIsBetter: m.higher }) : { tested: false, status: {} };
      verdicts[k] = v;
      const cells = Object.fromEntries(codes.map((c) => [c, {
        value: means[c], sd: desc[c] ? desc[c].sd : null, text: fmtValue(m.unit, means[c]), status: v.status[c] || null,
      }]));
      return { ...m, cells, invalid: row.id === "SP3" && !timingOk };
    });
    let sentence;
    if (row.id === "SP3") {
      if (!timingOk) sentence = TIMING_NOT_COMPARED;
      else if (!sp3 || !sp3.available) sentence = `Time and memory were not tested${sp3 && sp3.reason ? `: ${sp3.reason}` : ""}.`;
      else {
        const why = sp3All ? "needs at least 2 test cases" : "the within-class test needs at least 2 test cases per heterogeneity class";
        const a = testedSentence("time", verdicts.time, nameOf, false, why);
        const b = testedSentence("mem", verdicts.mem, nameOf, false, why);
        const tested = sp3Classes.filter((p) => p.testable).map((p) => p.br_class);
        const scope = !sp3All && tested.length && tested.length < sp3Classes.length
          ? ` Tested within ${list(tested)} only; the other heterogeneity classes have one test case each.` : "";
        sentence = [a, b].filter(Boolean).join(" ") + scope;
      }
    } else {
      const k = row.measures[0];
      sentence = testedSentence(k, verdicts[k], nameOf, true);
    }
    return { ...row, measures, sentence };
  });
  return {
    kind: "tested", codes, rows,
    note: `${nInst ?? "Several"} test cases. "Best" means significantly higher (or lower) than every other configuration shown: Holm-corrected test and effect size above the practical threshold (experiments/stats.py).`,
    statusText: { best: "Best", tie: "No significant difference" },
  };
}

// Which model a study gets: tested when its stats cover >= 2 test cases.
export function isTestedStudy(stats) {
  return !!(stats && stats.provenance && stats.provenance.n_instances >= 2 && stats.SP1);
}

// Every sentence and note a model can show (for the wording checks).
export function modelText(model) {
  return [model.note, ...model.rows.flatMap((r) => [r.title, r.note, r.sentence, ...r.measures.map((m) => m.label)])]
    .concat(Object.values(model.statusText)).filter(Boolean).join("\n");
}
