"""Study runner: configurations x seeds x instances -> one results file -> stats.

A "study" is the unit the SOP needs: every one of the four configurations run
N times (seeds) on one or more instances, with SU, placement count, CSR and
C3-C6 over placed boxes, wall-clock (M-3) and peak memory (M-4) recorded per
run, then experiments/stats.py applied to the whole file.

    python experiments/study.py --size demo                       # 1 instance, Quick, parallel
    python experiments/study.py --size standard                   # instance 350, Standard, seeds 1-30, parallel
    python experiments/study.py --size multi                      # sample8, Quick, seeds 1-10, serial
    python experiments/study.py --instance 350 --preset quick --seeds 1-5 --mode parallel --out x.json
    python experiments/study.py --sample experiments/samples/sample8_seed42.json --preset quick --seeds 1-10 --mode serial

Timing: --mode serial runs one optimizer at a time (M-3 / M-4 valid for SP3);
--mode parallel runs several at once and the file is flagged "concurrent" -
stats.py then refuses SP3 and the composite score on it.

Every arrangement is passed through tools/validate_arrangement.py (the
independent checker) inside the worker; a disagreement with the optimizer's
own evaluator aborts the study with a non-zero exit.

After the runs, experiments/baselines.py adds the Weight-Sorted Greedy and the
Random Order baseline (30 one-pass shuffled orders) for every instance, run
serially in this process (study["baselines"]); stats.py reports them in its
supplementary block, outside SP1-SP3.

Each run executes in a FRESH worker process (also in serial mode): the numba
kernels are warmed untimed first, then M-3 is the wall-clock of opt.run()
alone and M-4 is the process's peak working set (psutil), which is monotonic
per process and therefore only meaningful when one run owns the process.
tracemalloc is deliberately not used: it slows the optimizer ~4x.

Resume: every finished run is written at once to its own file in <out>.runs/
(with spec.json, the settings and commit the runs were made under). Running the
same command again skips the runs already there and assembles <out> from all
of them at the end; a restart with different settings or another commit is
refused (--force-resume overrides the commit check). Chunks run separately
(other seeds or --instance-ids, each with its own --out) are merged into one
study file with `--merge a.json b.json --out all.json`.

Every finished run prints one progress line: runs done / total, the share of
estimated work done (weight n_boxes^2 x config factor, REP = 7 unless the runs
already on disk say otherwise) and an ETA from this session's elapsed time.

Progress is written to <out>.progress.json after every completed run so a
detached server job can be polled. The optimizer, decoder, repair and
preprocessing code are untouched: this file only calls them.
"""
import sys
import os
import json
import time
import argparse
import platform
import statistics
import subprocess
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor, as_completed

_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT))
sys.path.insert(0, str(_ROOT / 'optimizer'))
sys.path.insert(0, str(_ROOT / 'tools'))

CONFIGS = ['DGWO', 'MOGWO', 'SEQ', 'REP']
CONFIG_LABELS = {'DGWO': 'DGWO', 'MOGWO': 'MOGWO', 'SEQ': 'Sequential', 'REP': 'Repair-based'}

# The same three presets the Logistics tab offers (pop_size x max_iter).
PRESETS = {
    'quick':    {'pop_size': 10, 'max_iter': 60},
    'standard': {'pop_size': 10, 'max_iter': 300},
    'thesis':   {'pop_size': 30, 'max_iter': 300},
}

# The stop augmentation is part of the instance, so it is fixed (as the UI's
# Quick Test fixes it) and the run seed controls only the optimizer.
STOP_SEED = 42
STOP_COUNT = 3
SUPPORT_THRESHOLD = 0.80          # C5 (geometry_3d / validate_arrangement)

SAMPLE8 = _ROOT / 'experiments' / 'samples' / 'sample8_seed42.json'
STUDIES_DIR = _ROOT / 'experiments' / 'results' / 'studies'

# The three sizes in the UI's "Full Comparison" picker. The demo seed count is
# whatever fits the <= 3 minute target on the demo laptop (measured, see
# docs/DEMO.md); the server passes its own --seeds so this is the CLI default.
SIZES = {
    'demo':     {'instance': 350, 'preset': 'quick',    'seeds': '1-5',  'mode': 'parallel',
                 'name': 'Demo study'},
    'standard': {'instance': 350, 'preset': 'standard', 'seeds': '1-30', 'mode': 'parallel',
                 'name': 'Standard study (Study A)'},
    'multi':    {'sample': str(SAMPLE8), 'preset': 'quick', 'seeds': '1-10', 'mode': 'serial',
                 'name': 'Multi-instance study (Study B)'},
    'thesis':   {'sample': str(_ROOT / 'experiments' / 'sample30_seed42.json'), 'preset': 'thesis', 'seeds': '1-30', 'mode': 'serial',
                 'name': 'Thesis study'},
}


def load_sample(path):
    """Read a sample provenance file, refusing a deprecated one: its file name
    contains DEPRECATED, or its JSON has "deprecated": true."""
    path = Path(path)
    if 'DEPRECATED' in path.name.upper():
        raise ValueError(f"refusing deprecated sample file {path.name}: use experiments/sample30_seed42.json")
    doc = json.loads(path.read_text(encoding='utf-8'))
    if doc.get('deprecated') is True:
        raise ValueError(f"refusing sample file {path.name}: it is marked deprecated "
                         f"({doc.get('deprecated_reason', 'no reason given')})")
    return doc


def parse_seeds(spec):
    """'1-10' -> [1..10]; '1,4,9' -> [1,4,9]; both may be mixed."""
    out = []
    for part in str(spec).split(','):
        part = part.strip()
        if not part:
            continue
        if '-' in part:
            a, b = part.split('-', 1)
            out.extend(range(int(a), int(b) + 1))
        else:
            out.append(int(part))
    return out


# Windows: never open a console window for a child process. The server starts
# this script detached (no console of its own), so every console program it
# launches would otherwise get a fresh, visible window.
_NO_WINDOW = getattr(subprocess, 'CREATE_NO_WINDOW', 0)


def _hide_worker_windows():
    """Pool workers are started by multiprocessing with fixed creation flags,
    so CREATE_NO_WINDOW cannot be passed to them. pythonw.exe is the same
    interpreter without a console; workers talk to the parent over pipes,
    never stdout, so nothing is lost."""
    if sys.platform != 'win32':
        return
    import multiprocessing
    pythonw = Path(sys.executable).with_name('pythonw.exe')
    if pythonw.exists():
        multiprocessing.set_executable(str(pythonw))


def _git(args, cwd):
    return subprocess.check_output(['git', *args], cwd=cwd, stderr=subprocess.DEVNULL,
                                   creationflags=_NO_WINDOW).decode()


def git_commit(cwd=_ROOT):
    try:
        return _git(['rev-parse', '--short', 'HEAD'], cwd).strip()
    except Exception:
        return None


def git_state(cwd=_ROOT):
    """Commit and working-tree state. dirty = a TRACKED file differs from the
    commit (untracked files, e.g. study outputs, are not counted); None when
    git is unavailable."""
    commit = git_commit(cwd)
    try:
        changed = [ln[3:] for ln in _git(['status', '--porcelain', '--untracked-files=no'], cwd).splitlines() if ln.strip()]
    except Exception:
        return {'commit': commit, 'dirty': None, 'dirty_files': None}
    return {'commit': commit, 'dirty': bool(changed), 'dirty_files': changed[:20]}


def library_versions():
    """Versions that can change results (numba compiles the hot loops)."""
    import numpy, scipy, numba
    return {'python': platform.python_version(), 'numba': numba.__version__,
            'numpy': numpy.__version__, 'scipy': scipy.__version__}


def load_custom_load(custom_id, raw_dir=None):
    """A stored custom load (preprocessing/custom_load.py): container after the
    pipeline's rear-door mapping, boxes with the stop labels and fragile flags
    stored at conversion. Every configuration and seed reads the same labels."""
    from preprocessing.custom_load import load_stored
    return load_stored(custom_id)


def instance_meta(instance_id, sample=None):
    """BR class / box type count / box count for one wtpack id."""
    from preprocessing.sampling import resolve_instance_id
    from preprocessing.pipeline import load_augmented_instance
    meta = resolve_instance_id(instance_id)
    row = None
    if sample:
        row = next((c for c in sample['selected'] if c['instance_id'] == instance_id), None)
    if row is None:
        inst = load_augmented_instance({'data': {'raw_dir': str(_ROOT / 'data' / 'raw')}},
                                       instance_id=instance_id, stop_seed=STOP_SEED, stop_count=STOP_COUNT)
        boxes = inst['boxes']
        n_types = len({(b['l'], b['w'], b['h']) for b in boxes})
        row = {'n_boxes': len(boxes), 'n_types': n_types,
               'fragile_count': sum(int(b['fragile']) for b in boxes)}
    return {'instance_id': instance_id, 'br_class': meta['br_class'], 'file': meta['file'],
            'n_boxes': row['n_boxes'], 'n_types': row['n_types'],
            'fragile_count': row.get('fragile_count')}


# ─── worker start-up: compile numba before any timed run ─────────────────────
# Filled in by warm_worker() in each worker process; copied into every run row
# so a study shows that the compile / cache-load cost was paid untimed.
_WORKER = {'pid': None, 'warmup_cpu_ms': None, 'warmup_wall_ms': None}


def warm_worker(enforce_support=True, enforce_fragility=True, raw_dir=None):
    """ProcessPoolExecutor initializer: one throwaway decode + evaluate + repair
    (a 1-iteration RepairBasedHybrid on instance 350) so every numba kernel is
    compiled or loaded from its cache before the worker's first timed run.
    Its CPU and wall time are recorded, never added to a run's M-3 or CPU time."""
    from preprocessing.pipeline import load_augmented_instance
    from thesis_algorithms import RepairBasedHybrid
    c0, w0 = time.process_time(), time.perf_counter()
    inst = load_augmented_instance({'data': {'raw_dir': raw_dir or str(_ROOT / 'data' / 'raw')}},
                                   instance_id=350, stop_seed=STOP_SEED, stop_count=STOP_COUNT)
    RepairBasedHybrid(items=inst['boxes'], container=inst['container'], pop_size=3, max_iter=1,
                      enforce_support=enforce_support, enforce_fragility=enforce_fragility, seed=0).run()
    _WORKER.update(pid=os.getpid(), warmup_cpu_ms=round((time.process_time() - c0) * 1000.0, 1),
                   warmup_wall_ms=round((time.perf_counter() - w0) * 1000.0, 1))


# ─── one run (executed in a worker process for --mode parallel) ──────────────
def run_task(task):
    """task = dict(configuration, instance_id | custom_load, seed, pop_size, max_iter,
    lambdas, enforce_support, enforce_fragility, raw_dir). Returns the run row."""
    from preprocessing.pipeline import load_augmented_instance
    from thesis_algorithms import (StandaloneDGWO, StandaloneMOGWO,
                                   SequentialHybrid, RepairBasedHybrid)
    from thesis_metrics import evaluate_constraints, space_utilization
    from validate_arrangement import validate
    from layout_metrics import layout_indicators

    classes = {'DGWO': StandaloneDGWO, 'MOGWO': StandaloneMOGWO,
               'SEQ': SequentialHybrid, 'REP': RepairBasedHybrid}
    import psutil

    def _peak_mb():
        mi = psutil.Process().memory_info()
        peak = getattr(mi, 'peak_wset', None)          # Windows
        if peak is None:                                # POSIX: ru_maxrss
            try:
                import resource
                ru = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
                peak = ru * (1 if sys.platform == 'darwin' else 1024)
            except Exception:
                peak = mi.rss
        return peak / (1024 * 1024)

    cfg = task['configuration']
    if task.get('custom_load'):
        inst = load_custom_load(task['custom_load'])
    else:
        inst = load_augmented_instance({'data': {'raw_dir': task['raw_dir']}},
                                       instance_id=task['instance_id'],
                                       stop_seed=STOP_SEED, stop_count=STOP_COUNT)
    boxes, container = inst['boxes'], inst['container']
    lam = task['lambdas']

    opt = classes[cfg](
        items=boxes, container=container,
        pop_size=task['pop_size'], max_iter=task['max_iter'],
        lambda_w=lam['w'], lambda_f=lam['f'], lambda_b=lam['b'], lambda_a=lam['a'],
        enforce_support=task['enforce_support'], enforce_fragility=task['enforce_fragility'],
        seed=task['seed'],
        # R4 and R5 belong to REP alone; the other configurations take no such switch.
        **({'edge_fill': task.get('edge_fill', True),
            'fragile_lift': task.get('fragile_lift', True)} if cfg == 'REP' else {}),
    )
    # Warm every compiled kernel (REP touches decode + evaluate + repair) so
    # M-3 never includes numba cache loading; same as the server's warm-up.
    RepairBasedHybrid(items=boxes, container=container, pop_size=3, max_iter=1,
                      enforce_support=task['enforce_support'],
                      enforce_fragility=task['enforce_fragility'], seed=0).run()
    baseline_mb = psutil.Process().memory_info().rss / (1024 * 1024)

    t0, c0 = time.perf_counter(), time.process_time()
    best = opt.run()
    exec_time_ms = (time.perf_counter() - t0) * 1000.0          # M-3
    cpu_time_ms = (time.process_time() - c0) * 1000.0           # this process's CPU time for opt.run() alone
    peak_mb = _peak_mb()                                          # M-4

    csr, detail = evaluate_constraints(best.placements, boxes, best.orientations)
    placements = {int(k): [float(v) for v in vals] for k, vals in best.placements.items()}
    orientations = {int(k): int(v) for k, v in best.orientations.items()}

    # Independent check: the Chapter 3 validator must agree with the evaluator.
    iv = validate(container, boxes, placements, orientations)
    pairs = [('C3', 'C3_weight_pct'), ('C4', 'C4_fragility_pct'), ('C5', 'C5_balance_pct'),
             ('C6', 'C6_stop_order_pct'), ('all', 'total_compliant_pct')]
    diffs = {k: [iv['pct'][k], detail[ek]] for k, ek in pairs if abs(iv['pct'][k] - detail[ek]) > 1e-6}
    geom_ok = iv['pct']['C1'] == 100.0 and iv['pct']['C2'] == 100.0 and iv['pct']['orient'] == 100.0
    validation = {'agree': (not diffs) and geom_ok, 'C1': iv['pct']['C1'], 'C2': iv['pct']['C2'],
                  'orient': iv['pct']['orient'], 'diffs': diffs, 'issues': iv['issues'][:8]}

    row = {
        'configuration':    cfg,
        'instance_id':      task.get('instance_id'),
        'custom_load':      task.get('custom_load'),
        'seed':             task['seed'],
        'n_items':          len(boxes),
        'placed':           len(best.placements),
        'su_pct':           round(space_utilization(best.placements, container) * 100.0, 4),
        'csr_pct':          round(csr, 4),
        'C3_pct':           round(detail['C3_weight_pct'], 4),
        'C4_pct':           round(detail['C4_fragility_pct'], 4),
        'C5_pct':           round(detail['C5_balance_pct'], 4),
        'C6_pct':           round(detail['C6_stop_order_pct'], 4),
        'exec_time_ms':     round(exec_time_ms, 1),
        'cpu_time_ms':      round(cpu_time_ms, 1),
        'worker_pid':       _WORKER['pid'] if _WORKER['pid'] == os.getpid() else None,
        'worker_warmup_cpu_ms': _WORKER['warmup_cpu_ms'] if _WORKER['pid'] == os.getpid() else None,
        'peak_mem_mb':      round(peak_mb, 3),
        'baseline_mem_mb':  round(baseline_mb, 3),
        # What this run's optimizer object actually used (not what was asked for).
        'params_used':      {'lambda_w': opt.lambda_w, 'lambda_f': opt.lambda_f,
                             'lambda_b': opt.lambda_b, 'lambda_a': opt.lambda_a,
                             'enforce_support': bool(opt.enforce_support),
                             'enforce_fragility': bool(opt.enforce_fragility)},
        'budget_exhausted': bool(getattr(best, 'budget_exhausted', False)),
        'repair_stats':     getattr(opt, 'repair_stats', None),
        # REP only: was R4 (edge filling) applied to the returned arrangement, and
        # what did it do (before / after indicators, boxes placed, stacks moved,
        # time_ms = the time it added to M-3).
        'edge_fill':        bool(opt.edge_fill) if cfg == 'REP' else None,
        'edge_fill_stats':  getattr(opt, 'edge_fill_stats', None),
        # REP only: was R5 (fragile lift, run before R4) applied, and what did it do
        # (before / after, boxes added, fragile boxes moved, rejections, time_ms).
        'fragile_lift':     bool(opt.fragile_lift) if cfg == 'REP' else None,
        'fragile_lift_stats': getattr(opt, 'fragile_lift_stats', None),
        # MOGWO / SEQ / REP: the final Pareto archive's two ends. The reported
        # solution is its highest-SU member; the highest-CSR member (ties on
        # CSR -> higher SU) is the other end of the trade-off it found.
        'archive':          archive_summary(getattr(opt, 'final_archive', None), len(boxes)),
        'placements':       placements,
        'orientations':     orientations,
        'validation':       validation,
        # M-6 gap and M-7 load distribution (supporting descriptive indicators).
        'layout':           layout_indicators(placements, container, boxes),
    }
    if task.get('custom_load'):
        # Fingerprint of the stop labels this run read (all runs of one load
        # must show the same value: the labels are stored, never re-drawn).
        import hashlib
        row['stops_sha1'] = hashlib.sha1(','.join(str(b['stop']) for b in boxes).encode()).hexdigest()
    return row


def archive_summary(archive, n_items):
    """Size and the highest-SU / highest-CSR members of a final archive (None
    for DGWO, which has none). CSR over placed boxes and over all boxes."""
    if not archive:
        return None

    def member(w):
        placed = len(w.placements)
        return {'su_pct': round(w.su * 100.0, 4), 'csr_pct': round(w.csr, 4), 'placed': placed,
                'csr_all_pct': round(w.csr * placed / n_items, 4) if n_items else 0.0}
    return {'size': len(archive),
            'highest_su': member(max(archive, key=lambda w: w.su)),
            'highest_csr': member(max(archive, key=lambda w: (w.csr, w.su)))}


def _write_progress(path, prog):
    """Atomic-ish progress write. On Windows os.replace fails with WinError 5
    while another process (the server's poll) has the file open, so retry
    briefly and fall back to an in-place write rather than kill the study."""
    tmp = path.with_suffix('.tmp')
    data = json.dumps(prog)
    tmp.write_text(data, encoding='utf-8')
    for attempt in range(20):
        try:
            os.replace(tmp, path)
            return
        except PermissionError:
            time.sleep(0.05 * (attempt + 1))
    try:
        path.write_text(data, encoding='utf-8')
        tmp.unlink(missing_ok=True)
    except OSError:
        pass


# ─── resume: one file per finished run ───────────────────────────────────────
def task_key(t):
    """configuration | instance (or custom load) | seed; works for a task or a run row."""
    inst = t.get('instance_id')
    return f"{t['configuration']}|{inst if inst is not None else t.get('custom_load')}|{t['seed']}"


class RunStore:
    """<out>.runs/: spec.json plus one <key>.json per finished run, written atomically
    the moment the run returns, so a kill loses at most the runs in flight."""

    def __init__(self, out):
        self.dir = Path(str(out) + '.runs')

    def check_spec(self, spec, force=False):
        """Create spec.json, or refuse to mix runs made under other settings."""
        path = self.dir / 'spec.json'
        if not path.exists():
            self.dir.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(spec, indent=1), encoding='utf-8')
            return
        old = json.loads(path.read_text(encoding='utf-8'))
        diff = {k: [old.get(k), spec.get(k)] for k in spec if old.get(k) != spec.get(k)}
        commit_diff = diff.pop('commit', None)
        if commit_diff and not force:
            raise SystemExit(f"{self.dir}: runs on disk were made at commit {old.get('commit')}, this is "
                             f"{spec.get('commit')}; the code may differ. Restart at that commit, or pass --force-resume.")
        if diff:
            raise SystemExit(f"{self.dir}: cannot resume, settings differ from the runs on disk "
                             f"(on disk vs now): {json.dumps(diff)}")

    def load(self, log=print):
        rows = {}
        for f in sorted(self.dir.glob('*.json')) if self.dir.exists() else []:
            if f.name == 'spec.json':
                continue
            try:
                row = json.loads(f.read_text(encoding='utf-8'))
                rows[task_key(row)] = row
            except (ValueError, KeyError, OSError):
                log(f"ignoring unreadable run file {f.name} (it will be run again)")
        return rows

    def save(self, row):
        name = task_key(row).replace('|', '_') + '.json'
        tmp = self.dir / (name + '.tmp')
        tmp.write_text(json.dumps(row), encoding='utf-8')
        for attempt in range(20):
            try:
                os.replace(tmp, self.dir / name)
                return
            except PermissionError:          # Windows: another process has it open
                time.sleep(0.05 * (attempt + 1))
        (self.dir / name).write_text(json.dumps(row), encoding='utf-8')
        tmp.unlink(missing_ok=True)


# ─── progress: runs %, estimated-work % and ETA ──────────────────────────────
REP_FACTOR_PRIOR = 7.0


def fmt_dur(sec):
    sec = int(round(sec))
    d, r = divmod(sec, 86400)
    h, r = divmod(r, 3600)
    m, s_ = divmod(r, 60)
    if d:
        return f"{d}d {h:02d}h"
    if h:
        return f"{h}h {m:02d}m"
    return f"{m}m {s_:02d}s"


def work_factors(done_rows):
    """Cost of a run relative to a non-REP one. Prior: REP = 7. If the runs already on
    disk hold at least 3 REP and 3 other runs, their median time per n_boxes^2 gives the
    ratio instead. Fixed for the session, so the percentage never moves backwards."""
    per = {'REP': [], 'other': []}
    for r in done_rows:
        if r.get('exec_time_ms') and r.get('n_items'):
            per['REP' if r['configuration'] == 'REP' else 'other'].append(r['exec_time_ms'] / r['n_items'] ** 2)
    if len(per['REP']) >= 3 and len(per['other']) >= 3:
        ratio = statistics.median(per['REP']) / statistics.median(per['other'])
        return {'REP': round(min(max(ratio, 1.0), 50.0), 1), 'source': 'measured on the runs already on disk'}
    return {'REP': REP_FACTOR_PRIOR, 'source': 'prior'}


class StudyProgress:
    def __init__(self, tasks, boxes_of, done_keys, factors):
        self.factors, self.boxes_of = factors, boxes_of
        self.total = len(tasks)
        self.weights = {task_key(t): self._w(t) for t in tasks}
        self.w_total = sum(self.weights.values())
        self.done_keys = set(done_keys)
        self.w_done = sum(self.weights[k] for k in self.done_keys)
        self.w_session = 0.0
        self.t0 = None

    def _w(self, t):
        inst = t.get('instance_id') if t.get('instance_id') is not None else t.get('custom_load')
        return self.boxes_of[inst] ** 2 * (self.factors['REP'] if t['configuration'] == 'REP' else 1.0)

    def start(self):
        self.t0 = time.time()

    def finish(self, key):
        self.done_keys.add(key)
        self.w_done += self.weights[key]
        self.w_session += self.weights[key]

    def snapshot(self):
        elapsed = time.time() - self.t0 if self.t0 else 0.0
        remaining = self.w_total - self.w_done
        eta = elapsed * remaining / self.w_session if self.w_session > 0 else None
        return {'pct_runs': round(100.0 * len(self.done_keys) / self.total, 2) if self.total else 100.0,
                'pct_work': round(100.0 * self.w_done / self.w_total, 2) if self.w_total else 100.0,
                'session_elapsed_s': round(elapsed, 1), 'eta_s': None if eta is None else round(eta, 1)}

    def line(self, row):
        s_ = self.snapshot()
        inst = row.get('instance_id') if row.get('instance_id') is not None else row.get('custom_load')
        eta = 'n/a' if s_['eta_s'] is None else ('~' + fmt_dur(s_['eta_s']) if s_['eta_s'] else '0m 00s')
        return (f"[{len(self.done_keys):,} / {self.total:,} runs | {s_['pct_runs']:.1f}% runs | "
                f"{s_['pct_work']:.1f}% est. work] {row['configuration']} inst {inst} seed {row['seed']} "
                f"done ({row['exec_time_ms'] / 1000:.0f} s) | elapsed {fmt_dur(s_['session_elapsed_s'])} | ETA {eta}")


def run_study(*, name, size, instance_ids, custom_load, preset, seeds, mode, lambdas,
              enforce_support, enforce_fragility, workers, out, sample_path=None,
              configs=CONFIGS, raw_dir=None, run_stats=True, edge_fill=True, fragile_lift=True,
              force_resume=False, log=print):
    raw_dir = raw_dir or str(_ROOT / 'data' / 'raw')
    pop_size, max_iter = PRESETS[preset]['pop_size'], PRESETS[preset]['max_iter']
    sample = load_sample(sample_path) if sample_path else None

    custom_doc = None
    if custom_load:
        cl = load_custom_load(custom_load)
        custom_doc = cl['doc']
        inst_rows = [{'instance_id': None, 'custom_load': custom_load, 'br_class': 'custom',
                      'label': custom_doc.get('label'), 'name': custom_doc.get('name'),
                      'n_boxes': len(cl['boxes']), 'n_types': custom_doc['raw']['n_types'],
                      'fragile_count': sum(int(b['fragile']) for b in cl['boxes'])}]
    else:
        inst_rows = [instance_meta(i, sample) for i in instance_ids]

    tasks = []
    for row in inst_rows:
        for seed in seeds:
            for cfg in configs:
                tasks.append({'configuration': cfg, 'instance_id': row['instance_id'],
                              'custom_load': custom_load, 'seed': seed,
                              'pop_size': pop_size, 'max_iter': max_iter, 'lambdas': lambdas,
                              'enforce_support': enforce_support, 'enforce_fragility': enforce_fragility,
                              'raw_dir': raw_dir, 'edge_fill': edge_fill,
                              'fragile_lift': fragile_lift})
    # Longest jobs first so a parallel pool packs well (REP is the slow one).
    order = {'REP': 0, 'MOGWO': 1, 'DGWO': 2, 'SEQ': 3}
    if mode == 'parallel':
        tasks.sort(key=lambda t: order.get(t['configuration'], 9))

    # Provenance is taken BEFORE the first run: the code that ran is the code
    # at the start. The end state is recorded too, so a commit or edit made
    # while the study was running is visible in the file.
    git_start = git_state()
    if git_start['dirty']:
        log(f"WARNING: working tree has uncommitted changes to tracked files: {', '.join(git_start['dirty_files'])}")

    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)

    # Resume: runs already on disk (same settings, same commit) are not run again.
    store = RunStore(out)
    store.check_spec({'preset': {'name': preset, 'pop_size': pop_size, 'max_iter': max_iter},
                      'lambdas': lambdas, 'enforce_support': enforce_support,
                      'enforce_fragility': enforce_fragility, 'edge_fill': edge_fill,
                      'fragile_lift': fragile_lift, 'mode': mode,
                      'stop_seed': custom_doc['augmentation']['stops']['seed'] if custom_doc else STOP_SEED,
                      'stop_count': custom_doc['augmentation']['stops']['num_stops'] if custom_doc else STOP_COUNT,
                      'versions': library_versions(), 'commit': git_start['commit']}, force=force_resume)
    on_disk = store.load(log)
    wanted = {task_key(t) for t in tasks}
    stale = [k for k in on_disk if k not in wanted]
    if stale:
        log(f"{len(stale)} run(s) on disk belong to other seeds / instances / configurations and are left out of this study")
    runs_done = {k: v for k, v in on_disk.items() if k in wanted}
    todo = [t for t in tasks if task_key(t) not in runs_done]

    boxes_of = {(r['instance_id'] if r['instance_id'] is not None else r['custom_load']): r['n_boxes'] for r in inst_rows}
    factors = work_factors(list(runs_done.values()))
    progress_loaded = len(runs_done)
    progress = StudyProgress(tasks, boxes_of, runs_done, factors)
    log(f"study: {len(tasks):,} runs | {len(runs_done):,} already on disk"
        f"{' (resuming)' if runs_done else ''} | {len(todo):,} remaining | "
        f"work weight n_boxes^2 x (REP {factors['REP']:g} [{factors['source']}], others 1)")

    progress_path = out.with_name(out.name + '.progress.json')
    started = time.time()
    progress.start()
    per_cfg_total = {c: sum(1 for t in tasks if t['configuration'] == c) for c in configs}
    prog = {'status': 'running', 'done': len(runs_done), 'total': len(tasks),
            'per_configuration': {c: {'done': sum(1 for k in runs_done if k.split('|')[0] == c),
                                      'total': per_cfg_total[c]} for c in configs},
            'started_at': started, 'elapsed_s': 0.0, 'mode': mode, 'error': None,
            'last_run': None, 'resumed_runs': len(runs_done), **progress.snapshot()}
    _write_progress(progress_path, prog)

    def _done(res):
        # Progress is computed here in the parent, after the worker has returned
        # (and stopped its clock): it cannot touch M-3 / M-4.
        store.save(res)
        runs_done[task_key(res)] = res
        progress.finish(task_key(res))
        prog['done'] += 1
        prog['per_configuration'][res['configuration']]['done'] += 1
        prog['elapsed_s'] = round(time.time() - started, 1)
        prog.update(progress.snapshot())
        prog['last_run'] = {k: res[k] for k in ('configuration', 'instance_id', 'seed', 'su_pct', 'csr_pct', 'exec_time_ms')}
        _write_progress(progress_path, prog)
        v = res['validation']
        log(progress.line(res))
        log(f"    SU={res['su_pct']:.2f} CSR={res['csr_pct']:.2f} placed={res['placed']}/{res['n_items']} "
            f"{res['peak_mem_mb']:.1f}MB validator={'AGREE' if v['agree'] else 'DISAGREE'}")

    try:
        if todo:
            # One fresh process per run, in both modes (see module docstring).
            _hide_worker_windows()
            with ProcessPoolExecutor(max_workers=1 if mode == 'serial' else workers,
                                     max_tasks_per_child=1, initializer=warm_worker,
                                     initargs=(enforce_support, enforce_fragility, raw_dir)) as ex:
                if mode == 'serial':
                    for t in todo:
                        _done(ex.submit(run_task, t).result())
                else:
                    futs = [ex.submit(run_task, t) for t in todo]
                    for f in as_completed(futs):
                        _done(f.result())
    except BaseException as e:
        prog['status'] = 'error'
        prog['error'] = f'{type(e).__name__}: {e}'
        _write_progress(progress_path, prog)
        raise

    runs = [runs_done[task_key(t)] for t in tasks]
    runs.sort(key=lambda r: (r['instance_id'] if r['instance_id'] is not None else -1, r['seed'],
                             configs.index(r['configuration'])))
    bad = [r for r in runs if not r['validation']['agree']]

    git_end = git_state()
    changed_during_run = (git_end['commit'] != git_start['commit']
                          or git_end['dirty_files'] != git_start['dirty_files'])
    if changed_during_run:
        log(f"WARNING: the repository changed while the study ran "
            f"(start {git_start['commit']}, end {git_end['commit']})")

    study = {
        'stackr_study': 1,
        'name': name,
        'size': size,
        'created_at': time.strftime('%Y-%m-%dT%H:%M:%S'),
        'commit': git_start['commit'],                 # at the START of the study
        'git': {'commit_start': git_start['commit'], 'dirty_start': git_start['dirty'],
                'dirty_files_start': git_start['dirty_files'],
                'commit_end': git_end['commit'], 'dirty_end': git_end['dirty'],
                'dirty_files_end': git_end['dirty_files'],
                'changed_during_run': changed_during_run,
                'dirty_rule': 'tracked files only (git status --porcelain --untracked-files=no)'},
        'versions': library_versions(),
        'machine': {'platform': platform.platform(), 'processor': platform.processor(),
                    'cpu_count': os.cpu_count(), 'python': platform.python_version()},
        'mode': mode,
        'workers': 1 if mode == 'serial' else workers,
        'timing_valid': mode == 'serial',
        'timing_method': 'fresh process per run; numba warmed untimed in the worker initializer; M-3 = wall-clock of opt.run(); '
                         'CPU time = process CPU time of opt.run() (time.process_time); M-4 = process peak working set (psutil)',
        'timing_note': ('serial - one optimizer at a time; M-3 / M-4 valid for SP3'
                        if mode == 'serial' else
                        'concurrent - not valid for SP3 (several optimizers shared the CPU)'),
        'preset': {'name': preset, 'pop_size': pop_size, 'max_iter': max_iter},
        'lambdas': lambdas,
        'enforce_support': enforce_support,
        'enforce_fragility': enforce_fragility,
        'edge_fill': edge_fill,          # REP's R4 step (optimizer/edge_fill.py)
        'fragile_lift': fragile_lift,    # REP's R5 step (optimizer/fragile_lift.py), run before R4
        'support_threshold': SUPPORT_THRESHOLD,
        # A custom load's stops are the labels stored at conversion (given by
        # the user, or drawn once with the recorded seed).
        'stop_seed': custom_doc['augmentation']['stops']['seed'] if custom_doc else STOP_SEED,
        'stop_count': custom_doc['augmentation']['stops']['num_stops'] if custom_doc else STOP_COUNT,
        'stop_mode': custom_doc['augmentation']['stops']['mode'] if custom_doc else 'assigned',
        'seq_budget_split': {'dgwo_iters': max_iter // 2, 'mogwo_iters': max_iter - max_iter // 2,
                             'note': 'SequentialHybrid: T1 = max_iter // 2 DGWO iterations, then T2 = max_iter - T1 MOGWO iterations'},
        'seeds': list(seeds),
        'runs_per_configuration': len(seeds) * len(inst_rows),
        'configurations': list(configs),
        'configuration_labels': CONFIG_LABELS,
        'sample': str(sample_path) if sample_path else None,
        'custom_load': custom_load,
        'custom_load_label': custom_doc.get('label') if custom_doc else None,
        'instances': inst_rows,
        'wall_clock_s': round(time.time() - started, 1),     # this session only
        'resume': {'runs_dir': store.dir.name, 'runs_loaded_from_disk': progress_loaded, 'sessions_note':
                   'wall_clock_s covers the session that assembled this file; runs loaded from disk were timed in their own sessions'},
        'validation': {'arrangements': len(runs), 'agree': len(runs) - len(bad),
                       'disagreements': [{'configuration': r['configuration'], 'instance_id': r['instance_id'],
                                          'seed': r['seed'], **r['validation']} for r in bad]},
        'runs': runs,
    }
    out.write_text(json.dumps(study, indent=1), encoding='utf-8')
    log(f"wrote {out}  ({len(runs)} runs, {study['wall_clock_s']} s wall)")

    if bad:
        prog.update(status='error', error=f'{len(bad)} arrangement(s) disagree with the independent validator')
        _write_progress(progress_path, prog)
        log(f"VALIDATOR DISAGREEMENT on {len(bad)} arrangement(s):")
        for r in bad:
            log(f"  {r['configuration']} inst={r['instance_id']} seed={r['seed']}: {r['validation']}")
        return study, 2

    # Weight-Sorted Greedy and Random Order baselines per instance (Chapter 3
    # supplementary analysis); serial, after the GWO runs.
    from baselines import attach_baselines
    bad_b = attach_baselines(study, raw_dir, log=log)
    out.write_text(json.dumps(study, indent=1), encoding='utf-8')
    if bad_b:
        prog.update(status='error', error=f'{bad_b} baseline arrangement(s) disagree with the independent validator')
        _write_progress(progress_path, prog)
        log(f"VALIDATOR DISAGREEMENT on {bad_b} baseline arrangement(s)")
        return study, 2

    if run_stats:
        from stats import analyse, save_stats
        study['stats'] = analyse(study)
        save_stats(study, out)
        log("stats attached")

    prog.update(status='done', elapsed_s=round(time.time() - started, 1))
    _write_progress(progress_path, prog)
    return study, 0


# ─── merge chunks into one study ─────────────────────────────────────────────
MERGE_SAME = ('preset', 'lambdas', 'enforce_support', 'enforce_fragility', 'edge_fill', 'fragile_lift', 'support_threshold',
              'stop_seed', 'stop_count', 'stop_mode', 'seq_budget_split', 'mode', 'custom_load', 'configurations')


def merge_studies(paths, out, force=False, log=print):
    """Merge study files made from disjoint chunks (other seeds or other instances, same
    settings) into one file the stats step accepts. Refuses chunks with different settings,
    overlapping runs, or a union that is not a complete instances x seeds x configurations
    design. Baselines are carried over per instance; stats are recomputed."""
    docs = [json.loads(Path(p).read_text(encoding='utf-8')) for p in paths]
    first = docs[0]
    for p, d in zip(paths[1:], docs[1:]):
        diff = [k for k in MERGE_SAME if d.get(k) != first.get(k)]
        if diff:
            raise SystemExit(f"{p}: cannot merge, differs from {paths[0]} in: {', '.join(diff)}")
    commits = sorted({d.get('commit') for d in docs})
    if len(commits) > 1 and not force:
        raise SystemExit(f"chunks were made at different commits {commits}; pass --force to merge anyway")
    if len({d['versions']['numba'] for d in docs}) > 1 and not force:
        raise SystemExit("chunks were made with different numba versions; pass --force to merge anyway")
    runs, seen = [], {}
    for p, d in zip(paths, docs):
        for r in d['runs']:
            k = task_key(r)
            if k in seen:
                raise SystemExit(f"run {k} is in both {seen[k]} and {p}: chunks must not overlap")
            seen[k] = p
            runs.append(r)
    configs = first['configurations']
    ikey = lambda i: i['instance_id'] if i['instance_id'] is not None else i['custom_load']
    instances = list({ikey(i): i for d in docs for i in d['instances']}.values())
    seeds = sorted({r['seed'] for r in runs})
    missing = [f"{c}|{ikey(i)}|{sd}" for i in instances for sd in seeds for c in configs
               if f"{c}|{ikey(i)}|{sd}" not in seen]
    if missing:
        raise SystemExit(f"merged chunks are not a complete design: {len(missing)} run(s) missing, e.g. {missing[:3]}")
    runs.sort(key=lambda r: (r['instance_id'] if r['instance_id'] is not None else -1, r['seed'],
                             configs.index(r['configuration'])))
    study = {k: v for k, v in first.items() if k not in ('stats', 'baselines')}
    bad = [r for r in runs if not r['validation']['agree']]
    per = {}
    for d in docs:
        for b in (d.get('baselines') or {}).get('per_instance', []):
            per.setdefault(b['instance_id'] if b['instance_id'] is not None else b.get('custom_load'), b)
    study.update({
        'name': first.get('name'), 'created_at': time.strftime('%Y-%m-%dT%H:%M:%S'),
        'commit': commits[0] if len(commits) == 1 else 'mixed: ' + ', '.join(map(str, commits)),
        'seeds': seeds, 'runs_per_configuration': len(seeds) * len(instances),
        'instances': instances, 'runs': runs,
        'wall_clock_s': round(sum(d.get('wall_clock_s') or 0 for d in docs), 1),
        'merged_from': [{'file': Path(p).name, 'name': d.get('name'), 'commit': d.get('commit'),
                         'seeds': d.get('seeds'), 'instances': [i['instance_id'] for i in d['instances']],
                         'runs': len(d['runs'])} for p, d in zip(paths, docs)],
        'validation': {'arrangements': len(runs), 'agree': len(runs) - len(bad),
                       'disagreements': [{'configuration': r['configuration'], 'instance_id': r['instance_id'],
                                          'seed': r['seed'], **r['validation']} for r in bad]},
    })
    base = (first.get('baselines') or {})
    if base and all(per.get(ikey(i)) for i in instances):
        base = dict(base)
        base['per_instance'] = [per[ikey(i)] for i in instances]
        base['validation'] = {'arrangements': sum(1 + len(p_['random_order']) for p_ in base['per_instance']),
                              'disagreements': sum(1 for p_ in base['per_instance']
                                                   for r in [p_['weight_sorted']] + p_['random_order']
                                                   if not r['validation_agree'])}
        study['baselines'] = base
    else:
        from baselines import attach_baselines
        attach_baselines(study, None, log=log)
    from stats import analyse
    study['stats'] = analyse(study)
    Path(out).write_text(json.dumps(study, indent=1), encoding='utf-8')
    log(f"merged {len(paths)} files -> {out}: {len(runs)} runs, {len(instances)} instance(s), seeds {seeds[0]}-{seeds[-1]}")
    return study


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--size', choices=sorted(SIZES), help='one of the UI picker sizes (defaults below can be overridden)')
    p.add_argument('--instance', type=int, help='a single wtpack instance id')
    p.add_argument('--sample', help='provenance JSON from preprocessing.sampling (all its instances)')
    p.add_argument('--n-instances', type=int, default=None, help='with --sample: only the first N')
    p.add_argument('--custom-load', help='id of a custom load in experiments/custom_loads/')
    p.add_argument('--preset', choices=sorted(PRESETS))
    p.add_argument('--seeds', help="e.g. '1-30' or '1,2,5'")
    p.add_argument('--mode', choices=['serial', 'parallel'])
    p.add_argument('--workers', type=int, default=max(1, (os.cpu_count() or 2) - 2))
    p.add_argument('--configs', default=','.join(CONFIGS))
    p.add_argument('--lambda', type=float, default=0.20, dest='lam')
    p.add_argument('--lambda-w', type=float); p.add_argument('--lambda-f', type=float)
    p.add_argument('--lambda-b', type=float); p.add_argument('--lambda-a', type=float)
    p.add_argument('--enforce-support', action=argparse.BooleanOptionalAction, default=True)
    p.add_argument('--enforce-fragility', action=argparse.BooleanOptionalAction, default=True)
    p.add_argument('--edge-fill', action=argparse.BooleanOptionalAction, default=True,
                   help="REP only: apply repair step R4 (edge filling) to its final arrangement")
    p.add_argument('--fragile-lift', action=argparse.BooleanOptionalAction, default=True,
                   help="REP only: apply repair step R5 (fragile lift) to its final arrangement, before R4")
    p.add_argument('--instance-ids', help="comma-separated wtpack ids (a chunk: with --sample they must be in it)")
    p.add_argument('--force-resume', action='store_true',
                   help='continue from runs on disk made at another commit')
    p.add_argument('--merge', nargs='+', metavar='STUDY.json',
                   help='merge chunk study files (disjoint seeds or instances, same settings) into --out and exit')
    p.add_argument('--force', action='store_true', help='with --merge: allow chunks from different commits / numba')
    p.add_argument('--name')
    p.add_argument('--out')
    p.add_argument('--no-stats', action='store_true')
    p.add_argument('--print-defaults', action='store_true',
                   help='print the locked study parameters as JSON (the UI shows these) and exit')
    a = p.parse_args()

    if a.merge:
        if not a.out:
            p.error('--merge needs --out')
        merge_studies(a.merge, a.out, force=a.force, log=lambda s: print(s, file=sys.stderr, flush=True))
        return

    if a.print_defaults:
        from thesis_algorithms import ThesisOptimizerBase
        import inspect
        sig = inspect.signature(ThesisOptimizerBase.__init__).parameters
        print(json.dumps({
            'presets': PRESETS, 'sizes': SIZES, 'configurations': CONFIGS, 'labels': CONFIG_LABELS,
            'lambdas': {'w': a.lam, 'f': a.lam, 'b': a.lam, 'a': a.lam},
            'optimizer_default_lambdas': {k: sig[f'lambda_{k}'].default for k in ('w', 'f', 'b', 'a')},
            'support_threshold': SUPPORT_THRESHOLD, 'enforce_support': True, 'enforce_fragility': True,
            'stop_seed': STOP_SEED, 'stop_count': STOP_COUNT,
            'seq_budget_split': 'T1 = max_iter // 2 DGWO iterations, then T2 = max_iter - T1 MOGWO iterations',
            'mogwo_archive_max': 100,
        }, indent=1))
        return

    d = dict(SIZES.get(a.size, {}))
    if a.custom_load:       # the size then supplies only preset / seeds / mode
        d.pop('instance', None); d.pop('sample', None)
    instance = a.instance if a.instance is not None else d.get('instance')
    sample = a.sample or d.get('sample')
    preset = a.preset or d.get('preset')
    seeds_spec = a.seeds or d.get('seeds')
    mode = a.mode or d.get('mode')
    name = a.name or d.get('name') or 'study'
    if not preset or not seeds_spec or not mode:
        p.error('--preset, --seeds and --mode are required unless --size supplies them')
    if sum(x is not None for x in (instance, sample, a.custom_load)) != 1:
        p.error('pass exactly one of --instance, --sample, --custom-load (or --size)')

    if sample:
        try:
            prov = load_sample(sample)
        except ValueError as e:
            p.error(str(e))
        instance_ids = [c['instance_id'] for c in prov['selected']]
        if a.instance_ids:
            want = [int(x) for x in a.instance_ids.split(',')]
            bad_ids = [i for i in want if i not in instance_ids]
            if bad_ids:
                p.error(f"--instance-ids {bad_ids} are not in the sample")
            instance_ids = want
        if a.n_instances:
            instance_ids = instance_ids[:a.n_instances]
    elif instance is not None:
        instance_ids = [instance]
    else:
        instance_ids = []

    lambdas = {k: (v if v is not None else a.lam) for k, v in
               (('w', a.lambda_w), ('f', a.lambda_f), ('b', a.lambda_b), ('a', a.lambda_a))}
    seeds = parse_seeds(seeds_spec)
    out = a.out or str(STUDIES_DIR / f"{a.size or 'study'}_{time.strftime('%Y%m%d-%H%M%S')}.json")

    _, code = run_study(name=name, size=a.size or 'custom', instance_ids=instance_ids,
                        custom_load=a.custom_load, preset=preset, seeds=seeds, mode=mode,
                        lambdas=lambdas, enforce_support=a.enforce_support,
                        enforce_fragility=a.enforce_fragility, workers=a.workers, out=out,
                        sample_path=sample, configs=a.configs.split(','), run_stats=not a.no_stats,
                        edge_fill=a.edge_fill, fragile_lift=a.fragile_lift, force_resume=a.force_resume,
                        log=lambda s: print(s, file=sys.stderr, flush=True))
    sys.exit(code)


if __name__ == '__main__':
    main()
