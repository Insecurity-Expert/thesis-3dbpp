"""
baseline_2d.py  –  Phase 1: Baseline Replication
=================================================
Implements HD-GWO for 2-D Bin Packing as described in:
  Kosari et al. (2024) "A Hybrid Discrete Grey Wolf Optimization Algorithm
  Imbalance-ness Aware for Solving Two-dimensional Bin-packing Problems"

Encoding
--------
Integer assignment vector  g  of length n (one entry per item).
g[i] ∈ {0 .. m-1}  where the value is the bin index assigned to item i.
This matches the paper's discrete genotype directly.

Feasibility
-----------
A bin is feasible if the total area of its assigned items ≤ bin area.
(Phase 2 will replace this with exact 3-D geometric checks.)

Dissipation  (paper Eq. 7, 2-D version)
-----------------------------------------
D(X) = Σ_b [ C1·(1 – ux_b)² + C2·(1 – uy_b)² ]
where ux_b = (sum of item lengths in bin b) / container_L  (x-utilisation)
      uy_b = (sum of item heights in bin b) / container_H  (y-utilisation)
C1 = C2 = 0.5  (equal dimension weights, as in the paper).
"""

import math
import random
import sys
import time


# ─────────────────────────────────────────────────────────────────────────────
# Geometry helpers (2-D)
# ─────────────────────────────────────────────────────────────────────────────

def item_area(item):
    return item['L'] * item['H']

def bin_area(container):
    return container['L'] * container['H']

def _dissipation_2d(bin_assignment, items, container):
    """
    Compute 2-D dissipation (Eq. 7) across all non-empty bins.
    Returns total dissipation (float).
    """
    CL, CH = container['L'], container['H']
    C1 = C2 = 0.5
    diss = 0.0
    for b_items in bin_assignment.values():
        if not b_items:
            continue
        sum_L = sum(items[i]['L'] for i in b_items)
        sum_H = sum(items[i]['H'] for i in b_items)
        ux = min(sum_L / CL, 1.0) if CL > 0 else 0.0
        uy = min(sum_H / CH, 1.0) if CH > 0 else 0.0
        diss += C1 * (1 - ux) ** 2 + C2 * (1 - uy) ** 2
    return diss


# ─────────────────────────────────────────────────────────────────────────────
# Wolf – assignment-vector encoding
# ─────────────────────────────────────────────────────────────────────────────

class Wolf2D:
    """
    One candidate solution.
    genes[i] = bin index (0-based) assigned to item i.
    """

    __slots__ = ('items', 'container', 'n', 'm', 'genes',
                 'bin_assignment', 'n_bins', 'dissipation', 'composite')

    def __init__(self, items, container, m=None):
        self.items     = items
        self.container = container
        self.n         = len(items)
        cap            = bin_area(container)
        total          = sum(item_area(i) for i in items)
        # m = upper bound on bin count (2× theoretical lower bound)
        self.m = m or max(2, math.ceil(total / cap) * 2)
        self.genes = self._make_random_genes()
        self._decode()

    # ── Initialisation ────────────────────────────────────────────────────────
    def _make_random_genes(self):
        """Assign items to bins randomly while respecting area capacity."""
        cap        = bin_area(self.container)
        bin_loads  = {}          # bin_id → area used
        genes      = [0] * self.n

        for i in range(self.n):
            area   = item_area(self.items[i])
            # Shuffle candidate bins
            candidates = list(range(self.m))
            random.shuffle(candidates)
            placed = False
            for b in candidates:
                if bin_loads.get(b, 0) + area <= cap:
                    genes[i] = b
                    bin_loads[b] = bin_loads.get(b, 0) + area
                    placed = True
                    break
            if not placed:
                # Extend m by opening a new bin
                self.m += 1
                genes[i] = self.m - 1
                bin_loads[self.m - 1] = area

        return genes

    # ── Decode genotype → fitness ─────────────────────────────────────────────
    def _decode(self):
        ba = {}
        for i, b in enumerate(self.genes):
            ba.setdefault(b, []).append(i)

        self.bin_assignment = ba
        self.n_bins         = len(ba)
        self.dissipation    = _dissipation_2d(ba, self.items, self.container)
        self.composite      = float(self.n_bins) + 0.1 * self.dissipation

    # ── Check & Correct (Algorithm 1, step after encircling) ─────────────────
    def check_and_correct(self):
        """
        Repair infeasible bins using a circular-queue strategy.
        If a bin's total area exceeds container area, move the smallest items
        out (to existing bins or a new bin) until the bin is feasible.
        """
        cap     = bin_area(self.container)
        changed = False

        for b in list(self.bin_assignment.keys()):
            b_items = self.bin_assignment.get(b, [])
            if not b_items:
                continue

            load = sum(item_area(self.items[i]) for i in b_items)
            if load <= cap:
                continue

            # Sort by area ascending — move smallest items first
            b_items_sorted = sorted(b_items, key=lambda i: item_area(self.items[i]))

            for item_idx in b_items_sorted:
                if load <= cap:
                    break
                area = item_area(self.items[item_idx])

                # Circular queue: try all other bins
                moved = False
                other_bins = [ob for ob in self.bin_assignment if ob != b]
                random.shuffle(other_bins)
                for ob in other_bins:
                    ob_load = sum(item_area(self.items[i])
                                  for i in self.bin_assignment[ob])
                    if ob_load + area <= cap:
                        self.genes[item_idx] = ob
                        load -= area
                        moved = True
                        changed = True
                        break

                if not moved:
                    # Open a new bin
                    new_b = max(self.bin_assignment.keys(), default=-1) + 1
                    self.genes[item_idx] = new_b
                    self.m = max(self.m, new_b + 1)
                    load -= area
                    changed = True

        if changed:
            self._decode()

    # ── Utility ───────────────────────────────────────────────────────────────
    def copy(self):
        w = Wolf2D.__new__(Wolf2D)
        w.items          = self.items
        w.container      = self.container
        w.n              = self.n
        w.m              = self.m
        w.genes          = self.genes[:]
        w.bin_assignment = {b: lst[:] for b, lst in self.bin_assignment.items()}
        w.n_bins         = self.n_bins
        w.dissipation    = self.dissipation
        w.composite      = self.composite
        return w


# ─────────────────────────────────────────────────────────────────────────────
# UDHC 1-5  (walking-around procedures for assignment encoding)
# ─────────────────────────────────────────────────────────────────────────────

def _udhc1(genes, m):
    """Swap adjacent pairs starting at index 0: (0,1),(2,3)…"""
    g = genes[:]
    for i in range(0, len(g) - 1, 2):
        g[i], g[i + 1] = g[i + 1], g[i]
    return g

def _udhc2(genes, m):
    """Swap adjacent pairs starting at index 1: (1,2),(3,4)…"""
    g = genes[:]
    for i in range(1, len(g) - 1, 2):
        g[i], g[i + 1] = g[i + 1], g[i]
    return g

def _udhc3(genes, m):
    """Randomly reassign a subset of items to random bins."""
    g = genes[:]
    k = max(1, len(g) // 5)
    for i in random.sample(range(len(g)), k):
        g[i] = random.randint(0, max(m - 1, 0))
    return g

def _udhc4(genes, m):
    """Reverse bin-assignment values for a random substring."""
    g = genes[:]
    if len(g) < 2:
        return g
    i, j = sorted(random.sample(range(len(g)), 2))
    g[i:j + 1] = g[i:j + 1][::-1]
    return g

def _udhc5(genes, m):
    """Swap two random items' bin assignments."""
    g = genes[:]
    if len(g) < 2:
        return g
    i, j = random.sample(range(len(g)), 2)
    g[i], g[j] = g[j], g[i]
    return g

_UDHC_FNS = [_udhc1, _udhc2, _udhc3, _udhc4, _udhc5]

def apply_udhc(genes, m):
    """Pick a random UDHC operator and return (new_genes, op_name)."""
    op = random.randint(0, 4)
    return _UDHC_FNS[op](genes, m), f"UDHC{op + 1}"


# ─────────────────────────────────────────────────────────────────────────────
# Algorithm 2 – Encircling the Prey
# ─────────────────────────────────────────────────────────────────────────────

def encircle(wolf, alpha, beta, delta):
    """
    For each gene, probabilistically inherit from alpha (50%), beta (30%),
    or delta (20%).  Then run Check & Correct to restore feasibility.
    """
    n       = wolf.n
    CUM     = (0.50, 0.80, 1.00)
    leaders = (alpha.genes, beta.genes, delta.genes)
    new_g   = [0] * n

    for i in range(n):
        r = random.random()
        new_g[i] = leaders[0 if r < CUM[0] else 1 if r < CUM[1] else 2][i]

    wolf.genes = new_g
    wolf._decode()
    wolf.check_and_correct()


# ─────────────────────────────────────────────────────────────────────────────
# Simulated Annealing with UDHC operators
# ─────────────────────────────────────────────────────────────────────────────

def simulated_annealing(wolf, T0=500.0, delta_T=25.0, freeze=10.0,
                        max_process=10):
    """
    Returns (best_wolf_found, last_udhc_name, final_temperature).
    Accept/reject uses bin count as primary criterion (paper §3.4).
    """
    current   = wolf.copy()
    best_sa   = current.copy()
    T         = T0
    last_udhc = "UDHC5"

    while T > freeze:
        for _ in range(max_process):
            new_g, udhc_name = apply_udhc(current.genes, current.m)
            cand = current.copy()
            cand.genes = new_g
            cand._decode()
            cand.check_and_correct()

            accept = False
            if cand.n_bins < current.n_bins:
                accept = True
            elif cand.n_bins == current.n_bins:
                dd = cand.dissipation - current.dissipation
                if dd <= 0 or random.random() < math.exp(-dd / max(T, 1e-10)):
                    accept = True
            else:
                df = cand.composite - current.composite
                if random.random() < math.exp(-df / max(T, 1e-10)):
                    accept = True

            if accept:
                current   = cand
                last_udhc = udhc_name

            if current.composite < best_sa.composite:
                best_sa = current.copy()

        T -= delta_T

    return best_sa, last_udhc, max(T, 0.0)


# ─────────────────────────────────────────────────────────────────────────────
# Algorithm 3 – Integration / Compaction
# ─────────────────────────────────────────────────────────────────────────────

def integrate(wolf):
    """
    Try to empty the least-utilised bin by redistributing its items to
    other bins.  Returns (wolf_after, bins_reduced_by).
    """
    if wolf.n_bins <= 1:
        return wolf, 0

    cap  = bin_area(wolf.container)
    util = {}
    for b, b_items in wolf.bin_assignment.items():
        used = sum(item_area(wolf.items[i]) for i in b_items)
        util[b] = used / cap if cap > 0 else 0.0

    src       = min(util, key=util.get)
    src_items = wolf.bin_assignment[src][:]

    new_genes    = wolf.genes[:]
    # Track provisional loads to avoid re-overloading target bins
    prov_loads   = {b: sum(item_area(wolf.items[i]) for i in lst)
                    for b, lst in wolf.bin_assignment.items()}

    for item_idx in src_items:
        area   = item_area(wolf.items[item_idx])
        placed = False
        for b in wolf.bin_assignment:
            if b == src:
                continue
            if prov_loads.get(b, 0) + area <= cap:
                new_genes[item_idx]  = b
                prov_loads[b]        = prov_loads.get(b, 0) + area
                prov_loads[src]      = prov_loads.get(src, 0) - area
                placed = True
                break
        # If an item can't be moved, integration fails for this bin

    trial = wolf.copy()
    trial.genes = new_genes
    trial._decode()

    if trial.n_bins <= wolf.n_bins:
        return trial, wolf.n_bins - trial.n_bins
    return wolf, 0


# ─────────────────────────────────────────────────────────────────────────────
# Algorithm 1 – HD-GWO Main Loop
# ─────────────────────────────────────────────────────────────────────────────

def hd_gwo_2d(items, container,
              pop_size=20, max_iter=50,
              T0=500.0, delta_T=25.0, freeze=10.0,
              max_process=10, max_time=60,
              stream_cb=None):
    """
    Run HD-GWO on a 2-D bin-packing instance.

    Parameters
    ----------
    items       : list of dicts with 'L', 'H' keys
    container   : dict with 'L', 'H' keys
    stream_cb   : optional callable(event_type, data_dict) for live streaming

    Returns
    -------
    best : Wolf2D   – best solution found
    """
    t0  = time.time()
    pop = sorted([Wolf2D(items, container) for _ in range(pop_size)],
                 key=lambda w: (w.n_bins, w.dissipation))

    alpha = pop[0].copy()
    beta  = pop[min(1, len(pop) - 1)].copy()
    delta = pop[min(2, len(pop) - 1)].copy()
    best  = alpha.copy()

    print(f"  [init] bins={best.n_bins}  diss={best.dissipation:.4f}",
          file=sys.stderr, flush=True)

    no_improve = 0

    for it in range(max_iter):

        # ── Time guard ───────────────────────────────────────────────────────
        if time.time() - t0 > max_time:
            print(f"  [iter {it+1}] Time limit ({max_time}s).",
                  file=sys.stderr, flush=True)
            break

        # ── Algorithm 2: Encircling ───────────────────────────────────────────
        for i in range(3, len(pop)):
            encircle(pop[i], alpha, beta, delta)

        # ── SA exploitation ───────────────────────────────────────────────────
        sa_best, last_udhc, final_T = simulated_annealing(
            best, T0, delta_T, freeze, max_process)

        # ── Algorithm 3: Integration ──────────────────────────────────────────
        sa_best, bins_reduced = integrate(sa_best)
        if bins_reduced > 0:
            print(f"  [iter {it+1}] Integration: -{bins_reduced} bin(s)",
                  file=sys.stderr, flush=True)

        # ── Inject SA result into population ──────────────────────────────────
        pop.sort(key=lambda w: (w.n_bins, w.dissipation))
        if sa_best.composite < pop[-1].composite:
            pop[-1] = sa_best
        pop.sort(key=lambda w: (w.n_bins, w.dissipation))

        # ── Refresh leaders ───────────────────────────────────────────────────
        alpha = pop[0].copy()
        beta  = pop[min(1, len(pop) - 1)].copy()
        delta = pop[min(2, len(pop) - 1)].copy()

        # ── Track best ────────────────────────────────────────────────────────
        if alpha.composite < best.composite:
            best       = alpha.copy()
            no_improve = 0
            print(f"  [iter {it+1}] ★ bins={best.n_bins} "
                  f"diss={best.dissipation:.4f} score={best.composite:.4f}",
                  file=sys.stderr, flush=True)
        else:
            no_improve += 1
            if (it + 1) % 10 == 0:
                print(f"  [iter {it+1}] bins={best.n_bins} "
                      f"(no improve: {no_improve})",
                      file=sys.stderr, flush=True)

        # ── Optional live stream ──────────────────────────────────────────────
        if stream_cb:
            stream_cb("iteration_update", {
                "iteration":        it + 1,
                "max_iter":         max_iter,
                "best_bins":        best.n_bins,
                "best_dissipation": round(best.dissipation, 4),
                "best_composite":   round(best.composite, 4) if hasattr(best, "composite") else None,
                "temperature":      round(final_T, 1),
                "last_udhc":        last_udhc,
            })

        if no_improve >= 50:
            print(f"  [iter {it+1}] Early stop (20 iters no improvement).",
                  file=sys.stderr, flush=True)
            break

    elapsed = time.time() - t0
    print(f"  Finished in {elapsed:.1f}s — bins={best.n_bins}",
          file=sys.stderr, flush=True)
    return best