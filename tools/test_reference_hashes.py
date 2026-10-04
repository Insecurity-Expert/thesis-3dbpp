"""Cross-commit determinism guard: the four configurations against stored hashes.

    python tools/test_reference_hashes.py           # compare with tools/determinism_reference.json
    python tools/test_reference_hashes.py --write   # regenerate the reference (only after an
                                                    # approved change to optimizer behaviour)

Each case runs one configuration on wtpack instance 350 (stop seed 42, 3 stops)
at pop 10 x 20 iterations, lambda 0.20, C4/C5 enforced, and hashes the returned
arrangement: placements, orientations, SU and CSR. test_determinism.py checks
that one run repeats within a commit; this checks that the code has not drifted
since the reference was recorded. Timing and memory are never hashed.
"""
import sys
import json
import hashlib
import argparse
import platform
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT))
sys.path.insert(0, str(_ROOT / 'optimizer'))

import numba
from preprocessing.pipeline import load_augmented_instance
from thesis_algorithms import StandaloneDGWO, StandaloneMOGWO, SequentialHybrid, RepairBasedHybrid

REFERENCE = _ROOT / 'tools' / 'determinism_reference.json'
CONFIGS = {'DGWO': StandaloneDGWO, 'MOGWO': StandaloneMOGWO,
           'SEQ': SequentialHybrid, 'REP': RepairBasedHybrid}
SEEDS = (1, 42)
SETTINGS = {'instance_id': 350, 'stop_seed': 42, 'stop_count': 3, 'pop_size': 10, 'max_iter': 20,
            'lambda': 0.20, 'enforce_support': True, 'enforce_fragility': True}
HASH_DEFINITION = ('sha256 of json.dumps({"p": placements, "o": orientations, "su": su, "csr": csr}, '
                   'sort_keys=True), keys as strings, placements as [x, y, z, dx, dy, dz]')


def run_case(inst, cfg, seed):
    best = CONFIGS[cfg](inst['boxes'], inst['container'],
                        pop_size=SETTINGS['pop_size'], max_iter=SETTINGS['max_iter'],
                        lambda_penalty=SETTINGS['lambda'],
                        enforce_support=SETTINGS['enforce_support'],
                        enforce_fragility=SETTINGS['enforce_fragility'], seed=seed).run()
    blob = json.dumps({'p': {str(k): list(v) for k, v in sorted(best.placements.items())},
                       'o': {str(k): v for k, v in sorted(best.orientations.items())},
                       'su': best.su, 'csr': best.csr}, sort_keys=True)
    return {'configuration': cfg, 'seed': seed,
            'sha256': hashlib.sha256(blob.encode('utf-8')).hexdigest(),
            'placed': len(best.placements), 'su_pct': round(best.su * 100.0, 4),
            'csr_pct': round(best.csr, 4)}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--write', action='store_true', help='overwrite the reference with this commit\'s values')
    a = ap.parse_args()

    inst = load_augmented_instance({'data': {'raw_dir': str(_ROOT / 'data' / 'raw')}},
                                   instance_id=SETTINGS['instance_id'],
                                   stop_seed=SETTINGS['stop_seed'], stop_count=SETTINGS['stop_count'])
    cases = [run_case(inst, cfg, seed) for cfg in CONFIGS for seed in SEEDS]

    if a.write:
        REFERENCE.write_text(json.dumps({
            'what': 'four configurations x two seeds on instance 350; see tools/test_reference_hashes.py',
            'hash_definition': HASH_DEFINITION, 'settings': SETTINGS,
            'recorded_with': {'numba': numba.__version__, 'python': platform.python_version(),
                              'platform': platform.platform()},
            'cases': cases}, indent=1) + '\n', encoding='utf-8')
        print(f"wrote {REFERENCE.name} ({len(cases)} cases)")
        return 0

    ref = json.loads(REFERENCE.read_text(encoding='utf-8'))
    if ref.get('settings') != SETTINGS:
        print(f"FAIL - reference settings {ref.get('settings')} differ from the test's {SETTINGS}")
        return 1
    want = {(c['configuration'], c['seed']): c for c in ref['cases']}
    failed = 0
    for got in cases:
        exp = want.get((got['configuration'], got['seed']))
        ok = exp is not None and exp['sha256'] == got['sha256']
        failed += not ok
        line = f"  {'PASS' if ok else 'FAIL'}  {got['configuration']:5s} seed {got['seed']:2d}  {got['sha256'][:16]}"
        if not ok:
            line += (f"  expected {exp['sha256'][:16] if exp else 'no reference'}"
                     f"  placed {got['placed']} vs {exp and exp['placed']}"
                     f"  SU {got['su_pct']} vs {exp and exp['su_pct']}"
                     f"  CSR {got['csr_pct']} vs {exp and exp['csr_pct']}")
        print(line)
    for m in sorted(set(want) - {(c['configuration'], c['seed']) for c in cases}):
        failed += 1
        print(f"  FAIL  reference case {m} was not run")
    print(f"\n{'PASS' if not failed else 'FAIL'} - {failed} failed of {len(want)} reference cases "
          f"(numba {numba.__version__}; reference recorded with "
          f"numba {ref.get('recorded_with', {}).get('numba')})")
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
