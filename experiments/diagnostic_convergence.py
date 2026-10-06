"""Convergence / diversity diagnostic (observation only - no method changes).

Runs the four configurations at the Thesis preset (pop 30 x 300 iterations)
on one instance each of BR1, BR4 and BR7 for seeds 1-5, serially, one fresh
process per run, with the calibrated settings Studies A and B use
(experiments/calibration.json). Records per run:

  * best-so-far SU per iteration by the configuration's own return criterion
    (DGWO: alpha by scalar fitness; MOGWO / SEQ / REP: highest-SU archive
    member) via the existing record_history hook, plus the highest SU of any
    wolf evaluated so far (REP: after repair);
  * population diversity per iteration: mean pairwise normalised Kendall tau
    distance between the wolves' loading orders (the stable argsort of the
    n sequence keys, exactly as thesis_math.decode_position builds it), and
    the share of sequence keys sitting on the [-5, 5] clip bound;
  * REP: per repair call, boxes relocated (R1 + R2) and boxes taken out of the
    container (deferred by R1 / R2 + removed by R3), and the share of run()
    wall-clock spent inside repair;
  * MOGWO / SEQ (and REP): the final archive, its size, the highest-SU member
    (the one each configuration reports) and the highest-CSR member.

The instrumentation subclasses the optimizer classes and only observes:
_evaluate, _update_archive and the wolf's _repair call their parents unchanged
and draw nothing from the RNG. `--check` proves it: the instrumented classes
must reproduce tools/determinism_reference.json bit for bit.

    python experiments/diagnostic_convergence.py --check
    python experiments/diagnostic_convergence.py            # all 60 runs (resumable)
    python experiments/diagnostic_convergence.py --report   # rebuild the report from the run files

Outputs (separate from Study A / Study B; nothing else is written):
    experiments/results/diagnostics/convergence_thesis/runs/<cfg>_i<id>_s<seed>.json
    experiments/results/diagnostics/convergence_thesis/summary.json
    docs/DIAGNOSTIC_CONVERGENCE.md
"""
import sys
import json
import time
import hashlib
import argparse
import statistics
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor

_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT))
sys.path.insert(0, str(_ROOT / 'optimizer'))
sys.path.insert(0, str(_ROOT / 'experiments'))
sys.path.insert(0, str(_ROOT / 'tools'))

import numpy as np

CONFIGS = ['DGWO', 'MOGWO', 'SEQ', 'REP']
# First instance of each class in the thesis sample (experiments/sample30_seed42.json);
# 185 and 174 are also Study B instances.
INSTANCES = {'BR1': 413, 'BR4': 185, 'BR7': 174}
SEEDS = [1, 2, 3, 4, 5]
POP_SIZE, MAX_ITER = 30, 300          # study.PRESETS['thesis']
STOP_SEED, STOP_COUNT = 42, 3
KEY_BOUND = 5.0
# "Stops improving": last iteration at which the curve rises by more than this
# (SU in percentage points).
EPS_PP = 1e-9

OUT_DIR = _ROOT / 'experiments' / 'results' / 'diagnostics' / 'convergence_thesis'
REPORT = _ROOT / 'docs' / 'DIAGNOSTIC_CONVERGENCE.md'


def _calibration():
    return json.loads((_ROOT / 'experiments' / 'calibration.json').read_text())


# ─── observation-only subclasses ────────────────────────────────────────────
def _instrumented(base):
    from thesis_algorithms import WolfContinuous

    class TimedWolf(WolfContinuous):
        """Times the repair call and notes how many boxes the decoder placed
        before it; the call itself is the parent's."""
        diag = None

        def _repair(self, items, container):
            before = len(self.placements)
            t0 = time.perf_counter()
            super()._repair(items, container)
            dt = time.perf_counter() - t0
            if self.diag is not None:
                self.diag['repair_s'] += dt
                r = self.last_repair
                self.diag['repair_calls'].append((
                    before,
                    r['relocated_R1'], r['relocated_R2'],
                    r['deferred_R1'], r['deferred_R2'], r['removed_R3'],
                    r['passes_used'], r['rmax_hit']))

    class Diag(base):
        def __init__(self, *a, **kw):
            super().__init__(*a, record_history=True, **kw)
            self.diag = {'repair_s': 0.0, 'repair_calls': [], 'evals': [], 'eval_su': []}
            self.diag_archive = None

        def _new_wolf(self):
            # Same constructor arguments and the same single rng.uniform draw.
            w = TimedWolf(self.n, lambda_w=self.lambda_w, lambda_f=self.lambda_f,
                          lambda_b=self.lambda_b, lambda_a=self.lambda_a, rng=self.rng)
            w.diag = self.diag
            return w

        def _evaluate(self, w, apply_repair=False, compute_penalty=False):
            super()._evaluate(w, apply_repair=apply_repair, compute_penalty=compute_penalty)
            self.diag['evals'].append(w.X[:self.n].copy())
            self.diag['eval_su'].append(w.su)

        def _update_archive(self, archive, wolf):
            self.diag_archive = archive          # pruning mutates and returns the same list
            return super()._update_archive(archive, wolf)

    Diag.__name__ = 'Diag' + base.__name__
    return Diag


def _classes():
    from thesis_algorithms import StandaloneDGWO, StandaloneMOGWO, SequentialHybrid, RepairBasedHybrid
    return {'DGWO': StandaloneDGWO, 'MOGWO': StandaloneMOGWO,
            'SEQ': SequentialHybrid, 'REP': RepairBasedHybrid}


def _load(instance_id):
    from preprocessing.pipeline import load_augmented_instance
    return load_augmented_instance({'data': {'raw_dir': str(_ROOT / 'data' / 'raw')}},
                                   instance_id=instance_id, stop_seed=STOP_SEED, stop_count=STOP_COUNT)


# ─── diversity ──────────────────────────────────────────────────────────────
def kendall_diversity(keys):
    """keys: (pop, n) sequence keys. Mean over wolf pairs of the normalised
    Kendall tau distance between their loading orders (stable argsort, as the
    decoder), i.e. the share of box pairs the two orders place differently."""
    order = np.argsort(keys, axis=1, kind='stable')
    pos = np.empty_like(order)
    rows = np.arange(order.shape[0])[:, None]
    pos[rows, order] = np.arange(order.shape[1])[None, :]
    iu, ju = np.triu_indices(order.shape[1], k=1)
    s = np.sign(pos[:, iu] - pos[:, ju]).astype(np.float64)     # no ties in a permutation
    P = s.shape[1]
    agree = s @ s.T                                             # concordant - discordant
    d = (P - agree) / (2.0 * P)
    k = keys.shape[0]
    return float(d[np.triu_indices(k, k=1)].mean())


def _snapshots(evals, pop):
    """Evaluations come in sweeps of `pop`: the initial population, then one
    sweep per iteration (SEQ's phase switch evaluates nothing). Snapshot t is
    the population after iteration t (t = 0: the initial population)."""
    E = np.asarray(evals)
    assert len(E) % pop == 0, len(E)
    return E.reshape(-1, pop, E.shape[1])


# ─── one run ────────────────────────────────────────────────────────────────
def run_task(task):
    import numba  # noqa: F401  (compiled kernels)
    from thesis_algorithms import RepairBasedHybrid
    from thesis_metrics import evaluate_constraints, space_utilization
    from validate_arrangement import validate

    cal = _calibration()
    lam = cal['lambdas']
    inst = _load(task['instance_id'])
    boxes, container = inst['boxes'], inst['container']
    flags = dict(enforce_support=cal['enforce_support'], enforce_fragility=cal['enforce_fragility'])
    # Warm every kernel untimed, as study.py does.
    RepairBasedHybrid(items=boxes, container=container, pop_size=3, max_iter=1, seed=0, **flags).run()

    cls = _instrumented(_classes()[task['configuration']])
    opt = cls(items=boxes, container=container, pop_size=POP_SIZE, max_iter=MAX_ITER,
              lambda_w=lam['w'], lambda_f=lam['f'], lambda_b=lam['b'], lambda_a=lam['a'],
              seed=task['seed'], **flags)
    t0 = time.perf_counter()
    best = opt.run()
    run_s = time.perf_counter() - t0

    n = len(boxes)
    snaps = _snapshots(opt.diag['evals'], POP_SIZE)
    diversity = [round(kendall_diversity(s), 6) for s in snaps]
    at_bound = [round(float(np.mean(np.abs(s) >= KEY_BOUND)), 6) for s in snaps]
    esu = np.asarray(opt.diag['eval_su']).reshape(-1, POP_SIZE).max(axis=1) * 100.0

    csr, _ = evaluate_constraints(best.placements, boxes, best.orientations)
    placements = {int(k): [float(v) for v in vals] for k, vals in best.placements.items()}
    orientations = {int(k): int(v) for k, v in best.orientations.items()}
    iv = validate(container, boxes, placements, orientations)

    def member(w):
        return {'su_pct': round(w.su * 100.0, 4), 'csr_pct': round(w.csr, 4),
                'placed': len(w.placements),
                'csr_all_pct': round(w.csr * len(w.placements) / n, 4)}

    archive = None
    if opt.diag_archive is not None:
        A = opt.diag_archive
        top_su = max(A, key=lambda w: w.su)
        top_csr = max(A, key=lambda w: (w.csr, w.su))
        archive = {'size': len(A), 'highest_su': member(top_su), 'highest_csr': member(top_csr),
                   'returned_is_highest_su': top_su is best,
                   'members': sorted(([round(w.su * 100.0, 4), round(w.csr, 4), len(w.placements)] for w in A),
                                     key=lambda m: -m[0])}

    repair = None
    if task['configuration'] == 'REP':
        calls = np.asarray(opt.diag['repair_calls'], dtype=float)
        repair = {'calls': int(len(calls)),
                  'repair_s': round(opt.diag['repair_s'], 3),
                  'repair_share': round(opt.diag['repair_s'] / run_s, 4),
                  'cols': ['placed_before', 'relocated_R1', 'relocated_R2', 'deferred_R1',
                           'deferred_R2', 'removed_R3', 'passes_used', 'rmax_hit'],
                  'sum': [int(v) for v in calls.sum(axis=0)],
                  'mean': [round(float(v), 4) for v in calls.mean(axis=0)],
                  'per_call_relocated': np.bincount((calls[:, 1] + calls[:, 2]).astype(int)).tolist(),
                  'per_call_out': np.bincount((calls[:, 3] + calls[:, 4] + calls[:, 5]).astype(int)).tolist(),
                  'repair_stats_check': opt.repair_stats}

    return {
        'configuration': task['configuration'], 'instance_id': task['instance_id'],
        'br_class': task['br_class'], 'seed': task['seed'], 'n_items': n,
        'pop_size': POP_SIZE, 'max_iter': MAX_ITER, 'lambdas': lam, **flags,
        'su_pct': round(space_utilization(best.placements, container) * 100.0, 4),
        'csr_pct': round(csr, 4), 'placed': len(best.placements),
        'csr_all_pct': round(csr * len(best.placements) / n, 4),
        'run_s': round(run_s, 2),
        'validator_agree': abs(iv['pct']['all'] - csr) < 1e-6 and iv['pct']['C1'] == 100.0
                           and iv['pct']['C2'] == 100.0,
        # iteration t = 1..MAX_ITER
        'incumbent_su': [round(h[1] * 100.0, 4) for h in opt.history],
        'incumbent_csr': [round(h[2], 4) for h in opt.history],
        'max_eval_su': [round(float(v), 4) for v in np.maximum.accumulate(esu)[1:]],
        # snapshot 0 = initial population, then t = 1..MAX_ITER
        'diversity_kendall': diversity,
        'keys_at_bound': at_bound,
        'archive': archive,
        'repair': repair,
    }


# ─── determinism check ──────────────────────────────────────────────────────
def check():
    """Instrumented classes vs tools/determinism_reference.json."""
    ref = json.loads((_ROOT / 'tools' / 'determinism_reference.json').read_text())
    s = ref['settings']
    inst = _load(s['instance_id'])
    bad = 0
    for case in ref['cases']:
        cls = _instrumented(_classes()[case['configuration']])
        best = cls(inst['boxes'], inst['container'], pop_size=s['pop_size'], max_iter=s['max_iter'],
                   lambda_penalty=s['lambda'], enforce_support=s['enforce_support'],
                   enforce_fragility=s['enforce_fragility'], seed=case['seed']).run()
        blob = json.dumps({'p': {str(k): list(v) for k, v in sorted(best.placements.items())},
                           'o': {str(k): v for k, v in sorted(best.orientations.items())},
                           'su': best.su, 'csr': best.csr}, sort_keys=True)
        h = hashlib.sha256(blob.encode('utf-8')).hexdigest()
        ok = h == case['sha256']
        bad += not ok
        print(f"  {'PASS' if ok else 'FAIL'}  {case['configuration']:5s} seed {case['seed']:2d}  {h[:16]}")
    print('instrumentation is observation-only' if not bad else f'{bad} case(s) differ')
    return bad


# ─── driver ─────────────────────────────────────────────────────────────────
def _run_path(t):
    return OUT_DIR / 'runs' / f"{t['configuration']}_i{t['instance_id']}_s{t['seed']}.json"


def run_all():
    (OUT_DIR / 'runs').mkdir(parents=True, exist_ok=True)
    tasks = [{'configuration': c, 'instance_id': iid, 'br_class': br, 'seed': s}
             for br, iid in INSTANCES.items() for s in SEEDS for c in CONFIGS]
    todo = [t for t in tasks if not _run_path(t).exists()]
    print(f"{len(tasks) - len(todo)} of {len(tasks)} runs already on disk; {len(todo)} to go", flush=True)
    for k, t in enumerate(todo, 1):
        # Serial, one fresh process per run (as study.py --mode serial).
        with ProcessPoolExecutor(max_workers=1) as ex:
            r = ex.submit(run_task, t).result()
        _run_path(t).write_text(json.dumps(r))
        print(f"[{k:2d}/{len(todo)}] {r['configuration']:5s} {r['br_class']} i{r['instance_id']} s{r['seed']} "
              f"SU={r['su_pct']:6.2f} CSR={r['csr_pct']:6.2f} placed={r['placed']}/{r['n_items']} "
              f"{r['run_s']:6.0f}s div0={r['diversity_kendall'][0]:.3f} divT={r['diversity_kendall'][-1]:.3f} "
              f"validator={'AGREE' if r['validator_agree'] else 'DISAGREE'}", flush=True)


# ─── report ─────────────────────────────────────────────────────────────────
def _last_improvement(curve):
    """1-based iteration of the last rise of a curve indexed t = 1..T (0 = never rose)."""
    last = 0
    for t in range(1, len(curve)):
        if curve[t] > curve[t - 1] + EPS_PP:
            last = t + 1
    return last


def _reach(curve, frac):
    """First iteration at which the curve has covered `frac` of its total rise."""
    lo, hi = curve[0], curve[-1]
    if hi - lo <= EPS_PP:
        return 1
    target = lo + frac * (hi - lo)
    return next(t + 1 for t, v in enumerate(curve) if v >= target - 1e-12)


def _mean(xs):
    return statistics.mean(xs) if xs else float('nan')


def _greedy(instance_id):
    from baselines import pack
    cal = _calibration()
    inst = _load(instance_id)
    boxes = inst['boxes']
    r = pack(sorted(range(len(boxes)), key=lambda i: -boxes[i]['mass']), boxes, inst['container'],
             cal['enforce_support'], cal['enforce_fragility'])
    return {'su_pct': round(r['su_pct'], 4), 'csr_pct': round(r['csr_pct'], 4), 'placed': r['placed'],
            'csr_all_pct': round(r['csr_pct'] * r['placed'] / r['n_items'], 4)}


def build_summary():
    runs = [json.loads(p.read_text()) for p in sorted((OUT_DIR / 'runs').glob('*.json'))]
    by = {}
    for r in runs:
        by.setdefault((r['br_class'], r['configuration']), []).append(r)
    summary = {'settings': {'pop_size': POP_SIZE, 'max_iter': MAX_ITER, 'seeds': SEEDS,
                            'instances': INSTANCES, 'stop_seed': STOP_SEED, 'stop_count': STOP_COUNT,
                            'calibration': _calibration(), 'mode': 'serial, one fresh process per run'},
               'n_runs': len(runs),
               'validator_disagreements': sum(not r['validator_agree'] for r in runs),
               'instances': {}}
    for br, iid in INSTANCES.items():
        g = _greedy(iid)
        row = {'instance_id': iid, 'n_items': None, 'greedy': g, 'configs': {}}
        for cfg in CONFIGS:
            rs = sorted(by.get((br, cfg), []), key=lambda r: r['seed'])
            if not rs:
                continue
            row['n_items'] = rs[0]['n_items']
            T = len(rs[0]['incumbent_su'])
            inc = [_mean([r['incumbent_su'][t] for r in rs]) for t in range(T)]
            bsf = [_mean([max(r['incumbent_su'][:t + 1]) for r in rs]) for t in range(T)]
            mev = [_mean([r['max_eval_su'][t] for r in rs]) for t in range(T)]
            div = [_mean([r['diversity_kendall'][t] for r in rs]) for t in range(T + 1)]
            bnd = [_mean([r['keys_at_bound'][t] for r in rs]) for t in range(T + 1)]
            per_seed_last = [_last_improvement([max(r['incumbent_su'][:t + 1]) for t in range(T)]) for r in rs]
            c = {
                'seeds': [r['seed'] for r in rs],
                'final_su_mean': _mean([r['su_pct'] for r in rs]),
                'final_su_sd': statistics.stdev([r['su_pct'] for r in rs]) if len(rs) > 1 else 0.0,
                'final_su_per_seed': [r['su_pct'] for r in rs],
                'final_csr_mean': _mean([r['csr_pct'] for r in rs]),
                'final_csr_all_mean': _mean([r['csr_all_pct'] for r in rs]),
                'placed_mean': _mean([r['placed'] for r in rs]),
                'su_minus_greedy_pp': _mean([r['su_pct'] for r in rs]) - g['su_pct'],
                'su_minus_greedy_per_seed': [round(r['su_pct'] - g['su_pct'], 4) for r in rs],
                'run_s_mean': _mean([r['run_s'] for r in rs]),
                'curve_best_so_far_su': [round(v, 4) for v in bsf],
                'curve_incumbent_su': [round(v, 4) for v in inc],
                'curve_max_evaluated_su': [round(v, 4) for v in mev],
                'curve_diversity': [round(v, 6) for v in div],
                'curve_keys_at_bound': [round(v, 6) for v in bnd],
                'last_improvement_mean_curve': _last_improvement(bsf),
                'last_improvement_per_seed': per_seed_last,
                'iter_95pct_of_gain': _reach(bsf, 0.95),
                'iter_99pct_of_gain': _reach(bsf, 0.99),
                'incumbent_regressions': sum(sum(1 for t in range(1, T) if r['incumbent_su'][t] < r['incumbent_su'][t - 1] - EPS_PP)
                                             for r in rs) / len(rs),
                'last_improvement_max_evaluated_su': _last_improvement(mev),
            }
            if rs[0]['archive']:
                A = [r['archive'] for r in rs]
                c['archive'] = {
                    'size_per_seed': [a['size'] for a in A],
                    'size_mean': _mean([a['size'] for a in A]),
                    'highest_su': {k: _mean([a['highest_su'][k] for a in A]) for k in A[0]['highest_su']},
                    'highest_csr': {k: _mean([a['highest_csr'][k] for a in A]) for k in A[0]['highest_csr']},
                    'per_seed': [{'seed': r['seed'], 'size': r['archive']['size'],
                                  'highest_su': r['archive']['highest_su'],
                                  'highest_csr': r['archive']['highest_csr']} for r in rs],
                    'returned_is_highest_su': all(a['returned_is_highest_su'] for a in A),
                }
            if rs[0]['repair']:
                R = [r['repair'] for r in rs]
                cols = R[0]['cols']
                tot_calls = sum(x['calls'] for x in R)
                sums = [sum(x['sum'][i] for x in R) for i in range(len(cols))]
                per = {col: sums[i] / tot_calls for i, col in enumerate(cols)}
                rel = [0] * max(len(x['per_call_relocated']) for x in R)
                out = [0] * max(len(x['per_call_out']) for x in R)
                for x in R:
                    for i, v in enumerate(x['per_call_relocated']):
                        rel[i] += v
                    for i, v in enumerate(x['per_call_out']):
                        out[i] += v
                c['repair'] = {
                    'calls_per_run': tot_calls / len(R),
                    'per_call_mean': per,
                    'relocated_per_call': per['relocated_R1'] + per['relocated_R2'],
                    'out_per_call': per['deferred_R1'] + per['deferred_R2'] + per['removed_R3'],
                    'share_calls_relocating': 1 - rel[0] / tot_calls,
                    'share_calls_taking_out': 1 - out[0] / tot_calls,
                    'out_per_call_hist': out,
                    'relocated_per_call_hist': rel,
                    'repair_share_mean': _mean([x['repair_share'] for x in R]),
                    'repair_share_per_seed': [x['repair_share'] for x in R],
                    'repair_s_mean': _mean([x['repair_s'] for x in R]),
                }
            row['configs'][cfg] = c
        summary['instances'][br] = row
    return summary


def _fmt(v, d=2):
    return f"{v:.{d}f}"


def write_report(s):
    L = []
    w = L.append
    w('# Diagnostic — convergence, diversity and repair at the Thesis preset\n')
    w('Diagnostic only: no optimizer, decoder, repair or evaluator code was changed, and Study A, '
      'Study B and `tools/determinism_reference.json` are untouched. Produced by '
      '`experiments/diagnostic_convergence.py`; per-run data in '
      '`experiments/results/diagnostics/convergence_thesis/` (`runs/*.json`, `summary.json`).\n')
    st = s['settings']
    w(f"**Setup.** Pop {st['pop_size']} × {st['max_iter']} iterations (Thesis preset), seeds "
      f"{st['seeds'][0]}–{st['seeds'][-1]}, λ = 0.20 (all four), C4/C5 enforced at decode "
      f"(`experiments/calibration.json`), stop seed 42, 3 stops. Instances: "
      + ', '.join(f"{br} = {v['instance_id']} ({v['n_items']} boxes)" for br, v in s['instances'].items())
      + ' — the first instance of each class in `experiments/sample30_seed42.json` '
      '(185 and 174 are also Study B instances). Serial, one fresh process per run, numba warmed untimed. '
      f"{s['n_runs']} runs; independent validator disagreements: {s['validator_disagreements']}. "
      'The instrumented classes reproduce all 8 reference hashes (`--check`), so the runs are the '
      'unmodified methods.\n')
    w('**Definitions.** *Best-so-far SU* = running maximum, per seed, of the SU of the solution the '
      f'configuration would return if stopped at that iteration (DGWO: α by scalar fitness; MOGWO, SEQ, '
      f'REP: highest-SU archive member), then averaged over the {len(st["seeds"])} seeds. *Stops improving* = last '
      f'iteration at which that mean curve rises. *Diversity* = mean over the {st["pop_size"] * (st["pop_size"] - 1) // 2} wolf pairs of the '
      'normalised Kendall tau distance between loading orders (stable argsort of the n sequence keys, '
      'as the decoder builds it): 0 = identical orders, ≈ 0.5 = unrelated orders.\n')

    # 1
    w('## 1. Best-so-far SU and where it stops improving\n')
    w('| class | config | SU @1 | @10 | @25 | @50 | @100 | @150 | @200 | @300 | stops improving (mean curve) | per seed | 95 % / 99 % of gain by |')
    w('|---|---|---|---|---|---|---|---|---|---|---|---|---|')
    for br, row in s['instances'].items():
        for cfg, c in row['configs'].items():
            b = c['curve_best_so_far_su']
            pts = [b[i - 1] for i in (1, 10, 25, 50, 100, 150, 200, 300) if i <= len(b)]
            w(f"| {br} | {cfg} | " + ' | '.join(_fmt(p) for p in pts)
              + f" | {c['last_improvement_mean_curve']} | {', '.join(map(str, c['last_improvement_per_seed']))}"
              f" | {c['iter_95pct_of_gain']} / {c['iter_99pct_of_gain']} |")
    w('')
    w('The incumbent itself is not monotone: average number of iterations per run in which the '
      'returned-criterion SU fell (DGWO\'s α is re-chosen from the moved population; archive pruning '
      'can drop the top-SU member):\n')
    w('| class | ' + ' | '.join(CONFIGS) + ' |')
    w('|---|' + '---|' * len(CONFIGS))
    for br, row in s['instances'].items():
        w(f"| {br} | " + ' | '.join(_fmt(row['configs'][c]['incumbent_regressions'], 1) if c in row['configs'] else '–'
                                    for c in CONFIGS) + ' |')
    w('')
    w('Highest SU of *any* wolf evaluated so far (ignores the return criterion; REP: after repair), '
      'mean of 5 seeds, at 300 and its last rise:\n')
    w('| class | ' + ' | '.join(CONFIGS) + ' |')
    w('|---|' + '---|' * len(CONFIGS))
    for br, row in s['instances'].items():
        w(f"| {br} | " + ' | '.join(
            f"{_fmt(row['configs'][c]['curve_max_evaluated_su'][-1])} (it {row['configs'][c]['last_improvement_max_evaluated_su']})"
            if c in row['configs'] else '–' for c in CONFIGS) + ' |')
    w('')

    # 2
    w('## 2. Population diversity (mean pairwise Kendall tau distance of loading orders)\n')
    w('| class | config | init | @1 | @5 | @10 | @25 | @50 | @100 | @150 | @200 | @300 | first iter < 0.05 | keys on ±5 bound @300 |')
    w('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|')
    for br, row in s['instances'].items():
        for cfg, c in row['configs'].items():
            d = c['curve_diversity']
            pts = [d[i] for i in (0, 1, 5, 10, 25, 50, 100, 150, 200, 300) if i < len(d)]
            below = next((t for t, v in enumerate(d) if v < 0.05), None)
            w(f"| {br} | {cfg} | " + ' | '.join(_fmt(p, 3) for p in pts)
              + f" | {below if below is not None else '—'} | {_fmt(100 * c['curve_keys_at_bound'][-1], 1)} % |")
    w('')

    # 3
    w('## 3. SU minus the Weight-Sorted Greedy\n')
    w('Greedy = one pass of the same decoder, heaviest box first, first allowed orientation '
      '(`experiments/baselines.py`). Configuration SU = mean of the 5 seeds\' returned solutions.\n')
    w('| class | greedy SU | ' + ' | '.join(f'{c} SU' for c in CONFIGS) + ' | ' + ' | '.join(f'{c} − greedy (pp)' for c in CONFIGS) + ' |')
    w('|---|---|' + '---|' * (2 * len(CONFIGS)))
    for br, row in s['instances'].items():
        cs = row['configs']
        w(f"| {br} | {_fmt(row['greedy']['su_pct'])} | "
          + ' | '.join(f"{_fmt(cs[c]['final_su_mean'])} ± {_fmt(cs[c]['final_su_sd'])}" if c in cs else '–' for c in CONFIGS) + ' | '
          + ' | '.join(f"{cs[c]['su_minus_greedy_pp']:+.2f}" if c in cs else '–' for c in CONFIGS) + ' |')
    w('')
    w('Per seed (pp): ' + '; '.join(
        f"{br} " + ', '.join(f"{c} [{', '.join(f'{x:+.1f}' for x in row['configs'][c]['su_minus_greedy_per_seed'])}]"
                             for c in CONFIGS if c in row['configs'])
        for br, row in s['instances'].items()) + '\n')
    w('For context (not asked): greedy CSR over placed / over all boxes and placed count, and the '
      'configurations\' mean CSR over placed boxes:\n')
    w('| class | greedy CSR placed | greedy CSR all | greedy placed | ' + ' | '.join(f'{c} CSR' for c in CONFIGS) + ' |')
    w('|---|---|---|---|' + '---|' * len(CONFIGS))
    for br, row in s['instances'].items():
        g, cs = row['greedy'], row['configs']
        w(f"| {br} | {_fmt(g['csr_pct'])} | {_fmt(g['csr_all_pct'])} | {g['placed']}/{row['n_items']} | "
          + ' | '.join(_fmt(cs[c]['final_csr_mean']) if c in cs else '–' for c in CONFIGS) + ' |')
    w('')

    # 4
    w('## 4. REP: what repair does per call, and what it costs\n')
    w(f'One repair call per evaluated wolf ({st["pop_size"]} + {st["pop_size"]} × {st["max_iter"]} = {st["pop_size"] * (st["max_iter"] + 1)} per run). *Relocated* = boxes moved '
      'to another feasible position by R1 (weight) or R2 (stop order). *Taken out* = boxes leaving the '
      'container: deferred by R1/R2 (no feasible position) plus removed by R3.\n')
    w('| class | placed by decoder | relocated R1 | relocated R2 | deferred R1 | deferred R2 | removed R3 | **relocated** | **taken out** | calls relocating ≥1 | calls taking out ≥1 | passes | R_MAX hit | repair share of run time | run time (s) |')
    w('|---|' + '---|' * 14)
    for br, row in s['instances'].items():
        c = row['configs'].get('REP')
        if not c:
            continue
        r, p = c['repair'], c['repair']['per_call_mean']
        w(f"| {br} | {_fmt(p['placed_before'], 1)} | {_fmt(p['relocated_R1'])} | {_fmt(p['relocated_R2'])} | "
          f"{_fmt(p['deferred_R1'])} | {_fmt(p['deferred_R2'])} | {_fmt(p['removed_R3'])} | "
          f"**{_fmt(r['relocated_per_call'])}** | **{_fmt(r['out_per_call'])}** | "
          f"{_fmt(100 * r['share_calls_relocating'], 1)} % | {_fmt(100 * r['share_calls_taking_out'], 1)} % | "
          f"{_fmt(p['passes_used'])} | {_fmt(100 * p['rmax_hit'], 1)} % | "
          f"**{_fmt(100 * r['repair_share_mean'], 1)} %** ({', '.join(_fmt(100 * x, 1) for x in r['repair_share_per_seed'])}) | "
          f"{_fmt(c['run_s_mean'], 0)} |")
    w('')
    w('Run time of all four configurations (s, mean of 5 serial runs, instrumented):\n')
    w('| class | ' + ' | '.join(CONFIGS) + ' |')
    w('|---|' + '---|' * len(CONFIGS))
    for br, row in s['instances'].items():
        w(f"| {br} | " + ' | '.join(_fmt(row['configs'][c]['run_s_mean'], 0) if c in row['configs'] else '–' for c in CONFIGS) + ' |')
    w('')

    # 5
    w('## 5. MOGWO and SEQ: final archive\n')
    w('The reported solution is the highest-SU archive member; the highest-CSR member is the other end '
      'of the front (ties on CSR broken by SU). Means over 5 seeds; CSR over placed boxes, '
      '"CSR all" = CSR × placed / n.\n')
    w('| class | config | archive size (per seed) | reported: SU | CSR | CSR all | placed | best-CSR: SU | CSR | CSR all | placed |')
    w('|---|---|---|---|---|---|---|---|---|---|---|')
    for br, row in s['instances'].items():
        for cfg in ('MOGWO', 'SEQ', 'REP'):
            c = row['configs'].get(cfg)
            if not c or 'archive' not in c:
                continue
            a = c['archive']
            hs, hc = a['highest_su'], a['highest_csr']
            w(f"| {br} | {cfg}{' (for reference)' if cfg == 'REP' else ''} | {_fmt(a['size_mean'], 1)} ({', '.join(map(str, a['size_per_seed']))}) | "
              f"{_fmt(hs['su_pct'])} | {_fmt(hs['csr_pct'])} | {_fmt(hs['csr_all_pct'])} | {_fmt(hs['placed'], 1)} | "
              f"{_fmt(hc['su_pct'])} | {_fmt(hc['csr_pct'])} | {_fmt(hc['csr_all_pct'])} | {_fmt(hc['placed'], 1)} |")
    w('')
    w('Per seed (SU / CSR of reported → best-CSR member):\n')
    for br, row in s['instances'].items():
        for cfg in ('MOGWO', 'SEQ'):
            c = row['configs'].get(cfg)
            if not c or 'archive' not in c:
                continue
            w(f"- {br} {cfg}: " + '; '.join(
                f"s{p['seed']} (n={p['size']}) {_fmt(p['highest_su']['su_pct'], 1)}/{_fmt(p['highest_su']['csr_pct'], 1)} → "
                f"{_fmt(p['highest_csr']['su_pct'], 1)}/{_fmt(p['highest_csr']['csr_pct'], 1)}"
                for p in c['archive']['per_seed']))
    w('')
    REPORT.write_text('\n'.join(L) + '\n', encoding='utf-8')


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--check', action='store_true', help='instrumented classes vs the reference hashes')
    p.add_argument('--report', action='store_true', help='only rebuild summary.json and the report')
    a = p.parse_args()
    if a.check:
        sys.exit(1 if check() else 0)
    if not a.report:
        if check():
            sys.exit('instrumentation changed a result; nothing run')
        run_all()
    s = build_summary()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / 'summary.json').write_text(json.dumps(s, indent=1))
    write_report(s)
    print(f"wrote {OUT_DIR / 'summary.json'} and {REPORT}")


if __name__ == '__main__':
    main()
