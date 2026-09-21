"""Pop-30 convergence check (Part J): was max_iter, chosen at pop 10, also
right at the campaign's pop 30? Records best-so-far per iteration via the
observation-only record_history hook.

    python experiments/convergence_pop30.py DGWO 1 350
"""
import sys, csv, time
from pathlib import Path
_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT)); sys.path.insert(0, str(_ROOT / 'optimizer'))
from preprocessing.pipeline import load_augmented_instance
from thesis_algorithms import StandaloneDGWO, StandaloneMOGWO, SequentialHybrid, RepairBasedHybrid
CFG = {'DGWO': StandaloneDGWO, 'MOGWO': StandaloneMOGWO, 'SEQ': SequentialHybrid, 'REP': RepairBasedHybrid}

name, seed, inst_id = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
pop, iters = 30, 500
inst = load_augmented_instance({'data': {'raw_dir': str(_ROOT / 'data' / 'raw')}}, instance_id=inst_id, stop_seed=seed)
opt = CFG[name](inst['boxes'], inst['container'], pop_size=pop, max_iter=iters, lambda_penalty=0.20,
                enforce_support=True, enforce_fragility=True, seed=seed, record_history=True)
t0 = time.perf_counter(); best = opt.run(); el = time.perf_counter() - t0
out = _ROOT / 'experiments' / 'convergence' / f'{name}_pop30_s{seed}_i{inst_id}.csv'
with open(out, 'w', newline='') as f:
    w = csv.writer(f); w.writerow(['cfg', 'seed', 'instance', 'pop', 'iteration', 'best_su', 'best_csr', 'best_placed'])
    for it, su, csr, pl in opt.history:
        w.writerow([name, seed, inst_id, pop, it + 1, f"{su*100:.4f}", f"{csr:.4f}", pl])
print(f"{name} pop={pop} seed={seed} inst={inst_id} final SU={best.su*100:.2f} CSR={best.csr:.2f} placed={len(best.placements)} {el:.0f}s ({1000*el/iters:.0f} ms/iter) -> {out.name}")
