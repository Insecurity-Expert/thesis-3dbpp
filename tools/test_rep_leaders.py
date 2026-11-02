"""REP leader structure and step order (Chapter 3 architecture text; Appendix 2.4):

  - every candidate is scored with PEN-1 on the decoded arrangement BEFORE repair;
  - per iteration: all wolves updated and scored (steps 4-7), then the leaders are
    chosen (steps 8-9), then all wolves repaired and archived (steps 10-35);
  - Beta and Delta are the 1st and 2nd of the pre-repair PEN-1 ranking, elitist;
  - Alpha is drawn from archive A as it stands before that iteration's repaired
    candidates enter it;
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

failed = 0


def check(name, ok, detail=''):
    global failed
    failed += not ok
    print(f"  {'PASS' if ok else 'FAIL'}  {name}{'' if ok else f'  ({detail})'}")


class Watched(RepairBasedHybrid):
    """Observation only (draws nothing from the optimizer's RNG)."""
    def __init__(self, *a, **kw):
        super().__init__(*a, **kw)
        self.events, self.pen_mismatch = [], 0
        self.pairs, self.alphas = [], []

    def _evaluate(self, w, apply_repair=False, compute_penalty=False):
        super()._evaluate(w, apply_repair=apply_repair, compute_penalty=compute_penalty)
        self.events.append('E' if not apply_repair else 'X')
        raw = WolfContinuous(self.n, self.lambda_w, self.lambda_f, self.lambda_b,
                             self.lambda_a, rng=np.random.default_rng(0))
        raw.X = w.X.copy()
        raw.decode_and_evaluate(self.items, self.container, enforce_support=self.enforce_support,
                                enforce_fragility=self.enforce_fragility, compute_penalty=True)
        self.pen_mismatch += raw.scalar_fitness != w.scalar_fitness

    def _dgwo_pair(self, incumbents, pop):
        out = super()._dgwo_pair(incumbents, pop)
        self.events.append('P')
        self.pairs.append((out, [w.scalar_fitness for w in pop]))
        return out

    def _select_alpha(self, archive):
        before = list(archive)
        out = super()._select_alpha(archive)
        self.events.append('A')
        self.alphas.append((out, before))
        return out

    def _repair_and_archive(self, w, archive):
        pen = w.scalar_fitness
        super()._repair_and_archive(w, archive)
        self.events.append('R')
        self.pen_mismatch += w.scalar_fitness != pen       # repair must not touch PEN-1


inst = load_augmented_instance({'data': {'raw_dir': str(_ROOT / 'data' / 'raw')}},
                               instance_id=350, stop_seed=42, stop_count=3)
N, T = 10, 12
kw = dict(pop_size=N, max_iter=T, lambda_penalty=0.20, enforce_support=True, enforce_fragility=True)
opt = Watched(inst['boxes'], inst['container'], seed=7, **kw)
best = opt.run()

check('PEN-1 is scored before repair and repair leaves it unchanged',
      opt.pen_mismatch == 0, f'{opt.pen_mismatch} mismatches')

ev = ''.join(opt.events)
want = 'E' * N + 'P' + 'R' * N + 'A' + ('E' * N + 'P' + 'A' + 'R' * N) * T
check('step order: init (score, Beta/Delta, repair, Alpha); then per iteration '
      'update+score all -> Beta/Delta -> Alpha -> repair+archive all', ev == want,
      f'got {ev[:60]}...')

ok, prev = True, None
for (beta, delta), pop_fit in opt.pairs:
    ok &= beta.scalar_fitness <= delta.scalar_fitness
    ok &= beta.scalar_fitness <= min(pop_fit) + 1e-12
    if prev is not None:
        ok &= beta.scalar_fitness <= prev + 1e-12
    prev = beta.scalar_fitness
check('Beta/Delta are the 1st/2nd of the pre-repair PEN-1 ranking, elitist', bool(ok))
check('Beta/Delta are distinct genomes', all(not np.array_equal(b.X, d.X) for (b, d), _ in opt.pairs))
check('Alpha is a member of archive A as it stood before that step\'s repairs',
      all(any(a is m for m in before) for a, before in opt.alphas))
check('archive holds only repaired arrangements (placed-box CSR = 100%)',
      all(m.csr == 100.0 for _, before in opt.alphas for m in before))
check('returned arrangement is compliant', best.csr == 100.0, f'CSR {best.csr}')

again = RepairBasedHybrid(inst['boxes'], inst['container'], seed=7, **kw).run()
check('same seed repeats exactly', again.placements == best.placements and again.su == best.su)

print(f"\n{'PASS' if not failed else 'FAIL'} - {failed} failed")
sys.exit(1 if failed else 0)
