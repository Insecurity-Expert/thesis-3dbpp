"""Acceptance A: the viewer's problem highlighting equals the independent validator.

Runs main_optimizer.py exactly as the server does (wtpack, instance 350,
seed 42, Quick preset pop 10 x 60) for DGWO, MOGWO and REP, maps each output
box back from render to physics axes, and compares the per-box C3-C6 flags the
optimizer emitted with tools/validate_arrangement.py, box by box and rule by
rule. REP must show zero violating boxes and a correct non-zero not-loaded
count. Then one stored Study A run is rebuilt through arrangement_view and
must reproduce its stored SU / CSR.

    python tools/check_problem_view.py            # PASS / FAIL
"""
import sys
import json
import subprocess
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
sys.path[:0] = [str(_ROOT), str(_ROOT / 'optimizer'), str(_ROOT / 'tools')]

from validate_arrangement import validate

INSTANCE, SEED, POP, ITERS = 350, 42, 10, 60
RULES = ('C3', 'C4', 'C5', 'C6')
STUDY = _ROOT / 'experiments' / 'results' / 'studies' / 'studyA_i350_standard_s1-30_parallel.json'


def run_optimizer(strategy):
    out = subprocess.run([sys.executable, str(_ROOT / 'optimizer' / 'main_optimizer.py'), str(INSTANCE),
                          '--dataset', 'wtpack', '--strategy', strategy, '--seed', str(SEED),
                          '--pop-size', str(POP), '--max-iter', str(ITERS)],
                         capture_output=True, text=True, cwd=_ROOT, check=True)
    return json.loads(out.stdout.strip().splitlines()[-1])


def compare(result, boxes, container, label):
    # render (x, y=height, z=depth) -> physics (x, y=depth, z=height)
    P = {e['item_idx']: [e['x'], e['z'], e['y'], e['dx'], e['dz'], e['dy']] for e in result['items']}
    O = {e['item_idx']: e['orientation'] for e in result['items']}
    ref = validate(container, boxes, P, O, verbose=True)['per_box']
    ok = True
    for rule in RULES:
        got = sorted(e['item_idx'] for e in result['items'] if rule in e['violations'])
        want = sorted(i for i in ref if not ref[i][rule])
        same = got == want
        ok &= same
        print(f"  {label:6s} {rule}: viewer {len(got):3d} boxes, validator {len(want):3d} boxes  "
              f"{'match' if same else 'DIFF ' + str(sorted(set(got) ^ set(want)))}")
    pv = result['problem_view']
    n_unplaced = pv['n_items'] - pv['n_placed']
    listed = len(pv['unplaced'])
    good = n_unplaced == listed == result['unplaced'] and pv['n_items'] == len(boxes)
    ok &= good
    print(f"  {label:6s} not loaded: {listed} of {pv['n_items']} listed, result says {result['unplaced']}  "
          f"{'match' if good else 'DIFF'}")
    return ok, sum(len(e['violations']) > 0 for e in result['items']), n_unplaced


def main():
    from preprocessing.pipeline import load_augmented_instance
    inst = load_augmented_instance({'data': {'raw_dir': str(_ROOT / 'data' / 'raw')}}, instance_id=INSTANCE)
    boxes, container = inst['boxes'], inst['container']
    all_ok = True
    for strat in ('DGWO', 'MOGWO', 'REP'):
        res = run_optimizer(strat)
        ok, n_flagged, n_unplaced = compare(res, boxes, container, strat)
        if strat == 'REP':
            rep_ok = n_flagged == 0 and n_unplaced > 0
            print(f"  REP    highlighted {n_flagged}, not loaded {n_unplaced}  "
                  f"{'ok' if rep_ok else 'FAIL (want 0 highlighted and >0 not loaded)'}")
            ok &= rep_ok
        all_ok &= ok

    from arrangement_view import study_run_view
    doc = json.loads(STUDY.read_text(encoding='utf-8'))
    idx = next(i for i, r in enumerate(doc['runs']) if r['configuration'] == 'MOGWO' and r['seed'] == 7)
    view = study_run_view(STUDY, idx)
    v = view['verified']
    s_ok = abs(v['su_pct'] - v['stored_su_pct']) < 1e-6 and abs(v['csr_pct'] - v['stored_csr_pct']) < 1e-6
    print(f"  study  Study A run {idx} (MOGWO seed 7): SU {v['su_pct']} vs {v['stored_su_pct']}, "
          f"CSR {v['csr_pct']} vs {v['stored_csr_pct']}  {'match' if s_ok else 'DIFF'}")
    run = doc['runs'][idx]
    P = {int(k): v for k, v in run['placements'].items()}
    O = {int(k): v for k, v in run['orientations'].items()}
    ref = validate(container, boxes, P, O, verbose=True)['per_box']
    for rule in RULES:
        got = sorted(e['item_idx'] for e in view['items'] if rule in e['violations'])
        want = sorted(i for i in ref if not ref[i][rule])
        s_ok &= got == want
    print(f"  study  per-box flags vs validator: {'match' if s_ok else 'DIFF'}")
    all_ok &= s_ok

    print("PASS" if all_ok else "FAIL")
    return 0 if all_ok else 1


if __name__ == '__main__':
    sys.exit(main())
