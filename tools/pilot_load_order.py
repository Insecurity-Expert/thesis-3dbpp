"""Pilot for REP's loading-sequence rule: REP with load_order off vs. on (R4 and R5 on in both).

    python tools/pilot_load_order.py --preset quick  --seeds 3,42
    python tools/pilot_load_order.py --preset thesis --seeds 3,42 --workers 4 --json out.json

Every (instance, seed, rule) is a full, independent REP run (the rule acts inside the
search, so the two rows cannot share a search). Instances 581, 413, 147, 392, 454, stop
seed 42, three stops, lambda 0.20, C4/C5 enforced. Prints one JSON row per run and a
markdown table. With --workers > 1 the times are measured with several runs sharing the
CPU and are indicative only.
"""
import sys
import json
import time
import argparse
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor

_ROOT = Path(__file__).resolve().parent.parent
sys.path[:0] = [str(_ROOT), str(_ROOT / 'optimizer')]

PRESETS = {'quick': (10, 60), 'thesis': (30, 300)}
INSTANCES = (581, 413, 147, 392, 454)


def run_case(args):
    preset, iid, seed, load_order = args
    from preprocessing.pipeline import load_augmented_instance
    from thesis_algorithms import RepairBasedHybrid
    from thesis_metrics import evaluate_constraints, space_utilization
    from layout_metrics import fragile_indicators, edge_indicators, load_distribution
    inst = load_augmented_instance({'data': {'raw_dir': str(_ROOT / 'data' / 'raw')}},
                                   instance_id=iid, stop_seed=42, stop_count=3)
    items, cont = inst['boxes'], inst['container']
    pop, iters = PRESETS[preset]
    opt = RepairBasedHybrid(items, cont, pop_size=pop, max_iter=iters, lambda_penalty=0.2,
                            enforce_support=True, enforce_fragility=True, seed=seed,
                            load_order=load_order)
    t0 = time.perf_counter()
    best = opt.run()
    secs = time.perf_counter() - t0
    pl, orr = best.placements, best.orientations
    csr, _ = evaluate_constraints(pl, items, orr)
    fr = fragile_indicators(pl, cont, items)
    ed = edge_indicators(pl, cont, items)
    r4, r5 = opt.edge_fill_stats, opt.fragile_lift_stats
    return {
        'preset': preset, 'instance': iid, 'seed': seed, 'load_order': load_order,
        'n_boxes': len(items), 'n_fragile': sum(int(b['fragile'] == 1) for b in items),
        'placed': len(pl), 'su_pct': round(space_utilization(pl, cont) * 100, 2),
        'csr_pct': round(csr, 2),
        'fragile_placed': fr['fragile_placed'], 'fragile_on_floor': fr['fragile_on_floor'],
        'dead_pct': fr['fragile_dead_volume_pct'],
        'm7_pct': load_distribution(pl, cont, items)['lr_mass_imbalance_pct'],
        'isolated': ed['isolated_boxes'], 'one_side': ed['one_side_boxes'],
        'r5': {'tried': r5['moves_tried'], 'accepted': r5['moves_accepted'],
               'boxes_added': len(r5['boxes_added']), 'fragile_moved': len(r5['fragile_lifted']),
               'refused_balance': r5['refused_balance'], 'refused_isolated': r5['refused_isolated'],
               'move_rejections': r5['move_rejections'],
               'placed_before': r5['before']['placed'], 'placed_after': r5['after']['placed'],
               'floor_before': r5['before']['fragile_on_floor'], 'floor_after': r5['after']['fragile_on_floor'],
               'dead_before_pct': r5['before']['dead_volume_pct'], 'dead_after_pct': r5['after']['dead_volume_pct'],
               'time_ms': r5['time_ms']},
        'r4': {'boxes_added': r4['placed_A'] + r4['placed_A2'], 'placed_A': r4['placed_A'],
               'placed_A2': r4['placed_A2'], 'compaction': r4['compaction'],
               'isolated_before': r4['before']['isolated_boxes'],
               'isolated_after': r4['after']['isolated_boxes'], 'time_ms': r4['time_ms']},
        'time_s': round(secs, 1),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--preset', default='quick', choices=sorted(PRESETS))
    ap.add_argument('--seeds', default='3,42')
    ap.add_argument('--instances', default=','.join(map(str, INSTANCES)))
    ap.add_argument('--workers', type=int, default=1)
    ap.add_argument('--json')
    a = ap.parse_args()
    jobs = [(a.preset, int(i), int(s), lo) for i in a.instances.split(',')
            for s in a.seeds.split(',') for lo in (False, True)]
    jobs.sort(key=lambda j: -j[1] if a.workers > 1 else 0)
    if a.workers > 1:
        with ProcessPoolExecutor(a.workers) as ex:
            rows = list(ex.map(run_case, jobs))
    else:
        rows = [run_case(j) for j in jobs]
    rows.sort(key=lambda r: (INSTANCES.index(r['instance']) if r['instance'] in INSTANCES else 99,
                             r['seed'], r['load_order']))
    for r in rows:
        print(json.dumps(r), flush=True)
    if a.json:
        Path(a.json).write_text(json.dumps(rows, indent=1))


if __name__ == '__main__':
    main()
