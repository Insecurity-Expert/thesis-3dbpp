"""M-19: confirm a study file holds the full design and nothing was dropped.

    python tools/check_run_count.py experiments/results/studies/<study>.json
    python tools/check_run_count.py <study>.json --instances 30 --seeds 30

Checks: exactly instances x seeds x 4 runs; every (configuration, instance,
seed) cell present exactly once; serial timing; every run passed the
independent validator; every run carries the M-6 / M-7 layout block. Exit 1 on
any failure.
"""
import sys
import json
import argparse
from collections import Counter
from pathlib import Path

CONFIGS = ("DGWO", "MOGWO", "SEQ", "REP")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("study")
    ap.add_argument("--instances", type=int, default=30)
    ap.add_argument("--seeds", type=int, default=30)
    a = ap.parse_args()
    s = json.loads(Path(a.study).read_text(encoding="utf-8"))
    runs = s.get("runs", [])
    insts = [i["instance_id"] for i in s.get("instances", [])]
    seeds = sorted({r["seed"] for r in runs})
    expected = a.instances * a.seeds * len(CONFIGS)
    cells = Counter((r["configuration"], r["instance_id"], r["seed"]) for r in runs)
    missing = [(c, i, sd) for c in CONFIGS for i in insts for sd in seeds if (c, i, sd) not in cells]
    dupes = [k for k, n in cells.items() if n > 1]
    bad_val = [(r["configuration"], r["instance_id"], r["seed"]) for r in runs
               if not (r.get("validation") or {}).get("agree", False)]
    no_layout = sum(1 for r in runs if not r.get("layout"))
    checks = [
        (len(runs) == expected, f"runs = {len(runs)} (expected {a.instances} x {a.seeds} x 4 = {expected})"),
        (len(insts) == a.instances, f"instances = {len(insts)} (expected {a.instances})"),
        (len(seeds) == a.seeds, f"seeds = {len(seeds)} (expected {a.seeds})"),
        (not missing, f"missing cells = {len(missing)}" + (f", first {missing[:3]}" if missing else "")),
        (not dupes, f"duplicate cells = {len(dupes)}" + (f", first {dupes[:3]}" if dupes else "")),
        (bool(s.get("timing_valid")) and s.get("mode") == "serial", f"timing: mode={s.get('mode')}, timing_valid={s.get('timing_valid')}"),
        (not bad_val, f"runs failing the independent validator = {len(bad_val)}"),
        (no_layout == 0, f"runs without the M-6/M-7 layout block = {no_layout}"),
    ]
    for ok, msg in checks:
        print(("  ok   " if ok else "  FAIL ") + msg)
    print(f"commit {s.get('commit')}  created {s.get('created_at')}  machine {s.get('machine')}")
    sys.exit(0 if all(ok for ok, _ in checks) else 1)


if __name__ == "__main__":
    main()
