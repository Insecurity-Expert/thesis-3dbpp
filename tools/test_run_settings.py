"""Every run uses the calibrated λ and C4/C5 enforcement of Study A and Study B.

    python tools/test_run_settings.py            (about a minute)

  1  experiments/calibration.json equals the λ and enforcement flags stored in
     Study A and Study B, for every configuration (each study passes one
     setting to all of its runs).
  2  The server sends them explicitly: server/runSettings.js turns the file
     into arguments, and both launch paths (Quick Test in server/index.js,
     comparisons in server/studies.js) append them; neither reads λ or the
     enforcement flags from the browser.
  3  A comparison launched with the server's arguments (study.py, instance
     350, Quick preset, seed 1, all four configurations) records, per run, the
     λ and flags its optimizer object actually used (params_used). Each must
     equal Study A/B's for that configuration.
  4  A Quick Test launched with the server's arguments (main_optimizer.py,
     each configuration, 1 iteration) echoes the same λ and flags.
  5  Any comparison saved by the app in experiments/results/studies that
     records params_used is checked the same way.

FAILS on any difference (e.g. an optimizer default of 1000.0 or enforcement
off instead of the calibrated values).
"""
import sys
import json
import tempfile
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STUDIES = ROOT / 'experiments' / 'results' / 'studies'
CONFIGS = ['DGWO', 'MOGWO', 'SEQ', 'REP']
FAILED = []


def check(name, got, want):
    ok = got == want
    print(f"  {'PASS' if ok else 'FAIL'}  {name}" + ('' if ok else f"\n        got  {got!r}\n        want {want!r}"))
    if not ok:
        FAILED.append(name)


def setting(lams, sup, frag):
    return {'lambda_w': float(lams['w']), 'lambda_f': float(lams['f']), 'lambda_b': float(lams['b']),
            'lambda_a': float(lams['a']), 'enforce_support': bool(sup), 'enforce_fragility': bool(frag)}


def from_params(p):
    return {k: (float(p[k]) if k.startswith('lambda') else bool(p[k]))
            for k in ('lambda_w', 'lambda_f', 'lambda_b', 'lambda_a', 'enforce_support', 'enforce_fragility')}


# ── 1. calibration file vs Study A / B ──────────────────────────────────────
print("1  calibration file vs Study A and Study B")
cal = json.loads((ROOT / 'experiments' / 'calibration.json').read_text(encoding='utf-8'))
want = setting(cal['lambdas'], cal['enforce_support'], cal['enforce_fragility'])
reference = {}
for f in ('studyA_i350_standard_s1-30_parallel.json', 'studyB_sample8_quick_s1-10_serial.json'):
    d = json.loads((STUDIES / f).read_text(encoding='utf-8'))
    for c in CONFIGS:
        got = setting(d['lambdas'], d['enforce_support'], d['enforce_fragility'])
        check(f"{f.split('_')[0]} {c}", got, want)
        reference.setdefault(c, got)
print(f"     reference per method: {json.dumps(reference['DGWO'])} (identical for all four)")

# ── 2. the server sends them explicitly ─────────────────────────────────────
print("2  the server's launch paths")
args = json.loads(subprocess.check_output(
    ['node', '-e', "console.log(JSON.stringify(require('./server/runSettings').calibratedArgs()))"], cwd=ROOT))
print(f"     calibratedArgs(): {' '.join(args)}")
check('args carry the calibrated λ', [args[i + 1] for i in (0, 2, 4, 6)],
      [str(cal['lambdas'][k]) for k in 'wfba'])
index = (ROOT / 'server' / 'index.js').read_text(encoding='utf-8')
studies = (ROOT / 'server' / 'studies.js').read_text(encoding='utf-8')
check('Quick Test path appends calibratedArgs()', 'argv.push(...calibratedArgs())' in index, True)
check('Quick Test path reads no λ / enforcement from the browser',
      any(k in index for k in ('msg.lambda', 'msg.enforceSupport', 'msg.enforceFragility')), False)
check('comparison path appends calibratedArgs()', '...calibratedArgs()]' in studies, True)

# ── 3. a comparison with the server's arguments ─────────────────────────────
print("3  comparison (study.py) with the server's arguments")
with tempfile.TemporaryDirectory() as tmp:
    out = Path(tmp) / 'settings_check.json'
    cmd = [sys.executable, str(ROOT / 'experiments' / 'study.py'), '--preset', 'quick', '--mode', 'parallel',
           '--seeds', '1', '--instance', '350', '--workers', '4', '--out', str(out), '--name', 'settings check'] + args
    subprocess.run(cmd, cwd=ROOT, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    runs = json.loads(out.read_text(encoding='utf-8'))['runs']
for r in sorted(runs, key=lambda r: CONFIGS.index(r['configuration'])):
    check(f"comparison run {r['configuration']} seed {r['seed']}", from_params(r['params_used']), reference[r['configuration']])

# ── 4. a Quick Test with the server's arguments ─────────────────────────────
print("4  Quick Test (main_optimizer.py) with the server's arguments")
for c in CONFIGS:
    cmd = [sys.executable, str(ROOT / 'optimizer' / 'main_optimizer.py'), '350', '--dataset', 'wtpack',
           '--raw-dir', str(ROOT / 'data' / 'raw'), '--stream', '--strategy', c,
           '--pop-size', '3', '--max-iter', '1', '--seed', '1'] + args
    lines = subprocess.run(cmd, cwd=ROOT, check=True, capture_output=True, text=True).stdout.splitlines()
    done = [json.loads(l) for l in lines if l.startswith('{') and '"instance_complete"' in l]
    check(f"Quick Test {c}", from_params(done[-1]['params']) if done else None, reference[c])

# ── 5. comparisons the app has saved ────────────────────────────────────────
print("5  comparisons saved by the app")
n = 0
for f in sorted(STUDIES.glob('*.json')):
    if f.name.endswith('.progress.json') or f.name.startswith('study'):
        continue
    d = json.loads(f.read_text(encoding='utf-8'))
    rows = [r for r in d.get('runs', []) if 'params_used' in r]
    for r in rows:
        check(f"{f.name} {r['configuration']} seed {r['seed']}", from_params(r['params_used']), reference[r['configuration']])
    n += len(rows)
print(f"     {n} saved run(s) checked")

print()
print(f"{'FAIL' if FAILED else 'PASS'} - {len(FAILED)} failed")
sys.exit(1 if FAILED else 0)
