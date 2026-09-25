"""Acceptance 4: the recommendation's composite scores are Chapter 3's.

    python tools/test_recommend.py

  1  Study B (serial: the cost basis is wall-clock, as in the thesis): every
     load's composite from experiments/recommend.py equals the per-instance
     composite stats.py stored in the study file (stats.composite.per_instance).
  2  For every load of Study B and of every comparison the app saved with CPU
     time: the composite equals an independent re-implementation of the
     Chapter 3 formula written here from the definition (not stats.py),
     with CPU time as the cost when the load recorded it.
  3  The tie flag equals an independent leave-one-repeat-code-out check.
  4  Representative runs follow the stated rule.
  5  A parallel study without CPU time (Study A) gets no recommendation.
"""
import sys
import json
import statistics as st
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'experiments'))
import recommend   # noqa: E402

STUDIES = ROOT / 'experiments' / 'results' / 'studies'
CONFIGS = ['DGWO', 'MOGWO', 'SEQ', 'REP']
FAILED = []


def check(name, ok, detail=''):
    print(f"  {'PASS' if ok else 'FAIL'}  {name}" + ('' if ok else f"  {detail}"))
    if not ok:
        FAILED.append(name)


def minmax(v):
    lo, hi = min(v), max(v)
    return [0.5] * len(v) if hi == lo else [(x - lo) / (hi - lo) for x in v]


def z(v):
    m = sum(v) / len(v)
    sd = st.stdev(v) if len(v) > 1 else 0.0
    return [0.0] * len(v) if sd == 0 else [(x - m) / sd for x in v]


def independent(runs, use_cpu):
    """Chapter 3 CS on one load, from its definition."""
    cfg = [c for c in CONFIGS if any(r['configuration'] == c for r in runs)]
    by = {c: [r for r in runs if r['configuration'] == c] for c in cfg}
    mean = lambda xs: sum(xs) / len(xs)
    su = [mean([r['su_pct'] for r in by[c]]) for c in cfg]
    csr = [mean([r['csr_pct'] * r['placed'] / r['n_items'] for r in by[c]]) for c in cfg]
    et = [mean([(r['cpu_time_ms'] if use_cpu else r['exec_time_ms']) for r in by[c]]) for c in cfg]
    pm = [mean([r['peak_mem_mb'] for r in by[c]]) for c in cfg]
    rob = [st.stdev([r['su_pct'] for r in by[c]]) if len(by[c]) > 1 else 0.0 for c in cfg]
    cc = [(a + b) / 2 for a, b in zip(z(et), z(pm))]
    s, k, c_, r_ = minmax(su), minmax(csr), minmax(cc), minmax(rob)
    return {c: 0.25 * s[i] + 0.25 * k[i] + 0.25 * (1 - c_[i]) + 0.25 * (1 - r_[i]) for i, c in enumerate(cfg)}


def top_of(scores):
    return sorted(scores, key=lambda c: (-scores[c], CONFIGS.index(c)))[0]


def close(a, b):
    return all(abs(a[c] - b[c]) < 1e-5 for c in a) and set(a) == set(b)


studyB = json.loads((STUDIES / 'studyB_sample8_quick_s1-10_serial.json').read_text(encoding='utf-8'))
recB = recommend.recommend(studyB)

print("1  Study B: recommend.py composite = the composite stats.py stored")
stored = {d['instance_id']: {c: v['CS'] for c, v in d['per_configuration'].items()}
          for d in studyB['stats']['composite']['per_instance']}
for L in recB['loads']:
    got = {c: L['composite'][c]['CS'] for c in L['configurations']}
    check(f"instance {L['instance_id']} ({L['cost_basis']})", L['cost_basis'] == 'wall' and close(got, stored[L['instance_id']]),
          f"{got} vs {stored[L['instance_id']]}")

files = [('Study B', studyB, recB)]
for f in sorted(STUDIES.glob('*.json')):
    if f.name.endswith('.progress.json') or f.name.startswith('study'):
        continue
    d = json.loads(f.read_text(encoding='utf-8'))
    if d.get('runs') and all('cpu_time_ms' in r for r in d['runs']):
        files.append((f.name, d, recommend.recommend(d)))

print("2-4  independent formula, tie check, representative runs")
for name, study, rec in files:
    for L in rec['loads']:
        runs = [r for r in study['runs'] if r.get('instance_id') == L['instance_id']]
        use_cpu = L['cost_basis'] == 'cpu'
        got = {c: L['composite'][c]['CS'] for c in L['configurations']}
        want = independent(runs, use_cpu)
        check(f"{name} load {L['instance_id']}: composite ({'CPU' if use_cpu else 'wall'} cost)", close(got, want), f"{got} vs {want}")
        check(f"{name} load {L['instance_id']}: top = {L['top']}", L['top'] == top_of(want))
        seeds = sorted({r['seed'] for r in runs})
        loo = {top_of(independent([r for r in runs if r['seed'] != s], use_cpu)) for s in seeds}
        check(f"{name} load {L['instance_id']}: tie = {L['tie']['is_tie']}", L['tie']['is_tie'] == bool(loo - {top_of(want)}))
        for c in L['configurations']:
            mine = [r for r in runs if r['configuration'] == c]
            best = max(mine, key=lambda r: (r['csr_pct'] * r['placed'] / r['n_items'], r['su_pct'], -r['seed']))
            rep = L['representative'][c]
            if not (study['runs'][rep['run_index']] is best or study['runs'][rep['run_index']] == best):
                check(f"{name} load {L['instance_id']} {c}: representative run", False, f"got seed {rep['seed']}, want {best['seed']}")
    print(f"     {name}: {len(rec['loads'])} load(s) checked")

print("5  Study A (parallel, no CPU time)")
recA = recommend.recommend(json.loads((STUDIES / 'studyA_i350_standard_s1-30_parallel.json').read_text(encoding='utf-8')))
check('no recommendation, with a reason', not recA['loads'][0]['available'] and bool(recA['loads'][0]['reason']))

print()
print(f"{'FAIL' if FAILED else 'PASS'} - {len(FAILED)} failed")
sys.exit(1 if FAILED else 0)
