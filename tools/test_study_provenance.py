"""Study provenance: commit taken at the start, end state, dirty flag, versions.

    python tools/test_study_provenance.py

1. git_state() on a scratch repository: clean, an edited tracked file (dirty),
   an untracked file only (not dirty).
2. A one-run study (DGWO, Quick, seed 1, instance 350, serial, no stats)
   writes commit == commit_start == HEAD at launch, the end state, and the
   numba / numpy / scipy / python versions of the interpreter that ran it.
"""
import sys
import json
import shutil
import tempfile
import subprocess
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT / 'experiments'))

import numba
import study

failed = 0


def check(label, got, want):
    global failed
    ok = got == want
    failed += not ok
    print(f"  {'PASS' if ok else 'FAIL'}  {label}" + ("" if ok else f"  (got {got!r}, want {want!r})"))


def git(args, cwd):
    subprocess.run(['git', *args], cwd=cwd, check=True, capture_output=True)


print("[git_state] scratch repository")
tmp = Path(tempfile.mkdtemp())
try:
    git(['init', '-q'], tmp)
    (tmp / 'a.txt').write_text('one\n')
    git(['add', 'a.txt'], tmp)
    git(['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'init'], tmp)
    s = study.git_state(tmp)
    check("clean tree is not dirty", s['dirty'], False)
    check("commit is recorded", bool(s['commit']), True)
    (tmp / 'new.txt').write_text('untracked\n')
    check("an untracked file alone is not dirty", study.git_state(tmp)['dirty'], False)
    (tmp / 'a.txt').write_text('two\n')
    s = study.git_state(tmp)
    check("an edited tracked file is dirty", s['dirty'], True)
    check("the edited file is listed", s['dirty_files'], ['a.txt'])
finally:
    shutil.rmtree(tmp, ignore_errors=True)

print("[study] one-run study records provenance")
head = study.git_commit()
out_dir = Path(tempfile.mkdtemp())
try:
    out = out_dir / 'prov.json'
    r = subprocess.run([sys.executable, str(_ROOT / 'experiments' / 'study.py'), '--instance', '350',
                        '--preset', 'quick', '--seeds', '1', '--mode', 'serial', '--configs', 'DGWO',
                        '--no-stats', '--out', str(out), '--name', 'provenance check'],
                       capture_output=True, text=True)
    check("study exits 0", r.returncode, 0)
    if r.returncode == 0:
        doc = json.loads(out.read_text(encoding='utf-8'))
        g = doc.get('git', {})
        check("commit is the start commit", doc.get('commit'), g.get('commit_start'))
        check("start commit is HEAD at launch", g.get('commit_start'), head)
        check("end commit recorded", g.get('commit_end'), head)
        check("dirty flags are booleans", (type(g.get('dirty_start')), type(g.get('dirty_end'))), (bool, bool))
        check("unchanged repository -> changed_during_run False", g.get('changed_during_run'), False)
        check("numba version recorded", doc.get('versions', {}).get('numba'), numba.__version__)
        check("python / numpy / scipy recorded",
              all(doc.get('versions', {}).get(k) for k in ('python', 'numpy', 'scipy')), True)
    else:
        print(r.stderr[-2000:])
finally:
    shutil.rmtree(out_dir, ignore_errors=True)

print(f"\n{'PASS' if not failed else 'FAIL'} - {failed} failed")
sys.exit(1 if failed else 0)
