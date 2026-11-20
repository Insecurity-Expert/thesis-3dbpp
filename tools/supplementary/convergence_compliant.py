"""
convergence_compliant.py - the convergence illustration (instance 350, pop 30,
500 iterations, seeds 1-5) with compliant SU recorded for the current best.

The original curves (experiments/convergence/*_pop30_s*_i350.csv) logged SU, CSR
and boxes placed per iteration but not the arrangement, so compliant SU cannot be
derived from them. The runs are deterministic, so this script repeats the SAME
runs (same code, seeds, instance, population and budget) and, at every iteration,
also evaluates the current best with thesis_metrics.compliant_space_utilization (the rule used by
compliant_su.py). The hook only observes: it never touches the RNG or a decision.

Reproduction check: every iteration's SU, CSR and boxes placed must equal the
original CSV; otherwise the script stops.

REP: its current best satisfies C3-C6 for every loaded box at every iteration
(CSR 100 throughout, checked here from the original CSVs), so its compliant SU
equals its SU and it is not re-run.

    python tools/supplementary/convergence_compliant.py            # DGWO, MOGWO, SEQ x seeds 1-5
    python tools/supplementary/convergence_compliant.py --workers 4
Writes experiments/convergence/<CFG>_pop30_csu_s<seed>_i350.csv
"""
import argparse
import csv
import sys
import time
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT), str(ROOT / "optimizer")]
CONV = ROOT / "experiments" / "convergence"
INSTANCE, POP, ITERS, SEEDS = 350, 30, 500, (1, 2, 3, 4, 5)
RERUN = ("DGWO", "MOGWO", "SEQ")


def run_one(cfg, seed):
    from preprocessing.pipeline import load_augmented_instance
    from thesis_algorithms import StandaloneDGWO, StandaloneMOGWO, SequentialHybrid
    from thesis_metrics import compliant_space_utilization
    cls = {"DGWO": StandaloneDGWO, "MOGWO": StandaloneMOGWO, "SEQ": SequentialHybrid}[cfg]
    inst = load_augmented_instance({"data": {"raw_dir": str(ROOT / "data" / "raw")}},
                                   instance_id=INSTANCE, stop_seed=42)
    boxes, C = inst["boxes"], inst["container"]
    opt =cls(boxes, C, pop_size=POP, max_iter=ITERS, lambda_penalty=0.20,
              enforce_support=True, enforce_fragility=True, seed=seed, record_history=True)
    csu_log = []

    def record(iteration, best, _orig=opt._record):
        _orig(iteration, best)                       # the original history row
        csu_log.append(100.0 * compliant_space_utilization(best.placements, boxes, best.orientations, C))

    opt._record = record
    t0 = time.perf_counter()
    opt.run()
    el = time.perf_counter() - t0

    orig = list(csv.DictReader(open(CONV / f"{cfg}_pop30_s{seed}_i{INSTANCE}.csv", newline="")))
    if len(orig) != len(opt.history):
        return cfg, seed, f"MISMATCH: {len(opt.history)} iterations vs {len(orig)} in the original", el
    for (it, su, csr, pl), o in zip(opt.history, orig):
        if (f"{su * 100:.4f}" != o["best_su"] or f"{csr:.4f}" != o["best_csr"] or pl != int(o["best_placed"])):
            return cfg, seed, f"MISMATCH at iteration {it + 1}: SU {su * 100:.4f} vs {o['best_su']}", el

    out = CONV / f"{cfg}_pop30_csu_s{seed}_i{INSTANCE}.csv"
    with open(out, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["cfg", "seed", "instance", "pop", "iteration", "best_su", "best_csr", "best_placed",
                    "best_compliant_su", "best_csr_all_boxes"])
        for (it, su, csr, pl), csu in zip(opt.history, csu_log):
            w.writerow([cfg, seed, INSTANCE, POP, it + 1, f"{su * 100:.4f}", f"{csr:.4f}", pl,
                        f"{csu:.4f}", f"{csr * pl / len(boxes):.4f}"])
    return cfg, seed, f"ok, reproduces the original; final compliant SU {csu_log[-1]:.2f} -> {out.name}", el


def rep_check():
    """REP: compliant SU = SU when every loaded box is compliant (CSR 100) at every iteration."""
    n_box = None
    for seed in SEEDS:
        rows = list(csv.DictReader(open(CONV / f"REP_pop30_s{seed}_i{INSTANCE}.csv", newline="")))
        if any(float(r["best_csr"]) != 100.0 for r in rows):
            sys.exit(f"REP seed {seed}: CSR below 100 somewhere - REP would need a re-run too")
        if n_box is None:
            from preprocessing.pipeline import load_augmented_instance
            n_box = len(load_augmented_instance({"data": {"raw_dir": str(ROOT / "data" / "raw")}},
                                                instance_id=INSTANCE, stop_seed=42)["boxes"])
        with open(CONV / f"REP_pop30_csu_s{seed}_i{INSTANCE}.csv", "w", newline="") as f:
            w = csv.writer(f)
            w.writerow(["cfg", "seed", "instance", "pop", "iteration", "best_su", "best_csr", "best_placed",
                        "best_compliant_su", "best_csr_all_boxes"])
            for r in rows:
                pl = int(r["best_placed"])
                w.writerow([r["cfg"], r["seed"], r["instance"], r["pop"], r["iteration"], r["best_su"], r["best_csr"],
                            pl, r["best_su"], f"{100.0 * pl / n_box:.4f}"])
    print("REP: CSR 100 at every iteration of all 5 seeds -> compliant SU = SU (copied, not re-run)")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--workers", type=int, default=3)
    a = ap.parse_args()
    rep_check()
    jobs = [(c, s) for c in RERUN for s in SEEDS]
    bad = 0
    with ProcessPoolExecutor(max_workers=a.workers, max_tasks_per_child=1) as ex:
        for cfg, seed, msg, el in ex.map(run_one, *zip(*jobs)):
            print(f"{cfg:5s} seed {seed}: {msg} ({el:.0f}s)", flush=True)
            bad += msg.startswith("MISMATCH")
    if bad:
        sys.exit(f"{bad} run(s) did not reproduce the original curves - do not use the compliant SU curves")
    print("all runs reproduce the original curves")


if __name__ == "__main__":
    main()
