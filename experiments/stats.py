"""Chapter 3 "Statistical Treatment" applied to one study results file.

    python experiments/stats.py experiments/results/studies/<study>.json        # attach stats in place
    python experiments/stats.py <study>.json --print                             # also print a summary

Input: a study file written by experiments/study.py (one row per run with the
configuration, instance, seed, SU, placed, n_items, CSR and C3-C6 over placed
boxes, M-3 execution time and M-4 peak memory).

Design: repeated measures. Each instance is one subject; its value for a
configuration is the mean over that instance's seeds, so every test compares
the four configurations WITHIN instances. A single-instance study cannot be
tested ("requires >= 2 instances") and is reported descriptively.

What is computed (every test reports its name, statistic, df, exact p and an
effect size; nothing is ever reported as NaN - an untestable case says why):

* Compliance BOTH ways for CSR and each of C3-C6: over placed boxes (as the
  evaluator reports it) and over ALL boxes, rate_placed x placed / n_items,
  i.e. an unplaced box counts as non-compliant. The manuscript's definition is
  all boxes (PRIMARY_COMPLIANCE) and the hypothesis is tested on it; the
  over-placed figures are reported descriptively.
* Descriptives per configuration and measure over runs: mean, median, sd,
  min, max, n.
* SP1 (SU): Shapiro-Wilk on the within-instance differences of every pair.
  All normal -> repeated-measures ANOVA (Mauchly's sphericity test; the
  Greenhouse-Geisser correction when sphericity is violated or cannot be
  checked), paired t-tests and d_z. Otherwise -> Friedman, Wilcoxon
  signed-rank and the matched-pairs rank-biserial r = (W+ - W-) / (W+ + W-).
  Post-hoc p-values Holm-corrected across the six pairs. Two-tailed,
  alpha = 0.05.
* SP2 (CSR, C3, C6 over all boxes): the same per measure, Holm-Bonferroni
  across the testable omnibus p-values (family of 3); H0 is rejected iff at
  least one Holm-corrected omnibus test is significant, and a pair's verdict
  needs its measure's Holm-corrected omnibus test to be significant. C4 and C5
  are enforced by the decoder (over all boxes each equals the share of boxes
  placed) and are reported descriptively. The decision is output explicitly.
* SP3 (ET, PM; serial timing only): Friedman within each BR class (the class's
  instances as subjects, >= 2 needed), Holm across ET and PM within the class;
  a pair's verdict needs the class's Holm-corrected Friedman result for that
  measure to be significant; per-class descriptives for the profile chart.
* Composite (serial timing, >= 2 instances): CS = 0.25 SU~ + 0.25 CSR~ +
  0.25 (1 - CC~) + 0.25 (1 - Rob~), ~ = min-max across the four configurations
  within an instance, CC = (z_ET + z_PM) / 2, Rob = sd of SU across the runs
  within the instance. Friedman on instances x 4, Nemenyi if significant.
  Supplementary: the top of the ranking is reported only when Friedman is
  significant; otherwise no configuration is distinguished.
* Outperformance per pair per metric needs ALL of: a significant omnibus test,
  a significant Holm-corrected post-hoc, |d_z| >= 0.5 or |r| >= 0.3, and the
  direction favouring that configuration. Its verdict text is neutral: "X
  significantly higher than Y on <measure> (<effect size>)", X being the
  configuration with the higher mean. Significant but below threshold is
  "statistically detectable but not practically meaningful".
* Outcome pattern (Chapter 3): A both hybrids outperform both baselines on the
  primary metrics, B exactly one does, C neither does, D mixed / trade-off;
  "not determinable" when SU or CSR cannot be tested.
* Supplementary (Chapter 3), outside SP1-SP3 and their Holm families, from the
  study's per-instance baselines (experiments/baselines.py):
  - each configuration vs the Weight-Sorted Greedy on CSR over all boxes,
    one-tailed (H1: configuration > greedy), instances as subjects: the
    configuration's per-instance mean minus the greedy's one value. Shapiro-Wilk
    on those differences; normal -> one-tailed paired t-test and d_z,
    otherwise one-tailed Wilcoxon signed-rank and the matched-pairs
    rank-biserial r. Holm across the four configurations (its own family).
  - the Random Order baseline (30 one-pass shuffled orders per instance):
    descriptive only, on CSR over all boxes, SU and execution time.
* Timing validity: a parallel study's execution times and peak memory are
  flagged invalid (out["timing"]); SP3 and the composite are refused on it.

Edge cases: a measure constant across ALL configurations is "not testable -
no variance"; a pair whose differences are constant (or N < 3) gets no
Shapiro-Wilk and sends the measure down the rank-based route; concurrent
timing refuses SP3 and the composite altogether.

scipy + scikit-posthocs only.
"""
import sys
import json
import math
import argparse
from pathlib import Path
from itertools import combinations

import numpy as np
from scipy import stats as sps
import scikit_posthocs as sph

ALPHA = 0.05
PRIMARY_COMPLIANCE = "all_boxes"           # the manuscript's locked definition
COMPLIANCE_DEFS = ("placed", "all_boxes")
CONFIGS = ["DGWO", "MOGWO", "SEQ", "REP"]
HYBRIDS = ["SEQ", "REP"]
BASELINES = ["DGWO", "MOGWO"]
LABELS = {"DGWO": "DGWO", "MOGWO": "MOGWO", "SEQ": "Sequential", "REP": "Repair-based"}

# Compliance measures (SP2) and the run-row keys they come from (over placed boxes).
COMPLIANCE_KEYS = {"CSR": "csr_pct", "C3": "C3_pct", "C4": "C4_pct", "C5": "C5_pct", "C6": "C6_pct"}
MEASURE_LABELS = {
    "SU": "space utilisation (%)",
    "CSR": "constraint satisfaction rate (%)",
    "C3": "C3 load-bearing compliance (%)",
    "C4": "C4 fragility compliance (%)",
    "C5": "C5 stability compliance (%)",
    "C6": "C6 stop-order compliance (%)",
    "ET": "execution time (ms)",
    "PM": "peak memory (MB)",
    "placed": "boxes placed",
}
# Measures the decoder enforces at placement time: a constant 100 % is by construction.
DECODER_ENFORCED = {"C4": "enforce_fragility", "C5": "enforce_support"}
# SP2 hypothesis family (Holm). C4 and C5 are enforced by the decoder, so over
# all boxes each equals the share of boxes placed: they are reported
# descriptively and are not separate tests.
SP2_FAMILY = ("CSR", "C3", "C6")
SP2_DESCRIPTIVE = ("C4", "C5")
COMPOSITE_LABEL = "Supplementary composite ranking (Chapter 3)"
SUPPLEMENTARY_LABEL = "Supplementary comparison with the non-search baselines (Chapter 3)"
GREEDY_LABEL = "Weight-Sorted Greedy"
RANDOM_LABEL = "Random Order"
LOWER_IS_BETTER = {"ET", "PM"}

D_THRESHOLD = 0.5       # Cohen's d practical threshold
R_THRESHOLD = 0.3       # rank-biserial r practical threshold


# ─── helpers ─────────────────────────────────────────────────────────────────
def _f(x, sig=6):
    """JSON-safe float to `sig` significant digits (p-values keep their exact
    magnitude, e.g. 3.2e-09, instead of rounding to 0); NaN / inf -> None."""
    if x is None:
        return None
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    if math.isnan(v) or math.isinf(v):
        return None
    return float(f"{v:.{sig}g}")


def magnitude(kind, val):
    if val is None:
        return None
    v = abs(val)
    if kind == "r":
        if v < 0.1: return "negligible"
        if v < 0.3: return "small"
        if v < 0.5: return "medium"
        return "large"
    if v < 0.2: return "negligible"
    if v < 0.5: return "small"
    if v < 0.8: return "medium"
    return "large"


def descriptives(values):
    v = np.asarray([x for x in values if x is not None], dtype=float)
    n = int(v.size)
    if n == 0:
        return {"n": 0, "mean": None, "median": None, "sd": None, "min": None, "max": None}
    return {"n": n, "mean": _f(v.mean()), "median": _f(np.median(v)),
            "sd": _f(v.std(ddof=1)) if n > 1 else None,
            "min": _f(v.min()), "max": _f(v.max())}


def shapiro(values):
    v = np.asarray(values, dtype=float)
    if v.size < 3:
        return {"applicable": False, "reason": "fewer than 3 instances", "normal": False, "W": None, "p": None}
    if np.ptp(v) == 0:
        return {"applicable": False, "reason": "the differences are constant - Shapiro-Wilk not applicable; treated as non-normal",
                "normal": False, "W": None, "p": None}
    W, p = sps.shapiro(v)
    return {"applicable": True, "reason": None, "W": _f(W), "p": _f(p), "normal": bool(p >= ALPHA),
            "test": "Shapiro-Wilk"}


def holm(pvalues):
    """Holm-Bonferroni step-down. None entries (untestable) are excluded from the family."""
    idx = [i for i, p in enumerate(pvalues) if p is not None]
    m = len(idx)
    out = [None] * len(pvalues)
    if m == 0:
        return out, 0
    order = sorted(idx, key=lambda i: pvalues[i])
    running = 0.0
    for rank, i in enumerate(order):
        adj = min(1.0, (m - rank) * pvalues[i])
        running = max(running, adj)
        out[i] = running
    return out, m


# ─── repeated-measures building blocks ───────────────────────────────────────
def _contrasts(k):
    """k x (k-1) orthonormal contrasts (Helmert, normalised)."""
    C = np.zeros((k, k - 1))
    for j in range(1, k):
        C[:j, j - 1] = 1.0
        C[j, j - 1] = -j
        C[:, j - 1] /= np.linalg.norm(C[:, j - 1])
    return C


def mauchly(mat):
    """Mauchly's test of sphericity on an N x k matrix (subjects x conditions)."""
    N, k = mat.shape
    p = k - 1
    if N - 1 < p:
        return {"test": "Mauchly", "computable": False,
                "reason": f"needs at least {k} instances for {k} configurations", "W": None, "chi2": None,
                "df": None, "p": None, "violated": None}
    S = np.cov(mat @ _contrasts(k), rowvar=False)
    tr = np.trace(S)
    if tr <= 0:
        return {"test": "Mauchly", "computable": False, "reason": "no variance in the contrasts",
                "W": None, "chi2": None, "df": None, "p": None, "violated": None}
    W = float(np.linalg.det(S) / (tr / p) ** p)
    W = min(max(W, 0.0), 1.0)
    df = p * (p + 1) // 2 - 1
    n1 = N - 1
    f = 1.0 - (2 * p * p + p + 2) / (6.0 * p * n1)
    if W <= 0:
        chi2, pv = math.inf, 0.0
    else:
        # Chi-square approximation with the second-order term, as R's
        # mauchly.test computes it (R uses k, not p, in that term).
        chi2 = -n1 * f * math.log(W)
        w2 = ((p + 2) * (p - 1) * (p - 2) * (2 * p ** 3 + 6 * p ** 2 + 3 * k + 2)
              / (288.0 * (n1 * p * f) ** 2))
        p1, p2 = sps.chi2.sf(chi2, df), sps.chi2.sf(chi2, df + 4)
        pv = float(min(1.0, max(0.0, p1 + w2 * (p2 - p1))))
    return {"test": "Mauchly", "computable": True, "reason": None, "W": _f(W), "chi2": _f(chi2),
            "df": df, "p": _f(pv), "violated": bool(pv < ALPHA)}


def gg_epsilon(mat):
    """Greenhouse-Geisser epsilon, in [1/(k-1), 1]."""
    N, k = mat.shape
    p = k - 1
    S = np.cov(mat @ _contrasts(k), rowvar=False)
    num, den = np.trace(S) ** 2, p * np.trace(S @ S)
    if den <= 0:
        return 1.0
    return float(min(1.0, max(1.0 / p, num / den)))


def rm_anova(mat):
    """One-way repeated-measures ANOVA, subjects = rows. Sphericity checked with
    Mauchly; when it is violated (or cannot be checked) the Greenhouse-Geisser
    correction is applied to the degrees of freedom."""
    N, k = mat.shape
    grand = mat.mean()
    ss_cond = N * ((mat.mean(axis=0) - grand) ** 2).sum()
    ss_subj = k * ((mat.mean(axis=1) - grand) ** 2).sum()
    ss_err = ((mat - grand) ** 2).sum() - ss_cond - ss_subj
    df1, df2 = k - 1, (k - 1) * (N - 1)
    ms_err = ss_err / df2 if df2 else 0.0
    F = (ss_cond / df1) / ms_err if ms_err > 0 else math.inf
    p_unc = float(sps.f.sf(F, df1, df2)) if math.isfinite(F) else 0.0
    sph = mauchly(mat)
    eps = gg_epsilon(mat)
    correct = sph["violated"] is not False      # violated, or not checkable
    if correct:
        cdf1, cdf2 = df1 * eps, df2 * eps
        p = float(sps.f.sf(F, cdf1, cdf2)) if math.isfinite(F) else 0.0
    else:
        cdf1, cdf2, p = df1, df2, p_unc
    eta = ss_cond / (ss_cond + ss_err) if (ss_cond + ss_err) > 0 else 0.0
    return {"testable": True, "test": "repeated-measures ANOVA", "statistic_name": "F",
            "statistic": _f(F), "df": [_f(cdf1, 4), _f(cdf2, 4)], "p": _f(p),
            "significant": bool(p < ALPHA), "family": "parametric",
            "sphericity": sph, "epsilon_gg": _f(eps, 4),
            "correction": "Greenhouse-Geisser" if correct else None,
            "df_uncorrected": [df1, df2], "p_uncorrected": _f(p_unc),
            "effect_size": "partial eta squared", "effect_value": _f(eta)}


def friedman(mat):
    N, k = mat.shape
    chi, p = sps.friedmanchisquare(*[mat[:, j] for j in range(k)])
    W = chi / (N * (k - 1)) if N * (k - 1) else 0.0
    return {"testable": True, "test": "Friedman", "statistic_name": "chi2", "statistic": _f(chi),
            "df": [k - 1], "p": _f(p), "significant": bool(p < ALPHA), "family": "non-parametric",
            "effect_size": "Kendall's W", "effect_value": _f(W)}


def d_z(diff):
    """Cohen's d for paired data: mean difference / sd of the differences."""
    sd = diff.std(ddof=1) if diff.size > 1 else 0.0
    if sd == 0:
        return 0.0 if diff.mean() == 0 else None
    return float(diff.mean() / sd)


def rank_biserial_paired(diff):
    """Matched-pairs rank-biserial r = (W+ - W-) / (W+ + W-), zero differences
    dropped (as the Wilcoxon test drops them). Positive when a tends to exceed b."""
    d = diff[diff != 0]
    if d.size == 0:
        return 0.0
    ranks = sps.rankdata(np.abs(d))
    w_plus, w_minus = ranks[d > 0].sum(), ranks[d < 0].sum()
    return float((w_plus - w_minus) / (w_plus + w_minus))


def _block_matrix(rows, key, configs, instances):
    """Instances x configurations, each cell the instance's mean over its seeds."""
    mat = np.zeros((len(instances), len(configs)))
    for i, inst in enumerate(instances):
        for j, c in enumerate(configs):
            vals = [x[key] for x in rows if x["configuration"] == c and x["instance_id"] == inst]
            mat[i, j] = np.mean(vals) if vals else np.nan
    return mat


# ─── the core: one measure, four configurations, instances as subjects ───────
def compare_rm(mat, configs, measure, lower_is_better=False, enforced_note=None, run_groups=None,
               route="auto"):
    """mat: N instances x k configurations (per-instance means over seeds).

    route "auto": Shapiro-Wilk on the within-instance differences of every pair;
    all normal -> RM-ANOVA (Mauchly / Greenhouse-Geisser) with paired t-tests and
    d_z; otherwise Friedman with Wilcoxon signed-rank and the matched-pairs
    rank-biserial r. route "friedman" skips the normality step (SP3).
    Post-hoc p-values are Holm-corrected across the pairs."""
    N, k = mat.shape
    result = {"measure": measure, "label": MEASURE_LABELS.get(measure, measure),
              "lower_is_better": lower_is_better, "n_instances": int(N),
              "descriptives": {c: descriptives(run_groups[c]) for c in configs} if run_groups else
                              {c: descriptives(mat[:, j]) for j, c in enumerate(configs)},
              "instance_means": {c: _f(mat[:, j].mean()) if N else None for j, c in enumerate(configs)}}
    pair_idx = list(combinations(range(k), 2))

    def untestable(reason):
        result["normality"] = {"basis": "within-instance differences", "pairs": [], "all_normal": False}
        result["all_normal"] = False
        result["omnibus"] = {"testable": False, "reason": reason, "significant": False, "p": None}
        result["pairs"] = []
        return result

    if N < 2:
        return untestable("requires >= 2 instances (repeated measures: each instance is one subject)")
    if np.all(np.ptp(mat, axis=1) == 0):
        reason = "not testable - no variance across configurations"
        if enforced_note:
            reason += f"; {enforced_note}"
        return untestable(reason)

    norm_pairs = []
    for i, j in pair_idx:
        sw = shapiro(mat[:, i] - mat[:, j])
        norm_pairs.append({"a": configs[i], "b": configs[j], **sw})
    all_normal = route == "auto" and all(n["normal"] for n in norm_pairs)
    result["normality"] = {"basis": "within-instance differences (one value per instance)",
                           "pairs": norm_pairs, "all_normal": bool(all_normal),
                           "skipped": route != "auto"}
    result["all_normal"] = bool(all_normal)

    parametric = all_normal
    result["omnibus"] = rm_anova(mat) if parametric else friedman(mat)

    raw = []
    for i, j in pair_idx:
        diff = mat[:, i] - mat[:, j]
        if np.all(diff == 0):
            raw.append((1.0, None, 0.0))
        elif parametric:
            t = sps.ttest_rel(mat[:, i], mat[:, j])
            raw.append((float(t.pvalue), _f(t.statistic), d_z(diff)))
        else:
            w = sps.wilcoxon(mat[:, i], mat[:, j])
            raw.append((float(w.pvalue), _f(w.statistic), rank_biserial_paired(diff)))
    adj, _ = holm([r[0] for r in raw])

    test = "paired t-test" if parametric else "Wilcoxon signed-rank"
    eff_name, thr, kind = ("d_z", D_THRESHOLD, "d") if parametric else ("matched-pairs rank-biserial r", R_THRESHOLD, "r")
    pairs = []
    for (i, j), (p_raw, stat, eff), p_adj in zip(pair_idx, raw, adj):
        a, b = configs[i], configs[j]
        ma, mb = mat[:, i].mean(), mat[:, j].mean()
        if ma == mb: favours = None
        elif lower_is_better: favours = a if ma < mb else b
        else: favours = a if ma > mb else b
        significant = p_adj is not None and p_adj < ALPHA
        practical = eff is not None and abs(eff) >= thr
        pairs.append({"a": a, "b": b, "test": test, "statistic": stat, "p_raw": _f(p_raw), "p": _f(p_adj),
                      "posthoc_significant": bool(significant),
                      "effect": {"name": eff_name, "value": _f(eff), "threshold": thr,
                                 "magnitude": magnitude(kind, eff), "practical": bool(practical)},
                      "mean_a": _f(ma), "mean_b": _f(mb), "favours": favours,
                      "higher": None if ma == mb else (a if ma > mb else b)})
    result["posthoc_test"] = f"{test} (Holm)"
    result["effect_size"] = eff_name
    result["pairs"] = pairs
    apply_verdicts(result, result["omnibus"]["significant"], "omnibus test")
    return result


def apply_verdicts(cmp, omnibus_significant, gate):
    """Set each pair's verdict. A pair is significant only when the gating
    omnibus result is (the raw omnibus test, or for SP2 its Holm-corrected
    result) and its Holm-corrected post-hoc test is. Outperformance (Chapter 3)
    also needs the practical-effect threshold; the field `outperforms` names the
    configuration the direction favours. The verdict TEXT is neutral: the
    configuration with the higher mean is named first."""
    label = MEASURE_LABELS.get(cmp["measure"], cmp["measure"]).split(" (")[0]   # name without its unit
    for pr in cmp.get("pairs", []):
        significant = bool(omnibus_significant and pr["posthoc_significant"])
        eff = pr["effect"]
        pr["significant"] = significant
        pr["omnibus_gate"] = gate
        if not significant:
            pr["outperforms"] = None
            pr["verdict"] = ("no significant difference" if omnibus_significant or not pr["posthoc_significant"]
                             else f"no significant difference ({gate} not significant)")
        elif not eff["practical"]:
            pr["outperforms"] = None
            pr["verdict"] = "statistically detectable but not practically meaningful"
        else:
            pr["outperforms"] = pr["favours"]
            hi = pr["higher"]
            lo = pr["b"] if hi == pr["a"] else pr["a"]
            # |effect|: its sign follows the (a, b) order, the text names the higher one first
            pr["verdict"] = (f"{LABELS[hi]} significantly higher than {LABELS[lo]} on {label} "
                             f"(|{eff['name']}| = {abs(eff['value']):.2f}, {eff['magnitude']})")


def outperforms(cmp, winner, loser):
    for pr in cmp.get("pairs", []):
        if {pr["a"], pr["b"]} == {winner, loser}:
            return pr["outperforms"] == winner
    return False
# ─── study-level ─────────────────────────────────────────────────────────────
def derive_rows(runs):
    rows = []
    for r in runs:
        n, placed = r["n_items"], r["placed"]
        frac = (placed / n) if n else 0.0
        row = {"configuration": r["configuration"], "instance_id": r.get("instance_id"),
               "seed": r["seed"], "SU": r["su_pct"], "placed": placed, "n_items": n,
               "ET": r["exec_time_ms"], "PM": r["peak_mem_mb"]}
        for m, key in COMPLIANCE_KEYS.items():
            row[f"{m}_placed"] = r[key]
            row[f"{m}_all_boxes"] = r[key] * frac
        rows.append(row)
    return rows


def group_values(rows, key, configs, instance_id=None):
    return {c: [x[key] for x in rows if x["configuration"] == c and
                (instance_id is None or x["instance_id"] == instance_id)] for c in configs}


def _instances_of(study):
    return [i["instance_id"] for i in study.get("instances", [])]


def analyse(study):
    runs = study["runs"]
    configs = [c for c in CONFIGS if any(r["configuration"] == c for r in runs)]
    rows = derive_rows(runs)
    instances = _instances_of(study)
    n_inst = len(instances)
    timing_valid = bool(study.get("timing_valid", study.get("mode") == "serial"))
    seeds = study.get("seeds") or sorted({r["seed"] for r in runs})
    runs_per_cfg = min(sum(1 for r in runs if r["configuration"] == c) for c in configs) if configs else 0

    out = {"alpha": ALPHA, "primary_compliance": PRIMARY_COMPLIANCE, "configurations": configs,
           "labels": LABELS, "hybrids": HYBRIDS, "baselines": BASELINES,
           "provenance": {"instances": study.get("instances", []), "n_instances": n_inst,
                          "preset": study.get("preset"), "seeds": seeds,
                          "runs_per_configuration": runs_per_cfg, "mode": study.get("mode"),
                          "timing_valid": timing_valid, "timing_note": study.get("timing_note"),
                          "commit": study.get("commit"), "created_at": study.get("created_at"),
                          "preliminary": (n_inst < 30) or (runs_per_cfg < 30),
                          "preliminary_reason": (f"{n_inst} instance(s) < 30" if n_inst < 30 else "") +
                                                ("; " if n_inst < 30 and runs_per_cfg < 30 else "") +
                                                (f"{runs_per_cfg} runs per configuration < 30" if runs_per_cfg < 30 else ""),
                          "seq_budget_split": study.get("seq_budget_split")}}

    def get_mat(measure):
        return _block_matrix(rows, measure, configs, instances)

    # ── descriptives for every measure (over runs), both compliance definitions
    desc = {}
    for m in ["SU", "placed", "ET", "PM"]:
        desc[m] = {c: descriptives(v) for c, v in group_values(rows, m, configs).items()}
    for m in COMPLIANCE_KEYS:
        desc[m] = {d: {c: descriptives(v) for c, v in group_values(rows, f"{m}_{d}", configs).items()}
                   for d in COMPLIANCE_DEFS}
    out["descriptives"] = desc
    out["timing"] = timing_flags(study, timing_valid)

    # Robustness = run-to-run sd of SU within an instance, averaged over instances.
    out["robustness"] = {}
    for c in configs:
        per = {}
        for inst in instances:
            vals = group_values(rows, "SU", [c], inst)[c]
            per[str(inst)] = float(np.std(vals, ddof=1)) if len(vals) > 1 else None
        sds = [v for v in per.values() if v is not None]
        out["robustness"][c] = {"sd_su": _f(np.mean(sds)) if sds else None,
                                "max_sd": _f(np.max(sds)) if sds else None,
                                "per_instance": {k: _f(v) for k, v in per.items()}}

    # ── SP1 ──────────────────────────────────────────────────────────────────
    sp1 = compare_rm(get_mat("SU"), configs, "SU", run_groups=group_values(rows, "SU", configs))
    out["SP1"] = {"measure": "SU", "comparison": sp1,
                  "confound_note": ("Sequential's DGWO phase receives only part of the iteration budget: "
                                    f"{study.get('seq_budget_split', {}).get('dgwo_iters', '?')} of "
                                    f"{study.get('preset', {}).get('max_iter', '?')} iterations go to DGWO, the rest to the MOGWO phase, "
                                    "so its utilisation is not a like-for-like comparison with standalone DGWO.")}

    # ── SP2 ──────────────────────────────────────────────────────────────────
    # The hypothesis is tested on the manuscript's definition (all boxes); the
    # over-placed-boxes figures are reported descriptively.
    sp2 = {"measures": list(COMPLIANCE_KEYS), "holm_family": list(SP2_FAMILY),
           "descriptive_measures": list(SP2_DESCRIPTIVE), "by_definition": {}}
    for d in COMPLIANCE_DEFS:
        per = {}
        for m in COMPLIANCE_KEYS:
            key = f"{m}_{d}"
            if d == PRIMARY_COMPLIANCE and m in SP2_FAMILY:
                per[m] = compare_rm(get_mat(key), configs, m,
                                    run_groups=group_values(rows, key, configs))
            elif d == PRIMARY_COMPLIANCE:
                enforced = study.get(DECODER_ENFORCED[m], True)
                share = [abs(x[key] - (x["placed"] / x["n_items"] if x["n_items"] else 0.0) * 100.0) for x in rows]
                reason = ("decoder-enforced; all-box value = share placed" if enforced else
                          f"not in the SP2 Holm family (Chapter 3); decode-time enforcement "
                          f"({DECODER_ENFORCED[m]}) was off in this study")
                per[m] = {"measure": m, "label": MEASURE_LABELS.get(m, m), "descriptive_only": True,
                          "decoder_enforced": bool(enforced),
                          "equals_share_placed": bool(share) and max(share) < 1e-6,
                          "descriptives": {c: descriptives(v) for c, v in group_values(rows, key, configs).items()},
                          "normality": {"basis": "within-instance differences", "pairs": [], "all_normal": False},
                          "all_normal": False, "pairs": [],
                          "omnibus": {"testable": False, "significant": False, "p": None, "p_holm": None,
                                      "significant_holm": False, "reason": reason}}
            else:
                per[m] = {"measure": m, "label": MEASURE_LABELS.get(m, m), "descriptive_only": True,
                          "descriptives": {c: descriptives(v) for c, v in group_values(rows, key, configs).items()},
                          "normality": {"basis": "within-instance differences", "pairs": [], "all_normal": False},
                          "all_normal": False, "pairs": [],
                          "omnibus": {"testable": False, "significant": False, "p": None, "p_holm": None,
                                      "significant_holm": False,
                                      "reason": "descriptive only - the hypothesis is tested on compliance over all boxes"}}
        if d == PRIMARY_COMPLIANCE:
            raw = [per[m]["omnibus"]["p"] if per[m]["omnibus"].get("testable") else None for m in SP2_FAMILY]
            adj, fam = holm(raw)
            for m, pa in zip(SP2_FAMILY, adj):
                per[m]["omnibus"]["p_holm"] = _f(pa)
                per[m]["omnibus"]["significant_holm"] = bool(pa is not None and pa < ALPHA)
                per[m]["omnibus"]["holm_family_size"] = fam
                # Pair verdicts are gated on the Holm-corrected omnibus result.
                apply_verdicts(per[m], per[m]["omnibus"]["significant_holm"], "Holm-corrected omnibus test")
            rejected = [m for m in SP2_FAMILY if per[m]["omnibus"]["significant_holm"]]
            untestable_all = all(not per[m]["omnibus"]["testable"] for m in SP2_FAMILY)
            if rejected:
                decision = "H0 rejected: at least one Holm-corrected omnibus test is significant (" + ", ".join(rejected) + ")"
            elif fam:
                decision = "H0 not rejected: no Holm-corrected omnibus test is significant"
            elif n_inst < 2:
                decision = "H0 not testable: requires >= 2 instances"
            else:
                decision = "H0 not testable: every compliance measure is constant"
            testable = not untestable_all
        else:
            fam, rejected, decision, testable = 0, [], "descriptive only", False
        sp2["by_definition"][d] = {"definition": d, "per_measure": per, "holm_family_size": fam,
                                   "significant_measures": rejected, "h0_rejected": len(rejected) > 0,
                                   "testable": testable, "decision": decision}
    sp2["primary"] = sp2["by_definition"][PRIMARY_COMPLIANCE]
    sp2["h0_rejected"] = sp2["primary"]["h0_rejected"]
    sp2["decision"] = sp2["primary"]["decision"]
    out["SP2"] = sp2

    # ── SP3 ──────────────────────────────────────────────────────────────────
    # Friedman within each BR class (instances of the class as subjects), Holm
    # across ET and PM within the class.
    if not timing_valid:
        out["SP3"] = {"available": False, "reason": "concurrent timing - not valid for SP3 (runs shared the CPU); rerun with --mode serial"}
    else:
        classes = {}
        for inst in study.get("instances", []):
            classes.setdefault(inst["br_class"], []).append(inst)
        prof = []
        for cls in sorted(classes, key=lambda s: int(''.join(ch for ch in s if ch.isdigit()) or 0)):
            insts = classes[cls]
            ids = [i["instance_id"] for i in insts]
            entry = {"br_class": cls, "n_types": insts[0].get("n_types"), "instances": ids,
                     "n_boxes": [i.get("n_boxes") for i in insts],
                     "mean_n_boxes": _f(np.mean([i.get("n_boxes") for i in insts if i.get("n_boxes") is not None])),
                     "per_configuration": {}}
            for c in configs:
                sub = [x for x in rows if x["configuration"] == c and x["instance_id"] in ids]
                entry["per_configuration"][c] = {"ET": descriptives([x["ET"] for x in sub]),
                                                 "PM": descriptives([x["PM"] for x in sub])}
            per = {}
            for m in ("ET", "PM"):
                mat = _block_matrix(rows, m, configs, ids)
                cmp = compare_rm(mat, configs, m, lower_is_better=True, route="friedman")
                if cmp["omnibus"].get("testable"):
                    ranks = np.array([sps.rankdata(r) for r in mat])        # 1 = fastest / smallest
                    cmp["mean_rank"] = {c: _f(ranks[:, j].mean()) for j, c in enumerate(configs)}
                per[m] = cmp
            raw = [per[m]["omnibus"]["p"] if per[m]["omnibus"].get("testable") else None for m in ("ET", "PM")]
            adj, fam = holm(raw)
            for m, pa in zip(("ET", "PM"), adj):
                per[m]["omnibus"]["p_holm"] = _f(pa)
                per[m]["omnibus"]["significant_holm"] = bool(pa is not None and pa < ALPHA)
                per[m]["omnibus"]["holm_family_size"] = fam
                # Pair verdicts are gated on the Holm-corrected per-class result
                # (Holm across ET and PM within the class; Chapter 3 Table 3a).
                apply_verdicts(per[m], per[m]["omnibus"]["significant_holm"], "Holm-corrected omnibus test")
            entry["friedman"] = per
            entry["testable"] = fam > 0
            prof.append(entry)
        n_testable = sum(1 for e in prof if e["testable"])
        out["SP3"] = {"available": True, "profiles": prof, "n_classes": len(prof),
                      "n_classes_testable": n_testable,
                      "note": None if n_testable == len(prof) else
                              f"{len(prof) - n_testable} of {len(prof)} BR class(es) have fewer than 2 instances; "
                              "the within-class Friedman test needs at least 2"}

    # ── composite ────────────────────────────────────────────────────────────
    if n_inst < 2:
        out["composite"] = {"available": False, "reason": "requires >= 2 instances (the overall ranking is tested across instances)"}
    elif not timing_valid:
        out["composite"] = {"available": False, "reason": "concurrent timing - the composite uses ET and PM; requires a serial study"}
    else:
        out["composite"] = composite(rows, configs, instances)

    # ── outcome pattern ──────────────────────────────────────────────────────
    out["outcome"] = outcome_pattern(sp1, sp2["primary"]["per_measure"]["CSR"], configs)

    # ── supplementary: non-search baselines (outside SP1-SP3) ─────────────────
    out["supplementary"] = supplementary(study, rows, configs, instances)
    return out


def timing_flags(study, timing_valid):
    """Every time / memory / composite figure of a parallel study is invalid:
    the runs shared the CPU. Readers mark the figures listed in `affects`."""
    return {"valid": bool(timing_valid), "mode": study.get("mode"),
            "note": study.get("timing_note") or ("serial" if timing_valid else "concurrent"),
            "affects": ["descriptives.ET", "descriptives.PM", "SP3", "composite"],
            "label": None if timing_valid else
                     "INVALID - parallel runs shared the CPU; time, memory and the composite are not comparable"}


# ─── supplementary: non-search baselines ─────────────────────────────────────
def one_tailed_greater(diff):
    """H1: mean(diff) > 0, one value per instance. Normal differences -> one-tailed
    paired t-test (d_z); otherwise one-tailed Wilcoxon signed-rank (rank-biserial r)."""
    diff = np.asarray(diff, float)
    sw = shapiro(diff)
    if diff.size < 2:
        return {"testable": False, "reason": "requires >= 2 instances (each instance is one subject)",
                "normality": sw, "p_raw": None}
    if np.all(diff == 0):
        return {"testable": False, "reason": "not testable - no difference from the greedy on any instance",
                "normality": sw, "p_raw": None}
    if sw["normal"]:
        t = sps.ttest_1samp(diff, 0.0, alternative="greater")
        eff, name, thr, kind = d_z(diff), "d_z", D_THRESHOLD, "d"
        test, stat, p = "paired t-test (one-tailed)", _f(t.statistic), float(t.pvalue)
    else:
        w = sps.wilcoxon(diff, alternative="greater")
        eff, name, thr, kind = rank_biserial_paired(diff), "matched-pairs rank-biserial r", R_THRESHOLD, "r"
        test, stat, p = "Wilcoxon signed-rank (one-tailed)", _f(w.statistic), float(w.pvalue)
    return {"testable": True, "test": test, "statistic": stat, "p_raw": p, "normality": sw,
            "effect": {"name": name, "value": _f(eff), "threshold": thr, "magnitude": magnitude(kind, eff),
                       "practical": bool(eff is not None and eff > 0 and abs(eff) >= thr)}}


def supplementary(study, rows, configs, instances):
    base = study.get("baselines")
    if not base:
        return {"available": False, "title": SUPPLEMENTARY_LABEL,
                "reason": "no baselines in this study file (python experiments/baselines.py --study <file>)"}
    per_inst = {b["instance_id"]: b for b in base["per_instance"]}
    insts = [i for i in instances if i in per_inst]
    key = f"CSR_{PRIMARY_COMPLIANCE}"
    greedy = np.array([per_inst[i]["weight_sorted"]["csr_all_pct"] for i in insts], float)
    mat = _block_matrix(rows, key, configs, insts)

    per_cfg, raw = {}, []
    for j, c in enumerate(configs):
        diff = mat[:, j] - greedy
        res = one_tailed_greater(diff)
        res.update(configuration=c, mean=_f(mat[:, j].mean()), greedy_mean=_f(greedy.mean()),
                   mean_difference=_f(diff.mean()), instances_above=int((diff > 0).sum()),
                   n_instances=len(insts))
        per_cfg[c] = res
        raw.append(res["p_raw"])
    adj, fam = holm(raw)
    for c, pa in zip(configs, adj):
        r = per_cfg[c]
        r["p"] = _f(pa)
        r["p_raw"] = _f(r["p_raw"])
        r["significant"] = bool(pa is not None and pa < ALPHA)
        if not r["testable"]:
            r["verdict"] = r["reason"]
        elif not r["significant"]:
            r["verdict"] = f"not significantly higher than the {GREEDY_LABEL}"
        elif not r["effect"]["practical"]:
            r["verdict"] = (f"significantly higher than the {GREEDY_LABEL}, but not practically meaningful "
                            f"(|{r['effect']['name']}| = {abs(r['effect']['value']):.2f})")
        else:
            r["verdict"] = (f"{LABELS[c]} significantly higher than the {GREEDY_LABEL} on CSR over all boxes "
                            f"(one-tailed, Holm p = {r['p']:.3g}; |{r['effect']['name']}| = "
                            f"{abs(r['effect']['value']):.2f}, {r['effect']['magnitude']})")
    vs_greedy = {"measure": "CSR", "definition": PRIMARY_COMPLIANCE, "baseline": GREEDY_LABEL,
                 "alternative": "configuration > Weight-Sorted Greedy (one-tailed)", "alpha": ALPHA,
                 "family": "these comparisons only (Holm across the configurations); not part of SP1-SP3",
                 "holm_family_size": fam, "n_instances": len(insts),
                 "greedy_per_instance": {str(i): _f(g) for i, g in zip(insts, greedy)},
                 "per_configuration": per_cfg,
                 "significant": [c for c in configs if per_cfg[c]["significant"]]}

    def pooled(k):
        return descriptives([d[k] for i in insts for d in per_inst[i]["random_order"]])
    random = {"baseline": RANDOM_LABEL, "descriptive_only": True, "n_draws_per_instance": base.get("n_random"),
              "n_instances": len(insts),
              "measures": {"CSR_all_boxes": pooled("csr_all_pct"), "SU": pooled("su_pct"),
                           "ET": pooled("exec_time_ms"), "placed": pooled("placed")},
              "per_instance": {str(i): {"CSR_all_boxes": descriptives([d["csr_all_pct"] for d in per_inst[i]["random_order"]]),
                                        "SU": descriptives([d["su_pct"] for d in per_inst[i]["random_order"]]),
                                        "ET": descriptives([d["exec_time_ms"] for d in per_inst[i]["random_order"]])}
                               for i in insts},
              "timing_valid": bool(base.get("timing_valid")), "timing_note": base.get("timing_note")}
    greedy_desc = {"CSR_all_boxes": descriptives(greedy),
                   "SU": descriptives([per_inst[i]["weight_sorted"]["su_pct"] for i in insts]),
                   "ET": descriptives([per_inst[i]["weight_sorted"]["exec_time_ms"] for i in insts]),
                   "placed": descriptives([per_inst[i]["weight_sorted"]["placed"] for i in insts])}
    return {"available": True, "title": SUPPLEMENTARY_LABEL, "separate_from": "SP1-SP3",
            "vs_greedy": vs_greedy, "greedy": greedy_desc, "random_order": random,
            "baseline_timing_valid": bool(base.get("timing_valid")),
            "note": "Supplementary to SP1-SP3: these tests are not in the SP1-SP3 Holm families and do "
                    "not change the outcome pattern. The baselines ran serially in one process."}


def friedman_block(mat, configs, lower_is_better=False):
    """mat: blocks x configurations. Friedman + mean ranks (+ Nemenyi if significant)."""
    nb, k = mat.shape
    res = {"test": "Friedman", "blocks": int(nb), "k": int(k), "matrix": [[_f(v) for v in row] for row in mat]}
    if nb < 2:
        res.update(testable=False, reason="requires >= 2 instances", significant=False, p=None)
        return res
    if np.all(np.ptp(mat, axis=1) == 0):
        res.update(testable=False, reason="not testable - no variance across configurations in any block", significant=False, p=None)
        return res
    try:
        chi, p = sps.friedmanchisquare(*[mat[:, j] for j in range(k)])
    except ValueError as e:
        res.update(testable=False, reason=f"not testable: {e}", significant=False, p=None)
        return res
    ranks = np.array([sps.rankdata(row if lower_is_better else -row) for row in mat])
    res.update(testable=True, statistic_name="chi2", statistic=_f(chi), df=[k - 1], p=_f(p),
               significant=bool(p < ALPHA),
               mean_rank={c: _f(ranks[:, j].mean()) for j, c in enumerate(configs)},
               mean_value={c: _f(mat[:, j].mean()) for j, c in enumerate(configs)})
    if res["significant"]:
        nm = sph.posthoc_nemenyi_friedman(mat)
        res["posthoc"] = {"test": "Nemenyi", "pairs": [
            {"a": a, "b": b, "p": _f(nm.iloc[i, j]), "significant": bool(nm.iloc[i, j] < ALPHA),
             "favours": (a if ranks[:, i].mean() < ranks[:, j].mean() else b if ranks[:, j].mean() < ranks[:, i].mean() else None)}
            for (i, a), (j, b) in combinations(list(enumerate(configs)), 2)]}
    return res


def _minmax(vals):
    v = np.asarray(vals, float)
    lo, hi = v.min(), v.max()
    if hi == lo:
        return np.full(v.shape, 0.5)     # tie: neutral, identical for all four (ranking unaffected)
    return (v - lo) / (hi - lo)


def _z(vals):
    v = np.asarray(vals, float)
    sd = v.std(ddof=1) if v.size > 1 else 0.0
    return np.zeros_like(v) if sd == 0 else (v - v.mean()) / sd


def composite_scores(rows, configs, instances, csr_key=f"CSR_{PRIMARY_COMPLIANCE}"):
    """CS(c, p) per instance p and configuration c. Returns (matrix instances x configs, details)."""
    mat = np.zeros((len(instances), len(configs)))
    details = []
    for pi, inst in enumerate(instances):
        su = [np.mean([x["SU"] for x in rows if x["configuration"] == c and x["instance_id"] == inst]) for c in configs]
        csr = [np.mean([x[csr_key] for x in rows if x["configuration"] == c and x["instance_id"] == inst]) for c in configs]
        et = [np.mean([x["ET"] for x in rows if x["configuration"] == c and x["instance_id"] == inst]) for c in configs]
        pm = [np.mean([x["PM"] for x in rows if x["configuration"] == c and x["instance_id"] == inst]) for c in configs]
        rob = [float(np.std([x["SU"] for x in rows if x["configuration"] == c and x["instance_id"] == inst], ddof=1))
               if len([x for x in rows if x["configuration"] == c and x["instance_id"] == inst]) > 1 else 0.0 for c in configs]
        z_et, z_pm = _z(et), _z(pm)
        cc = (z_et + z_pm) / 2.0
        cc_n = _minmax(cc)
        su_n, csr_n, rob_n = _minmax(su), _minmax(csr), _minmax(rob)
        cs = 0.25 * su_n + 0.25 * csr_n + 0.25 * (1 - cc_n) + 0.25 * (1 - rob_n)
        mat[pi, :] = cs
        details.append({"instance_id": inst, "per_configuration": {
            c: {"SU": _f(su[j]), "CSR": _f(csr[j]), "ET": _f(et[j]), "PM": _f(pm[j]), "Rob": _f(rob[j]),
                "CC": _f(cc[j]), "SU_n": _f(su_n[j]), "CSR_n": _f(csr_n[j]), "CC_n": _f(cc_n[j]),
                "Rob_n": _f(rob_n[j]), "CS": _f(cs[j])} for j, c in enumerate(configs)}})
    return mat, details

def composite(rows, configs, instances):
    mat, details = composite_scores(rows, configs, instances)
    fr = friedman_block(mat, configs, lower_is_better=False)
    mean_cs = {c: _f(mat[:, j].mean()) for j, c in enumerate(configs)}
    sd_cs = {c: _f(mat[:, j].std(ddof=1)) if mat.shape[0] > 1 else None for j, c in enumerate(configs)}
    comp = {c: {k: _f(np.mean([d["per_configuration"][c][k] for d in details])) for k in ("SU_n", "CSR_n", "CC_n", "Rob_n")} for c in configs}
    ranking = sorted(configs, key=lambda c: -mean_cs[c])
    # Key name kept for stored files and readers; it holds the top of the
    # ranking, reported only when the Friedman test is significant.
    rec = None
    if fr.get("significant"):
        rec = {"configuration": ranking[0], "label": LABELS[ranking[0]], "mean_cs": mean_cs[ranking[0]],
               "basis": "Friedman on the composite score is significant; this configuration has the highest mean composite score"}
    return {"available": True, "title": COMPOSITE_LABEL, "supplementary": True,
            "distinguished": rec is not None, "formula": "CS = 0.25*SU~ + 0.25*CSR~ + 0.25*(1-CC~) + 0.25*(1-Rob~); ~ = min-max across the four configurations within an instance; CC = (z_ET + z_PM)/2; Rob = sd of SU across runs within the instance",
            "csr_definition": PRIMARY_COMPLIANCE, "n_instances": len(instances),
            "mean_cs": mean_cs, "sd_cs": sd_cs, "components": comp, "ranking": ranking,
            "per_instance": details, "friedman": fr, "recommendation": rec,
            "recommendation_note": None if rec else "no configuration distinguished: the Friedman test on the composite score is not significant"}
def outcome_pattern(sp1, sp2_csr, configs):
    """Chapter 3 outcome pattern over the primary metrics: SU (SP1) and CSR over all boxes (SP2)."""
    metrics = {"SU": sp1, "CSR": sp2_csr}
    untested = [m for m, cmp in metrics.items() if not cmp["omnibus"].get("testable")]
    if untested:
        return {"pattern": None, "testable": False,
                "description": "not determinable - " + "; ".join(f"{m}: {metrics[m]['omnibus']['reason']}" for m in untested),
                "primary_metrics": ["SU", f"CSR ({PRIMARY_COMPLIANCE})"], "table": {}}
    table = {}
    for h in HYBRIDS:
        table[h] = {}
        for m, cmp in metrics.items():
            wins = {b: outperforms(cmp, h, b) for b in BASELINES if b in configs}
            losses = {b: outperforms(cmp, b, h) for b in BASELINES if b in configs}
            table[h][m] = {"beats_both_baselines": bool(wins) and all(wins.values()),
                           "beats": [b for b, w in wins.items() if w],
                           "beaten_by": [b for b, l in losses.items() if l]}
    all_win = {h: all(table[h][m]["beats_both_baselines"] for m in metrics) for h in HYBRIDS}
    # "mixed across metrics": a hybrid outperforms both baselines on one primary metric but not the other
    mixed = {h: any(table[h][m]["beats_both_baselines"] for m in metrics) and not all_win[h] for h in HYBRIDS}
    if any(mixed.values()):
        pat, text = "D", "mixed results across metrics - a trade-off profile"
    elif all(all_win.values()):
        pat, text = "A", "both hybrids outperform both baselines on the primary metrics (SU and CSR)"
    elif sum(all_win.values()) == 1:
        w = next(h for h in HYBRIDS if all_win[h])
        pat, text = "B", f"exactly one hybrid ({LABELS[w]}) outperforms both baselines on the primary metrics"
    else:
        pat, text = "C", "neither hybrid outperforms both baselines on the primary metrics"
    return {"pattern": pat, "testable": True, "description": text,
            "primary_metrics": ["SU", f"CSR ({PRIMARY_COMPLIANCE})"], "table": table}


# ─── I/O ─────────────────────────────────────────────────────────────────────
def save_stats(study, path):
    Path(path).write_text(json.dumps(study, indent=1), encoding="utf-8")


def summary_lines(st):
    L = []
    pv = st["provenance"]
    L.append(f"provenance: {pv['n_instances']} instance(s), preset {pv['preset']}, {len(pv['seeds'])} seeds, mode {pv['mode']}, commit {pv['commit']}"
             + (" [PRELIMINARY: " + pv["preliminary_reason"] + "]" if pv["preliminary"] else ""))
    c = st["SP1"]["comparison"]
    o = c["omnibus"]
    L.append("SP1 SU: " +
             (f"{o['test']} {o['statistic_name']}={o['statistic']} df={o['df']} p={o['p']} sig={o['significant']}"
              + (f" [{o['correction']}, eps={o['epsilon_gg']}]" if o.get("correction") else "")
              if o.get("testable") else o["reason"]))
    for pr in c.get("pairs", []):
        L.append(f"   {pr['a']} vs {pr['b']}: p={pr['p']} {pr['effect']['name']}={pr['effect']['value']} ({pr['effect']['magnitude']}) -> {pr['verdict']}")
    for d in COMPLIANCE_DEFS:
        blk = st["SP2"]["by_definition"][d]
        L.append(f"SP2 [{d}{' PRIMARY' if d == PRIMARY_COMPLIANCE else ''}]: {blk['decision']}")
        if d == PRIMARY_COMPLIANCE:
            for m, cmp in blk["per_measure"].items():
                o = cmp["omnibus"]
                L.append(f"   {m}: " + (f"{o['test']} stat={o['statistic']} p={o['p']} p_holm={o['p_holm']} sig_holm={o['significant_holm']}" if o.get("testable") else o["reason"]))
                for pr in cmp.get("pairs", []):
                    if pr["outperforms"] or pr["posthoc_significant"]:
                        L.append(f"      {pr['a']} vs {pr['b']}: p={pr['p']} eff={pr['effect']['value']} -> {pr['verdict']}")
    s3 = st["SP3"]
    if not s3.get("available"):
        L.append(f"SP3: {s3.get('reason', 'N/A')}")
    else:
        for p in s3["profiles"]:
            L.append(f"SP3 {p['br_class']} ({len(p['instances'])} instance(s)):")
            if True:
                for m in ("ET", "PM"):
                    cmp = p["friedman"][m]
                    o = cmp["omnibus"]
                    L.append(f"   {m}: " + (f"{o['test']} stat={o['statistic']} p={o['p']} p_holm={o['p_holm']} sig_holm={o['significant_holm']}" if o.get("testable") else o["reason"]))
    cs = st["composite"]
    if not cs.get("available"):
        L.append(f"composite: {cs['reason']}")
    else:
        fr = cs["friedman"]
        L.append(f"composite: mean CS {cs['mean_cs']}; Friedman " + (f"chi2={fr['statistic']} p={fr['p']} sig={fr['significant']}" if fr.get("testable") else fr["reason"]))
        top = cs['recommendation']
        L.append(f"   {COMPOSITE_LABEL}: " + (f"highest mean composite score {top['label']} ({top['mean_cs']})" if top else cs['recommendation_note']))
    L.append(f"outcome pattern: {st['outcome']['pattern'] or '-'} - {st['outcome']['description']}")
    tm = st.get("timing")
    if tm and not tm["valid"]:
        L.append(f"TIMING {tm['label']} ({tm['note']})")
    sp = st.get("supplementary")
    if sp:
        L.append(f"{SUPPLEMENTARY_LABEL} - separate from SP1-SP3:")
        if not sp.get("available"):
            L.append(f"   {sp['reason']}")
        else:
            vg = sp["vs_greedy"]
            L.append(f"   vs {GREEDY_LABEL}, CSR over all boxes, one-tailed, Holm across {vg['holm_family_size']}: "
                     f"greedy mean {sp['greedy']['CSR_all_boxes']['mean']}")
            for c, r in vg["per_configuration"].items():
                L.append(f"      {c}: mean {r['mean']} diff {r['mean_difference']} ({r['instances_above']}/{r['n_instances']} above) "
                         + (f"{r['test']} p_raw={r['p_raw']} p_holm={r['p']} -> " if r['testable'] else "") + r["verdict"])
            rm = sp["random_order"]["measures"]
            L.append(f"   {RANDOM_LABEL} (descriptive, {sp['random_order']['n_draws_per_instance']} draws x "
                     f"{sp['random_order']['n_instances']} instances): CSR(all) {rm['CSR_all_boxes']['mean']} "
                     f"sd {rm['CSR_all_boxes']['sd']}; SU {rm['SU']['mean']} sd {rm['SU']['sd']}; ET {rm['ET']['mean']} ms")
    return L
def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("study")
    p.add_argument("--print", action="store_true", dest="do_print")
    p.add_argument("--no-write", action="store_true")
    a = p.parse_args()
    study = json.loads(Path(a.study).read_text(encoding="utf-8"))
    if study.get("stackr_study") != 1:
        sys.exit("not a study file (stackr_study != 1)")
    study["stats"] = analyse(study)
    if not a.no_write:
        save_stats(study, a.study)
    if a.do_print or a.no_write:
        print("\n".join(summary_lines(study["stats"])))


if __name__ == "__main__":
    main()
