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


def run_one(strategy, boxes, container, seed, pop_size, max_iter, lambdas,
            enforce_support=True, enforce_fragility=True):
    """Same contract as main_optimizer.py: four PEN-1 weights and the two
    decode-time constraint flags reach the constructor verbatim."""
    opt = STRATEGIES[strategy](
        items=boxes,
        container=container,
        pop_size=pop_size,
        max_iter=max_iter,
        lambda_w=lambdas['w'], lambda_f=lambdas['f'],
        lambda_b=lambdas['b'], lambda_a=lambdas['a'],
        enforce_support=enforce_support,
        enforce_fragility=enforce_fragility,
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
        'params':           {'pop_size': pop_size, 'max_iter': max_iter, 'lambda_w': lambdas['w'],
                             'lambda_f': lambdas['f'], 'lambda_b': lambdas['b'], 'lambda_a': lambdas['a'],
                             'enforce_support': enforce_support, 'enforce_fragility': enforce_fragility,
                             'seed': seed},
        'repair_stats':     getattr(opt, 'repair_stats', None),
        'budget_exhausted': best.budget_exhausted,
        'peak_attempts':    best.placement_attempts,
        'exec_time_ms':     round(elapsed_ms, 1),
    }


def main():
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--instance', type=int, help='a single wtpack instance id')
    p.add_argument('--sample', help='provenance JSON from preprocessing.sampling')
    p.add_argument('--n-instances', type=int, default=None,
                   help='with --sample: run only the first N instances of the sample')
    p.add_argument('--seed', type=int, required=True, help='RNG seed (required)')
    p.add_argument('--strategy', choices=sorted(STRATEGIES))
    p.add_argument('--all', action='store_true', help='Run all four configurations')
    p.add_argument('--pop-size', type=int, default=30)
    p.add_argument('--max-iter', type=int, default=500)
    p.add_argument('--lambda', type=float, default=0.20, dest='lam',
                   help='Ties all four PEN-1 weights (the calibration grid runs tied)')
    p.add_argument('--lambda-w', type=float, default=None, help='override C3 weight')
    p.add_argument('--lambda-f', type=float, default=None, help='override C4 weight')
    p.add_argument('--lambda-b', type=float, default=None, help='override C5 weight')
    p.add_argument('--lambda-a', type=float, default=None, help='override C6 weight')
    p.add_argument('--enforce-support', action=argparse.BooleanOptionalAction, default=True,
                   help='Reject placements failing C5 at decode time (default on)')
    p.add_argument('--enforce-fragility', action=argparse.BooleanOptionalAction, default=True,
                   help='Reject placements above a fragile box at decode time (default on)')
    p.add_argument('--raw-dir', default=str(_ROOT / 'data' / 'raw'))
    p.add_argument('--stop-count', type=int, default=3)
    p.add_argument('--out', help='Write results JSON here (default: stdout)')
    args = p.parse_args()

    if not args.all and not args.strategy:
        p.error("pass --strategy or --all")
    if (args.instance is None) == (args.sample is None):
        p.error("pass exactly one of --instance or --sample")

    if args.sample:
        prov = json.loads(Path(args.sample).read_text())
        instance_ids = [c['instance_id'] for c in prov['selected']]
        if args.n_instances is not None:
            instance_ids = instance_ids[:args.n_instances]
    else:
        instance_ids = [args.instance]

    lambdas = {k: (v if v is not None else args.lam) for k, v in
               (('w', args.lambda_w), ('f', args.lambda_f), ('b', args.lambda_b), ('a', args.lambda_a))}

    targets = sorted(STRATEGIES) if args.all else [args.strategy]
    blobs = []
    for instance_id in instance_ids:
      inst = load_augmented_instance(
          {'data': {'raw_dir': args.raw_dir}},
          instance_id=instance_id,
          stop_seed=args.seed,
          stop_count=args.stop_count,
      )
      container = inst['container']
      results = []
      for strategy in targets:
        # Each configuration gets its own copy: the optimizer mutates nothing,
        # but sharing boxes across runs would couple them if that ever changes.
        fresh = load_augmented_instance(
            {'data': {'raw_dir': args.raw_dir}},
            instance_id=instance_id,
            stop_seed=args.seed,
            stop_count=args.stop_count,
        )
        res = run_one(strategy, fresh['boxes'], fresh['container'], args.seed,
                      args.pop_size, args.max_iter, lambdas,
                      args.enforce_support, args.enforce_fragility)
        res['instance_id'] = instance_id
        results.append(res)
        print(f"[inst {instance_id:3d}] {res['strategy']:6s} placed={res['placed']:3d}/{res['n_items']} SU={res['su_pct']:6.2f}% "
              f"CSR={res['csr_pct']:6.2f}% C3={res['C3_weight_pct']:6.2f} "
              f"C4={res['C4_fragility_pct']:6.2f} C5={res['C5_balance_pct']:6.2f} "
              f"C6={res['C6_stop_order_pct']:6.2f} "
              f"budget_exhausted={res['budget_exhausted']} "
              f"{res['exec_time_ms']:.0f}ms", file=sys.stderr, flush=True)

      blobs.append({
          'instance':       instance_id,
          'seed':           args.seed,
          'container':      container,
          'n_items':        len(inst['boxes']),
          'pop_size':       args.pop_size,
          'max_iter':       args.max_iter,
          'lambdas':        lambdas,
          'enforce_support': args.enforce_support,
          'enforce_fragility': args.enforce_fragility,
          'augmentation':   inst['augmentation'],
          'results':        results,
      })

    out = blobs[0] if len(blobs) == 1 else {'sample': args.sample, 'instances': blobs}
    if args.out:
        Path(args.out).write_text(json.dumps(out, indent=2, default=str))
        print(f"wrote {args.out}", file=sys.stderr)
    else:
        print(json.dumps(out, indent=2, default=str))


if __name__ == '__main__':
    main()
