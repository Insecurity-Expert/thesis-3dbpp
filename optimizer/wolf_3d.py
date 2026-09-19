# wolf_3d.py  -  Phase 2: 3-D Wolf Encoding + HD-GWO Algorithm
#
# Genotype:
#   genes[i]   = bin_id    (0-based integer)
#   orients[i] = orient_id (0-5)
#
# (x, y, z) coordinates are derived by DBLF, not encoded.
#
# Fitness:
#   composite = n_bins + OVERFLOW_PENALTY * overflow + W_DISS * dissipation

import math
import random
import sys
import time

from geometry_3d import (
    N_ORIENTATIONS,
    place_bin_dblf_legacy as place_bin_dblf,
    compute_weight_capacity,
    volumetric_dissipation,
)

OVERFLOW_PENALTY = 1000.0
W_DISS           = 0.1


# ─────────────────────────────────────────────────────────────────────────────
# Wolf3D
# ─────────────────────────────────────────────────────────────────────────────

class Wolf3D:

    __slots__ = ('items', 'container', 'weight_cap', 'n', 'm',
                 'genes', 'orients',
                 'n_bins', 'overflow', 'dissipation', 'composite',
                 'placements', 'bin_placements')

    def __init__(self, items, container, weight_cap, m=None):
        self.items      = items
        self.container  = container
        self.weight_cap = weight_cap
        self.n          = len(items)

        vol_cap     = container['L'] * container['H'] * container['D']
        vol_items   = sum(i['L'] * i['H'] * i['D'] for i in items)
        lb          = max(1, math.ceil(vol_items / vol_cap))
        # Use caller-supplied m, or 3× the volume lower bound.
        # 3× LB ensures each bin gets ~n/(3*lb) items, giving DBLF
        # enough headroom (typically 30-40% utilisation per bin).
        self.m      = m or max(3, lb * 3)

        self.genes   = self._make_random_genes()
        self.orients = [random.randint(0, N_ORIENTATIONS - 1)
                        for _ in range(self.n)]
        self._decode()
        self.check_and_correct()
        
    # ── Initialisation ────────────────────────────────────────────────────────
    def _make_random_genes(self):
        """
        Round-robin then shuffle.
        With m = 3*LB, each bin gets ~n/(3*LB) items — well within
        DBLF's geometric capacity (~60-70% of theoretical max fill).
        """
        genes = [i % self.m for i in range(self.n)]
        random.shuffle(genes)
        return genes

    # ── Decode ────────────────────────────────────────────────────────────────
    def _decode(self):
        groups = {}
        for i, b in enumerate(self.genes):
            groups.setdefault(b, []).append(i)

        orient_map       = {i: self.orients[i] for i in range(self.n)}
        all_placements   = {}
        bin_placed_lists = []
        total_overflow   = []

        for b_items in groups.values():
            pl, ov = place_bin_dblf(
                b_items, self.items, orient_map,
                self.container, self.weight_cap
            )
            all_placements.update(pl)
            total_overflow.extend(ov)
            coords = list(pl.values())
            if coords:
                bin_placed_lists.append(coords)

        self.placements     = all_placements
        self.bin_placements = bin_placed_lists
        self.n_bins         = len(bin_placed_lists)
        self.overflow       = len(total_overflow)
        self.dissipation    = volumetric_dissipation(bin_placed_lists,
                                                     self.container)
        self.composite      = (float(self.n_bins)
                               + OVERFLOW_PENALTY * self.overflow
                               + W_DISS * self.dissipation)

    # ── Check & Correct ───────────────────────────────────────────────────────
    def check_and_correct(self):
        """
        Assign every overflow item to a NEW dedicated bin.
        This guarantees zero overflow after the call (one item per new bin
        always fits geometrically).  The SA + Integration steps then merge
        these extra bins back down.

        Previous approach (volume-based reassignment) failed because it
        sent overflow items back to bins that were already geometrically
        full — just not by volume.
        """
        if self.overflow == 0:
            return

        # Re-detect which items actually overflow
        groups = {}
        for i, b in enumerate(self.genes):
            groups.setdefault(b, []).append(i)
        orient_map = {i: self.orients[i] for i in range(self.n)}

        overflow_items = []
        for b_items in groups.values():
            _, ov = place_bin_dblf(
                b_items, self.items, orient_map,
                self.container, self.weight_cap
            )
            overflow_items.extend(ov)

        if not overflow_items:
            return

        # Each overflow item gets its own new bin (guaranteed to fit)
        next_bin = max(self.genes) + 1
        for item_idx in overflow_items:
            self.genes[item_idx] = next_bin
            self.m               = max(self.m, next_bin + 1)
            next_bin            += 1

        self._decode()

    # ── Utility ───────────────────────────────────────────────────────────────
    def copy(self):
        w = Wolf3D.__new__(Wolf3D)
        w.items          = self.items
        w.container      = self.container
        w.weight_cap     = self.weight_cap
        w.n              = self.n
        w.m              = self.m
        w.genes          = self.genes[:]
        w.orients        = self.orients[:]
        w.n_bins         = self.n_bins
        w.overflow       = self.overflow
        w.dissipation    = self.dissipation
        w.composite      = self.composite
        w.placements     = dict(self.placements)
        w.bin_placements = [bp[:] for bp in self.bin_placements]
        return w

    def is_better_than(self, other):
        # Primary: effective bin count (overflow weighted very heavily)
        self_eff  = self.n_bins  + self.overflow  * 1000
        other_eff = other.n_bins + other.overflow * 1000
        if self_eff != other_eff:
            return self_eff < other_eff
        return self.composite < other.composite


# ─────────────────────────────────────────────────────────────────────────────
# UDHC operators (assignment + orientation)
# ─────────────────────────────────────────────────────────────────────────────

def _perturb_orients(orients, frac=0.15):
    o = orients[:]
    k = max(1, int(len(o) * frac))
    for i in random.sample(range(len(o)), k):
        o[i] = random.randint(0, N_ORIENTATIONS - 1)
    return o

def _udhc1(g, o, m):
    g = g[:]
    for i in range(0, len(g)-1, 2):
        g[i], g[i+1] = g[i+1], g[i]
    return g, _perturb_orients(o)

def _udhc2(g, o, m):
    g = g[:]
    for i in range(1, len(g)-1, 2):
        g[i], g[i+1] = g[i+1], g[i]
    return g, _perturb_orients(o)

def _udhc3(g, o, m):
    g = g[:]
    o = o[:]
    k = max(1, len(g) // 5)
    for i in random.sample(range(len(g)), k):
        g[i] = random.randint(0, max(m - 1, 0))
        o[i] = random.randint(0, N_ORIENTATIONS - 1)
    return g, o

def _udhc4(g, o, m):
    g = g[:]
    if len(g) >= 2:
        i, j = sorted(random.sample(range(len(g)), 2))
        g[i:j+1] = g[i:j+1][::-1]
    return g, _perturb_orients(o)

def _udhc5(g, o, m):
    g = g[:]
    if len(g) >= 2:
        i, j = random.sample(range(len(g)), 2)
        g[i], g[j] = g[j], g[i]
    return g, _perturb_orients(o)

_UDHC = [_udhc1, _udhc2, _udhc3, _udhc4, _udhc5]

def apply_udhc_3d(genes, orients, m):
    op     = random.randint(0, 4)
    ng, no = _UDHC[op](genes, orients, m)
    return ng, no, f"UDHC{op+1}"


# ─────────────────────────────────────────────────────────────────────────────
# Algorithm 2 – Encircling
# ─────────────────────────────────────────────────────────────────────────────

def encircle_3d(wolf, alpha, beta, delta):
    n    = wolf.n
    CUM  = (0.50, 0.80, 1.00)
    lg   = (alpha.genes,   beta.genes,   delta.genes)
    lo   = (alpha.orients, beta.orients, delta.orients)
    ng   = [0] * n
    no   = [0] * n
    for i in range(n):
        r     = random.random()
        k     = 0 if r < CUM[0] else 1 if r < CUM[1] else 2
        ng[i] = lg[k][i]
        no[i] = lo[k][i]
    wolf.genes   = ng
    wolf.orients = no
    wolf._decode()
    wolf.check_and_correct()


# ─────────────────────────────────────────────────────────────────────────────
# Simulated Annealing
# ─────────────────────────────────────────────────────────────────────────────

def simulated_annealing_3d(wolf, T0=500.0, delta_T=25.0,
                            freeze=10.0, max_process=10):
    current   = wolf.copy()
    best_sa   = current.copy()
    T         = T0
    last_udhc = "UDHC5"

    while T > freeze:
        for _ in range(max_process):
            ng, no, name = apply_udhc_3d(
                current.genes, current.orients, current.m)
            cand         = current.copy()
            cand.genes   = ng
            cand.orients = no
            cand._decode()
            cand.check_and_correct()

            accept = False
            if cand.is_better_than(current):
                accept = True
            else:
                df = cand.composite - current.composite
                if random.random() < math.exp(-df / max(T, 1.0)):
                    accept = True

            if accept:
                current   = cand
                last_udhc = name
            if current.is_better_than(best_sa):
                best_sa = current.copy()

        T -= delta_T

    return best_sa, last_udhc, max(T, 1.0)


# ─────────────────────────────────────────────────────────────────────────────
# Algorithm 3 – Integration
# ─────────────────────────────────────────────────────────────────────────────

def integrate_3d(wolf):
    if wolf.n_bins <= 1:
        return wolf, 0

    cap    = (wolf.container['L'] *
              wolf.container['H'] *
              wolf.container['D'])
    groups = {}
    for i, b in enumerate(wolf.genes):
        groups.setdefault(b, []).append(i)

    # Volume utilisation per bin
    util = {}
    for b, b_items in groups.items():
        used = sum(wolf.items[i]['L'] * wolf.items[i]['H'] * wolf.items[i]['D']
                   for i in b_items)
        util[b] = used / cap

    src       = min(util, key=util.get)
    src_items = groups[src][:]
    new_genes = wolf.genes[:]

    bin_vol = {b: sum(wolf.items[i]['L'] * wolf.items[i]['H'] * wolf.items[i]['D']
                      for i in items)
               for b, items in groups.items()}

    for item_idx in src_items:
        item_vol = (wolf.items[item_idx]['L'] *
                    wolf.items[item_idx]['H'] *
                    wolf.items[item_idx]['D'])
        for b in sorted(bin_vol):
            if b == src:
                continue
            # 70% volume cap leaves geometric headroom
            if bin_vol[b] + item_vol <= cap * 0.70:
                new_genes[item_idx]  = b
                bin_vol[b]          += item_vol
                bin_vol[src]        -= item_vol
                break

    trial         = wolf.copy()
    trial.genes   = new_genes
    trial._decode()

    if trial.n_bins <= wolf.n_bins and trial.overflow <= wolf.overflow:
        return trial, wolf.n_bins - trial.n_bins
    return wolf, 0


# ─────────────────────────────────────────────────────────────────────────────
# Algorithm 1 – HD-GWO main loop
# ─────────────────────────────────────────────────────────────────────────────

def hd_gwo_3d(items, container,
              pop_size=20, max_iter=50,
              T0=500.0, delta_T=25.0, freeze=10.0,
              max_process=10, max_time=60,
              stream_cb=None):

    weight_cap = compute_weight_capacity(items, container)
    t0         = time.time()

    pop = sorted(
        [Wolf3D(items, container, weight_cap) for _ in range(pop_size)],
        key=lambda w: (w.overflow, w.n_bins, w.dissipation)
    )

    alpha = pop[0].copy()
    beta  = pop[min(1, len(pop)-1)].copy()
    delta = pop[min(2, len(pop)-1)].copy()
    best  = alpha.copy()

    print(f"  [init] bins={best.n_bins}  overflow={best.overflow}"
          f"  diss={best.dissipation:.4f}  wt_cap={weight_cap}",
          file=sys.stderr, flush=True)

    no_improve = 0

    for it in range(max_iter):
        if time.time() - t0 > max_time:
            print(f"  [iter {it+1}] Time limit ({max_time}s).",
                  file=sys.stderr, flush=True)
            break

        for i in range(3, len(pop)):
            encircle_3d(pop[i], alpha, beta, delta)

        sa_best, last_udhc, final_T = simulated_annealing_3d(
            best, T0, delta_T, freeze, max_process)
        sa_best, bins_reduced = integrate_3d(sa_best)

        if bins_reduced > 0:
            print(f"  [iter {it+1}] Integration: -{bins_reduced}",
                  file=sys.stderr, flush=True)

        pop.sort(key=lambda w: (w.overflow, w.n_bins, w.dissipation))
        if sa_best.is_better_than(pop[-1]):
            pop[-1] = sa_best
        pop.sort(key=lambda w: (w.overflow, w.n_bins, w.dissipation))

        alpha = pop[0].copy()
        beta  = pop[min(1, len(pop)-1)].copy()
        delta = pop[min(2, len(pop)-1)].copy()

        if alpha.is_better_than(best):
            best       = alpha.copy()
            no_improve = 0
            print(f"  [iter {it+1}] * bins={best.n_bins}"
                  f"  overflow={best.overflow}"
                  f"  score={best.composite:.4f}",
                  file=sys.stderr, flush=True)
        else:
            no_improve += 1
            if (it+1) % 10 == 0:
                print(f"  [iter {it+1}] bins={best.n_bins}"
                      f"  overflow={best.overflow}"
                      f"  (no improve: {no_improve})",
                      file=sys.stderr, flush=True)

        if stream_cb:
            solution = [
                {"item_idx": idx, "bin_id": best.genes[idx],
                 "x": v[0], "y": v[1], "z": v[2],
                 "l": v[3], "h": v[4], "d": v[5]}
                for idx, v in best.placements.items()
            ]
            stream_cb("iteration_update", {
                "iteration":        it + 1,
                "max_iter":         max_iter,
                "best_bins":        best.n_bins,
                "overflow":         best.overflow,
                "best_dissipation": round(best.dissipation, 4),
                "best_composite":   round(best.composite, 4) if hasattr(best, "composite") else None,
                "temperature":      round(final_T, 1),
                "last_udhc":        last_udhc,
                "solution":         solution,
            })

        if no_improve >= 20:
            print(f"  [iter {it+1}] Early stop.", file=sys.stderr, flush=True)
            break

    elapsed = time.time() - t0
    print(f"  Done in {elapsed:.1f}s  bins={best.n_bins}"
          f"  overflow={best.overflow}",
          file=sys.stderr, flush=True)
    return best