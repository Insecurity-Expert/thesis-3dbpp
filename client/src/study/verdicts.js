// client/src/study/verdicts.js
//
// Every plain-language sentence about a study is generated HERE from the
// stats block that experiments/stats.py attached to the study file. Nothing
// in the UI names a winner, a "better" configuration or a number that was not
// computed. Grep-check: the only literal verdict fragments live in these
// templates and every one of them is parameterised by a stats field.

export const CONFIG_ORDER = ["DGWO", "MOGWO", "SEQ", "REP"];

// Neutral descriptions of what each configuration does (from README / the code).
export const CONFIG_DESC = {
  DGWO: "single-objective search (baseline)",
  MOGWO: "multi-objective search (baseline)",
  SEQ: "hybrid: DGWO phase, then MOGWO phase",
  REP: "hybrid: repair R1–R3 inside the loop",
};

export const MEASURE_PLAIN = {
  SU: "how full the container got",
  CSR: "overall rule compliance",
  C3: "weight limit on each box (C3)",
  C4: "protect fragile boxes (C4)",
  C5: "keep every box steady (C5)",
  C6: "unload in stop order (C6)",
  ET: "time taken",
  PM: "memory used",
  placed: "boxes placed",
};

export const DEFINITION_PLAIN = {
  placed: "over placed boxes",
  all_boxes: "over all boxes (unplaced = non-compliant)",
};

export function label(stats, code) {
  return (stats && stats.labels && stats.labels[code]) || code;
}

export const fmt = {
  num: (v, d = 2) => (v === null || v === undefined || Number.isNaN(Number(v)) ? "—" : Number(v).toFixed(d)),
  pct: (v, d = 1) => (v === null || v === undefined ? "—" : `${Number(v).toFixed(d)}%`),
  p: (p) => (p === null || p === undefined ? "—" : p < 0.0001 ? "< 0.0001" : Number(p).toFixed(4)),
  // "p = 0.0359" or "p < 0.0001" — for prose
  peq: (p) => (p === null || p === undefined ? "p = —" : p < 0.0001 ? "p < 0.0001" : `p = ${Number(p).toFixed(4)}`),
  ms: (ms) => (ms === null || ms === undefined ? "—" : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`),
  mb: (mb) => (mb === null || mb === undefined ? "—" : `${Number(mb).toFixed(1)} MB`),
  pm: (d) => (d && d.mean !== null && d.mean !== undefined ? `${Number(d.mean).toFixed(2)} ± ${d.sd === null || d.sd === undefined ? "—" : Number(d.sd).toFixed(2)}` : "—"),
  seeds: (seeds) => {
    if (!Array.isArray(seeds) || !seeds.length) return "—";
    const s = [...seeds].sort((a, b) => a - b);
    const contiguous = s.every((v, i) => i === 0 || v === s[i - 1] + 1);
    return contiguous && s.length > 2 ? `${s[0]}–${s[s.length - 1]} (${s.length})` : s.join(", ");
  },
  duration: (sec) => {
    if (sec === null || sec === undefined) return "—";
    if (sec < 90) return `about ${Math.max(1, Math.round(sec / 10) * 10)} s`;
    const m = Math.round(sec / 60);
    return m < 90 ? `about ${m} min` : `about ${(m / 60).toFixed(1)} h`;
  },
};

// ── normality ────────────────────────────────────────────────────────────────
// Repeated measures: Shapiro-Wilk runs on the within-instance differences of
// each pair of configurations (one value per test case).
export function normalitySentence(cmp) {
  const nm = cmp && cmp.normality;
  if (!nm || !Array.isArray(nm.pairs) || !nm.pairs.length) return "";
  if (nm.skipped) return "No normality step: this comparison always uses the Friedman test.";
  const tested = nm.pairs.filter((n) => n.applicable);
  const untested = nm.pairs.filter((n) => !n.applicable);
  const parts = [];
  if (tested.length) {
    const normal = tested.filter((n) => n.normal).length;
    parts.push(`Shapiro-Wilk found the differences of ${normal} of ${tested.length} tested pairs consistent with a normal distribution`);
  }
  if (untested.length) {
    parts.push(`${untested.length} pair${untested.length === 1 ? " was" : "s were"} not testable (${untested[0].reason}) and ${untested.length === 1 ? "is" : "are"} treated as non-normal`);
  }
  const family = cmp.all_normal
    ? "so the parametric route is used (repeated-measures ANOVA with Mauchly's sphericity test, paired t-tests, d_z)"
    : "so the rank-based route is used (Friedman, Wilcoxon signed-rank, matched-pairs rank-biserial r)";
  return parts.length ? `${parts.join("; ")}, ${family}.` : "";
}

export function dfText(o) {
  return o && Array.isArray(o.df) ? o.df.map((d) => (Number.isInteger(d) ? d : fmt.num(d, 2))).join(", ") : "";
}

export function sphericityText(o) {
  if (!o || !o.sphericity) return "";
  const s = o.sphericity;
  const m = s.computable ? `Mauchly's W = ${fmt.num(s.W, 3)}, ${fmt.peq(s.p)}` : `Mauchly's test not computable (${s.reason})`;
  return o.correction ? `${m}; Greenhouse-Geisser correction applied (ε = ${fmt.num(o.epsilon_gg, 3)})` : `${m}; sphericity holds, no correction`;
}

// ── omnibus ──────────────────────────────────────────────────────────────────
export function omnibusSentence(cmp, measureCode, opts = {}) {
  const o = cmp && cmp.omnibus;
  const what = MEASURE_PLAIN[measureCode] || measureCode;
  if (!o) return "";
  if (!o.testable) return `${capitalize(what)}: ${o.reason}.`;
  const sig = opts.holm ? o.significant_holm : o.significant;
  const p = opts.holm ? o.p_holm : o.p;
  const corr = opts.holm ? ` (Holm-corrected ${fmt.peq(p)}, family of ${o.holm_family_size})` : ` (${fmt.peq(p)})`;
  const stat = `${o.test}: ${o.statistic_name} = ${fmt.num(o.statistic, 3)}${o.df ? `, df = ${dfText(o)}` : ""}${o.correction ? ` (${o.correction})` : ""}`;
  return sig
    ? `${capitalize(what)}: the four configurations are not all the same — ${stat}${corr}.`
    : `${capitalize(what)}: no difference between the four configurations was detected — ${stat}${corr}.`;
}

// ── pairwise ─────────────────────────────────────────────────────────────────
export function pairVerdict(stats, pair) {
  const a = label(stats, pair.a), b = label(stats, pair.b);
  if (pair.outperforms) {
    const w = label(stats, pair.outperforms);
    const l = pair.outperforms === pair.a ? b : a;
    return { kind: "outperforms", text: `${w} outperforms ${l}`, winner: pair.outperforms };
  }
  if (pair.significant && !pair.effect.practical) {
    return { kind: "detectable", text: "statistically detectable but not practically meaningful", winner: null };
  }
  if (!pair.significant && pair.posthoc_significant) {
    return { kind: "none", text: "no significant difference (omnibus test not significant)", winner: null };
  }
  return { kind: "none", text: "no significant difference", winner: null };
}

export function effectPlain(effect) {
  if (!effect || effect.value === null || effect.value === undefined) return "—";
  return `${effect.magnitude} (${effect.name} = ${fmt.num(effect.value, 2)})`;
}

export function pairSentence(stats, pair, measureCode) {
  const v = pairVerdict(stats, pair);
  const what = MEASURE_PLAIN[measureCode] || measureCode;
  if (v.kind === "outperforms") {
    return `${v.text} on ${what}: corrected ${fmt.peq(pair.p)}, ${effectPlain(pair.effect)} effect.`;
  }
  if (v.kind === "detectable") {
    return `${label(stats, pair.a)} vs ${label(stats, pair.b)} on ${what}: the difference is real (${fmt.peq(pair.p)}) but too small to matter in practice (${effectPlain(pair.effect)}, below the threshold of ${pair.effect.threshold}).`;
  }
  return `${label(stats, pair.a)} vs ${label(stats, pair.b)} on ${what}: no significant difference (${fmt.peq(pair.p)}).`;
}

// ── SP1 ──────────────────────────────────────────────────────────────────────
export function sp1Summary(stats) {
  const cmp = stats && stats.SP1 && stats.SP1.comparison;
  if (!cmp) return "";
  const o = cmp.omnibus;
  if (!o.testable) return `Container fill could not be tested: ${o.reason}.`;
  if (!o.significant) return `No configuration filled the container significantly better than another (${o.test}, ${fmt.peq(o.p)}).`;
  const wins = cmp.pairs.filter((p) => p.outperforms);
  const detect = cmp.pairs.filter((p) => p.significant && !p.outperforms);
  const bits = [`The configurations differ on container fill (${o.test}, ${fmt.peq(o.p)}).`];
  if (wins.length) bits.push(wins.map((p) => pairVerdict(stats, p).text).join("; ") + ".");
  if (detect.length) bits.push(`${detect.length} pair${detect.length > 1 ? "s" : ""} differ${detect.length > 1 ? "" : "s"} detectably but not meaningfully.`);
  if (!wins.length && !detect.length) bits.push("No pair reached a significant post-hoc difference.");
  return bits.join(" ");
}

// ── SP2 ──────────────────────────────────────────────────────────────────────
export function sp2Summary(stats, definition) {
  const blk = stats && stats.SP2 && stats.SP2.by_definition && stats.SP2.by_definition[definition || stats.primary_compliance];
  if (!blk) return "";
  if (blk.definition !== stats.primary_compliance) {
    return `Compliance ${DEFINITION_PLAIN[blk.definition]} is reported for reference only; the hypothesis is tested ${DEFINITION_PLAIN[stats.primary_compliance]}.`;
  }
  const per = blk.per_measure;
  const untestable = Object.keys(per).filter((m) => !per[m].omnibus.testable);
  const differ = blk.significant_measures || [];
  const tested = Object.keys(per).filter((m) => per[m].omnibus.testable);
  const bits = [];
  const constant = untestable.filter((m) => /no variance/.test(per[m].omnibus.reason || ""));
  const other = untestable.filter((m) => !constant.includes(m));
  if (constant.length) bits.push(`${constant.map((m) => MEASURE_PLAIN[m] || m).join(", ")} ${constant.length > 1 ? "were" : "was"} the same for every configuration, so ${constant.length > 1 ? "they" : "it"} cannot be tested.`);
  if (other.length) bits.push(`${other.map((m) => MEASURE_PLAIN[m] || m).join(", ")} could not be tested: ${per[other[0]].omnibus.reason}.`);
  if (tested.length) {
    bits.push(differ.length
      ? `After Holm correction across ${blk.holm_family_size} testable measure${blk.holm_family_size > 1 ? "s" : ""}, the configurations differ on ${differ.map((m) => MEASURE_PLAIN[m] || m).join(", ")}.`
      : `After Holm correction across ${blk.holm_family_size} testable measure${blk.holm_family_size > 1 ? "s" : ""}, no measure differs between the configurations.`);
  }
  bits.push(blk.h0_rejected
    ? "Decision: H₀ (no difference in compliance) is rejected."
    : tested.length ? "Decision: H₀ (no difference in compliance) is not rejected."
    : "Decision: H₀ cannot be tested with this study.");
  return bits.join(" ");
}

// ── SP3 ──────────────────────────────────────────────────────────────────────
// Friedman within each BR class (the class's test cases as subjects), Holm
// across time and memory within the class.
export function sp3ClassSentence(stats, p, m) {
  const cmp = p.friedman && p.friedman[m];
  const o = cmp && cmp.omnibus;
  if (!o) return "";
  if (!o.testable) return `${p.br_class}: ${o.reason}.`;
  const order = cmp.mean_rank ? Object.entries(cmp.mean_rank).sort((a, b) => a[1] - b[1]).map(([c]) => label(stats, c)) : [];
  return o.significant_holm
    ? `${p.br_class}: the methods differ on ${MEASURE_PLAIN[m]} (Friedman χ² = ${fmt.num(o.statistic, 2)}, Holm-corrected ${fmt.peq(o.p_holm)}); mean rank ${order.join(" < ")} (lower is better).`
    : `${p.br_class}: no difference on ${MEASURE_PLAIN[m]} detected (Friedman χ² = ${fmt.num(o.statistic, 2)}, Holm-corrected ${fmt.peq(o.p_holm)}).`;
}

export function sp3Summary(stats) {
  const s3 = stats && stats.SP3;
  if (!s3) return "";
  if (!s3.available) return `Time and memory were not compared: ${s3.reason}.`;
  const prof = s3.profiles || [];
  const testable = prof.filter((p) => p.testable);
  if (!testable.length) {
    return `Time and memory are compared within each heterogeneity class (Friedman, ≥ 2 test cases per class); no class in this study has enough test cases, so they are shown descriptively.`;
  }
  const diff = (m) => testable.filter((p) => p.friedman[m].omnibus.significant_holm).map((p) => p.br_class);
  const bits = [`Compared within ${testable.length} of ${prof.length} heterogeneity class${prof.length > 1 ? "es" : ""} (Friedman, Holm across time and memory).`];
  for (const m of ["ET", "PM"]) {
    const d = diff(m);
    bits.push(d.length ? `The methods differ on ${MEASURE_PLAIN[m]} in ${d.join(", ")}.` : `No class shows a difference on ${MEASURE_PLAIN[m]}.`);
  }
  if (s3.note) bits.push(`${capitalize(s3.note)}.`);
  return bits.join(" ");
}

// ── composite / recommendation ───────────────────────────────────────────────
export function compositeSummary(stats) {
  const cs = stats && stats.composite;
  if (!cs) return "";
  if (!cs.available) return `No overall ranking: ${cs.reason}.`;
  const fr = cs.friedman;
  const ranking = cs.ranking.map((c, i) => `${i + 1}. ${label(stats, c)} (${fmt.num(cs.mean_cs[c] * 5, 2)} / 5)`).join(", ");
  if (!fr.testable) return `Overall scores: ${ranking}. The ranking could not be tested: ${fr.reason}.`;
  if (!fr.significant) {
    return `Overall scores: ${ranking}. The Friedman test does not separate them (χ² = ${fmt.num(fr.statistic, 2)}, ${fmt.peq(fr.p)} over ${fr.blocks} test cases), so no configuration is recommended — the differences are within what chance could produce.`;
  }
  const rec = cs.recommendation;
  const ties = ((fr.posthoc && fr.posthoc.pairs) || [])
    .filter((p) => !p.significant && (p.a === rec.configuration || p.b === rec.configuration))
    .map((p) => label(stats, p.a === rec.configuration ? p.b : p.a));
  const beats = ((fr.posthoc && fr.posthoc.pairs) || [])
    .filter((p) => p.significant && p.favours === rec.configuration)
    .map((p) => label(stats, p.a === rec.configuration ? p.b : p.a));
  let s = `Overall scores: ${ranking}. The ranking is reliable (Friedman χ² = ${fmt.num(fr.statistic, 2)}, ${fmt.peq(fr.p)} over ${fr.blocks} test cases). Recommended: ${label(stats, rec.configuration)} with the best mean score, ${fmt.num(rec.mean_cs * 5, 2)} / 5.`;
  if (beats.length) s += ` Nemenyi separates it from ${beats.join(" and ")}.`;
  if (ties.length) s += ` It is statistically tied with ${ties.join(" and ")}.`;
  return s;
}

// ── outcome banner ───────────────────────────────────────────────────────────
export function outcomeBanner(stats) {
  if (!stats) return null;
  const cs = stats.composite;
  const oc = stats.outcome;
  if (cs && cs.available && cs.friedman && cs.friedman.significant && cs.recommendation) {
    return { kind: "winner", title: `Recommended: ${label(stats, cs.recommendation.configuration)}`,
             sub: `Best mean overall score across ${cs.n_instances} test cases; the ranking passed the Friedman test (${fmt.peq(cs.friedman.p)}).`,
             config: cs.recommendation.configuration };
  }
  if (cs && !cs.available && /2 instances/.test(cs.reason || "")) {
    return { kind: "info", title: "Statistical tests need ≥ 2 test cases",
             sub: `This study used ${stats.provenance.n_instances} test case. The tests compare the methods within test cases, so with one test case the results below are descriptive: averages and spreads, no significance tests and no overall ranking.` };
  }
  if (cs && !cs.available) {
    return { kind: "info", title: "No overall ranking for this study", sub: `${cs.reason}. ` + outcomeText(oc) };
  }
  if (cs && cs.available) {
    return { kind: "pattern", title: outcomeTitle(oc), sub: `${outcomeText(oc)} The overall ranking did not pass the Friedman test (${fmt.peq(cs.friedman.p)}), so no single configuration is recommended.` };
  }
  return { kind: "pattern", title: outcomeTitle(oc), sub: outcomeText(oc) };
}

export function outcomeTitle(oc) {
  if (!oc) return "";
  if (!oc.pattern) return "No outcome pattern";
  const names = { A: "Both hybrids come out ahead", B: "One hybrid comes out ahead", C: "No hybrid comes out ahead", D: "No single best method — a trade-off" };
  return `${names[oc.pattern] || ""} (Outcome ${oc.pattern})`;
}

export function outcomeText(oc) {
  if (!oc) return "";
  if (!oc.pattern) return `Outcome pattern ${oc.description}.`;
  return `Outcome pattern ${oc.pattern}: ${oc.description}.`;
}

export function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

// Provenance strip text pieces.
export function provenanceItems(study, stats) {
  const pv = (stats && stats.provenance) || {};
  const inst = (study && study.instances) || pv.instances || [];
  const preset = study && study.preset;
  return [
    ["Test cases", inst.length ? inst.map((i) => `${i.br_class} — ${i.n_types ?? "?"} box types (instance ${i.instance_id}, ${i.n_boxes} boxes)`).join("; ") : "—"],
    ["Preset", preset ? `${preset.name} (pop ${preset.pop_size} × ${preset.max_iter} iterations)` : "—"],
    ["Seeds", fmt.seeds(study ? study.seeds : pv.seeds)],
    ["Runs per configuration", pv.runs_per_configuration ?? (study ? study.runs_per_configuration : "—")],
    ["Mode", study ? `${study.mode} — ${study.timing_note || (study.timing_valid ? "timing valid" : "concurrent — not valid for SP3")}` : "—"],
    ["Commit", (study && study.commit) || pv.commit || "—"],
  ];
}
