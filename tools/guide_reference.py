"""Independent reference for the Loading Guide test (acceptance 5).

    python tools/guide_reference.py --study <study.json> --run <index>

For one stored study run, from tools/validate_arrangement.py only (it imports
nothing from optimizer/):
  supporters   per placed box: the boxes it rests on, by the validator's C5
               contact rule (a top face within TOL of the base, footprint
               overlap _ov > 0 on both axes; a base within TOL of the floor
               rests on the floor)
  c6_blockers  per C6-blocked box: the later-stop boxes the validator names
               (above it, or between it and the door), parsed from its issues
  counts       boxes breaking C3, C4, C5, C6 (validator per-box flags)
  unplaced     the boxes the run did not load
Keys are box indices (item_idx).
"""
import re
import sys
import json
import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / 'tools'))
import validate_arrangement as va   # noqa: E402


def reference(study_path, run_index):
    doc = json.loads(Path(study_path).read_text(encoding='utf-8'))
    run = doc['runs'][run_index]
    if run.get('custom_load'):
        from preprocessing.custom_load import load_stored
        inst = load_stored(run['custom_load'])
    else:
        from preprocessing.pipeline import load_augmented_instance
        inst = load_augmented_instance({'data': {'raw_dir': str(ROOT / 'data' / 'raw')}}, instance_id=run['instance_id'],
                                       stop_seed=doc['stop_seed'], stop_count=doc['stop_count'])
    boxes, container = inst['boxes'], inst['container']
    P = {int(k): [float(v) for v in vals] for k, vals in run['placements'].items()}
    O = {int(k): int(v) for k, v in run['orientations'].items()}
    res = va.validate(container, boxes, P, O, verbose=True)

    supporters = {}
    for i, (x, y, z, dx, dy, dz) in P.items():
        if abs(z) < va.TOL:
            supporters[i] = []
            continue
        supporters[i] = sorted(j for j, (xj, yj, zj, dxj, dyj, dzj) in P.items()
                               if j != i and abs((zj + dzj) - z) < va.TOL
                               and va._ov(x, x + dx, xj, xj + dxj) > 0 and va._ov(y, y + dy, yj, yj + dyj) > 0)
    c6 = {}
    for line in res['issues']:
        m = re.match(r'C6 box (\d+) \(stop \d+\): later-stop above \[(.*?)\], doorward \[(.*?)\]', line)
        if m:
            ids = [int(t) for t in re.findall(r'\d+', m.group(2) + ',' + m.group(3))]
            c6[int(m.group(1))] = sorted(set(ids))
    pb = res['per_box']
    counts = {k: sum(1 for i in pb if not pb[i][k]) for k in ('C3', 'C4', 'C5', 'C6')}
    return {'supporters': supporters, 'c6_blockers': c6, 'counts': counts,
            'unplaced': sorted(i for i in range(len(boxes)) if i not in P),
            'ids': {i: boxes[i].get('id', i) for i in range(len(boxes))}}


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--study', required=True)
    ap.add_argument('--run', type=int, required=True)
    a = ap.parse_args()
    print(json.dumps(reference(a.study, a.run)))
