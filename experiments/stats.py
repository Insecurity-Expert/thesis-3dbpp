"""Chapter 3 "Statistical Treatment" applied to one study results file.

    python experiments/stats.py experiments/results/studies/<study>.json        # attach stats in place
    python experiments/stats.py <study>.json --print                             # also print a summary

Input: a study file written by experiments/study.py (one row per run with the
configuration, instance, seed, SU, placed, n_items, CSR and C3-C6 over placed
boxes, M-3 execution time and M-4 peak memory).

What is computed (every test reports its name, statistic, df, exact p and an
effect size; nothing is ever reported as NaN - an untestable case says why):

* Compliance BOTH ways for CSR and each of C3-C6: over placed boxes (as the
  evaluator reports it) and over ALL boxes, rate_placed x placed / n_items,
  i.e. an unplaced box counts as non-compliant. The manuscript's locked
  definition is all boxes (PRIMARY_COMPLIANCE); both are reported everywhere.
* Descriptives per configuration and measure: mean, median, sd, min, max, n.
* SP1 (SU): Shapiro-Wilk per group -> one-way ANOVA + Tukey HSD + Cohen's d
  when every group is normal, otherwise Kruskal-Wallis + Dunn-Bonferroni +
  rank-biserial r. Two-tailed, alpha = 0.05.
* SP2 (CSR, C3, C4, C5, C6): the same per measure, Holm-Bonferroni across the
  five omnibus p-values; H0 is rejected iff at least one Holm-corrected omnibus
  test is significant. The decision is output explicitly.
* SP3 (ET, PM; serial timing only): omnibus per metric with Holm across the
  two, Friedman with instances as blocks (>= 2 instances), per-BR-class
  profiles.
* Composite (serial timing, >= 2 instances): CS = 0.25 SU~ + 0.25 CSR~ +
  0.25 (1 - CC~) + 0.25 (1 - Rob~), ~ = min-max across the four configurations
  within an instance, CC = (z_ET + z_PM) / 2, Rob = sd of SU across the runs
  within the instance. Friedman on instances x 4, Nemenyi if significant. A
  recommendation exists only when Friedman is significant.
* Outperformance per pair per metric needs ALL of: a significant corrected
  post-hoc, |d| >= 0.5 or |r| >= 0.3, and the direction favouring that
  configuration. Significant but below threshold is "statistically
  detectable but not practically meaningful".
* Outcome pattern (Chapter 3): A both hybrids outperform both baselines on the
  primary metrics, B exactly one does, C neither does, D mixed / trade-off.

Edge cases: a measure constant across ALL configurations is "not testable -
no variance"; a group that is constant (or has n < 3) gets no Shapiro-Wilk
and is treated as non-normal; one instance skips the SP3 Friedman and the
composite ("requires >= 2 instances"); concurrent timing refuses SP3 and the
composite altogether.

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
LOWER_IS_BETTER = {"ET", "PM"}

D_THRESHOLD = 0.5       # Cohen's d practical threshold
R_THRESHOLD = 0.3       # rank-biserial r practical threshold


# ─── helpers ─────────────────────────────────────────────────────────────────
def _f(x, nd=6):
    """JSON-safe float: NaN / inf -> None."""
    if x is None:
        return None
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    if math.isnan(v) or math.isinf(v):
        return None
    return round(v, nd)


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
        return {"applicable": False, "reason": "n < 3", "normal": False, "W": None, "p": None}
    if np.ptp(v) == 0:
        return {"applicable": False, "reason": "constant within the group - Shapiro-Wilk not applicable; treated as non-normal",
                "normal": False, "W": None, "p": None}
    W, p = sps.shapiro(v)
    return {"applicable": True, "reason": None, "W": _f(W), "p": _f(p), "normal": bool(p >= ALPHA),
            "test": "Shapiro-Wilk"}


def cohens_d(a, b):
    a, b = np.asarray(a, float), np.asarray(b, float)
    na, nb = a.size, b.size
    if na < 2 or nb < 2:
        return None
    sp = math.sqrt(((na - 1) * a.var(ddof=1) + (nb - 1) * b.var(ddof=1)) / (na + nb - 2))
    if sp == 0:
        return 0.0 if a.mean() == b.mean() else None
    return (a.mean() - b.mean()) / sp


def rank_biserial(a, b):
    """r = 2U/(n1 n2) - 1, positive when a tends to exceed b."""
    a, b = np.asarray(a, float), np.asarray(b, float)
    if a.size == 0 or b.size == 0:
        return None
    if np.ptp(np.concatenate([a, b])) == 0:
        return 0.0
    u = sps.mannwhitneyu(a, b, alternative="two-sided").statistic
    return 2.0 * u / (a.size * b.size) - 1.0


def magnitude(kind, value):
    if value is None:
        return None
    v = abs(value)
    if kind == "d":
        return "negligible" if v < 0.2 else "small" if v < 0.5 else "medium" if v < 0.8 else "large"
    return "negligible" if v < 0.1 else "small" if v < 0.3 else "medium" if v < 0.5 else "large"


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


# ─── the core: one measure, four groups ──────────────────────────────────────
def compare_groups(groups, measure, configs=CONFIGS, lower_is_better=False, enforced_note=None):
    """groups: {config: [values]}. Returns normality, omnibus, post-hoc pairs."""
    present = [c for c in configs if len(groups.get(c, [])) > 0]
    normality = {c: shapiro(groups[c]) for c in present}
    desc = {c: descriptives(groups[c]) for c in present}
    allv = np.concatenate([np.asarray(groups[c], float) for c in present]) if present else np.array([])

    result = {"measure": measure, "label": MEASURE_LABELS.get(measure, measure),
              "lower_is_better": lower_is_better, "descriptives": desc, "normality": normality,
              "all_normal": bool(present) and all(normality[c]["normal"] for c in present)}

    if len(present) < 2 or allv.size == 0:
        result["omnibus"] = {"testable": False, "reason": "fewer than two configurations have data",
                             "significant": False, "p": None}
        result["pairs"] = []
        return result
    if np.ptp(allv) == 0:
        reason = "not testable - no variance"
        if enforced_note:
            reason += f"; {enforced_note}"
        result["omnibus"] = {"testable": False, "reason": reason, "significant": False, "p": None,
                             "constant_value": _f(allv[0])}
        result["pairs"] = []
        return result

    arrays = [np.asarray(groups[c], float) for c in present]
    k, N = len(arrays), int(allv.size)
    if result["all_normal"]:
        F, p = sps.f_oneway(*arrays)
        result["omnibus"] = {"testable": True, "test": "one-way ANOVA", "statistic_name": "F",
                             "statistic": _f(F), "df": [k - 1, N - k], "p": _f(p),
                             "significant": bool(p < ALPHA), "family": "parametric"}
        post = "Tukey HSD"
        th = sps.tukey_hsd(*arrays)
        pmat = {(present[i], present[j]): float(th.pvalue[i][j]) for i in range(k) for j in range(k)}
        effect_name = "Cohen's d"
    else:
        H, p = sps.kruskal(*arrays)
        result["omnibus"] = {"testable": True, "test": "Kruskal-Wallis", "statistic_name": "H",
                             "statistic": _f(H), "df": [k - 1], "p": _f(p),
                             "significant": bool(p < ALPHA), "family": "non-parametric"}
        post = "Dunn-Bonferroni"
        dm = sph.posthoc_dunn(arrays, p_adjust="bonferroni")
        pmat = {(present[i], present[j]): float(dm.iloc[i, j]) for i in range(k) for j in range(k)}
        effect_name = "rank-biserial r"

    pairs = []
    for a, b in combinations(present, 2):
        pa, pb = np.asarray(groups[a], float), np.asarray(groups[b], float)
        p_pair = pmat[(a, b)]
        if effect_name == "Cohen's d":
            eff = cohens_d(pa, pb)
            thr = D_THRESHOLD
            kind = "d"
        else:
            eff = rank_biserial(pa, pb)
            thr = R_THRESHOLD
            kind = "r"
        ma, mb = pa.mean(), pb.mean()
        if ma == mb:
            favours = None
        elif lower_is_better:
            favours = a if ma < mb else b
        else:
            favours = a if ma > mb else b
        significant = (p_pair is not None) and (not math.isnan(p_pair)) and p_pair < ALPHA
        practical = eff is not None and abs(eff) >= thr
        omni_sig = result["omnibus"]["significant"]
        if not omni_sig or not significant:
            verdict = "no significant difference"
            winner = None
        elif not practical:
            verdict = "statistically detectable but not practically meaningful"
            winner = None
        else:
            winner = favours
            verdict = f"{LABELS[winner]} outperforms {LABELS[b if winner == a else a]}"
        pairs.append({"a": a, "b": b, "test": post, "p": _f(p_pair),
                      "significant": bool(significant and omni_sig),
                      "posthoc_significant": bool(significant),
                      "effect": {"name": effect_name, "value": _f(eff), "threshold": thr,
                                 "magnitude": magnitude(kind, eff), "practical": bool(practical)},
                      "mean_a": _f(ma), "mean_b": _f(mb), "favours": favours,
                      "outperforms": winner, "verdict": verdict})
    result["posthoc_test"] = post
    result["effect_size"] = effect_name
    result["pairs"] = pairs
    return result


def outperforms(cmp, winner, loser):
    """Does `winner` outperform `loser` on this comparison (all three conditions)?"""
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

    # ── descriptives for every measure, both compliance definitions ──────────
    desc = {}
    for m in ["SU", "placed", "ET", "PM"]:
        desc[m] = {c: descriptives(v) for c, v in group_values(rows, m, configs).items()}
    for m in COMPLIANCE_KEYS:
        desc[m] = {d: {c: descriptives(v) for c, v in group_values(rows, f"{m}_{d}", configs).items()}
                   for d in COMPLIANCE_DEFS}
    out["descriptives"] = desc
    # Robustness = sd of SU across runs (per configuration; per instance too).
    out["robustness"] = {c: {"sd_su": desc["SU"][c]["sd"],
                             "per_instance": {str(i): _f(np.std(group_values(rows, "SU", [c], i)[c], ddof=1))
                                              if len(group_values(rows, "SU", [c], i)[c]) > 1 else None
                                              for i in instances}} for c in configs}

    # ── SP1 ──────────────────────────────────────────────────────────────────
    sp1 = compare_groups(group_values(rows, "SU", configs), "SU", configs)
    out["SP1"] = {"measure": "SU", "comparison": sp1,
                  "confound_note": ("Sequential's DGWO phase receives only part of the iteration budget: "
                                    f"{study.get('seq_budget_split', {}).get('dgwo_iters', '?')} of "
                                    f"{study.get('preset', {}).get('max_iter', '?')} iterations go to DGWO, the rest to the MOGWO phase, "
                                    "so its utilisation is not a like-for-like comparison with standalone DGWO.")}

    # ── SP2 ──────────────────────────────────────────────────────────────────
    sp2 = {"measures": list(COMPLIANCE_KEYS), "by_definition": {}}
    for d in COMPLIANCE_DEFS:
        per = {}
        for m in COMPLIANCE_KEYS:
            note = None
            if m in DECODER_ENFORCED and study.get(DECODER_ENFORCED[m], True):
                note = f"enforced by the decoder ({DECODER_ENFORCED[m]}=true)"
            per[m] = compare_groups(group_values(rows, f"{m}_{d}", configs), m, configs, enforced_note=note)
        raw = [per[m]["omnibus"]["p"] if per[m]["omnibus"].get("testable") else None for m in COMPLIANCE_KEYS]
        adj, fam = holm(raw)
        for m, pa in zip(COMPLIANCE_KEYS, adj):
            per[m]["omnibus"]["p_holm"] = _f(pa)
            per[m]["omnibus"]["significant_holm"] = bool(pa is not None and pa < ALPHA)
            per[m]["omnibus"]["holm_family_size"] = fam
        rejected = [m for m in COMPLIANCE_KEYS if per[m]["omnibus"]["significant_holm"]]
        sp2["by_definition"][d] = {
            "definition": d, "per_measure": per, "holm_family_size": fam,
            "significant_measures": rejected,
            "h0_rejected": len(rejected) > 0,
            "decision": ("H0 rejected: at least one Holm-corrected omnibus test is significant (" + ", ".join(rejected) + ")")
                        if rejected else ("H0 not rejected: no Holm-corrected omnibus test is significant"
                                          if fam else "H0 not testable: every compliance measure is constant"),
        }
    sp2["primary"] = sp2["by_definition"][PRIMARY_COMPLIANCE]
    sp2["h0_rejected"] = sp2["primary"]["h0_rejected"]
    sp2["decision"] = sp2["primary"]["decision"]
    out["SP2"] = sp2

    # ── SP3 ──────────────────────────────────────────────────────────────────
    if not timing_valid:
        out["SP3"] = {"available": False, "reason": "concurrent timing - not valid for SP3 (runs shared the CPU); rerun with --mode serial"}
    else:
        per = {m: compare_groups(group_values(rows, m, configs), m, configs, lower_is_better=True) for m in ("ET", "PM")}
        raw = [per[m]["omnibus"]["p"] if per[m]["omnibus"].get("testable") else None for m in ("ET", "PM")]
        adj, fam = holm(raw)
        for m, pa in zip(("ET", "PM"), adj):
            per[m]["omnibus"]["p_holm"] = _f(pa)
            per[m]["omnibus"]["significant_holm"] = bool(pa is not None and pa < ALPHA)
            per[m]["omnibus"]["holm_family_size"] = fam
        sp3 = {"available": True, "per_metric": per, "holm_family_size": fam}
        # per-BR-class profile (mean ET / PM per class per configuration)
        classes = {}
        for inst in study.get("instances", []):
            classes.setdefault(inst["br_class"], []).append(inst)
        prof = []
        for cls in sorted(classes, key=lambda s: int(''.join(ch for ch in s if ch.isdigit()) or 0)):
            ids = [i["instance_id"] for i in classes[cls]]
            entry = {"br_class": cls, "n_types": classes[cls][0].get("n_types"),
                     "instances": ids, "n_boxes": [i.get("n_boxes") for i in classes[cls]],
                     "mean_n_boxes": _f(np.mean([i.get("n_boxes") for i in classes[cls] if i.get("n_boxes") is not None])),
                     "per_configuration": {}}
            for c in configs:
                sub = [x for x in rows if x["configuration"] == c and x["instance_id"] in ids]
                entry["per_configuration"][c] = {"ET": descriptives([x["ET"] for x in sub]),
                                                 "PM": descriptives([x["PM"] for x in sub])}
            prof.append(entry)
        sp3["profiles"] = prof
        # Friedman with instances as blocks (per-instance mean over seeds)
        if n_inst < 2:
            sp3["friedman"] = {m: {"testable": False, "reason": "requires >= 2 instances"} for m in ("ET", "PM")}
        else:
            fr = {}
            for m in ("ET", "PM"):
                mat = np.array([[np.mean(group_values(rows, m, [c], i)[c]) for c in configs] for i in instances])
                fr[m] = friedman_block(mat, configs, lower_is_better=True)
            sp3["friedman"] = fr
        out["SP3"] = sp3

    # ── composite ────────────────────────────────────────────────────────────
    if not timing_valid:
        out["composite"] = {"available": False, "reason": "concurrent timing - the composite uses ET and PM; requires a serial study"}
    elif n_inst < 2:
        out["composite"] = {"available": False, "reason": "requires >= 2 instances (the overall ranking is tested across instances)"}
    else:
        out["composite"] = composite(rows, configs, instances)

    # ── outcome pattern ──────────────────────────────────────────────────────
    out["outcome"] = outcome_pattern(sp1, sp2["primary"]["per_measure"]["CSR"], configs)
    return out


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
        su = [np.mean(group_values(rows, "SU", [c], inst)[c]) for c in configs]
        csr = [np.mean(group_values(rows, csr_key, [c], inst)[c]) for c in configs]
        et = [np.mean(group_values(rows, "ET", [c], inst)[c]) for c in configs]
        pm = [np.mean(group_values(rows, "PM", [c], inst)[c]) for c in configs]
        rob = [float(np.std(group_values(rows, "SU", [c], inst)[c], ddof=1))
               if len(group_values(rows, "SU", [c], inst)[c]) > 1 else 0.0 for c in configs]
        cc = (_z(et) + _z(pm)) / 2.0
        su_n, csr_n, cc_n, rob_n = _minmax(su), _minmax(csr), _minmax(cc), _minmax(rob)
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
    # component means across instances (for the "out of 5" breakdown in the UI)
    comp = {c: {k: _f(np.mean([d["per_configuration"][c][k] for d in details]))
                for k in ("SU_n", "CSR_n", "CC_n", "Rob_n")} for c in configs}
    ranking = sorted(configs, key=lambda c: -mean_cs[c])
    rec = None
    if fr.get("significant"):
        rec = {"configuration": ranking[0], "label": LABELS[ranking[0]], "mean_cs": mean_cs[ranking[0]],
               "basis": "Friedman on the composite score is significant; the recommendation is the best mean CS"}
    return {"available": True, "formula": "CS = 0.25*SU~ + 0.25*CSR~ + 0.25*(1-CC~) + 0.25*(1-Rob~); ~ = min-max across the four configurations within an instance; CC = (z_ET + z_PM)/2; Rob = sd of SU across runs within the instance",
            "csr_definition": PRIMARY_COMPLIANCE, "n_instances": len(instances),
            "mean_cs": mean_cs, "sd_cs": sd_cs, "components": comp, "ranking": ranking,
            "per_instance": details, "friedman": fr, "recommendation": rec,
            "recommendation_note": None if rec else "no recommendation: the Friedman test on the composite score is not significant, so the ranking is not distinguishable from chance"}


def outcome_pattern(sp1, sp2_csr, configs):
    """Chapter 3 outcome pattern over the primary metrics: SU (SP1) and CSR over all boxes (SP2)."""
    metrics = {"SU": sp1, "CSR": sp2_csr}
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
    return {"pattern": pat, "description": text, "primary_metrics": ["SU", f"CSR ({PRIMARY_COMPLIANCE})"],
            "table": table}


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
    L.append(f"SP1 SU: normality all_normal={c['all_normal']}; " +
             (f"{o['test']} {o['statistic_name']}={o['statistic']} df={o['df']} p={o['p']} sig={o['significant']}" if o.get("testable") else o["reason"]))
    for pr in c["pairs"]:
        L.append(f"   {pr['a']} vs {pr['b']}: p={pr['p']} {pr['effect']['name']}={pr['effect']['value']} ({pr['effect']['magnitude']}) -> {pr['verdict']}")
    for d in COMPLIANCE_DEFS:
        blk = st["SP2"]["by_definition"][d]
        L.append(f"SP2 [{d}{' PRIMARY' if d == PRIMARY_COMPLIANCE else ''}]: {blk['decision']}")
        for m, cmp in blk["per_measure"].items():
            o = cmp["omnibus"]
            L.append(f"   {m}: " + (f"{o['test']} stat={o['statistic']} p={o['p']} p_holm={o['p_holm']} sig_holm={o['significant_holm']}" if o.get("testable") else o["reason"]))
            for pr in cmp["pairs"]:
                if pr["outperforms"] or pr["posthoc_significant"]:
                    L.append(f"      {pr['a']} vs {pr['b']}: p={pr['p']} eff={pr['effect']['value']} -> {pr['verdict']}")
    s3 = st["SP3"]
    if not s3.get("available"):
        L.append(f"SP3: {s3['reason']}")
    else:
        for m, cmp in s3["per_metric"].items():
            o = cmp["omnibus"]
            L.append(f"SP3 {m}: " + (f"{o['test']} stat={o['statistic']} p={o['p']} p_holm={o['p_holm']} sig_holm={o['significant_holm']}" if o.get("testable") else o["reason"]))
            fr = s3["friedman"][m]
            L.append(f"   Friedman: " + (f"chi2={fr['statistic']} p={fr['p']} sig={fr['significant']} mean_rank={fr['mean_rank']}" if fr.get("testable") else fr["reason"]))
    cs = st["composite"]
    if not cs.get("available"):
        L.append(f"composite: {cs['reason']}")
    else:
        fr = cs["friedman"]
        L.append(f"composite: mean CS {cs['mean_cs']}; Friedman " + (f"chi2={fr['statistic']} p={fr['p']} sig={fr['significant']}" if fr.get("testable") else fr["reason"]))
        L.append(f"   recommendation: {cs['recommendation'] or cs['recommendation_note']}")
    L.append(f"outcome pattern: {st['outcome']['pattern']} - {st['outcome']['description']}")
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
