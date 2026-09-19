"""Academic entry point for the four-configuration comparison.

wtpack only. Seed required. No fallbacks, no synthesised physics: if an
instance lacks real data the run fails rather than inventing it.

    python experiments/runner.py --instance 0 --strategy DGWO --seed 42
    python experiments/runner.py --instance 0 --all --seed 42
"""
import sys
import json
import time
import argparse
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT))
sys.path.insert(0, str(_ROOT / 'optimizer'))

from preprocessing.pipeline import load_augmented_instance
from thesis_algorithms import (StandaloneDGWO, StandaloneMOGWO,
                               SequentialHybrid, RepairBasedHybrid)
from thesis_metrics import evaluate_constraints, space_utilization

STRATEGIES = {
    'DGWO':  StandaloneDGWO,
    'MOGWO': StandaloneMOGWO,
    'SEQ':   SequentialHybrid,
    'REP':   RepairBasedHybrid,
}


def run_one(strategy, boxes, container, seed, pop_size, max_iter, lambda_penalty):
    opt = STRATEGIES[strategy](
        items=boxes,
        container=container,
        pop_size=pop_size,
        max_iter=max_iter,
        lambda_penalty=lambda_penalty,
        seed=seed,
    )
    t0 = time.perf_counter()
    best = opt.run()
    elapsed_ms = (time.perf_counter() - t0) * 1000.0

    csr, detail = evaluate_constraints(best.placements, boxes, best.orientations)
    return {
        'strategy':         strategy,
        'seed':             seed,
        'placed':           len(best.placements),
        'n_items':          len(boxes),
        'su_pct':           round(space_utilization(best.placements, container) * 100.0, 4),
        'csr_pct':          round(csr, 4),
        'C3_weight_pct':    round(detail['C3_weight_pct'], 4),
        'C4_fragility_pct': round(detail['C4_fragility_pct'], 4),
        'C5_balance_pct':   round(detail['C5_balance_pct'], 4),
        'C6_stop_order_pct': round(detail['C6_stop_order_pct'], 4),
        'budget_exhausted': best.budget_exhausted,
        'peak_attempts':    best.placement_attempts,
        'exec_time_ms':     round(elapsed_ms, 1),
    }


def main():
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--instance', type=int, required=True, help='wtpack instance id')
    p.add_argument('--seed', type=int, required=True, help='RNG seed (required)')
    p.add_argument('--strategy', choices=sorted(STRATEGIES))
    p.add_argument('--all', action='store_true', help='Run all four configurations')
    p.add_argument('--pop-size', type=int, default=30)
    p.add_argument('--max-iter', type=int, default=500)
    p.add_argument('--lambda-penalty', type=float, default=0.10)
    p.add_argument('--raw-dir', default=str(_ROOT / 'data' / 'raw'))
    p.add_argument('--stop-count', type=int, default=3)
    p.add_argument('--out', help='Write results JSON here (default: stdout)')
    args = p.parse_args()

    if not args.all and not args.strategy:
        p.error("pass --strategy or --all")

    inst = load_augmented_instance(
        {'data': {'raw_dir': args.raw_dir}},
        instance_id=args.instance,
        stop_seed=args.seed,
        stop_count=args.stop_count,
    )
    container = inst['container']

    targets = sorted(STRATEGIES) if args.all else [args.strategy]
    results = []
    for strategy in targets:
        # Each configuration gets its own copy: the optimizer mutates nothing,
        # but sharing boxes across runs would couple them if that ever changes.
        fresh = load_augmented_instance(
            {'data': {'raw_dir': args.raw_dir}},
            instance_id=args.instance,
            stop_seed=args.seed,
            stop_count=args.stop_count,
        )
        res = run_one(strategy, fresh['boxes'], fresh['container'], args.seed,
                      args.pop_size, args.max_iter, args.lambda_penalty)
        results.append(res)
        print(f"{res['strategy']:6s} placed={res['placed']:3d}/{res['n_items']} SU={res['su_pct']:6.2f}% "
              f"CSR={res['csr_pct']:6.2f}% C3={res['C3_weight_pct']:6.2f} "
              f"C4={res['C4_fragility_pct']:6.2f} C5={res['C5_balance_pct']:6.2f} "
              f"C6={res['C6_stop_order_pct']:6.2f} "
              f"budget_exhausted={res['budget_exhausted']} "
              f"{res['exec_time_ms']:.0f}ms", file=sys.stderr, flush=True)

    blob = {
        'instance':       args.instance,
        'seed':           args.seed,
        'container':      container,
        'n_items':        len(inst['boxes']),
        'pop_size':       args.pop_size,
        'max_iter':       args.max_iter,
        'lambda_penalty': args.lambda_penalty,
        'augmentation':   inst['augmentation'],
        'results':        results,
    }

    if args.out:
        Path(args.out).write_text(json.dumps(blob, indent=2, default=str))
        print(f"wrote {args.out}", file=sys.stderr)
    else:
        print(json.dumps(blob, indent=2, default=str))


if __name__ == '__main__':
    main()
