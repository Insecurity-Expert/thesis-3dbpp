"""Sample files: study.py refuses deprecated ones; the demo instance is separate.

    python tools/test_sample_guard.py

1. load_sample() refuses a file whose name contains DEPRECATED, and a file
   whose JSON has "deprecated": true; it accepts the thesis sample.
2. study.py --sample on the deprecated file exits with an error before any run.
3. The thesis sample (experiments/sample30_seed42.json) is what the current
   preprocessing/sampling.py draws; the demo instance (350) is not in it, and
   its metadata matches the pipeline.
"""
import sys
import json
import shutil
import tempfile
import subprocess
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT))
sys.path.insert(0, str(_ROOT / 'optimizer'))
sys.path.insert(0, str(_ROOT / 'experiments'))

import study

THESIS = _ROOT / 'experiments' / 'sample30_seed42.json'
OLD = _ROOT / 'experiments' / 'samples' / 'sample30_seed42_DEPRECATED.json'
DEMO = _ROOT / 'experiments' / 'samples' / 'demo_instance_350.json'

failed = 0


def check(label, got, want):
    global failed
    ok = got == want
    failed += not ok
    print(f"  {'PASS' if ok else 'FAIL'}  {label}" + ("" if ok else f"  (got {got!r}, want {want!r})"))


def refused(path):
    try:
        study.load_sample(path)
        return False
    except ValueError:
        return True


print("[load_sample]")
check("thesis sample is accepted", study.load_sample(THESIS)['n_total'], 30)
check("the deprecated sample is refused", refused(OLD), True)
tmp = Path(tempfile.mkdtemp())
try:
    by_name = tmp / 'copy_of_thesis_DEPRECATED.json'
    shutil.copy(THESIS, by_name)
    check("a file named *DEPRECATED* is refused even with valid content", refused(by_name), True)
    by_flag = tmp / 'normal_name.json'
    doc = json.loads(THESIS.read_text(encoding='utf-8'))
    doc['deprecated'] = True
    by_flag.write_text(json.dumps(doc), encoding='utf-8')
    check('a file marked "deprecated": true is refused under any name', refused(by_flag), True)

    print("[study.py CLI]")
    out = tmp / 'never_written.json'
    r = subprocess.run([sys.executable, str(_ROOT / 'experiments' / 'study.py'), '--sample', str(OLD),
                        '--preset', 'quick', '--seeds', '1', '--mode', 'serial', '--no-stats',
                        '--out', str(out)], capture_output=True, text=True)
    check("study.py exits non-zero on the deprecated sample", r.returncode != 0, True)
    check("the error names the refusal", 'deprecated' in r.stderr.lower(), True)
    check("no study file is written", out.exists(), False)
finally:
    shutil.rmtree(tmp, ignore_errors=True)

print("[thesis sample and demo instance]")
from preprocessing.sampling import sample_instances
from preprocessing.pipeline import load_augmented_instance
thesis = json.loads(THESIS.read_text(encoding='utf-8'))
_, fresh = sample_instances({'data': {'raw_dir': str(_ROOT / 'data' / 'raw')}}, n_total=30, seed=42)
check("thesis sample = what sampling.py draws now (ids, in order)",
      [c['instance_id'] for c in thesis['selected']], [c['instance_id'] for c in fresh['selected']])
demo = json.loads(DEMO.read_text(encoding='utf-8'))['instance']
check("demo instance is 350", demo['instance_id'], 350)
check("demo instance is not in the thesis sample",
      demo['instance_id'] in {c['instance_id'] for c in thesis['selected']}, False)
inst = load_augmented_instance({'data': {'raw_dir': str(_ROOT / 'data' / 'raw')}}, instance_id=350,
                               stop_seed=study.STOP_SEED, stop_count=study.STOP_COUNT)
boxes = inst['boxes']
check("demo n_boxes / n_types / fragile_count match the pipeline",
      (demo['n_boxes'], demo['n_types'], demo['fragile_count']),
      (len(boxes), len({(b['l'], b['w'], b['h']) for b in boxes}), sum(int(b['fragile']) for b in boxes)))

print(f"\n{'PASS' if not failed else 'FAIL'} - {failed} failed")
sys.exit(1 if failed else 0)
