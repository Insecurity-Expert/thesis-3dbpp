"""Chapter 3 "Statistical Treatment" applied to one study results file.

    python experiments/stats.py experiments/results/studies/<study>.json        # attach stats in place
    python experiments/stats.py <study>.json --print                             # also print a summary

Input: a study file written by experiments/study.py (one row per run with the
configuration, instance, seed, SU, placed, n_items, CSR and C3-C6 over placed
boxes, M-3 execution time and M-4 peak memory).

Design (Chapter 3, Statistical Treatment): REPEATED MEASURES. The unit of
analysis is the mean of each measure over an instance's runs; the four
configurations are treatments and every instance is a block. Nothing is ever
reported as NaN - an untestable case says why.

* Compliance BOTH ways for CSR and each of C3-C6: over placed boxes (as the
  evaluator reports it) and over ALL boxes, rate_placed x placed / n_items,
  i.e. an unplaced box counts as non-compliant. The manuscript's locked
  definition is all boxes (PRIMARY_COMPLIANCE); formal tests use it, the
  placed-box basis is descriptive.
* Descriptives per configuration and measure over the run-level values:
  mean, median, sd, min, max, n.
* Normality: Shapiro-Wilk (alpha 0.05) on the within-instance differences of
  every configuration pair. All normal -> repeated-measures ANOVA with
  Mauchly's test and the Greenhouse-Geisser correction where sphericity is
  violated, post-hoc paired t-tests, Cohen's d_z (ES-1), partial eta squared.
  Otherwise -> Friedman, post-hoc Wilcoxon signed-rank, matched-pairs
  rank-biserial r = (W+ - W-) / (W+ + W-) (ES-2, Kerby 2014), Kendall's W.
  Post-hoc p-values are Holm-Bonferroni corrected within the measure.
* SP1 (SU): the omnibus above, two-tailed, alpha = 0.05.
* SP2 (CSR, C3, C4, C5, C6, all-box basis): the omnibus per measure,
  Holm-Bonferroni across the testable omnibus p-values; H0 is rejected iff at
  least one Holm-corrected omnibus test is significant.
* SP3 (ET, PM; serial timing only): BR class is a stratification variable.
  Within each class, Friedman on ET and on PM (instances as blocks), Holm
  across the two metrics, Wilcoxon post-hocs; per-class descriptive profiles.
  No Configuration x Class interaction is tested.
* Robustness (M-5): sd of SU across an instance's runs, mean and max over
  instances; the SP1 procedure is applied to it as a descriptive check.
* Composite (serial timing, >= 2 instances): CS = 0.25 SU~ + 0.25 CSR~ +
  0.25 (1 - CC~) + 0.25 (1 - Rob~), ~ = min-max across the four configurations
  within an instance, CC = (z_ET + z_PM) / 2. Friedman on instances x 4,
  Nemenyi if significant. A recommendation exists only when Friedman is
  significant.
* Outperformance per pair per metric needs ALL of: a significant omnibus, a
  significant Holm-corrected post-hoc, |d_z| >= 0.5 or |r| >= 0.3, and the
  direction favouring that configuration. Significant but below threshold is
  "statistically detectable but not practically meaningful".
* Outcome pattern (Chapter 3): A both hybrids outperform both baselines on the
  primary metrics, B exactly one does, C neither does, D mixed / trade-off.

Edge cases: fewer than 2 instances -> no repeated-measures test ("requires >=
2 instances"); a measure identical across configurations in every instance ->
"not testable - no variance"; a constant pairwise difference or fewer than 3
instances -> Shapiro-Wilk not applicable, treated as non-normal; concurrent
timing refuses SP3 and the composite altogether.

scipy + pingouin + scikit-posthocs.
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
try:
    import pingouin as pg
except ImportError:          # pragma: no cover - required by Chapter 3
    pg = None

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

D_THRESHOLD = 0.5       # Cohen's d_z practical threshold (ES-1)
R_THRESHOLD = 0.3       # matched-pairs rank-biserial r practical threshold (ES-2)


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


# ─── the core: one measure, four configurations, instances as blocks ─────────
def describe(vals):
    v = np.asarray(vals, float)
    if v.size == 0:
        return {"n": 0, "mean": None, "median": None, "sd": None, "min": None, "max": None}
    return {"n": int(v.size), "mean": _f(v.mean()), "median": _f(np.median(v)),
            "sd": _f(v.std(ddof=1)) if v.size > 1 else None, "min": _f(v.min()), "max": _f(v.max())}


def shapiro_differences(mat, configs):
    """Shapiro-Wilk on the within-instance differences of every pair."""
    N = mat.shape[0]
    out = {}
    for i, j in combinations(range(len(configs)), 2):
        key = f"{configs[i]}-{configs[j]}"
        d = mat[:, i] - mat[:, j]
        if N < 3:
            out[key] = {"a": configs[i], "b": configs[j], "applicable": False, "normal": False,
                        "reason": "fewer than 3 instances"}
        elif np.ptp(d) == 0:
            out[key] = {"a": configs[i], "b": configs[j], "applicable": False, "normal": False,
                        "reason": "constant difference"}
        else:
            W, p = sps.shapiro(d)
            out[key] = {"a": configs[i], "b": configs[j], "applicable": True, "W": _f(W), "p": _f(p),
                        "normal": bool(p >= ALPHA)}
    return out


def rank_biserial(x, y):
    """ES-2: (W+ - W-) / (W+ + W-) over the non-zero paired differences (Kerby, 2014)."""
    d = np.asarray(x, float) - np.asarray(y, float)
    d = d[d != 0]
    if d.size == 0:
        return 0.0
    ranks = sps.rankdata(np.abs(d))
    wp, wm = ranks[d > 0].sum(), ranks[d < 0].sum()
    return float((wp - wm) / (wp + wm))


def cohens_dz(x, y):
    """ES-1: mean of the within-instance differences / their sd."""
    d = np.asarray(x, float) - np.asarray(y, float)
    sd = d.std(ddof=1) if d.size > 1 else 0.0
    if sd == 0:
        return 0.0
    return float(d.mean() / sd)


def _rm_anova(mat):
    """Repeated-measures ANOVA with Mauchly and Greenhouse-Geisser (pingouin)."""
    N, k = mat.shape
    import pandas as pd
    long = pd.DataFrame({"subject": np.repeat(np.arange(N), k), "cfg": np.tile(np.arange(k), N),
                         "y": mat.reshape(-1)})
    t = pg.rm_anova(data=long, dv="y", within="cfg", subject="subject", correction=True, detailed=True)
    row, err = t.iloc[0], t.iloc[1]
    F = float(row["F"])
    df1, df2 = int(row["DF"]), int(err["DF"])
    p_unc = float(row["p_unc"])
    # Chapter 3 reports partial eta squared: SS_effect / (SS_effect + SS_error)
    np2 = float(row["SS"]) / (float(row["SS"]) + float(err["SS"]))
    sphericity_ok = bool(row["sphericity"]) if row.get("sphericity") == row.get("sphericity") else True
    p_gg = row.get("p_GG_corr")
    p_gg = float(p_gg) if p_gg == p_gg and p_gg is not None else None
    eps = row.get("eps")
    eps = float(eps) if eps == eps and eps is not None else None
    spher = {"W_spher": row.get("W_spher"), "p_spher": row.get("p_spher")}
    p_used = p_unc if (sphericity_ok or p_gg is None) else p_gg
    return {"F": F, "df": [df1, df2], "p": p_used, "p_uncorrected": p_unc, "partial_eta_sq": np2,
            "sphericity": {"test": "Mauchly", "W": _f(spher.get("W_spher")), "p": _f(spher.get("p_spher")),
                           "assumed": sphericity_ok, "greenhouse_geisser_epsilon": _f(eps),
                           "corrected": not sphericity_ok and p_gg is not None,
                           "df_corrected": ([_f(df1 * eps), _f(df2 * eps)] if (not sphericity_ok and eps) else None)}}


def compare_rm(mat, configs, measure, lower_is_better=False, enforced_note=None, force_nonparametric=False):
    """mat: instances x configurations of instance-level means.

    Shapiro-Wilk on the pairwise within-instance differences picks the branch:
    RM-ANOVA + paired t + d_z, or Friedman + Wilcoxon + matched-pairs r.
    force_nonparametric selects the Friedman branch directly (SP3, Chapter 3)."""
    N, k = mat.shape
    result = {"measure": measure, "label": MEASURE_LABELS.get(measure, measure),
              "lower_is_better": lower_is_better, "n_blocks": int(N),
              "descriptives": {c: describe(mat[:, j]) for j, c in enumerate(configs)}}
    if N < 2:
        result.update(normality={}, all_normal=False, pairs=[],
                      omnibus={"testable": False, "reason": "requires >= 2 instances (repeated-measures design: instances are the blocks)",
                               "significant": False, "p": None})
        return result
    if np.all(np.ptp(mat, axis=1) == 0):
        reason = "not testable - no variance across configurations"
        if enforced_note:
            reason += f"; {enforced_note}"
        result.update(normality={}, all_normal=False, pairs=[],
                      omnibus={"testable": False, "reason": reason, "significant": False, "p": None})
        return result

    norm = shapiro_differences(mat, configs)
    all_normal = bool(norm) and all(n["normal"] for n in norm.values())
    parametric = all_normal and not force_nonparametric and pg is not None
    result["normality"] = norm
    result["normality_basis"] = "within-instance differences of each configuration pair"
    result["all_normal"] = all_normal

    omni = None
    if parametric:
        try:
            r = _rm_anova(mat)
            omni = {"testable": True, "test": "Repeated-measures ANOVA", "statistic_name": "F",
                    "statistic": _f(r["F"]), "df": r["df"], "p": _f(r["p"]),
                    "p_uncorrected": _f(r["p_uncorrected"]), "significant": bool(r["p"] < ALPHA),
                    "effect_size": "partial eta squared", "effect_value": _f(r["partial_eta_sq"]),
                    "sphericity": r["sphericity"]}
        except Exception as e:                     # degenerate design -> rank-based route
            parametric = False
            result["parametric_fallback"] = f"repeated-measures ANOVA failed ({e}); Friedman used"
    if not parametric:
        chi, p = sps.friedmanchisquare(*[mat[:, j] for j in range(k)])
        W = chi / (N * (k - 1))
        omni = {"testable": True, "test": "Friedman", "statistic_name": "chi2",
                "statistic": _f(chi), "df": [k - 1], "p": _f(p), "significant": bool(p < ALPHA),
                "effect_size": "Kendall's W", "effect_value": _f(W)}
        if force_nonparametric:
            omni["route_note"] = "Friedman within the BR class (Chapter 3, SP3)"
    result["omnibus"] = omni

    eff_name = "Cohen's d_z" if parametric else "matched-pairs r"
    threshold = D_THRESHOLD if parametric else R_THRESHOLD
    pair_idx = list(combinations(range(k), 2))
    raw = []
    for i, j in pair_idx:
        x, y = mat[:, i], mat[:, j]
        if np.all(x - y == 0):
            raw.append(1.0)
            continue
        if parametric:
            raw.append(float(sps.ttest_rel(x, y).pvalue))
        else:
            try:
                raw.append(float(sps.wilcoxon(x, y, zero_method="wilcox").pvalue))
            except ValueError:
                raw.append(1.0)
    adj, _ = holm(raw)
    pairs = []
    for (i, j), p_raw, p_adj in zip(pair_idx, raw, adj):
        a, b = configs[i], configs[j]
        x, y = mat[:, i], mat[:, j]
        eff = cohens_dz(x, y) if parametric else rank_biserial(x, y)
        ma, mb = float(x.mean()), float(y.mean())
        if ma == mb:
            favours = None
        elif lower_is_better:
            favours = a if ma < mb else b
        else:
            favours = a if ma > mb else b
        post_sig = p_adj is not None and p_adj < ALPHA
        practical = abs(eff) >= threshold
        if not omni["significant"] or not post_sig:
            verdict, winner = "no significant difference", None
        elif not practical:
            verdict, winner = "statistically detectable but not practically meaningful", None
        else:
            winner = favours
            verdict = f"{LABELS[winner]} outperforms {LABELS[b if winner == a else a]}"
        pairs.append({"a": a, "b": b, "test": "paired t-test" if parametric else "Wilcoxon signed-rank",
                      "p_raw": _f(p_raw), "p": _f(p_adj), "correction": "Holm-Bonferroni",
                      "significant": bool(post_sig and omni["significant"]), "posthoc_significant": bool(post_sig),
                      "effect": {"name": eff_name, "value": _f(eff), "threshold": threshold,
                                 "magnitude": magnitude("d" if parametric else "r", eff), "practical": bool(practical)},
                      "mean_a": _f(ma), "mean_b": _f(mb), "mean_difference": _f(ma - mb), "favours": favours,
                      "outperforms": winner, "verdict": verdict})
    result["posthoc_test"] = "paired t-test" if parametric else "Wilcoxon signed-rank"
    result["effect_size"] = eff_name
    result["pairs"] = pairs
    return result


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
        mat = np.zeros((n_inst, len(configs)))
        for i_idx, inst in enumerate(instances):
            for j_idx, c in enumerate(configs):
                vals = [x[measure] for x in rows if x["configuration"] == c and x["instance_id"] == inst]
                mat[i_idx, j_idx] = np.mean(vals) if vals else 0.0
        return mat

    # ── descriptives over run-level values (Stage 3) ────────────────────────
    desc = {m: {c: describe([x[m] for x in rows if x["configuration"] == c]) for c in configs}
            for m in ("SU", "placed", "ET", "PM")}
    for m in COMPLIANCE_KEYS:
        desc[m] = {d: {c: describe([x[f"{m}_{d}"] for x in rows if x["configuration"] == c]) for c in configs}
                   for d in COMPLIANCE_DEFS}
    out["descriptives"] = desc

    # ── robustness (M-5): sd of SU across an instance's runs ────────────────
    rob_mat = np.zeros((n_inst, len(configs)))
    out["robustness"] = {}
    for j_idx, c in enumerate(configs):
        sds = []
        for i_idx, inst in enumerate(instances):
            vals = [x["SU"] for x in rows if x["configuration"] == c and x["instance_id"] == inst]
            sd = float(np.std(vals, ddof=1)) if len(vals) > 1 else 0.0
            sds.append(sd)
            rob_mat[i_idx, j_idx] = sd
        out["robustness"][c] = {"mean_sd": _f(np.mean(sds)) if sds else None,
                                "sd_of_sd": _f(np.std(sds, ddof=1)) if len(sds) > 1 else None,
                                "max_sd": _f(np.max(sds)) if sds else None,
                                "per_instance": {str(inst): _f(sd) for inst, sd in zip(instances, sds)}}
    out["robustness_check"] = compare_rm(rob_mat, configs, "Rob", lower_is_better=True)
    out["robustness_check"]["note"] = "descriptive check (Table 4); no research question"

    # ── SP1 ──────────────────────────────────────────────────────────────────
    sp1 = compare_rm(get_mat("SU"), configs, "SU")
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
            if d == "all_boxes":
                per[m] = compare_rm(get_mat(f"{m}_{d}"), configs, m, enforced_note=note)
            else:
                per[m] = {"measure": m, "label": MEASURE_LABELS.get(m, m), "note": "output descriptively only (RM testing is on all_boxes)"}
        if d == "all_boxes":
            raw = [per[m]["omnibus"]["p"] if per[m]["omnibus"].get("testable") else None for m in COMPLIANCE_KEYS]
            adj, fam = holm(raw)
            for m, pa in zip(COMPLIANCE_KEYS, adj):
                per[m]["omnibus"]["p_holm"] = _f(pa)
                per[m]["omnibus"]["significant_holm"] = bool(pa is not None and pa < ALPHA)
                per[m]["omnibus"]["holm_family_size"] = fam
            rejected = [m for m in COMPLIANCE_KEYS if per[m]["omnibus"]["significant_holm"]]
            decision = ("H0 rejected: at least one Holm-corrected omnibus test is significant (" + ", ".join(rejected) + ")") if rejected else ("H0 not rejected: no Holm-corrected omnibus test is significant" if fam else "H0 not testable: every compliance measure is constant")
        else:
            fam, rejected, decision = 0, [], "descriptive only"
        sp2["by_definition"][d] = {"definition": d, "per_measure": per, "holm_family_size": fam, "significant_measures": rejected, "h0_rejected": len(rejected) > 0, "decision": decision}
    sp2["primary"] = sp2["by_definition"][PRIMARY_COMPLIANCE]
    sp2["h0_rejected"] = sp2["primary"]["h0_rejected"]
    sp2["decision"] = sp2["primary"]["decision"]
    out["SP2"] = sp2

    # ── SP3: Friedman within each BR class, Holm across ET and PM ────────────
    if not timing_valid:
        out["SP3"] = {"available": False, "reason": "concurrent timing - not valid for SP3 (runs shared the CPU); rerun with --mode serial"}
    else:
        classes = {}
        for inst in study.get("instances", []):
            classes.setdefault(inst["br_class"], []).append(inst)
        prof = []
        for cls in sorted(classes, key=lambda s_: int(''.join(ch for ch in s_ if ch.isdigit()) or 0)):
            insts = classes[cls]
            ids = [i["instance_id"] for i in insts]
            nb = [i.get("n_boxes") for i in insts if i.get("n_boxes") is not None]
            entry = {"br_class": cls, "n_types": insts[0].get("n_types"), "instances": ids,
                     "n_instances": len(ids), "n_boxes": [i.get("n_boxes") for i in insts],
                     "mean_n_boxes": _f(np.mean(nb)) if nb else None,
                     "per_configuration": {c: {m: describe([x[m] for x in rows if x["configuration"] == c and x["instance_id"] in ids])
                                               for m in ("ET", "PM")} for c in configs}}
            per = {}
            for m in ("ET", "PM"):
                mat = np.zeros((len(ids), len(configs)))
                for i_idx, inst_id in enumerate(ids):
                    for j_idx, c in enumerate(configs):
                        vals = [x[m] for x in rows if x["configuration"] == c and x["instance_id"] == inst_id]
                        mat[i_idx, j_idx] = np.mean(vals) if vals else 0.0
                per[m] = compare_rm(mat, configs, m, lower_is_better=True, force_nonparametric=True)
            raw = [per[m]["omnibus"]["p"] if per[m]["omnibus"].get("testable") else None for m in ("ET", "PM")]
            adj, fam = holm(raw)
            for m, pa in zip(("ET", "PM"), adj):
                per[m]["omnibus"]["p_holm"] = _f(pa)
                per[m]["omnibus"]["significant_holm"] = bool(pa is not None and pa < ALPHA)
                per[m]["omnibus"]["holm_family_size"] = fam
                # post-hocs only read as significant when the Holm-corrected omnibus is
                if not per[m]["omnibus"]["significant_holm"]:
                    for pr in per[m]["pairs"]:
                        pr["significant"], pr["outperforms"] = False, None
                        pr["verdict"] = "no significant difference"
            entry["tests"] = per
            prof.append(entry)
        out["SP3"] = {"available": True, "design": "Friedman within each BR class (instances as blocks), Holm across ET and PM; no Configuration x Class interaction is tested",
                      "power_note": "each class rests on only a few instance-level aggregates; per-class results are exploratory",
                      "profiles": prof}

    # ── composite ────────────────────────────────────────────────────────────
    if n_inst < 2:
        out["composite"] = {"available": False, "reason": "requires >= 2 instances (the overall ranking is tested across instances)"}
    elif not timing_valid:
        out["composite"] = {"available": False, "reason": "concurrent timing - the composite uses ET and PM; requires a serial study"}
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
    L.append(f"SP1 SU: " +
             (f"{o['test']} {o['statistic_name']}={o['statistic']} df={o['df']} p={o['p']} sig={o['significant']}" if o.get("testable") else o["reason"]))
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
            L.append(f"SP3 {p['br_class']}:")
            if "tests" in p:
                for m in ("ET", "PM"):
                    cmp = p["tests"][m]
                    o = cmp["omnibus"]
                    L.append(f"   {m}: " + (f"{o['test']} stat={o['statistic']} p={o['p']} p_holm={o['p_holm']} sig_holm={o['significant_holm']}" if o.get("testable") else o["reason"]))
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
