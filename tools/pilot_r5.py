"""Pilot for repair step R5 (optimizer/fragile_lift.py): REP with R5 off vs. on, R4 on in both.

    python tools/pilot_r5.py                         # the pilot table of docs/R5_FRAGILE_LIFT.md
    python tools/pilot_r5.py --cases 581:3 --preset quick

One search per (instance, seed); R4 alone and R5 then R4 are applied to snapshots of
its result, which is what REP(fragile_lift=False) and REP(fragile_lift=True) return.
"""
import sys
import json
import copy
import time
import argparse
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT))
sys.path.insert(0, str(_ROOT / 'optimizer'))

from preprocessing.pipeline import load_augmented_instance
from thesis_algorithms import RepairBasedHybrid
from thesis_metrics import evaluate_constraints, space_utilization
from layout_metrics import fragile_indicators, edge_indicators, load_distribution
from edge_fill import repair_R4_edge_fill
from fragile_lift import repair_R5_fragile_lift

PRESETS = {'quick': (10, 60), 'standard': (10, 300), 'thesis': (30, 300)}
CASES = '581:3,581:42,413:42,147:42,392:42,454:42'


def load(instance_id):
    cfg = {'data': {'raw_dir': str(_ROOT / 'data' / 'raw')}}
    return load_augmented_instance(cfg, instance_id=instance_id, stop_seed=42, stop_count=3)


def row(label, pl, orr, items, container, r5=None):
    csr, _ = evaluate_constraints(pl, items, orr)
    fr = fragile_indicators(pl, container, items)
    e = edge_indicators(pl, container, items)
    return {'run': label, 'placed': len(pl), 'su_pct': round(space_utilization(pl, container) * 100, 2),
            'csr_pct': round(csr, 2), 'fragile_on_floor': fr['fragile_on_floor'],
            'fragile_placed': fr['fragile_placed'],
            'dead_pct': fr['fragile_dead_volume_pct'], 'isolated': e['isolated_boxes'],
            'one_side': e['one_side_boxes'],
            'm7_pct': load_distribution(pl, container, items)['lr_mass_imbalance_pct'],
            'added': len(r5['boxes_added']) if r5 else 0,
            'lifted': len(r5['fragile_lifted']) if r5 else 0,
            'r5_ms': r5['time_ms'] if r5 else None}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--cases', default=CASES)
    ap.add_argument('--preset', default='quick', choices=sorted(PRESETS))
    ap.add_argument('--json')
    a = ap.parse_args()
    pop, iters = PRESETS[a.preset]
    out = []
    for case in a.cases.split(','):
        iid, seed = (int(v) for v in case.split(':'))
        inst = load(iid)
        items, cont = inst['boxes'], inst['container']
        t0 = time.perf_counter()
        opt = RepairBasedHybrid(items, cont, pop_size=pop, max_iter=iters, lambda_penalty=0.2,
                                enforce_support=True, enforce_fragility=True, seed=seed,
                                edge_fill=False, fragile_lift=False)
        best = opt.run()
        search_s = time.perf_counter() - t0
        res = {}
        for label, lift in (('R5 off', False), ('R5 on', True)):
            w = opt._snapshot(best)
            r5 = None
            if lift:
                r5 = repair_R5_fragile_lift(w.placements, w.orientations, w.unplaced, items, cont)
            repair_R4_edge_fill(w.placements, w.orientations, w.unplaced, items, cont)
            res[label] = (row(label, w.placements, w.orientations, items, cont, r5), r5)
        for label, (r, r5) in res.items():
            r.update(instance=iid, seed=seed, search_s=round(search_s, 1))
            out.append({**r, 'r5_stats': r5})
            print(json.dumps({k: v for k, v in r.items()}), flush=True)
        r5 = res['R5 on'][1]
        print('   R5 moves %d/%d  rejections %s  move_rejections %s  lifted %s'
              % (r5['moves_accepted'], r5['moves_tried'], r5['rejections'], r5['move_rejections'],
                 [(d['item'], d['old_z'], d['new_z'], d['new_top_z']) for d in r5['fragile_lifted']]), flush=True)
    if a.json:
        Path(a.json).write_text(json.dumps(out, indent=1))


if __name__ == '__main__':
    main()
