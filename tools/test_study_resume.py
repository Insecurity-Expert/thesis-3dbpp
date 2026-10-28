"""
test_study_resume.py - study.py resume, progress line and chunk merge.

Runs a small study (instance 350, quick preset, DGWO + MOGWO, seeds 1-3, serial),
kills it after three runs, restarts the same command and checks that
  1. the assembled file matches an uninterrupted run (placements, orientations, SU, CSR, layout),
  2. the progress line resumes from the right count and ends at 100 %,
  3. a restart with other settings is refused,
  4. two chunks (seeds 1-2 and seed 3, separate --out) merge into the same runs and the
     stats step accepts the result, and overlapping chunks are refused.
Also unit-checks the duration format and the work weights.

Usage:
    python tools/test_study_resume.py        (about 3 minutes)
"""
import re
import sys
import json
import time
import tempfile
import subprocess
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
sys.path[:0] = [str(_ROOT), str(_ROOT / 'optimizer'), str(_ROOT / 'experiments')]
import study

FAILS = []
STUDY = [sys.executable, str(_ROOT / 'experiments' / 'study.py')]
COMMON = ['--instance', '350', '--preset', 'quick', '--mode', 'serial', '--configs', 'DGWO,MOGWO', '--no-stats']


def check(cond, msg):
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond:
        FAILS.append(msg)


def run(args, log):
    with open(log, 'w') as f:
        return subprocess.run(STUDY + COMMON + args, stdout=f, stderr=subprocess.STDOUT).returncode


def det(r):
    return {k: r[k] for k in ('configuration', 'instance_id', 'seed', 'placed', 'su_pct', 'csr_pct',
                              'placements', 'orientations', 'layout')}


def main():
    print("-- units ------------------------------------------------------------")
    check(study.fmt_dur(26 * 3600) == '1d 02h' and study.fmt_dur(2 * 86400 + 16 * 3600) == '2d 16h'
          and study.fmt_dur(3725) == '1h 02m' and study.fmt_dur(75) == '1m 15s', "duration format")
    tasks = [{'configuration': c, 'instance_id': 1, 'seed': s} for c in ('REP', 'DGWO') for s in (1, 2)]
    pr = study.StudyProgress(tasks, {1: 10}, [], {'REP': 7.0, 'source': 'prior'})
    pr.start()
    check(pr.w_total == 2 * 700 + 2 * 100, "weight = n_boxes^2 x factor (REP 7, others 1)")
    pr.finish(study.task_key(tasks[0]))
    check(pr.snapshot()['pct_work'] == round(100 * 700 / 1600, 2) and pr.snapshot()['pct_runs'] == 25.0,
          "est.-work % differs from runs %")

    tmp = Path(tempfile.mkdtemp(prefix='resume_'))
    print(f"\n-- kill and restart ({tmp}) ---------------------------------------")
    run(['--seeds', '1-3', '--name', 'T', '--out', str(tmp / 'ref.json')], tmp / 'ref.log')
    out = tmp / 'int.json'
    cmd = STUDY + COMMON + ['--seeds', '1-3', '--name', 'T', '--out', str(out)]
    p = subprocess.Popen(cmd, stdout=open(tmp / 'int1.log', 'w'), stderr=subprocess.STDOUT, start_new_session=True)
    runs_dir = Path(str(out) + '.runs')
    while len(list(runs_dir.glob('*_*_*.json'))) < 3 and p.poll() is None:
        time.sleep(1)
    p.kill()   # SIGKILL on POSIX, TerminateProcess on Windows (no signal.SIGKILL there)
    p.wait()
    n_disk = len([f for f in runs_dir.glob('*.json') if f.name != 'spec.json'])
    check(3 <= n_disk < 6 and not out.exists(), f"killed with {n_disk} of 6 runs on disk and no final file yet")
    rc = run(['--seeds', '1-3', '--name', 'T', '--out', str(out)], tmp / 'int2.log')
    log2 = (tmp / 'int2.log').read_text()
    check(rc == 0 and out.exists(), "restart finished and wrote the study file")
    check(f"{n_disk} already on disk (resuming)" in log2 and f"{6 - n_disk} remaining" in log2, "start line: total / done / remaining")
    lines = re.findall(r"\[([\d,]+) / ([\d,]+) runs \| ([\d.]+)% runs \| ([\d.]+)% est\. work\]", log2)
    check(lines and int(lines[0][0]) == n_disk + 1 and lines[-1][:1] == ('6',) and lines[-1][2:] == ('100.0', '100.0'),
          f"progress line resumes at {n_disk + 1} / 6 and ends at 100.0% / 100.0%")
    check(all(float(a[3]) <= float(b[3]) for a, b in zip(lines, lines[1:])), "est.-work % never goes down")
    ref, got = json.loads((tmp / 'ref.json').read_text()), json.loads(out.read_text())
    check([det(r) for r in ref['runs']] == [det(r) for r in got['runs']],
          "interrupted + resumed file == uninterrupted file (placements, orientations, SU, CSR, layout)")
    check(got['resume']['runs_loaded_from_disk'] == n_disk, "file records how many runs came from disk")
    rc = run(['--seeds', '1-3', '--name', 'T', '--out', str(out), '--edge-fill'] + ['--lambda', '0.3'], tmp / 'bad.log')
    check(rc != 0 and 'cannot resume' in (tmp / 'bad.log').read_text(), "restart with other settings is refused")

    print("\n-- chunks and merge -------------------------------------------------")
    run(['--seeds', '1-2', '--name', 'A', '--out', str(tmp / 'A.json')], tmp / 'A.log')
    run(['--seeds', '3', '--name', 'B', '--out', str(tmp / 'B.json')], tmp / 'B.log')
    m = subprocess.run([sys.executable, str(_ROOT / 'experiments' / 'study.py'), '--merge', str(tmp / 'A.json'),
                        str(tmp / 'B.json'), '--out', str(tmp / 'AB.json')], capture_output=True, text=True)
    check(m.returncode == 0, "two chunks merge")
    merged = json.loads((tmp / 'AB.json').read_text())
    check([det(r) for r in merged['runs']] == [det(r) for r in ref['runs']], "merged runs == uninterrupted study")
    check('stats' in merged and merged['stats']['layout']['available']
          and 'isolated_boxes' in merged['stats']['layout']['measures'], "stats step accepted it; edge measures in stats.layout")
    m = subprocess.run([sys.executable, str(_ROOT / 'experiments' / 'study.py'), '--merge', str(tmp / 'A.json'),
                        str(tmp / 'AB.json'), '--out', str(tmp / 'x.json')], capture_output=True, text=True)
    check(m.returncode != 0 and 'must not overlap' in (m.stderr + m.stdout), "overlapping chunks are refused")

    print()
    if FAILS:
        print(f"FAIL ({len(FAILS)} failures)")
        sys.exit(1)
    print("PASS - tools/test_study_resume.py: all tests succeeded!")


if __name__ == '__main__':
    main()
