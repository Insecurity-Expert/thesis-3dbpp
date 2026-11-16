"""
task7_baselines.py - validator plan, optional task 7.

(a) Compliant SU for the two non-search baselines (Weight-Sorted Greedy, Random
    Order). The study stores only their scores, not their arrangements, but both
    are deterministic: Greedy is one pass in a fixed order, and Random Order uses
    numpy default_rng([random_seed, instance_id]) per instance. This script rebuilds
    every arrangement with experiments/baselines.py itself, checks that SU, CSR and
    boxes placed reproduce the stored values exactly, and then counts the volume of
    loaded boxes satisfying C3-C6 (the same per_box_constraints rule as
    compliant_su.py). Descriptive only, no tests.

(b) Scatter plot, one point per instance and configuration: compliant SU (y)
    against all-box CSR (x), for DGWO, MOGWO, SEQ, REP and the two baselines.

Usage (laptop, from C:\\thesis-3dbpp):
    python tools\\supplementary\\task7_baselines.py
Outputs in C:\\thesis-tools\\export (change with --out):
    task7_baselines.txt, task7_points.csv, task7_scatter.png, task7_scatter.pdf
"""
import argparse
import csv
import statistics as st
import sys
from collections import defaultdict
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT), str(ROOT / "optimizer"), str(ROOT / "experiments")]

import numpy as np  # noqa: E402
from preprocessing.pipeline import load_augmented_instance  # noqa: E402
from thesis_metrics import per_box_constraints  # noqa: E402
from baselines import pack  # noqa: E402

CONFIGS = ("DGWO", "MOGWO", "SEQ", "REP")
BASES = ("Greedy", "Random")
LABEL = {"DGWO": "DGWO", "MOGWO": "MOGWO", "SEQ": "Sequential", "REP": "Repair-based",
         "Greedy": "Weight-Sorted Greedy", "Random": "Random Order (mean of 30)"}
STUDIES = ROOT / "experiments" / "results" / "studies"
TOL = 1e-3     # stored baseline values are rounded to 4 decimals


def compliant_su(r, boxes, vol):
    P = {int(k): v for k, v in r["placements"].items()}
    O = {int(k): v for k, v in r["orientations"].items()}
    ok = [k for k, x in per_box_constraints(P, boxes, O).items() if x["C3"] and x["C4"] and x["C5"] and x["C6"]]
    return 100.0 * sum(P[k][3] * P[k][4] * P[k][5] for k in ok) / vol


def same(r, stored):
    csr_all = r["csr_pct"] * r["placed"] / r["n_items"] if r["n_items"] else 0.0
    return (abs(r["su_pct"] - stored["su_pct"]) <= TOL and abs(r["csr_pct"] - stored["csr_pct"]) <= TOL
            and abs(csr_all - stored["csr_all_pct"]) <= TOL and r["placed"] == stored["placed"])


def rebuild(study, raw_dir, log):
    """Per instance: Greedy and the 30 Random Order draws, rebuilt and checked."""
    b = study["baselines"]
    es, ef, n_random, seed = b["enforce_support"], b["enforce_fragility"], b["n_random"], b["random_seed"]
    out, mismatches = {}, 0
    for row in b["per_instance"]:
        iid = row["instance_id"]
        inst = load_augmented_instance({"data": {"raw_dir": raw_dir}}, instance_id=iid,
                                       stop_seed=study["stop_seed"], stop_count=study["stop_count"])
        boxes, C = inst["boxes"], inst["container"]
        vol = C["L"] * C["W"] * C["H"]
        idx = list(range(len(boxes)))
        g = pack(sorted(idx, key=lambda i: -boxes[i]["mass"]), boxes, C, es, ef)
        rng = np.random.default_rng([seed, iid])
        draws = [pack(rng.permutation(len(boxes)).tolist(), boxes, C, es, ef) for _ in range(n_random)]
        bad = (not same(g, row["weight_sorted"])) + sum(not same(d, s) for d, s in zip(draws, row["random_order"]))
        mismatches += bad
        out[iid] = {
            "Greedy": {"su": g["su_pct"], "csu": compliant_su(g, boxes, vol),
                       "csr_all": row["weight_sorted"]["csr_all_pct"]},
            "Random": {"su": st.mean(d["su_pct"] for d in draws),
                       "csu": st.mean(compliant_su(d, boxes, vol) for d in draws),
                       "csr_all": st.mean(s["csr_all_pct"] for s in row["random_order"])},
        }
        log(f"instance {iid}: greedy compliant SU {out[iid]['Greedy']['csu']:.2f}, random mean "
            f"{out[iid]['Random']['csu']:.2f}" + (f"   ** {bad} arrangement(s) did not reproduce **" if bad else ""))
    return out, mismatches


def gwo_points(study, csv_path):
    """Per instance and configuration: mean compliant SU (CSV) and mean all-box CSR (study)."""
    csu, csr, su = defaultdict(list), defaultdict(list), defaultdict(list)
    with open(csv_path, encoding="utf-8-sig", newline="") as fh:
        for x in csv.DictReader(fh):
            csu[(x["configuration"], int(x["instance_id"]))].append(float(x["compliant_su"]))
    for r in study["runs"]:
        k = (r["configuration"], int(r["instance_id"]))
        csr[k].append(r["csr_pct"] * r["placed"] / r["n_items"] if r["n_items"] else 0.0)
        su[k].append(r["su_pct"])
    return {k: {"su": st.mean(su[k]), "csu": st.mean(csu[k]), "csr_all": st.mean(csr[k])} for k in csr}


def plot(points, out):
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        return "matplotlib not installed - plot skipped (pip install matplotlib), points are in task7_points.csv"
    # categorical slots in fixed order; marker shape as second encoding (print / colour-blind)
    style = {"DGWO": ("#2a78d6", "o"), "MOGWO": ("#eb6834", "s"), "SEQ": ("#1baf7a", "^"),
             "REP": ("#eda100", "D"), "Greedy": ("#e87ba4", "v"), "Random": ("#008300", "P")}
    fig, ax = plt.subplots(figsize=(7.0, 5.2), dpi=200)
    for c in CONFIGS + BASES:
        xs = [p["csr_all"] for (cc, _), p in points.items() if cc == c]
        ys = [p["csu"] for (cc, _), p in points.items() if cc == c]
        col, mk = style[c]
        ax.scatter(xs, ys, s=30, marker=mk, color=col, edgecolor="white", linewidth=0.6, alpha=0.9,
                   label=LABEL[c], zorder=3)
    ax.set_xlabel("Constraint satisfaction rate, all-box basis (%)")
    ax.set_ylabel("Compliant space utilisation (%)")
    ax.set_title("Compliant SU vs all-box CSR, per instance (mean over runs)", fontsize=10)
    ax.grid(True, color="#e4e3df", linewidth=0.6, zorder=0)
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    ax.legend(frameon=False, fontsize=8, loc="best")
    fig.tight_layout()
    fig.savefig(out / "task7_scatter.png")
    fig.savefig(out / "task7_scatter.pdf")
    plt.close(fig)
    return f"written {out / 'task7_scatter.png'} and .pdf"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--main", default=str(STUDIES / "thesis_main_v3.json"))
    ap.add_argument("--csv", default=r"C:\thesis-tools\export\compliant_su_per_run.csv")
    ap.add_argument("--raw-dir", default=str(ROOT / "data" / "raw"))
    ap.add_argument("--out", default=r"C:\thesis-tools\export")
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)

    study = json.loads(Path(a.main).read_text(encoding="utf-8"))
    if not study.get("baselines"):
        sys.exit("the study has no baselines section")
    base, mismatches = rebuild(study, a.raw_dir, print)
    points = gwo_points(study, a.csv)
    for iid, d in base.items():
        for c in BASES:
            points[(c, iid)] = d[c]

    n_arr = sum(1 + len(r["random_order"]) for r in study["baselines"]["per_instance"])
    L = ["TASK 7 (optional, descriptive): compliant SU of the non-search baselines",
         f"study: {Path(a.main).name}; baseline arrangements rebuilt with experiments/baselines.py",
         f"reproduction check: {n_arr - mismatches} of {n_arr} arrangements reproduce the stored SU, CSR and boxes placed"
         + ("" if not mismatches else "   ** MISMATCH - do not use these numbers **"),
         "", f"Mean over the {len(base)} instances (each instance: mean over its runs / draws)",
         f"{'configuration':28s} {'raw SU':>8s} {'compliant SU':>13s} {'illegal vol.':>13s} {'all-box CSR':>12s}"]
    for c in CONFIGS + BASES:
        ps = [p for (cc, _), p in points.items() if cc == c]
        su_, csu_, csr_ = (st.mean(p[k] for p in ps) for k in ("su", "csu", "csr_all"))
        L.append(f"{LABEL[c]:28s} {su_:8.2f} {csu_:13.2f} {su_ - csu_:13.2f} {csr_:12.2f}")
    L.append("")
    L.append("Compliant SU = volume of loaded boxes satisfying C3-C6, % of the container. "
             "Baselines: no tests (descriptive), as in the Chapter 3 supplementary comparison.")

    with open(out / "task7_points.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["configuration", "instance_id", "raw_su", "compliant_su", "csr_all_boxes"])
        for (c, iid), p in sorted(points.items(), key=lambda kv: (kv[0][0], kv[0][1])):
            w.writerow([c, iid, f"{p['su']:.4f}", f"{p['csu']:.4f}", f"{p['csr_all']:.4f}"])
    L.append(plot(points, out))
    (out / "task7_baselines.txt").write_text("\n".join(L) + "\n", encoding="utf-8")
    print("\n" + "\n".join(L))
    print(f"written {out / 'task7_baselines.txt'} and {out / 'task7_points.csv'}")


if __name__ == "__main__":
    main()
