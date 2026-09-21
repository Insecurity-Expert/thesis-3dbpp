"""Morning-of-defense check: is the machine producing the numbers on the slides?

Runs DGWO at the Quick preset (pop 10 x 60), seed 42, instance 350, with the
demo's flags, and compares SU, CSR and placed count against the reference
recorded by experiments/runner.py (experiments/results/quick_i350_s42.json).
The optimizer is deterministic, so the match is exact, not approximate.

    python tools/demo_check.py            # PASS / FAIL, under a minute
"""
import sys
import json
import time
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT))
sys.path.insert(0, str(_ROOT / 'optimizer'))

REF = _ROOT / 'experiments' / 'results' / 'quick_i350_s42.json'
INSTANCE, SEED, POP, ITERS, LAM = 350, 42, 10, 60, 0.20


def main():
    if not REF.exists():
        print(f"FAIL: reference file missing: {REF}")
        return 2
    ref_doc = json.loads(REF.read_text())
    ref = next(r for r in ref_doc['results'] if r['strategy'] == 'DGWO')

    from preprocessing.pipeline import load_augmented_instance
    from thesis_algorithms import StandaloneDGWO
    from thesis_metrics import evaluate_constraints, space_utilization

    t0 = time.perf_counter()
    inst = load_augmented_instance({'data': {'raw_dir': str(_ROOT / 'data' / 'raw')}},
                                   instance_id=INSTANCE, stop_seed=SEED)
    opt = StandaloneDGWO(inst['boxes'], inst['container'], pop_size=POP, max_iter=ITERS,
                         lambda_penalty=LAM, enforce_support=True, enforce_fragility=True, seed=SEED)
    best = opt.run()
    su = round(space_utilization(best.placements, inst['container']) * 100.0, 4)
    csr = round(evaluate_constraints(best.placements, inst['boxes'], best.orientations)[0], 4)
    placed = len(best.placements)
    wall = time.perf_counter() - t0

    checks = [('SU %', su, ref['su_pct']), ('CSR %', csr, ref['csr_pct']), ('placed', placed, ref['placed'])]
    ok = all(abs(a - b) < 1e-6 for _, a, b in checks)
    print(f"DGWO | instance {INSTANCE} | pop {POP} x {ITERS} | seed {SEED} | {wall:.1f} s")
    for name, got, want in checks:
        flag = "ok" if abs(got - want) < 1e-6 else f"DIFF {got - want:+.4f}"
        print(f"  {name:8s} got {got:<10} ref {want:<10} {flag}")
    print("PASS" if ok else "FAIL — the machine is not reproducing the slide reference (code, data or numba cache changed)")
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
