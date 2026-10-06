"""Non-search baselines for the panel: one pass of the SAME decoder, evaluator
and constraint flags the four GWO configurations use, with no optimisation.

  weight-descending  heaviest box first, one place_container_dblf call
  volume-descending  largest box first, one call
  random             N shuffled orders (default 30); mean / sd / best reported

Orientation for every box is its FIRST allowed orientation code (the
optimizer would search over this; a baseline does not). Decode-time C5/C4
enforcement is on, exactly as in the demo and the slide runs.

    python experiments/baselines.py --instance 350 --out experiments/results/baselines_i350.json

Study mode (Chapter 3 supplementary analysis): for every instance of a study
file, the Weight-Sorted Greedy (one pass, heaviest first) and the Random Order
baseline (30 draws, each ONE pass of a shuffled loading order) are run through
the same decoder, evaluator and flags with the study's stop labels, checked by
the independent validator, and stored in study["baselines"]; stats.py is then
re-applied. study.py does this automatically after the GWO runs. The baselines
always run one at a time in this process, so their execution times are serial.

    python experiments/baselines.py --study experiments/results/studies/<study>.json
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


# ─── study mode ──────────────────────────────────────────────────────────────
STUDY_BASELINE_KEYS = ('su_pct', 'csr_pct', 'csr_all_pct', 'placed', 'n_items', 'exec_time_ms',
                       'C3_weight_pct', 'C4_fragility_pct', 'C5_balance_pct', 'C6_stop_order_pct')


def _study_row(r, container, boxes):
    """One baseline pass as a study row: no arrangement stored, the independent
    validator's verdict instead (the arrangement is checked here)."""
    sys.path.insert(0, str(_ROOT / 'tools'))
    from validate_arrangement import validate
    iv = validate(container, boxes, r['placements'], r['orientations'])
    pairs = [('C3', 'C3_weight_pct'), ('C4', 'C4_fragility_pct'), ('C5', 'C5_balance_pct'),
             ('C6', 'C6_stop_order_pct'), ('all', 'csr_pct')]
    diffs = {k: [iv['pct'][k], r[ek]] for k, ek in pairs if abs(iv['pct'][k] - r[ek]) > 1e-6}
    geom_ok = iv['pct']['C1'] == 100.0 and iv['pct']['C2'] == 100.0 and iv['pct']['orient'] == 100.0
    row = dict(r, csr_all_pct=r['csr_pct'] * r['placed'] / r['n_items'] if r['n_items'] else 0.0,
               exec_time_ms=r['wall_ms'])
    row = {k: (round(row[k], 4) if isinstance(row[k], float) else row[k]) for k in STUDY_BASELINE_KEYS}
    row['budget_exhausted'] = bool(r['budget_exhausted'])
    row['validation_agree'] = (not diffs) and geom_ok
    return row


def instance_baselines(boxes, container, *, enforce_support, enforce_fragility, n_random, rng):
    """Weight-Sorted Greedy and n_random Random Order passes for one instance."""
    idx = list(range(len(boxes)))
    flags = dict(enforce_support=enforce_support, enforce_fragility=enforce_fragility)
    greedy = pack(sorted(idx, key=lambda i: -boxes[i]['mass']), boxes, container, **flags)
    draws = []
    for k in range(n_random):
        r = _study_row(pack(rng.permutation(len(boxes)).tolist(), boxes, container, **flags), container, boxes)
        r['draw'] = k
        draws.append(r)
    return {'weight_sorted': _study_row(greedy, container, boxes), 'random_order': draws}


def attach_baselines(study, raw_dir=None, n_random=30, random_seed=42, log=print):
    """Fill study["baselines"] for every instance of the study (in place)."""
    from preprocessing.custom_load import load_stored
    raw_dir = raw_dir or str(_ROOT / 'data' / 'raw')
    es, ef = study['enforce_support'], study['enforce_fragility']
    per = []
    warmed = False
    for row in study['instances']:
        if row.get('custom_load'):
            inst = load_stored(row['custom_load'])
        else:
            inst = load_augmented_instance({'data': {'raw_dir': raw_dir}}, instance_id=row['instance_id'],
                                           stop_seed=study['stop_seed'], stop_count=study['stop_count'])
        boxes, container = inst['boxes'], inst['container']
        validate_items(boxes)
        if not warmed:      # compile / load the numba kernels untimed
            pack(list(range(len(boxes))), boxes, container, es, ef)
            warmed = True
        # One stream per instance, so adding instances never changes the others' draws.
        rng = np.random.default_rng([random_seed, row['instance_id'] if row['instance_id'] is not None else 0])
        b = instance_baselines(boxes, container, enforce_support=es, enforce_fragility=ef,
                               n_random=n_random, rng=rng)
        per.append({'instance_id': row['instance_id'], 'custom_load': row.get('custom_load'), **b})
        g = b['weight_sorted']
        log(f"baselines inst={row['instance_id']}: greedy SU={g['su_pct']:.2f} CSR(all)={g['csr_all_pct']:.2f} "
            f"placed={g['placed']}/{g['n_items']}; random x{n_random} mean SU="
            f"{statistics.mean(d['su_pct'] for d in b['random_order']):.2f}")
    bad = sum(1 for p_ in per for r in [p_['weight_sorted']] + p_['random_order'] if not r['validation_agree'])
    study['baselines'] = {
        'weight_sorted': 'one pass, heaviest box first',
        'random_order': f'{n_random} draws per instance, each one pass of a shuffled loading order '
                        '(numpy default_rng([random_seed, instance_id]))',
        'n_random': n_random, 'random_seed': random_seed,
        'orientation_rule': 'first allowed orientation code per box (no orientation search)',
        'enforce_support': es, 'enforce_fragility': ef,
        'timing_valid': True,
        'timing_note': 'serial - every baseline pass ran alone in one process after an untimed warm-up; '
                       'exec_time_ms = wall-clock of the one decode',
        'validation': {'arrangements': sum(1 + len(p_['random_order']) for p_ in per),
                       'disagreements': bad},
        'per_instance': per,
    }
    return bad


def main_study(args):
    path = Path(args.study)
    study = json.loads(path.read_text(encoding='utf-8'))
    if study.get('stackr_study') != 1:
        sys.exit('not a study file (stackr_study != 1)')
    bad = attach_baselines(study, args.raw_dir, args.random_orders, args.random_seed)
    if bad:
        sys.exit(f'{bad} baseline arrangement(s) disagree with the independent validator; nothing written')
    if not args.no_stats:
        from stats import analyse
        study['stats'] = analyse(study)
    path.write_text(json.dumps(study, indent=1), encoding='utf-8')
    print(f"wrote {path} (baselines{'' if args.no_stats else ' + stats'})")


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
    p.add_argument('--study', help='attach per-instance baselines to this study file (study mode)')
    p.add_argument('--no-stats', action='store_true', help='study mode: do not re-apply stats.py')
    args = p.parse_args()
    if args.study:
        return main_study(args)

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
        'instance': args.instance, 'stop_seed': args.stop_seed, 'n_items': n, 'container': container,
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
