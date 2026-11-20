"""
convergence_compliant_plot.py - Figure 12 (convergence illustration, instance 350)
with panel (a) on compliant SU. Reads experiments/convergence/*_pop30_csu_s*_i350.csv
written by convergence_compliant.py. Same layout and styling as the thesis-run-v3
figure; panel (b) (CSR of the current best, loaded boxes) is unchanged.

    python tools/supplementary/convergence_compliant_plot.py [--out <folder>]
Writes convergence_compliant.png / .pdf and prints the values at iterations 300 and 500.
"""
import argparse
import csv
import glob
from collections import defaultdict
from pathlib import Path

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
CONV = ROOT / "experiments" / "convergence"
CFGS = ["DGWO", "MOGWO", "SEQ", "REP"]
LAB = {"DGWO": "DGWO", "MOGWO": "MOGWO", "SEQ": "Sequential", "REP": "Repair-based"}
COL = {"DGWO": "#1b6ca8", "MOGWO": "#d1495b", "SEQ": "#e09f1f", "REP": "#2e8b57"}
LS = {"DGWO": "-", "MOGWO": "--", "SEQ": "-.", "REP": "-"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(CONV))
    a = ap.parse_args()
    data = defaultdict(lambda: defaultdict(list))
    for f in sorted(glob.glob(str(CONV / "*_pop30_csu_s*_i350.csv"))):
        rows = list(csv.DictReader(open(f, newline="")))
        c = rows[0]["cfg"]
        data[c]["csu"].append([float(r["best_compliant_su"]) for r in rows])
        data[c]["csr"].append([float(r["best_csr"]) for r in rows])
    for c in CFGS:
        if len(data[c]["csu"]) != 5:
            raise SystemExit(f"{c}: {len(data[c]['csu'])} seed file(s) found, expected 5 - run convergence_compliant.py first")

    plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 10})
    fig, axes = plt.subplots(1, 2, figsize=(10, 4.4), dpi=200)
    panels = ((axes[0], "csu", "(a) Compliant space utilization", "Compliant SU of current best solution (%)", "bottom"),
              (axes[1], "csr", "(b) Constraint satisfaction", "CSR of current best, loaded boxes (%)", "bottom"))
    for ax, key, title, ylab, where in panels:
        for c in CFGS:
            arr = np.array(data[c][key])
            it = np.arange(1, arr.shape[1] + 1)
            m, sd = arr.mean(0), arr.std(0, ddof=1)
            ax.plot(it, m, LS[c], color=COL[c], lw=1.8, label=LAB[c])
            ax.fill_between(it, m - sd, m + sd, color=COL[c], alpha=0.12, lw=0)
        ax.axvline(300, color="0.35", lw=1, ls=":")
        y0, y1 = ax.get_ylim()
        if where == "top":
            ax.text(305, y1 - 0.02 * (y1 - y0), "experiment\nbudget (300)", fontsize=8, color="0.3", va="top")
        else:
            ax.text(305, y0 + 0.02 * (y1 - y0), "experiment\nbudget (300)", fontsize=8, color="0.3", va="bottom")
        ax.set_xlim(1, 500)
        ax.set_xlabel("Iteration")
        ax.set_ylabel(ylab)
        ax.set_title(title, fontsize=10.5, loc="left")
        ax.grid(alpha=0.25, lw=0.6)
        for s in ("top", "right"):
            ax.spines[s].set_visible(False)
    axes[0].legend(frameon=False, fontsize=8.5, loc="lower left", bbox_to_anchor=(0.05, 0.0), ncol=2)
    fig.text(0.01, 0.012,
             "Instance 350 (outside the 30-instance sample); population 30; 500 iterations; 5 seeds per configuration. Lines: mean over seeds; bands: ±1 SD.\n"
             "Each curve follows the configuration's own best solution (DGWO: PEN-1; MOGWO: archive SU; SEQ: PEN-1, then archive SU from iteration 250),\n"
             "not the best by compliant SU, so curves can dip. Code: thesis-run-v3.",
             fontsize=7.3, color="0.3")
    fig.tight_layout(rect=(0, 0.1, 1, 1))
    out = Path(a.out)
    fig.savefig(out / "convergence_compliant.png")
    fig.savefig(out / "convergence_compliant.pdf")
    print(f"written {out / 'convergence_compliant.png'} and .pdf")
    print(f"{'config':6s} {'compliant SU @300':>18s} {'@500':>8s} {'gain':>6s}   {'CSR @300':>9s} {'@500':>7s}")
    for c in CFGS:
        u, r = np.array(data[c]["csu"]), np.array(data[c]["csr"])
        print(f"{c:6s} {u[:, 299].mean():18.2f} {u[:, -1].mean():8.2f} {u[:, -1].mean() - u[:, 299].mean():6.2f}   "
              f"{r[:, 299].mean():9.1f} {r[:, -1].mean():7.1f}")


if __name__ == "__main__":
    main()
