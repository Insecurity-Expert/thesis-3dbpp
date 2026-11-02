"""REP leader structure (Chapter 3, Appendix 2.4 and Figure 10):

  - every candidate is scored with PEN-1 on the decoded arrangement BEFORE repair;
  - Beta and Delta are the 1st and 2nd of that pre-repair PEN-1 ranking,
    elitist (replaced only by a strictly better genome), as in StandaloneDGWO;
  - Alpha is a member of the MOGWO archive;
  - only repaired arrangements enter the archive (placed-box CSR = 100%);
  - the run repeats exactly under the same seed.

    python tools/test_rep_leaders.py
"""
import sys
from pathlib import Path

import numpy as np

_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT))
sys.path.insert(0, str(_ROOT / 'optimizer'))

from preprocessing.pipeline import load_augmented_instance
from thesis_algorithms import RepairBasedHybrid, WolfContinuous
from thesis_metrics import evaluate_constraints, space_utilization

failed = 0


def check(name, ok, detail=''):
    global failed
    failed += not ok
    print(f"  {'PASS' if ok else 'FAIL'}  {name}{'' if ok else f'  ({detail})'}")


class Watched(RepairBasedHybrid):
    """Observation only: records pre-repair PEN-1 recomputed independently,
    and the leaders chosen after each iteration. Draws nothing from the RNG."""
    def __init__(self, *a, **kw):
        super().__init__(*a, **kw)
        self.pen_mismatch = 0
        self.best_seen = []          # best and 2nd-best distinct pre-repair PEN-1 so far
        self.leader_log = []
        self._all = {}

    def _evaluate(self, w, apply_repair=False, compute_penalty=False):
        super()._evaluate(w, apply_repair=apply_repair, compute_penalty=compute_penalty)
        # Recompute raw PEN-1 independently: decode the same genome without repair.
        raw = WolfContinuous(self.n, self.lambda_w, self.lambda_f, self.lambda_b,
                             self.lambda_a, rng=np.random.default_rng(0))
        raw.X = w.X.copy()
        raw.decode_and_evaluate(self.items, self.container, apply_repair=False,
                                enforce_support=self.enforce_support,
                                enforce_fragility=self.enforce_fragility,
                                compute_penalty=True, load_order=self.load_order)
        if raw.scalar_fitness != w.scalar_fitness:
            self.pen_mismatch += 1
        self._all.setdefault(w.X.tobytes(), w.scalar_fitness)

    def _record(self, iteration, best):
        super()._record(iteration, best)


inst = load_augmented_instance({'data': {'raw_dir': str(_ROOT / 'data' / 'raw')}},
                               instance_id=350, stop_seed=42, stop_count=3)
kw = dict(pop_size=10, max_iter=15, lambda_penalty=0.20,
          enforce_support=True, enforce_fragility=True)

# Capture leaders via a wrapper around _dgwo_pair / _select_alpha.
opt = Watched(inst['boxes'], inst['container'], seed=7, **kw)
pairs, alphas, archives = [], [], []
orig_pair, orig_alpha = opt._dgwo_pair, opt._select_alpha
opt._dgwo_pair = lambda inc, pop: (lambda r: (pairs.append((r, [w.scalar_fitness for w in pop])), r)[1])(orig_pair(inc, pop))
opt._select_alpha = lambda arch: (lambda r: (alphas.append(r), archives.append(list(arch)), r)[2])(orig_alpha(arch))
best = opt.run()

check('PEN-1 is scored before repair (matches an unrepaired decode of the same genome)',
      opt.pen_mismatch == 0, f'{opt.pen_mismatch} mismatches')

ok_rank = True
prev = None
for (beta, delta), pop_fit in pairs:
    if not (beta.scalar_fitness <= delta.scalar_fitness):
        ok_rank = False
    if beta.scalar_fitness > min(pop_fit) + 1e-12:
        ok_rank = False
    if prev is not None and beta.scalar_fitness > prev + 1e-12:
        ok_rank = False      # elitism: Beta never gets worse
    prev = beta.scalar_fitness
check('Beta/Delta are the 1st/2nd of the pre-repair PEN-1 ranking, elitist', ok_rank)

check('Alpha is always an archive member',
      all(any(a is m for m in arch) for a, arch in zip(alphas, archives)))

check('Beta/Delta are distinct genomes',
      all(not np.array_equal(b.X, d.X) for (b, d), _ in pairs))

check('archive holds only repaired arrangements (placed-box CSR = 100%)',
      all(m.csr == 100.0 for arch in archives for m in arch))

check('returned arrangement is compliant', best.csr == 100.0, f'CSR {best.csr}')

again = RepairBasedHybrid(inst['boxes'], inst['container'], seed=7, **kw).run()
check('same seed repeats exactly',
      again.placements == best.placements and again.su == best.su)

print(f"\n{'PASS' if not failed else 'FAIL'} - {failed} failed")
sys.exit(1 if failed else 0)
