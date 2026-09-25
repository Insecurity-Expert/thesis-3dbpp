"""Recommended solution for one load: Chapter 3's composite over that load's runs.

    python experiments/recommend.py <study.json>            # JSON, one entry per load (instance)

For each load (test case or custom load) in a study file:

* the per-load composite CS(c, p) from experiments/stats.py (composite_scores,
  called, not changed): 0.25 SU~ + 0.25 CSR~ (all boxes) + 0.25 (1 - CC~)
  + 0.25 (1 - Rob~), ~ = min-max across the four methods on this load,
  CC = (z_ET + z_PM) / 2, Rob = sd of SU across the load's repeat codes.
  No Friedman step: this compares four methods on ONE load and is not the
  thesis's statistical conclusion.
* Cost basis. ET in CC is process CPU time of opt.run() (cpu_time_ms) when
  every run of the load recorded it; else wall-clock (M-3) when the study
  ran one run at a time (serial); else the recommendation is not available
  (parallel wall-clock is shared-CPU time and not comparable). PM is each
  run's own worker process's peak memory, as recorded.
* Tie rule (leave one repeat code out): the composite is recomputed once per
  repeat code with that code's runs left out. If the top method differs in
  any recomputation, "two methods did about equally well".
* Representative run of each method: highest rule-following over all boxes
  (csr_pct x placed / n_items), then highest container fill, then the lowest
  repeat code.
"""
import sys
import json
import argparse
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import stats   # noqa: E402  experiments/stats.py

CONFIGS = stats.CONFIGS


def cost_basis(study, runs):
    if runs and all(r.get('cpu_time_ms') is not None for r in runs):
        return 'cpu', None
    if study.get('timing_valid', study.get('mode') == 'serial'):
        return 'wall', None
    return None, ('this comparison ran several runs at once and did not record CPU time, so its times '
                  'are shared-CPU wall-clock times and cannot be compared; run it again to get a recommendation')


def with_cost(runs, basis):
    """Runs with exec_time_ms set to the cost basis (CPU time when chosen)."""
    return [dict(r, exec_time_ms=r['cpu_time_ms']) if basis == 'cpu' else r for r in runs]


def composite_for(runs, configs, inst):
    rows = stats.derive_rows(runs)
    mat, details = stats.composite_scores(rows, configs, [inst])
    per = details[0]['per_configuration']
    ranking = sorted(configs, key=lambda c: (-per[c]['CS'], configs.index(c)))
    return per, ranking


def all_box(r):
    return r['csr_pct'] * r['placed'] / r['n_items'] if r['n_items'] else 0.0


def representative(indexed_runs):
    """indexed_runs: [(index in study['runs'], run)] of one method on one load."""
    return min(indexed_runs, key=lambda ir: (-all_box(ir[1]), -ir[1]['su_pct'], ir[1]['seed']))


def recommend_load(study, inst, indexed):
    runs = [r for _, r in indexed]
    configs = [c for c in CONFIGS if any(r['configuration'] == c for r in runs)]
    seeds = sorted({r['seed'] for r in runs})
    out = {'instance_id': inst, 'configurations': configs, 'seeds': seeds, 'n_runs': len(runs)}

    reps = {}
    for c in configs:
        i, r = representative([(i, r) for i, r in indexed if r['configuration'] == c])
        reps[c] = {'run_index': i, 'seed': r['seed'], 'su_pct': r['su_pct'], 'csr_placed_pct': r['csr_pct'],
                   'csr_all_pct': all_box(r), 'placed': r['placed'], 'n_items': r['n_items'],
                   'not_loaded': r['n_items'] - r['placed'], 'wall_ms': r['exec_time_ms'],
                   'cpu_ms': r.get('cpu_time_ms'), 'peak_mem_mb': r.get('peak_mem_mb'),
                   'C3_pct': r['C3_pct'], 'C4_pct': r['C4_pct'], 'C5_pct': r['C5_pct'], 'C6_pct': r['C6_pct']}
    out['representative'] = reps
    out['representative_rule'] = ('the run with the highest rule-following over all boxes, then the highest '
                                  'container fill, then the lowest repeat code')

    basis, reason = cost_basis(study, runs)
    out['cost_basis'] = basis
    if basis is None or len(configs) < 2:
        out.update(available=False, reason=reason or 'fewer than two methods ran on this load')
        return out
    costed = with_cost(runs, basis)
    per, ranking = composite_for(costed, configs, inst)
    out.update(available=True, composite=per, ranking=ranking, top=ranking[0],
               formula='CS = 0.25*SU~ + 0.25*CSR~ + 0.25*(1-CC~) + 0.25*(1-Rob~) (experiments/stats.py composite_scores, one load)',
               cost_note=('Cost here uses CPU time; the thesis studies use wall-clock time (M-3).' if basis == 'cpu'
                          else 'Cost here uses wall-clock time (M-3); this comparison ran one run at a time.'),
               memory_note='Peak memory is as recorded; each run had its own worker process.')

    # Tie rule: leave one repeat code out.
    reps_loo = []
    if len(seeds) >= 3:          # Rob needs >= 2 runs per method after dropping one
        for s in seeds:
            kept = [r for r in costed if r['seed'] != s]
            p2, rk2 = composite_for(kept, configs, inst)
            reps_loo.append({'left_out': s, 'top': rk2[0], 'scores': {c: p2[c]['CS'] for c in configs}})
    tops = sorted({x['top'] for x in reps_loo} - {ranking[0]}, key=configs.index)
    out['tie'] = {'rule': 'leave one repeat code out: the composite is recomputed once per repeat code with '
                          "that code's runs removed; if the top method changes in any recomputation, the "
                          'result is "Two methods did about equally well"',
                  'checked': bool(reps_loo), 'replicates': reps_loo,
                  'is_tie': bool(tops), 'also_top': tops}
    return out


def recommend(study):
    runs = study['runs']
    keys = []
    for r in runs:
        k = r.get('instance_id')
        if k not in keys:
            keys.append(k)
    loads = []
    for k in keys:
        indexed = [(i, r) for i, r in enumerate(runs) if r.get('instance_id') == k]
        loads.append(recommend_load(study, k, indexed))
    return {'study': study.get('name'), 'mode': study.get('mode'), 'custom_load': study.get('custom_load'),
            'loads': loads}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('study')
    a = ap.parse_args(argv)
    study = json.loads(Path(a.study).read_text(encoding='utf-8'))
    print(json.dumps(recommend(study)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
