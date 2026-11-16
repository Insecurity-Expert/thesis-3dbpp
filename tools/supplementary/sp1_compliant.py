"""
sp1_compliant.py - SP1 on compliant space utilisation (M-1b): programmer tasks 1-4
of the group's plan after the validator's comment.

No new optimisation runs. It takes the finished studies (thesis-run-v3) and the
per-run compliant SU already computed and checked (compliant_su.py,
compliant_check.py), puts compliant SU where raw SU was, and reruns the
unchanged stats.py procedures:

  1. the 18 planned REP comparisons, one Holm family across both studies, with
     SP1 now on compliant SU (SU, CSR, C3, C6 from the main study; ET, PM from the
     serial timing study);
  2. the SP1 omnibus test (RM-ANOVA or Friedman) on compliant SU;
  3. the six post hoc pairs with their own six-pair Holm correction (DGWO vs MOGWO,
     DGWO vs SEQ and MOGWO vs SEQ stay outside the planned family);
  4. robustness (M-5) = run-to-run SD of compliant SU per instance, and the
     composite score (SU term and Rob term on compliant SU) with Friedman and
     Nemenyi;

each for all 30 instances and for the 26 non-development instances (excluding
413, 147, 392, 454). The study files are only read, never written.

Usage (laptop, from C:\\thesis-3dbpp):
    python tools\\supplementary\\sp1_compliant.py
    python tools\\supplementary\\sp1_compliant.py --main <main.json> --timing <timing.json>
        --csv <compliant_su_per_run.csv> --out <folder>
"""
import argparse
import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT), str(ROOT / "optimizer"), str(ROOT / "experiments")]
import stats as S  # noqa: E402

DEV = {413, 147, 392, 454}
CONFIGS = ("DGWO", "MOGWO", "SEQ", "REP")
STUDIES = ROOT / "experiments" / "results" / "studies"
SU_TOL = 0.01          # raw SU in the CSV (4 decimals) vs the study's su_pct


def with_compliant_su(study, csv_path):
    """A copy of the study whose su_pct is the run's compliant SU (raw kept as
    su_raw_pct). The CSV lists the runs in study order (compliant_su.py walks
    study['runs']); every row is checked against its run before use."""
    with open(csv_path, encoding="utf-8-sig", newline="") as fh:
        rows = list(csv.DictReader(fh))
    runs = study["runs"]
    if len(rows) != len(runs):
        sys.exit(f"CSV has {len(rows)} rows but the study has {len(runs)} runs - wrong file?")
    new_runs = []
    for k, (r, x) in enumerate(zip(runs, rows)):
        if x["configuration"] != r["configuration"] or int(x["instance_id"]) != int(r["instance_id"]):
            sys.exit(f"row {k}: CSV has {x['configuration']} / {x['instance_id']}, "
                     f"study has {r['configuration']} / {r['instance_id']} - order mismatch")
        if abs(float(x["su"]) - r["su_pct"]) > SU_TOL:
            sys.exit(f"row {k}: CSV raw SU {x['su']} != study SU {r['su_pct']} - not the same study?")
        csu = float(x["compliant_su"])
        if csu > r["su_pct"] + SU_TOL:
            sys.exit(f"row {k}: compliant SU {csu} > raw SU {r['su_pct']}")
        nr = {key: val for key, val in r.items() if key not in ("placements", "orientations")}
        nr["su_raw_pct"], nr["su_pct"] = r["su_pct"], csu
        new_runs.append(nr)
    return {**study, "runs": new_runs}


def subset(study, keep):
    return {**study,
            "instances": [i for i in study["instances"] if i["instance_id"] in keep],
            "runs": [r for r in study["runs"] if r["instance_id"] in keep]}


def run_all(main, timing):
    st = S.analyse(main)
    st["planned_family_combined"] = S.combined_planned(main, timing)
    st["composite_combined"] = S.combined_composite(main, timing)
    return st


def report(title, st, n_inst):
    L = [f"=== {title} ({n_inst} instances) ===", ""]

    pf = st["planned_family_combined"]
    L.append("[Task 1] PLANNED FAMILY - 18 REP comparisons, one Holm family "
             "(SP1 = compliant SU; SU/CSR/C3/C6 main study, ET/PM serial timing study)")
    if not pf.get("available"):
        L.append(f"   NOT AVAILABLE: {pf['reason']}")
    else:
        L.append(f"   Holm across {pf['holm_family_size']} testable of {pf['planned_size']}")
        L.append(f"   {'SP':3s} {'measure':12s} {'vs':6s} {'REP mean':>10s} {'other':>10s} {'diff':>10s} "
                 f"{'test':22s} {'p raw':>11s} {'p Holm':>11s} {'effect':>9s}  verdict")
        for c in pf["comparisons"]:
            m = "compl. SU" if c["measure"] == "SU" else c["measure"]
            if not c.get("testable"):
                L.append(f"   {c['sp']:3s} {m:12s} {c['other']:6s} {c['verdict']}")
                continue
            L.append(f"   {c['sp']:3s} {m:12s} {c['other']:6s} {c['mean_reference']:>10.4g} {c['mean_other']:>10.4g} "
                     f"{c['mean_difference']:>10.4g} {c['test']:22s} {c['p_raw']:>11.4g} {c['p_holm']:>11.4g} "
                     f"{('d_z ' if c['effect']['name'] == 'd_z' else 'r ') + format(c['effect']['value'], '.3f'):>9s}  "
                     f"{c['verdict']}")
        for sp, d in pf["decisions"].items():
            dec = d["decision"].replace("SU vs", "compliant SU vs") if sp in ("SP1", "SP4") else d["decision"]
            L.append(f"   {sp}: {dec}")
        L.append(f"   outcome (REP): {pf['outcome']['pattern'] or '-'} - {pf['outcome']['description']}")
    L.append("")

    cmp = st["SP1"]["comparison"]
    om = cmp["omnibus"]
    L.append("[Task 2] OMNIBUS on compliant SU (four configurations, instances as subjects)")
    L.append("   instance means: " + ", ".join(f"{k} {v:.4g}" for k, v in cmp.get("instance_means", {}).items()))
    L.append(f"   normality of within-instance differences: all normal = {cmp.get('normality', {}).get('all_normal')}")
    extra = ""
    for k in ("sphericity", "mauchly", "epsilon", "correction"):
        if k in om:
            extra += f" {k}={om[k]}"
    L.append(f"   {om.get('test')}: statistic={om.get('statistic')} df={om.get('df')} p={om.get('p')} "
             f"significant={om.get('significant')}{extra}")
    L.append("")

    L.append("[Task 3] POST HOC PAIRS on compliant SU - six-pair Holm (outside the planned family; "
             "REP rows are descriptive here, the planned family above decides H0)")
    for p in cmp.get("pairs", []):
        L.append(f"   {p['a']:5s} vs {p['b']:5s}: {p['test']} p raw={p['p_raw']} p Holm(6)={p['p']} "
                 f"{p['effect']['name']}={p['effect']['value']} ({p['effect']['magnitude']}) -> {p['verdict']}")
    L.append("")

    L.append("[Task 4a] ROBUSTNESS (M-5) = run-to-run SD of compliant SU within an instance, mean over instances")
    for c in CONFIGS:
        rb = st["robustness"].get(c)
        if rb:
            L.append(f"   {c:5s}: mean SD {rb['sd_su']:.4f}   max SD {rb['max_sd']:.4f}")
    L.append("")

    cc = st["composite_combined"]
    L.append("[Task 4b] COMPOSITE SCORE (SU term = compliant SU, Rob = SD of compliant SU; "
             "ET/PM from the serial timing study)")
    if not cc.get("available"):
        L.append(f"   NOT AVAILABLE: {cc['reason']}")
    else:
        L.append("   mean CS: " + ", ".join(f"{c} {cc['mean_cs'][c]:.4f} (SD {cc['sd_cs'][c]:.4f})" for c in cc["ranking"]))
        L.append("   mean normalised terms: " + "; ".join(
            f"{c} SU~{v['SU_n']:.3f} CSR~{v['CSR_n']:.3f} CC~{v['CC_n']:.3f} Rob~{v['Rob_n']:.3f}"
            for c, v in cc["components"].items()))
        fr = cc["friedman"]
        if fr.get("testable"):
            L.append(f"   Friedman: chi2={fr['statistic']} df={fr['df']} p={fr['p']} significant={fr['significant']}")
            L.append("   mean rank (1 = best): " + ", ".join(f"{c} {v}" for c, v in fr["mean_rank"].items()))
            for p in fr.get("posthoc", {}).get("pairs", []):
                L.append(f"   Nemenyi {p['a']:5s} vs {p['b']:5s}: p={p['p']} significant={p['significant']}"
                         + (f" (favours {p['favours']})" if p["significant"] and p["favours"] else ""))
        else:
            L.append(f"   Friedman not testable: {fr.get('reason')}")
        L.append("   note: legality now enters the composite twice (compliant SU and CSR).")
    L.append("")
    return L


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--main", default=str(STUDIES / "thesis_main_v3.json"))
    ap.add_argument("--timing", default=str(STUDIES / "thesis_timing_v3.json"))
    ap.add_argument("--csv", default=r"C:\thesis-tools\export\compliant_su_per_run.csv")
    ap.add_argument("--out", default=r"C:\thesis-tools\export")
    a = ap.parse_args()

    main_study = json.loads(Path(a.main).read_text(encoding="utf-8"))
    timing = json.loads(Path(a.timing).read_text(encoding="utf-8"))
    for name, s in (("--main", main_study), ("--timing", timing)):
        if s.get("stackr_study") != 1:
            sys.exit(f"{name}: not a study file")
    q = with_compliant_su(main_study, a.csv)
    S.MEASURE_LABELS["SU"] = "compliant space utilisation (%)"

    all_inst = {i["instance_id"] for i in q["instances"]}
    keep26 = all_inst - DEV
    results = {"all": run_all(q, timing),
               "non_development": run_all(subset(q, keep26), subset(timing, keep26))}

    L = ["SP1 ON COMPLIANT SPACE UTILISATION (M-1b) - validator plan, programmer tasks 1-4",
         f"main study: {Path(a.main).name}   timing study: {Path(a.timing).name}   compliant SU: {Path(a.csv).name}",
         f"commit of the main study: {main_study.get('commit') or (main_study.get('git') or {}).get('commit_start')}",
         "Compliant SU = volume of loaded boxes satisfying C3-C6, % of the container. Adopted for SP1 after the "
         "initial results were reviewed (disclosed in Ch. 1 and Ch. 3).",
         "Raw SU is descriptive only and is not tested here. Every other measure is unchanged from stats_v3_final.txt.",
         ""]
    L += report("ALL INSTANCES", results["all"], len(all_inst))
    L += report("SENSITIVITY: 26 non-development instances (excl. 413, 147, 392, 454)",
                results["non_development"], len(keep26))

    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    txt = out / "stats_sp1_compliant.txt"
    txt.write_text("\n".join(L) + "\n", encoding="utf-8")
    (out / "stats_sp1_compliant.json").write_text(json.dumps(results, indent=1, default=str), encoding="utf-8")
    print("\n".join(L))
    print(f"written {txt} and {out / 'stats_sp1_compliant.json'}")


if __name__ == "__main__":
    main()
