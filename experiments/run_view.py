"""One stored study run for the 3-D viewer and the Loading Guide.

    python experiments/run_view.py --study <study.json> --run <index>

Calls optimizer/arrangement_view.study_run_view (which re-verifies the stored
arrangement against the study's recorded SU and CSR and annotates every
placed box with its C3-C6 outcome, load above vs capacity, support ratio and
C6 blockers) and adds, without changing any of it:

* the size of every box that was not loaded (item_idx -> l, w, h), read from
  the same load the run used;
* the run's wall-clock and CPU time, its repeat code and the study's preset,
  for the guide's technical details.
Nothing here feeds a score.
"""
import sys
import json
import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
for p in (str(ROOT), str(ROOT / 'optimizer')):
    if p not in sys.path:
        sys.path.insert(0, p)

from arrangement_view import study_run_view   # noqa: E402


def run_view(study_path, run_index):
    view = study_run_view(study_path, run_index)
    doc = json.loads(Path(study_path).read_text(encoding='utf-8'))
    run = doc['runs'][run_index]
    if run.get('custom_load'):
        from preprocessing.custom_load import load_stored
        boxes = load_stored(run['custom_load'])['boxes']
    else:
        from preprocessing.pipeline import load_augmented_instance
        boxes = load_augmented_instance({'data': {'raw_dir': str(ROOT / 'data' / 'raw')}},
                                        instance_id=run['instance_id'],
                                        stop_seed=doc['stop_seed'], stop_count=doc['stop_count'])['boxes']
    for u in view['problem_view']['unplaced']:
        b = boxes[u['item_idx']]
        u.update(l=b['l'], w=b['w'], h=b['h'])
    view['timing'] = {'wall_ms': run.get('exec_time_ms'), 'cpu_ms': run.get('cpu_time_ms'),
                      'peak_mem_mb': run.get('peak_mem_mb'), 'mode': doc.get('mode')}
    view['study_name'] = doc.get('name')
    return view


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--study', required=True)
    ap.add_argument('--run', type=int, required=True)
    a = ap.parse_args()
    try:
        print(json.dumps(run_view(a.study, a.run)))
    except Exception as exc:
        print(json.dumps({"status": "error", "error": str(exc)}))
        sys.exit(1)
