"""experiments/representative.py: the neutral representative run and the means.

    python tools/test_representative.py

1. Synthetic: the representative is the run closest to the median SU; an
   exact tie goes to the lowest seed; even run counts use the mean of the two
   middle values as the median.
2. Study A and Study B (stored files): for every load and configuration the
   chosen run equals an independent re-implementation of the rule, its
   run_index points at that run, and the means equal a direct computation.
3. Nothing is ranked: no top / ranking / composite / recommendation keys.
"""
import sys
import json
import statistics
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT / 'experiments'))
import representative as R

failed = 0


def check(label, ok, detail=''):
    global failed
    failed += not ok
    print(f"  {'PASS' if ok else 'FAIL'}  {label}" + ('' if ok else f"  ({detail})"))


def run(cfg, seed, su, inst=1, placed=80, n=100, csr=50.0):
    return {'configuration': cfg, 'instance_id': inst, 'seed': seed, 'su_pct': su, 'csr_pct': csr,
            'placed': placed, 'n_items': n, 'exec_time_ms': 1000.0, 'cpu_time_ms': 900.0, 'peak_mem_mb': 100.0,
            'C3_pct': 90.0, 'C4_pct': 100.0, 'C5_pct': 100.0, 'C6_pct': 60.0}


print("[rule]")
# odd count: median 60 -> seed 3
doc = R.representatives({'runs': [run('DGWO', 1, 50), run('DGWO', 2, 70), run('DGWO', 3, 60)]})
check("closest to the median (odd count)", doc['loads'][0]['representative']['DGWO']['seed'] == 3)
# tie: median 60, seeds 4 (58) and 2 (62) are both 2 away -> lowest seed 2
doc = R.representatives({'runs': [run('MOGWO', 4, 58), run('MOGWO', 2, 62), run('MOGWO', 9, 60.5), run('MOGWO', 7, 59.5)]})
rep = doc['loads'][0]['representative']['MOGWO']
check("even count: median = mean of the middle two (60.0)", rep['median_su_pct'] == 60.0, rep['median_su_pct'])
check("exact tie in distance -> lowest seed", rep['seed'] == 7, rep['seed'])   # 59.5 and 60.5 tie; 7 < 9
doc = R.representatives({'runs': [run('SEQ', 5, 60), run('SEQ', 3, 60), run('SEQ', 8, 61)]})
check("identical SU -> lowest seed", doc['loads'][0]['representative']['SEQ']['seed'] == 3)
m = R.representatives({'runs': [run('REP', 1, 20, placed=30, csr=100.0), run('REP', 2, 30, placed=40, csr=100.0)]})['loads'][0]['means']['REP']
check("means: SU, all-box compliance, placed", (m['su_pct'], m['csr_all_pct'], m['placed']) == (25.0, 35.0, 35.0), m)

print("[stored studies]")
for name in ('studyA_i350_standard_s1-30_parallel.json', 'studyB_sample8_quick_s1-10_serial.json'):
    study = json.loads((_ROOT / 'experiments' / 'results' / 'studies' / name).read_text(encoding='utf-8'))
    doc = R.representatives(study)
    ok_rule = ok_index = ok_means = ok_even = True
    for L in doc['loads']:
        for c in L['configurations']:
            mine = [(i, r) for i, r in enumerate(study['runs']) if r.get('instance_id') == L['instance_id'] and r['configuration'] == c]
            med = statistics.median(r['su_pct'] for _, r in mine)
            # equal distances to 1e-9 are ties: with an even run count the two
            # middle runs are always exactly equidistant from the median
            best = sorted(mine, key=lambda ir: (round(abs(ir[1]['su_pct'] - med), 9), ir[1]['seed']))[0]
            mid = sorted(rr['su_pct'] for _, rr in mine)
            if len(mid) % 2 == 0:
                lo, hi = mid[len(mid) // 2 - 1], mid[len(mid) // 2]
                pair = [rr for _, rr in mine if rr['su_pct'] in (lo, hi)]
                ok_even &= best[1]['seed'] == min(rr['seed'] for rr in pair)
            got = L['representative'][c]
            ok_rule &= got['seed'] == best[1]['seed']
            ok_index &= study['runs'][got['run_index']]['seed'] == got['seed'] and study['runs'][got['run_index']]['configuration'] == c
            rs = [r for _, r in mine]
            ok_means &= abs(L['means'][c]['su_pct'] - sum(r['su_pct'] for r in rs) / len(rs)) < 1e-9
            ok_means &= abs(L['means'][c]['csr_all_pct'] - sum(r['csr_pct'] * r['placed'] / r['n_items'] for r in rs) / len(rs)) < 1e-9
            for k in ('C3', 'C4', 'C5', 'C6'):
                ok_means &= abs(L['means'][c][f'{k}_pct'] - sum(r[f'{k}_pct'] for r in rs) / len(rs)) < 1e-9
                ok_means &= abs(L['means'][c][f'{k}_all_pct'] - sum(r[f'{k}_pct'] * r['placed'] / r['n_items'] for r in rs) / len(rs)) < 1e-9
    check(f"{name[:6]}: representative = independent median rule ({len(doc['loads'])} load(s))", ok_rule)
    check(f"{name[:6]}: even run count -> the lower-seed of the two middle runs", ok_even)
    check(f"{name[:6]}: run_index points at that run", ok_index)
    check(f"{name[:6]}: means equal a direct computation", ok_means)
    flat = json.dumps(doc)
    check(f"{name[:6]}: nothing ranked or recommended",
          not any(k in flat for k in ('"top"', '"ranking"', '"composite"', '"recommend')))
    check(f"{name[:6]}: configurations in the fixed order",
          all(L['configurations'] == [c for c in R.CONFIGS if c in L['configurations']] for L in doc['loads']))

print(f"\n{'PASS' if not failed else 'FAIL'} - {failed} failed")
sys.exit(1 if failed else 0)
