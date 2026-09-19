import math
import sys
import numpy as np

from thesis_math import decode_position
from thesis_metrics import validate_items, evaluate_constraints, space_utilization
from geometry_3d import place_container_dblf, get_dims

class WolfContinuous:
    def __init__(self, n, lambda_penalty=1000.0, rng=None):
        self.n = n
        self.lambda_penalty = lambda_penalty
        self.rng = rng if rng is not None else np.random.default_rng()
        # [k_1..k_n, r_1..r_n] — random keys then orientation genes
        self.X = self.rng.uniform(-5, 5, 2 * n)

        # Phenotype
        self.placements = {}
        self.orientations = {}
        self.unplaced = []
        self.budget_exhausted = False
        self.placement_attempts = 0
        self.last_repair = None

        # Fitness / Metrics
        self.su = 0.0
        self.csr = 0.0
        self.scalar_fitness = float('inf')
        
    def decode_and_evaluate(self, items, container, apply_repair=False):
        """
        Decodes X into discrete placements using DBLF and evaluates fitness.
        If apply_repair is True, applies heuristic repair logic before evaluation.
        """
        # 1. Decode the genome into a placement sequence and orientations
        sequence, orients_map = decode_position(self.X, items, container)

        # 2. Fill ONE container in the sequence the genome specifies
        (self.placements, self.unplaced, self.orientations,
         self.placement_attempts, self.budget_exhausted) = place_container_dblf(
            sequence, items, orients_map, container)

        # 3. (Optional) Repair R1-R5
        if apply_repair:
            self._repair(items, container)

        # 4. Evaluate U(X) and S(X)
        self.su = space_utilization(self.placements, container)
        self.csr, detail = evaluate_constraints(self.placements, items, self.orientations)

        # 5. Scalar Fitness F(X) for DGWO — Chapter 3 PEN-1.
        # Violations are RATES over placed boxes so SumV is in [0, 4] and lives
        # on the same scale as U(X) in [0, 1]; percentage-point deficits would
        # let the penalty outweigh utilization by 20-90x at every grid lambda.
        # No separate unplaced term: V_unplaced/V_c = V_total/V_c - U(X), so it
        # is just a rescale of U plus a per-instance constant.
        sum_v = (detail['C3_weight_rate'] + detail['C4_fragility_rate']
                 + detail['C5_balance_rate'] + detail['C6_stop_order_rate'])
        penalty = self.lambda_penalty * sum_v

        self.scalar_fitness = -self.su + penalty

    def _repair(self, items, container):
        """Relocate-then-defer repair R1-R5 (see repair.py). Mutates the
        arrangement in place and records per-call stats on self.last_repair."""
        from repair import repair_arrangement
        self.last_repair = repair_arrangement(
            self.placements, self.orientations, self.unplaced, items, container)

    def dominates(self, other):
        """Pareto dominance: True if self dominates other based on SU and CSR (MOGWO-1)."""
        better_or_eq = (self.su >= other.su) and (self.csr >= other.csr)
        strictly_better = (self.su > other.su) or (self.csr > other.csr)
        return better_or_eq and strictly_better


def _update_position(wolf, alpha_X, beta_X, delta_X, a, rng):
    """Leaders are passed as frozen position arrays, not wolf objects: the
    sweep overwrites pop[0..2] in place, so live references would let later
    wolves chase an already-moved leader (Mirjalili et al. 2014, Eq. 3.6)."""
    n_dim = len(wolf.X)

    r1 = rng.random((3, n_dim))
    r2 = rng.random((3, n_dim))
    A = 2 * a * r1 - a
    C = 2 * r2

    leaders = np.vstack([alpha_X, beta_X, delta_X])
    D = np.abs(C * leaders - wolf.X)
    X_cand = leaders - A * D

    wolf.X = np.clip(X_cand.mean(axis=0), -5, 5)

class ThesisOptimizerBase:
    def __init__(self, items, container, pop_size=30, max_iter=500, lambda_penalty=1000.0,
                 stream_cb=None, seed=None):
        self.items = items
        self.container = container
        self.pop_size = pop_size
        self.max_iter = max_iter
        self.lambda_penalty = lambda_penalty
        self.stream_cb = stream_cb
        self.n = len(items)
        self.seed = seed
        self.rng = np.random.default_rng(seed)

        # Real physics only — raises rather than inventing missing fields
        validate_items(self.items)

class StandaloneDGWO(ThesisOptimizerBase):
    def run(self):
        pop = [WolfContinuous(self.n, lambda_penalty=self.lambda_penalty, rng=self.rng)
               for _ in range(self.pop_size)]

        for w in pop:
            w.decode_and_evaluate(self.items, self.container)

        pop.sort(key=lambda w: w.scalar_fitness)
        alpha, beta, delta = pop[0], pop[1], pop[2]

        for iteration in range(self.max_iter):
            a = 2.0 - iteration * (2.0 / self.max_iter)
            alpha_X, beta_X, delta_X = alpha.X.copy(), beta.X.copy(), delta.X.copy()

            for i in range(self.pop_size):
                _update_position(pop[i], alpha_X, beta_X, delta_X, a, self.rng)
                pop[i].decode_and_evaluate(self.items, self.container)

            pop.sort(key=lambda w: w.scalar_fitness)
            alpha, beta, delta = pop[0], pop[1], pop[2]
            
            if self.stream_cb:
                self._emit(iteration, alpha)
                
        return alpha
        
    def _emit(self, it, best):
        self.stream_cb("iteration_update", {
            "iteration": it + 1,
            "max_iter": self.max_iter,
            "best_placed": len(best.placements),
            "best_su": round(best.su, 2),
            "best_csr": round(best.csr, 2),
            "fitness": round(best.scalar_fitness, 2)
        })

class StandaloneMOGWO(ThesisOptimizerBase):
    def run(self):
        pop = [WolfContinuous(self.n, lambda_penalty=self.lambda_penalty, rng=self.rng) for _ in range(self.pop_size)]
        archive = []

        for w in pop:
            w.decode_and_evaluate(self.items, self.container)
            self._update_archive(archive, w)

        alpha, beta, delta = self._select_leaders(archive)

        for iteration in range(self.max_iter):
            a = 2.0 - iteration * (2.0 / self.max_iter)
            alpha_X, beta_X, delta_X = alpha.X.copy(), beta.X.copy(), delta.X.copy()

            for i in range(self.pop_size):
                _update_position(pop[i], alpha_X, beta_X, delta_X, a, self.rng)
                pop[i].decode_and_evaluate(self.items, self.container)
                self._update_archive(archive, pop[i])
                
            # Limit archive size
            if len(archive) > 100:
                archive = self._prune_archive(archive, max_size=100)
                
            alpha, beta, delta = self._select_leaders(archive)
            
            if self.stream_cb:
                self._emit(iteration, alpha)
                
        # Return best from archive based on CSR then SU
        archive.sort(key=lambda w: (w.csr, len(w.placements), w.su), reverse=True)
        return archive[0]
        
    def _update_archive(self, archive, wolf):
        dominated = []
        is_dominated = False
        for i, a_wolf in enumerate(archive):
            if a_wolf.dominates(wolf):
                is_dominated = True
                break
            elif wolf.dominates(a_wolf):
                dominated.append(i)
                
        if not is_dominated:
            # Remove dominated
            for i in reversed(dominated):
                archive.pop(i)
            # Deep copy to archive
            w_copy = WolfContinuous(self.n, lambda_penalty=self.lambda_penalty, rng=self.rng)
            w_copy.X = wolf.X.copy()
            w_copy.su = wolf.su
            w_copy.csr = wolf.csr
            w_copy.scalar_fitness = wolf.scalar_fitness
            w_copy.placements = dict(wolf.placements)
            w_copy.orientations = dict(wolf.orientations)
            w_copy.unplaced = list(wolf.unplaced)
            w_copy.budget_exhausted = wolf.budget_exhausted
            w_copy.placement_attempts = wolf.placement_attempts
            archive.append(w_copy)
            
    def _compute_grid_densities(self, archive, n_grids=10):
        if not archive: return []
        su_vals = [w.su for w in archive]
        csr_vals = [w.csr for w in archive]
        su_min, su_max = min(su_vals), max(su_vals)
        csr_min, csr_max = min(csr_vals), max(csr_vals)
        
        # Avoid division by zero
        if su_max == su_min: su_max += 1e-9
        if csr_max == csr_min: csr_max += 1e-9
            
        grid_counts = {}
        wolf_grids = []
        for w in archive:
            g_su = int((w.su - su_min) / (su_max - su_min) * (n_grids - 1))
            g_csr = int((w.csr - csr_min) / (csr_max - csr_min) * (n_grids - 1))
            g = (g_su, g_csr)
            wolf_grids.append(g)
            grid_counts[g] = grid_counts.get(g, 0) + 1
            
        return grid_counts, wolf_grids
        
    def _prune_archive(self, archive, max_size=100):
        """Prunes the archive by removing solutions from the most crowded grids."""
        while len(archive) > max_size:
            grid_counts, wolf_grids = self._compute_grid_densities(archive)
            # Find the most crowded grid
            max_density_grid = max(grid_counts.keys(), key=lambda g: grid_counts[g])
            # Find all wolves in that grid
            candidates = [i for i, g in enumerate(wolf_grids) if g == max_density_grid]
            # Remove a random wolf from the most crowded grid
            remove_idx = int(self.rng.choice(candidates))
            archive.pop(remove_idx)
        return archive

    def _select_leaders(self, archive):
        if len(archive) < 1:
            # Fallback if empty (shouldn't happen)
            fake = WolfContinuous(self.n, lambda_penalty=self.lambda_penalty, rng=self.rng)
            return fake, fake, fake
            
        if len(archive) < 3:
            return archive[0], archive[min(1, len(archive)-1)], archive[0]
            
        # Grid-density leader selection (roulette wheel inversely proportional to density)
        grid_counts, wolf_grids = self._compute_grid_densities(archive)
        
        # Constant > 1 to allow selection even for dense grids
        C = 10.0 
        probabilities = []
        for g in wolf_grids:
            p = C / grid_counts[g]
            probabilities.append(p)
            
        total_p = sum(probabilities)
        probabilities = [p / total_p for p in probabilities]
        
        # Select 3 without replacement
        selected_indices = self.rng.choice(len(archive), size=3, replace=False, p=probabilities)
        return archive[selected_indices[0]], archive[selected_indices[1]], archive[selected_indices[2]]
            
    def _emit(self, it, best):
        self.stream_cb("iteration_update", {
            "iteration": it + 1,
            "max_iter": self.max_iter,
            "best_placed": len(best.placements),
            "best_su": round(best.su, 2),
            "best_csr": round(best.csr, 2),
            "fitness": None
        })

class SequentialHybrid(StandaloneMOGWO):
    def run(self):
        # Phase 1: DGWO for T1
        T1 = self.max_iter // 2
        pop = [WolfContinuous(self.n, lambda_penalty=self.lambda_penalty, rng=self.rng) for _ in range(self.pop_size)]
        
        for w in pop:
            w.decode_and_evaluate(self.items, self.container)
            
        pop.sort(key=lambda w: w.scalar_fitness)
        alpha, beta, delta = pop[0], pop[1], pop[2]
        
        for iteration in range(T1):
            a = 2.0 - iteration * (2.0 / T1)
            alpha_X, beta_X, delta_X = alpha.X.copy(), beta.X.copy(), delta.X.copy()
            for i in range(self.pop_size):
                _update_position(pop[i], alpha_X, beta_X, delta_X, a, self.rng)
                pop[i].decode_and_evaluate(self.items, self.container)

            pop.sort(key=lambda w: w.scalar_fitness)
            alpha, beta, delta = pop[0], pop[1], pop[2]
            
            if self.stream_cb:
                self._emit(iteration, alpha, T1, "Phase 1: DGWO")
                
        # Phase 2: MOGWO for T2 using pop from Phase 1
        T2 = self.max_iter - T1
        archive = []
        for w in pop:
            self._update_archive(archive, w)
            
        alpha, beta, delta = self._select_leaders(archive)
        
        for iteration in range(T2):
            a = 2.0 - iteration * (2.0 / T2)
            alpha_X, beta_X, delta_X = alpha.X.copy(), beta.X.copy(), delta.X.copy()
            for i in range(self.pop_size):
                _update_position(pop[i], alpha_X, beta_X, delta_X, a, self.rng)
                pop[i].decode_and_evaluate(self.items, self.container)
                self._update_archive(archive, pop[i])
                
            if len(archive) > 100:
                archive = self._prune_archive(archive, max_size=100)
                
            alpha, beta, delta = self._select_leaders(archive)
            
            if self.stream_cb:
                self._emit(T1 + iteration, alpha, T2, "Phase 2: MOGWO")
                
        archive.sort(key=lambda w: (w.csr, len(w.placements), w.su), reverse=True)
        return archive[0]
        
    def _emit(self, it, best, max_it, phase):
        self.stream_cb("iteration_update", {
            "iteration": it + 1,
            "max_iter": self.max_iter,
            "best_placed": len(best.placements),
            "best_su": round(best.su, 2),
            "best_csr": round(best.csr, 2),
            "phase": phase
        })

class RepairBasedHybrid(StandaloneMOGWO):
    def _note_repair(self, w):
        for k, v in w.last_repair.items():
            self.repair_stats[k] = self.repair_stats.get(k, 0) + v
        self.repair_stats['candidates'] = self.repair_stats.get('candidates', 0) + 1

    def run(self):
        from repair import STAT_KEYS
        self.repair_stats = {k: 0 for k in STAT_KEYS}
        self.repair_stats['candidates'] = 0

        pop = [WolfContinuous(self.n, lambda_penalty=self.lambda_penalty, rng=self.rng) for _ in range(self.pop_size)]
        archive = []

        for w in pop:
            # ONLY DIFFERENCE: apply_repair=True
            w.decode_and_evaluate(self.items, self.container, apply_repair=True)
            self._note_repair(w)
            self._update_archive(archive, w)

        alpha, beta, delta = self._select_leaders(archive)

        for iteration in range(self.max_iter):
            a = 2.0 - iteration * (2.0 / self.max_iter)
            alpha_X, beta_X, delta_X = alpha.X.copy(), beta.X.copy(), delta.X.copy()

            for i in range(self.pop_size):
                _update_position(pop[i], alpha_X, beta_X, delta_X, a, self.rng)
                # Apply repair R1-R5 before evaluation
                pop[i].decode_and_evaluate(self.items, self.container, apply_repair=True)
                self._note_repair(pop[i])
                self._update_archive(archive, pop[i])
                
            if len(archive) > 100:
                archive = self._prune_archive(archive, max_size=100)
                
            alpha, beta, delta = self._select_leaders(archive)
            
            if self.stream_cb:
                self._emit(iteration, alpha)
                
        archive.sort(key=lambda w: (w.csr, len(w.placements), w.su), reverse=True)
        return archive[0]
