"""Representative run of each configuration on each load of a study, plus the
per-configuration means the Results page shows. Neutral: nothing is ranked.

    python experiments/representative.py <study.json>     # JSON, one entry per load

Representative run: the run whose container fill (SU) is closest to that
configuration's MEDIAN SU over its runs on the load; ties go to the lowest
seed (repeat code). It is the run the cards, the 3D viewer and the Loading
Guide show; it is typical of the configuration, not its best.
"""
import sys
import json
import argparse
import statistics
from pathlib import Path

CONFIGS = ['DGWO', 'MOGWO', 'SEQ', 'REP']          # fixed display order
RULE = ('the run whose container fill is closest to the median container fill of '
        "that configuration's runs on this load; ties go to the lowest repeat code")


def all_box(r):
    """Rule compliance over ALL boxes: unplaced boxes count as non-compliant."""
    return r['csr_pct'] * r['placed'] / r['n_items'] if r['n_items'] else 0.0


def pick_representative(indexed_runs):
    """indexed_runs: [(index in study['runs'], run)] of one configuration on one load.
    Returns (index, run, median_su)."""
    med = statistics.median(r['su_pct'] for _, r in indexed_runs)
    i, r = min(indexed_runs, key=lambda ir: (round(abs(ir[1]['su_pct'] - med), 9), ir[1]['seed']))
    return i, r, med


def _mean(xs):
    xs = [x for x in xs if x is not None]
    return sum(xs) / len(xs) if xs else None


def load_entry(inst, indexed):
    runs = [r for _, r in indexed]
    configs = [c for c in CONFIGS if any(r['configuration'] == c for r in runs)]
    out = {'instance_id': inst, 'configurations': configs,
           'seeds': sorted({r['seed'] for r in runs}), 'n_runs': len(runs),
           'representative': {}, 'means': {}}
    for c in configs:
        mine = [(i, r) for i, r in indexed if r['configuration'] == c]
        i, r, med = pick_representative(mine)
        out['representative'][c] = {
            'run_index': i, 'seed': r['seed'], 'median_su_pct': med,
            'su_pct': r['su_pct'], 'csr_placed_pct': r['csr_pct'], 'csr_all_pct': all_box(r),
            'placed': r['placed'], 'n_items': r['n_items'], 'not_loaded': r['n_items'] - r['placed'],
            'wall_ms': r['exec_time_ms'], 'cpu_ms': r.get('cpu_time_ms'), 'peak_mem_mb': r.get('peak_mem_mb'),
            'C3_pct': r['C3_pct'], 'C4_pct': r['C4_pct'], 'C5_pct': r['C5_pct'], 'C6_pct': r['C6_pct']}
        rs = [r for _, r in mine]
        out['means'][c] = {
            'n_runs': len(rs),
            'su_pct': _mean(r['su_pct'] for r in rs),
            'su_min': min(r['su_pct'] for r in rs), 'su_max': max(r['su_pct'] for r in rs),
            'csr_all_pct': _mean(all_box(r) for r in rs),
            'csr_placed_pct': _mean(r['csr_pct'] for r in rs),
            'placed': _mean(r['placed'] for r in rs), 'n_items': rs[0]['n_items'],
            'cpu_ms': _mean(r.get('cpu_time_ms') for r in rs),
            'wall_ms': _mean(r['exec_time_ms'] for r in rs),
            'peak_mem_mb': _mean(r.get('peak_mem_mb') for r in rs)}
    return out


def representatives(study):
    runs = study['runs']
    keys = []
    for r in runs:
        if r.get('instance_id') not in keys:
            keys.append(r.get('instance_id'))
    loads = [load_entry(k, [(i, r) for i, r in enumerate(runs) if r.get('instance_id') == k]) for k in keys]
    split = study.get('seq_budget_split') or {}
    return {'study': study.get('name'), 'mode': study.get('mode'), 'custom_load': study.get('custom_load'),
            'representative_rule': RULE, 'seq_budget_split': split, 'loads': loads}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('study')
    a = ap.parse_args(argv)
    study = json.loads(Path(a.study).read_text(encoding='utf-8'))
    print(json.dumps(representatives(study)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
