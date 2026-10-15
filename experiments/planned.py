"""D2(b) hypothesis design: planned paired comparisons with the Repair-Based
Hybrid (REP) as the reference configuration. FOR CONFIRMATION with the adviser.

Family: for each of six measures - SU (SP1); CSR, C3 and C6 over all boxes
(SP2); ET and PM (SP3) - REP is compared with DGWO, MOGWO and SEQ: 6 x 3 = 18
planned comparisons, one Holm-Bonferroni family, alpha = 0.05. The REP vs SEQ
comparisons also answer SP4. Comparisons among DGWO, MOGWO and SEQ are not
tested.

Each comparison: the 30 instance-level aggregates (mean over the instance's
seeds), differences d = REP - other. Shapiro-Wilk on d; normal -> paired
t-test and d_z, otherwise Wilcoxon signed-rank and the matched-pairs
rank-biserial r. Two-tailed (directional H1 -> set TAILS = "greater"/"less"
per measure; see `one_sided`).

Outperformance (Chapter 3 rule, unchanged): Holm-adjusted p < alpha, |d_z| >=
0.5 or |r| >= 0.3, and the direction favouring that configuration.

An untestable comparison (fewer than 3 instances, all differences zero,
concurrent timing for ET / PM) leaves the family and says why.

Second confound, reported with every REP vs SEQ comparison: the two hybrids
differ in the repair stage AND in schedule (SEQ switches once at T1, REP runs
its pipeline every iteration), so a difference is attributed to both together.
"""
import numpy as np
from scipy import stats as sps

REFERENCE = "REP"
OTHERS = ("DGWO", "MOGWO", "SEQ")
BENCHMARK = "SEQ"
FAMILY_MEASURES = (("SP1", "SU", "SU"),
                   ("SP2", "CSR", "CSR_all_boxes"),
                   ("SP2", "C3", "C3_all_boxes"),
                   ("SP2", "C6", "C6_all_boxes"),
                   ("SP3", "ET", "ET"),
                   ("SP3", "PM", "PM"))
PRIMARY = ("SU", "CSR")
TAILS = "two-sided"
SCHEDULE_CONFOUND = ("REP and SEQ differ in the repair stage and in schedule (SEQ switches from DGWO to "
                     "MOGWO once, at T1; REP applies its pipeline in every iteration). A difference is "
                     "attributed to the repair stage together with this schedule difference, not to repair alone.")


def planned_family(get_mat, configs, timing_valid, *, alpha, holm, shapiro, d_z, rank_biserial_paired,
                   magnitude, labels, measure_labels, lower_is_better, d_thr, r_thr, f):
    if REFERENCE not in configs:
        return {"available": False, "reason": f"{REFERENCE} not in the study"}
    ref_j = configs.index(REFERENCE)
    comps = []
    for sp, m, key in FAMILY_MEASURES:
        mat = get_mat(key)
        N = mat.shape[0]
        for other in OTHERS:
            c = {"sp": sp, "measure": m, "label": measure_labels.get(m, m), "reference": REFERENCE,
                 "other": other, "n_instances": int(N), "sp4": other == BENCHMARK,
                 "lower_is_better": m in lower_is_better}
            if other == BENCHMARK:
                c["confound_note"] = SCHEDULE_CONFOUND
            if other not in configs:
                c.update(testable=False, reason=f"{other} not in the study", p_raw=None)
                comps.append(c); continue
            if m in ("ET", "PM") and not timing_valid:
                c.update(testable=False, reason="concurrent timing - rerun with --mode serial", p_raw=None)
                comps.append(c); continue
            a, b = mat[:, ref_j], mat[:, configs.index(other)]
            diff = a - b
            c.update(mean_reference=f(a.mean()), mean_other=f(b.mean()), mean_difference=f(diff.mean()))
            if N < 3:
                c.update(testable=False, reason="requires >= 3 instances", p_raw=None)
                comps.append(c); continue
            if np.all(diff == 0):
                c.update(testable=False, p_raw=None,
                         reason="not testable - every instance-level difference is zero (constant by construction?)")
                comps.append(c); continue
            sw = shapiro(diff)
            c["normality"] = sw
            if sw["normal"]:
                t = sps.ttest_rel(a, b, alternative=TAILS)
                c.update(test="paired t-test", statistic=f(t.statistic), df=int(N - 1), p_raw=float(t.pvalue),
                         effect={"name": "d_z", "value": f(d_z(diff)), "threshold": d_thr,
                                 "magnitude": magnitude("d", d_z(diff))})
            else:
                w = sps.wilcoxon(a, b, alternative=TAILS)
                r = rank_biserial_paired(diff)
                c.update(test="Wilcoxon signed-rank", statistic=f(w.statistic), df=None, p_raw=float(w.pvalue),
                         effect={"name": "matched-pairs rank-biserial r", "value": f(r), "threshold": r_thr,
                                 "magnitude": magnitude("r", r)})
            c["testable"] = True
            comps.append(c)

    adj, fam = holm([c["p_raw"] for c in comps])
    for c, pa in zip(comps, adj):
        c["p_holm"] = f(pa)
        if not c.get("testable"):
            c.update(significant=False, outperforms=None, verdict=c["reason"])
            continue
        c["p_raw"] = f(c["p_raw"])
        sig = pa < alpha
        eff = c["effect"]
        practical = eff["value"] is not None and abs(eff["value"]) >= eff["threshold"]
        md = c["mean_difference"]
        if md == 0:
            favours = None
        elif c["lower_is_better"]:
            favours = REFERENCE if md < 0 else c["other"]
        else:
            favours = REFERENCE if md > 0 else c["other"]
        c.update(significant=bool(sig), practical=bool(practical), favours=favours)
        if not sig:
            c.update(outperforms=None, verdict="no significant difference")
        elif not practical:
            c.update(outperforms=None, verdict="statistically detectable but not practically meaningful")
        else:
            hi = REFERENCE if md > 0 else c["other"]
            lo = c["other"] if hi == REFERENCE else REFERENCE
            c.update(outperforms=favours,
                     verdict=(f"{labels[hi]} significantly higher than {labels[lo]} on "
                              f"{c['label'].split(' (')[0]} (|{eff['name']}| = {abs(eff['value']):.2f}, {eff['magnitude']})"))

    def decide(sel):
        cs = [c for c in comps if sel(c)]
        sig = [f"{c['measure']} vs {c['other']}" for c in cs if c.get("significant")]
        tested = [c for c in cs if c.get("testable")]
        if sig:
            return {"h0_rejected_for": sig, "decision": "H0 rejected for: " + ", ".join(sig)}
        if tested:
            return {"h0_rejected_for": [], "decision": f"H0 not rejected for any of {len(tested)} tested comparison(s)"}
        return {"h0_rejected_for": [], "decision": "not testable"}

    per_sp = {sp: decide(lambda c, sp=sp: c["sp"] == sp) for sp in ("SP1", "SP2", "SP3")}
    per_sp["SP4"] = decide(lambda c: c["other"] == BENCHMARK)
    per_sp["SP4"]["confound_note"] = SCHEDULE_CONFOUND
    return {"available": True, "design": "planned paired comparisons, REP as reference (D2 b, for confirmation)",
            "reference": REFERENCE, "others": list(OTHERS), "benchmark": BENCHMARK, "tails": TAILS,
            "correction": "Holm-Bonferroni", "planned_size": len(comps), "holm_family_size": fam,
            "comparisons": comps, "decisions": per_sp,
            "outcome": outcome(comps, labels)}


def outcome(comps, labels):
    """Outcome patterns restated for REP (FOR CONFIRMATION):
    A  REP outperforms all three (DGWO, MOGWO, SEQ) on both primary metrics (SU, CSR);
    B  REP outperforms at least one but not all of them on the primary metrics, and is
       outperformed by none on a primary metric;
    C  REP outperforms none of them on either primary metric;
    D  mixed / trade-off: REP outperforms some configuration on a primary metric and is
       outperformed by some configuration on a primary metric."""
    prim = [c for c in comps if c["measure"] in PRIMARY]
    if any(not c.get("testable") for c in prim):
        return {"pattern": None, "description": "not determinable - a primary comparison is untestable"}
    wins = [(c["measure"], c["other"]) for c in prim if c["outperforms"] == REFERENCE]
    losses = [(c["measure"], c["other"]) for c in prim if c["outperforms"] == c["other"]]
    if wins and losses:
        pat, text = "D", "mixed results - a trade-off profile"
    elif len(wins) == len(prim):
        pat, text = "A", f"{labels[REFERENCE]} outperforms the baselines and the benchmark on the primary metrics"
    elif wins:
        pat, text = "B", f"{labels[REFERENCE]} outperforms some but not all of the other configurations on the primary metrics"
    else:
        pat, text = "C", f"{labels[REFERENCE]} does not outperform the baselines or the benchmark on the primary metrics"
    return {"pattern": pat, "description": text,
            "wins": [f"{m} vs {o}" for m, o in wins], "losses": [f"{m} vs {o}" for m, o in losses]}
