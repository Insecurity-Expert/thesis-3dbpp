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

Each run executes in a FRESH worker process (also in serial mode): the numba
kernels are warmed untimed first, then M-3 is the wall-clock of opt.run()
alone and M-4 is the process's peak working set (psutil), which is monotonic
per process and therefore only meaningful when one run owns the process.
tracemalloc is deliberately not used: it slows the optimizer ~4x.

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
    'full':     {'pop_size': 30, 'max_iter': 500},
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
}


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


def git_commit():
    try:
        return subprocess.check_output(['git', 'rev-parse', '--short', 'HEAD'], cwd=_ROOT,
                                       stderr=subprocess.DEVNULL).decode().strip()
    except Exception:
        return None


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


# ─── one run (executed in a worker process for --mode parallel) ──────────────
def run_task(task):
    """task = dict(configuration, instance_id | custom_load, seed, pop_size, max_iter,
    lambdas, enforce_support, enforce_fragility, raw_dir). Returns the run row."""
    from preprocessing.pipeline import load_augmented_instance
    from thesis_algorithms import (StandaloneDGWO, StandaloneMOGWO,
                                   SequentialHybrid, RepairBasedHybrid)
    from thesis_metrics import evaluate_constraints, space_utilization
    from validate_arrangement import validate

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
    )
    # Warm every compiled kernel (REP touches decode + evaluate + repair) so
    # M-3 never includes numba cache loading; same as the server's warm-up.
    RepairBasedHybrid(items=boxes, container=container, pop_size=3, max_iter=1,
                      enforce_support=task['enforce_support'],
                      enforce_fragility=task['enforce_fragility'], seed=0).run()
    baseline_mb = psutil.Process().memory_info().rss / (1024 * 1024)

    t0 = time.perf_counter()
    best = opt.run()
    exec_time_ms = (time.perf_counter() - t0) * 1000.0          # M-3
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
        'peak_mem_mb':      round(peak_mb, 3),
        'baseline_mem_mb':  round(baseline_mb, 3),
        'budget_exhausted': bool(getattr(best, 'budget_exhausted', False)),
        'repair_stats':     getattr(opt, 'repair_stats', None),
        'placements':       placements,
        'orientations':     orientations,
        'validation':       validation,
    }
    if task.get('custom_load'):
        # Fingerprint of the stop labels this run read (all runs of one load
        # must show the same value: the labels are stored, never re-drawn).
        import hashlib
        row['stops_sha1'] = hashlib.sha1(','.join(str(b['stop']) for b in boxes).encode()).hexdigest()
    return row


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


def run_study(*, name, size, instance_ids, custom_load, preset, seeds, mode, lambdas,
              enforce_support, enforce_fragility, workers, out, sample_path=None,
              configs=CONFIGS, raw_dir=None, run_stats=True, log=print):
    raw_dir = raw_dir or str(_ROOT / 'data' / 'raw')
    pop_size, max_iter = PRESETS[preset]['pop_size'], PRESETS[preset]['max_iter']
    sample = json.loads(Path(sample_path).read_text(encoding='utf-8')) if sample_path else None

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
                              'raw_dir': raw_dir})
    # Longest jobs first so a parallel pool packs well (REP is the slow one).
    order = {'REP': 0, 'MOGWO': 1, 'DGWO': 2, 'SEQ': 3}
    if mode == 'parallel':
        tasks.sort(key=lambda t: order.get(t['configuration'], 9))

    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    progress_path = out.with_name(out.name + '.progress.json')
    started = time.time()
    per_cfg_total = {c: sum(1 for t in tasks if t['configuration'] == c) for c in configs}
    prog = {'status': 'running', 'done': 0, 'total': len(tasks),
            'per_configuration': {c: {'done': 0, 'total': per_cfg_total[c]} for c in configs},
            'started_at': started, 'elapsed_s': 0.0, 'mode': mode, 'error': None,
            'last_run': None}
    _write_progress(progress_path, prog)

    runs = []
    def _done(res):
        runs.append(res)
        prog['done'] += 1
        prog['per_configuration'][res['configuration']]['done'] += 1
        prog['elapsed_s'] = round(time.time() - started, 1)
        prog['last_run'] = {k: res[k] for k in ('configuration', 'instance_id', 'seed', 'su_pct', 'csr_pct', 'exec_time_ms')}
        _write_progress(progress_path, prog)
        v = res['validation']
        log(f"[{prog['done']:4d}/{prog['total']}] {res['configuration']:5s} inst={res['instance_id']} "
            f"seed={res['seed']:3d} SU={res['su_pct']:6.2f} CSR={res['csr_pct']:6.2f} "
            f"placed={res['placed']}/{res['n_items']} {res['exec_time_ms']/1000:6.1f}s "
            f"{res['peak_mem_mb']:.1f}MB validator={'AGREE' if v['agree'] else 'DISAGREE'}")

    try:
        # One fresh process per run, in both modes (see module docstring).
        with ProcessPoolExecutor(max_workers=1 if mode == 'serial' else workers,
                                 max_tasks_per_child=1) as ex:
            if mode == 'serial':
                for t in tasks:
                    _done(ex.submit(run_task, t).result())
            else:
                futs = [ex.submit(run_task, t) for t in tasks]
                for f in as_completed(futs):
                    _done(f.result())
    except BaseException as e:
        prog['status'] = 'error'
        prog['error'] = f'{type(e).__name__}: {e}'
        _write_progress(progress_path, prog)
        raise

    runs.sort(key=lambda r: (r['instance_id'] if r['instance_id'] is not None else -1, r['seed'],
                             configs.index(r['configuration'])))
    bad = [r for r in runs if not r['validation']['agree']]

    study = {
        'stackr_study': 1,
        'name': name,
        'size': size,
        'created_at': time.strftime('%Y-%m-%dT%H:%M:%S'),
        'commit': git_commit(),
        'machine': {'platform': platform.platform(), 'processor': platform.processor(),
                    'cpu_count': os.cpu_count(), 'python': platform.python_version()},
        'mode': mode,
        'workers': 1 if mode == 'serial' else workers,
        'timing_valid': mode == 'serial',
        'timing_method': 'fresh process per run; numba warmed untimed; M-3 = wall-clock of opt.run(); M-4 = process peak working set (psutil)',
        'timing_note': ('serial - one optimizer at a time; M-3 / M-4 valid for SP3'
                        if mode == 'serial' else
                        'concurrent - not valid for SP3 (several optimizers shared the CPU)'),
        'preset': {'name': preset, 'pop_size': pop_size, 'max_iter': max_iter},
        'lambdas': lambdas,
        'enforce_support': enforce_support,
        'enforce_fragility': enforce_fragility,
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
        'wall_clock_s': round(time.time() - started, 1),
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

    if run_stats:
        from stats import analyse, save_stats
        study['stats'] = analyse(study)
        save_stats(study, out)
        log("stats attached")

    prog.update(status='done', elapsed_s=round(time.time() - started, 1))
    _write_progress(progress_path, prog)
    return study, 0


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
    p.add_argument('--name')
    p.add_argument('--out')
    p.add_argument('--no-stats', action='store_true')
    p.add_argument('--print-defaults', action='store_true',
                   help='print the locked study parameters as JSON (the UI shows these) and exit')
    a = p.parse_args()

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
        prov = json.loads(Path(sample).read_text(encoding='utf-8'))
        instance_ids = [c['instance_id'] for c in prov['selected']]
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
                        log=lambda s: print(s, file=sys.stderr, flush=True))
    sys.exit(code)


if __name__ == '__main__':
    main()
