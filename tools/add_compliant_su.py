"""
add_compliant_su.py - add compliant space utilisation (M-1b) to the runs of an
existing study file, so the Results page can show it.

New studies record `compliant_su_pct` on every run (experiments/study.py). Study
files made before that (the thesis v3 study, earlier Run STACKR comparisons) have
the arrangement of every run but not this number; this script computes it from
the saved arrangement with the same rule (thesis_metrics.compliant_space_
utilization: the volume of loaded boxes satisfying C3-C6, % of the container).
No optimisation is run and no other field changes.

Check before writing: each run's SU recomputed from its arrangement must equal the
stored su_pct (to 0.001), so the arrangement belongs to that run.

    python tools/add_compliant_su.py experiments/results/studies/<study>.json
    python tools/add_compliant_su.py <study.json> --dry-run      # compute and report, write nothing

The original file is kept as <study>.json.bak.
"""
import argparse
import json
import shutil
import statistics as st
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path[:0] = [str(ROOT), str(ROOT / "optimizer"), str(ROOT / "experiments")]

from thesis_metrics import space_utilization, compliant_space_utilization  # noqa: E402
from preprocessing.pipeline import load_augmented_instance  # noqa: E402

TOL = 1e-3


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("study")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    path = Path(a.study)
    study = json.loads(path.read_text(encoding="utf-8"))
    if study.get("stackr_study") != 1:
        sys.exit("not a study file (stackr_study != 1)")
    import study as study_mod   # experiments/study.py: the same loaders the runs used
    stop_seed = study.get("stop_seed", study_mod.STOP_SEED)
    stop_count = study.get("stop_count", study_mod.STOP_COUNT)

    cache, by_cfg, added, already = {}, defaultdict(list), 0, 0
    for k, r in enumerate(study["runs"]):
        if "placements" not in r:
            sys.exit(f"run {k} has no saved arrangement - cannot compute compliant SU")
        key = r.get("custom_load") or r.get("instance_id")
        if key not in cache:
            if r.get("custom_load"):
                inst = study_mod.load_custom_load(r["custom_load"])
            else:
                inst = load_augmented_instance({"data": {"raw_dir": str(ROOT / "data" / "raw")}},
                                               instance_id=r["instance_id"], stop_seed=stop_seed, stop_count=stop_count)
            cache[key] = (inst["boxes"], inst["container"])
        boxes, container = cache[key]
        P = {int(i): v for i, v in r["placements"].items()}
        O = {int(i): v for i, v in r["orientations"].items()}
        su = space_utilization(P, container) * 100.0
        if abs(su - r["su_pct"]) > TOL:
            sys.exit(f"run {k} ({r['configuration']}, instance {r.get('instance_id')}, seed {r['seed']}): "
                     f"SU from its arrangement {su:.4f} != stored {r['su_pct']} - not written")
        csu = round(compliant_space_utilization(P, boxes, O, container) * 100.0, 4)
        if "compliant_su_pct" in r:
            already += 1
            if abs(r["compliant_su_pct"] - csu) > TOL:
                sys.exit(f"run {k}: stored compliant_su_pct {r['compliant_su_pct']} != recomputed {csu}")
        else:
            r["compliant_su_pct"] = csu
            added += 1
        by_cfg[r["configuration"]].append((r["su_pct"], csu))

    print(f"{path.name}: {len(study['runs'])} runs, every arrangement reproduces its stored SU")
    for c in ("DGWO", "MOGWO", "SEQ", "REP"):
        if by_cfg[c]:
            print(f"  {c:5s} mean SU {st.mean(x for x, _ in by_cfg[c]):6.2f}   mean compliant SU {st.mean(y for _, y in by_cfg[c]):6.2f}")
    if a.dry_run:
        print(f"dry run: {added} run(s) would get compliant_su_pct ({already} already had it); nothing written")
        return
    if added:
        shutil.copy2(path, path.with_suffix(path.suffix + ".bak"))
        path.write_text(json.dumps(study, indent=1), encoding="utf-8")
        print(f"added compliant_su_pct to {added} run(s) ({already} already had it); original kept as {path.name}.bak")
    else:
        print(f"nothing to add: all {already} run(s) already have compliant_su_pct")


if __name__ == "__main__":
    main()
