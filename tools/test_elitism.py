"""DGWO elitism (Mirjalili et al. 2014): alpha, beta, delta are the best PEN-1
solutions found so far, replaced only by a better wolf, and DGWO returns the
best-ever alpha. Applies to StandaloneDGWO and SequentialHybrid's DGWO phase.

    python tools/test_elitism.py
"""
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT))
sys.path.insert(0, str(_ROOT / 'optimizer'))

from preprocessing.pipeline import load_augmented_instance
from thesis_algorithms import StandaloneDGWO, SequentialHybrid

failed = 0


def check(name, ok, detail=''):
    global failed
    failed += not ok
    print(f"  {'PASS' if ok else 'FAIL'}  {name}{'' if ok else f'  ({detail})'}")


def watch(base):
    """Observation only: every evaluated PEN-1 fitness, and alpha/beta/delta
    after each iteration (via _record, which never touches the RNG)."""
    class W(base):
        def __init__(self, *a, **kw):
            super().__init__(*a, **kw)
            self.seen, self.leader_log = [], []

        def _evaluate(self, w, apply_repair=False, compute_penalty=False):
            super()._evaluate(w, apply_repair=apply_repair, compute_penalty=compute_penalty)
            if compute_penalty:
                self.seen.append(w.scalar_fitness)

        def _record(self, iteration, best):
            super()._record(iteration, best)
            self.leader_log.append((iteration, best.scalar_fitness, len(self.seen)))
    return W


inst = load_augmented_instance({'data': {'raw_dir': str(_ROOT / 'data' / 'raw')}},
                               instance_id=350, stop_seed=42, stop_count=3)
kw = dict(pop_size=10, max_iter=20, lambda_penalty=0.20, enforce_support=True, enforce_fragility=True)

print("[DGWO]")
for seed in (1, 42):
    opt = watch(StandaloneDGWO)(inst['boxes'], inst['container'], seed=seed, **kw)
    best = opt.run()
    fits = [f for _, f, _ in opt.leader_log]
    check(f"seed {seed}: alpha fitness never gets worse", all(b <= a for a, b in zip(fits, fits[1:])), fits)
    check(f"seed {seed}: alpha = best fitness evaluated so far, every iteration",
          all(abs(f - min(opt.seen[:n])) < 1e-12 for _, f, n in opt.leader_log))
    check(f"seed {seed}: returns the best-ever alpha", abs(best.scalar_fitness - min(opt.seen)) < 1e-12,
          (best.scalar_fitness, min(opt.seen)))
    # A frozen snapshot: re-decoding its genome reproduces its stored fitness,
    # so no later position update moved it.
    again = opt._snapshot(best)
    again.decode_and_evaluate(inst['boxes'], inst['container'], enforce_support=True,
                              enforce_fragility=True, compute_penalty=True)
    check(f"seed {seed}: returned alpha is frozen (its genome re-decodes to its fitness)",
          abs(again.scalar_fitness - best.scalar_fitness) < 1e-12 and again.placements == best.placements)

print("[SEQ, DGWO phase]")
for seed in (1, 42):
    opt = watch(SequentialHybrid)(inst['boxes'], inst['container'], seed=seed, **kw)
    opt.run()
    T1 = kw['max_iter'] // 2
    ph1 = [(f, n) for it, f, n in opt.leader_log if it < T1]
    check(f"seed {seed}: phase-1 alpha = best PEN-1 fitness so far, every iteration",
          all(abs(f - min(opt.seen[:n])) < 1e-12 for f, n in ph1))

print(f"\n{'PASS' if not failed else 'FAIL'} - {failed} failed")
sys.exit(1 if failed else 0)
