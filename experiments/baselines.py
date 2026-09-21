"""Non-search baselines for the panel: one pass of the SAME decoder, evaluator
and constraint flags the four GWO configurations use, with no optimisation.

  weight-descending  heaviest box first, one place_container_dblf call
  volume-descending  largest box first, one call
  random             N shuffled orders (default 30); mean / sd / best reported

Orientation for every box is its FIRST allowed orientation code (the
optimizer would search over this; a baseline does not). Decode-time C5/C4
enforcement is on, exactly as in the demo and the slide runs.

    python experiments/baselines.py --instance 350 --out experiments/results/baselines_i350.json
"""
import sys
import json
import time
import argparse
import statistics
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT))
sys.path.insert(0, str(_ROOT / 'optimizer'))

import numpy as np
from preprocessing.pipeline import load_augmented_instance
from geometry_3d import place_container_dblf
from thesis_metrics import evaluate_constraints, space_utilization, validate_items


def pack(sequence, boxes, container, enforce_support, enforce_fragility):
    orients = {i: boxes[i]['allowed_orientations'][0] for i in range(len(boxes))}
    t0 = time.perf_counter()
    placements, unplaced, orientations, attempts, exhausted = place_container_dblf(
        list(sequence), boxes, orients, container,
        enforce_support=enforce_support, enforce_fragility=enforce_fragility)
    wall_ms = (time.perf_counter() - t0) * 1000.0
    csr, d = evaluate_constraints(placements, boxes, orientations)
    return {
        'su_pct': space_utilization(placements, container) * 100.0,
        'csr_pct': csr,
        'C3_weight_pct': d['C3_weight_pct'], 'C4_fragility_pct': d['C4_fragility_pct'],
        'C5_balance_pct': d['C5_balance_pct'], 'C6_stop_order_pct': d['C6_stop_order_pct'],
        'placed': len(placements), 'n_items': len(boxes),
        'wall_ms': wall_ms, 'budget_exhausted': exhausted,
        # the arrangement itself, for the independent validator
        'placements': {int(k): list(v) for k, v in placements.items()},
        'orientations': {int(k): int(v) for k, v in orientations.items()},
    }


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--instance', type=int, default=350)
    p.add_argument('--stop-seed', type=int, default=42, help='stop assignment seed (matches runner default)')
    p.add_argument('--random-orders', type=int, default=30)
    p.add_argument('--random-seed', type=int, default=42)
    p.add_argument('--no-enforce-support', dest='enforce_support', action='store_false')
    p.add_argument('--no-enforce-fragility', dest='enforce_fragility', action='store_false')
    p.add_argument('--raw-dir', default=str(_ROOT / 'data' / 'raw'))
    p.add_argument('--out')
    args = p.parse_args()

    inst = load_augmented_instance({'data': {'raw_dir': args.raw_dir}}, instance_id=args.instance, stop_seed=args.stop_seed)
    boxes, container = inst['boxes'], inst['container']
    validate_items(boxes)
    n = len(boxes)
    idx = list(range(n))
    flags = dict(enforce_support=args.enforce_support, enforce_fragility=args.enforce_fragility)

    results = {}
    results['weight_descending'] = pack(sorted(idx, key=lambda i: -boxes[i]['mass']), boxes, container, **flags)
    results['volume_descending'] = pack(sorted(idx, key=lambda i: -(boxes[i]['l'] * boxes[i]['w'] * boxes[i]['h'])), boxes, container, **flags)

    rng = np.random.default_rng(args.random_seed)
    runs = []
    for k in range(args.random_orders):
        order = rng.permutation(n).tolist()
        r = pack(order, boxes, container, **flags)
        r['order_index'] = k
        runs.append(r)
    best = max(runs, key=lambda r: r['su_pct'])
    agg = {}
    for key in ('su_pct', 'csr_pct', 'C3_weight_pct', 'C4_fragility_pct', 'C5_balance_pct', 'C6_stop_order_pct', 'placed', 'wall_ms'):
        vals = [r[key] for r in runs]
        agg[key] = {'mean': statistics.mean(vals), 'sd': statistics.pstdev(vals), 'min': min(vals), 'max': max(vals)}
    results['random'] = {'n_orders': args.random_orders, 'seed': args.random_seed, 'aggregate': agg,
                         'best_by_su': best, 'runs': runs}

    out = {
        'instance': args.instance, 'n_items': n, 'container': container,
        'orientation_rule': 'first allowed orientation code per box (no orientation search)',
        'enforce_support': args.enforce_support, 'enforce_fragility': args.enforce_fragility,
        'evaluator': 'thesis_metrics.evaluate_constraints (same as the optimizer)',
        'decoder': 'geometry_3d.place_container_dblf (same as the optimizer)',
        'results': results,
    }

    def row(name, r):
        return (f"{name:20s} SU={r['su_pct']:6.2f}% CSR={r['csr_pct']:6.2f}% "
                f"C3={r['C3_weight_pct']:6.2f} C4={r['C4_fragility_pct']:6.2f} "
                f"C5={r['C5_balance_pct']:6.2f} C6={r['C6_stop_order_pct']:6.2f} "
                f"placed={r['placed']:3d}/{n}  {r['wall_ms']:7.1f} ms")
    print(f"instance {args.instance} | n={n} | orientation: first allowed | enforce C5={args.enforce_support} C4={args.enforce_fragility}")
    print(row('weight-descending', results['weight_descending']))
    print(row('volume-descending', results['volume_descending']))
    a = agg
    print(f"{'random (mean)':20s} SU={a['su_pct']['mean']:6.2f}% CSR={a['csr_pct']['mean']:6.2f}% "
          f"C3={a['C3_weight_pct']['mean']:6.2f} C4={a['C4_fragility_pct']['mean']:6.2f} "
          f"C5={a['C5_balance_pct']['mean']:6.2f} C6={a['C6_stop_order_pct']['mean']:6.2f} "
          f"placed={a['placed']['mean']:5.1f}/{n}  {a['wall_ms']['mean']:7.1f} ms   (n={args.random_orders})")
    print(f"{'random (sd)':20s} SU={a['su_pct']['sd']:6.2f}  CSR={a['csr_pct']['sd']:6.2f}  placed={a['placed']['sd']:5.1f}")
    print(row('random (best by SU)', best))

    if args.out:
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.out).write_text(json.dumps(out, indent=1, default=str))
        print(f"wrote {args.out}")


if __name__ == '__main__':
    main()
