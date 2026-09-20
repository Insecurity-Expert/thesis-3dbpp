"""
Relocate-then-defer repair (Chapter 3, R1-R5).

Every operator first tries to RELOCATE a violating box to a feasible extreme
point; only when no position exists is the box DEFERRED to the unpacked list.
After R_MAX passes any box still in violation is removed (R5), iterated to a
fixpoint because removing a support can orphan the boxes above it. The result
is feasible by construction: S(X_feas) == 1.0 is asserted, not hoped for.

Constraint checks here must mirror thesis_metrics.evaluate_constraints exactly
or the final assertion cannot hold.
"""
import math
from collections import Counter

import numpy as np
from numba import njit

from geometry_3d import get_dims, vertical_lbs, overlaps
from thesis_metrics import (_is_above, _blocks_extraction, _overlap,
                            evaluate_constraints)

R_MAX = 3
SUPPORT_THRESHOLD = 0.80

# R4 destinations are checked against C1-C6. Chapter 3 wrote "subject to
# (C1)-(C5)", which lets a relocated blocker block a DIFFERENT earlier-stop box
# and prevents the pass loop from ever converging (Step 5: R_MAX hit 800/800).
# Both directions of the blocking relation are checked (see _feasible_at, C6).
R4_CHECK = ('C1', 'C2', 'C3', 'C4', 'C5', 'C6')
OPERATORS = ('R1', 'R2', 'R3', 'R4')

STAT_KEYS = ('relocated_R1', 'relocated_R2', 'relocated_R3', 'relocated_R4',
             'deferred_R1', 'deferred_R2', 'deferred_R3', 'deferred_R4',
             'removed_R5', 'passes_used', 'rmax_hit')


# -- Per-pass caches -----------------------------------------------------------
class RepairContext:
    """Caches Above(i) and Blocking(i); any mutation must call invalidate()."""

    def __init__(self, items, placements, orientations, container):
        self.items = items
        self.placements = placements
        self.orientations = orientations
        self.container = container
        self._above = None
        self._blocking = None
        # B1: which constraint rejected each candidate position, per operator
        self.rejections = {op: Counter() for op in OPERATORS}
        # Step 6: extreme points are rebuilt lazily, only after a mutation
        self._eps = None

    def invalidate(self):
        self._above = None
        self._blocking = None
        self._eps = None

    def extreme_points(self):
        if self._eps is None:
            self._eps = rebuild_extreme_points(self.placements, self.container)
        return self._eps

    def above(self, i):
        if self._above is None:
            members = list(self.placements)
            n = len(members)
            if n == 0:
                self._above = {}
            else:
                P = np.array([self.placements[a] for a in members], dtype=float)
                x, y, z, dx, dy, dz = P.T
                x1, y1, z1 = x + dx, y + dy, z + dz
                ox = np.minimum(x1[:, None], x1[None, :]) - np.maximum(x[:, None], x[None, :])
                oy = np.minimum(y1[:, None], y1[None, :]) - np.maximum(y[:, None], y[None, :])
                A = (z[None, :] >= z1[:, None]) & (ox > 0) & (oy > 0)
                np.fill_diagonal(A, False)
                self._above = {members[a]: [members[b] for b in np.flatnonzero(A[a])]
                               for a in range(n)}
        return self._above[i]

    def blocking(self, i):
        """Later-stop boxes that sit above i or between i and the door."""
        if self._blocking is None:
            self._blocking = {}
            members = list(self.placements)
            for a in members:
                s_a = self.items[a]['stop']
                above_set = set(self.above(a))
                self._blocking[a] = [
                    b for b in members
                    if a != b and self.items[b]['stop'] > s_a
                    and (b in above_set or _blocks_extraction(a, b, self.placements))
                ]
        return self._blocking[i]

    def place(self, i, pos, r):
        self.placements[i] = pos
        self.orientations[i] = r
        self.invalidate()

    def remove(self, i):
        del self.placements[i]
        self.orientations.pop(i, None)
        self.invalidate()


# -- Geometry helpers ----------------------------------------------------------
def _support_ratio(i, placements):
    (x_i, y_i, z_i, dx_i, dy_i, dz_i) = placements[i]
    top_area = dx_i * dy_i
    if z_i == 0:
        return 1.0
    if top_area <= 0:
        return 0.0
    supported = 0.0
    for j, (x_j, y_j, z_j, dx_j, dy_j, dz_j) in placements.items():
        if i == j:
            continue
        if abs((z_j + dz_j) - z_i) < 1e-5:
            supported += (_overlap(x_i, x_i + dx_i, x_j, x_j + dx_j)
                          * _overlap(y_i, y_i + dy_i, y_j, y_j + dy_j))
    return supported / top_area


def _borne_mass(i, items, placements):
    return sum(items[j]['mass'] for j in placements
               if i != j and _is_above(i, j, placements))


def _capacity(i, items, placements, orientations):
    (_, _, _, dx, dy, _) = placements[i]
    return vertical_lbs(items[i], orientations[i]) * dx * dy


def rebuild_extreme_points(placements, container):
    """Extreme points from scratch, DBLF-ordered (deepest, lowest, leftmost).

    Returns a list of (x, y, z) tuples; vectorized internally."""
    CL, CW, CH = container['L'], container['W'], container['H']
    if not placements:
        return np.zeros((1, 3)) if (0 < CL and 0 < CW and 0 < CH) else np.zeros((0, 3))
    P = np.array(list(placements.values()), dtype=float)
    px, py, pz, pdx, pdy, pdz = P.T
    cand = np.vstack([
        np.zeros((1, 3)),
        np.column_stack([px + pdx, py, pz]),
        np.column_stack([px, py + pdy, pz]),
        np.column_stack([px, py, pz + pdz]),
    ])
    cand = cand[(cand[:, 0] < CL) & (cand[:, 1] < CW) & (cand[:, 2] < CH)]
    if cand.shape[0] == 0:
        return cand
    cx, cy, cz = cand[:, 0][:, None], cand[:, 1][:, None], cand[:, 2][:, None]
    inside = ((px <= cx) & (cx < px + pdx) &
              (py <= cy) & (cy < py + pdy) &
              (pz <= cz) & (cz < pz + pdz)).any(axis=1)
    cand = cand[~inside]
    if cand.shape[0] == 0:
        return cand
    cand = cand[np.lexsort((cand[:, 0], cand[:, 2], -cand[:, 1]))]
    # identical points are adjacent after the sort; cheaper than np.unique
    if cand.shape[0] > 1:
        distinct = np.ones(cand.shape[0], dtype=bool)
        distinct[1:] = (cand[1:] != cand[:-1]).any(axis=1)
        cand = cand[distinct]
    return cand


# -- Precomputed view of the placements for one EP scan ------------------------
class _PlacedView:
    """Arrays over the placed boxes plus per-box borne mass and capacity, built
    once per find_feasible_position call. Placements do not change during a
    scan, so everything that depends only on them is computed here, once."""

    __slots__ = ('n', 'x', 'y', 'z', 'dx', 'dy', 'dz', 'x1', 'y1', 'z1',
                 'mass', 'fragile', 'stop', 'cap', 'borne')

    def __init__(self, items, placements, orientations):
        idx = list(placements)
        self.n = len(idx)
        if self.n == 0:
            return
        P = np.array([placements[i] for i in idx], dtype=float)
        self.x, self.y, self.z, self.dx, self.dy, self.dz = P.T
        self.x1, self.y1, self.z1 = self.x + self.dx, self.y + self.dy, self.z + self.dz
        self.mass = np.array([items[i]['mass'] for i in idx], dtype=float)
        self.fragile = np.array([items[i]['fragile'] == 1 for i in idx])
        self.stop = np.array([items[i]['stop'] for i in idx])
        self.cap = np.array([vertical_lbs(items[i], orientations[i]) for i in idx]) * self.dx * self.dy
        # above[i, j]: j rests above i  (z_j >= z_i + dz_i and xy overlap)
        ox = np.minimum(self.x1[:, None], self.x1[None, :]) - np.maximum(self.x[:, None], self.x[None, :])
        oy = np.minimum(self.y1[:, None], self.y1[None, :]) - np.maximum(self.y[:, None], self.y[None, :])
        above = (self.z[None, :] >= self.z1[:, None]) & (ox > 0) & (oy > 0)
        np.fill_diagonal(above, False)
        self.borne = above @ self.mass


@njit(cache=True)
def _scan(eps, n_eps, dx, dy, dz, CL, CW, CH,
          Vx, Vy, Vz, Vx1, Vy1, Vz1, Vmass, Vfragile, Vstop, Vcap, Vborne, n,
          b_mass, b_fragile, b_stop, b_cap,
          chk, min_y, use_corr, cx, cz, cdx, cdz, deeper, rej):
    """First EP index where the box fits under the checked constraints, or -1.

    Transcription of the reference path — min_y / corridor filters, then C1,
    C2, C5, C4, C3, C6 in that order, first hit wins. rej[c] receives the
    first failing constraint per rejected EP (0..5 = C1..C6), exactly as the
    sequential version tallied it. chk[c] enables constraint c."""
    for k in range(n_eps):
        ex = eps[k, 0]
        ey = eps[k, 1]
        ez = eps[k, 2]
        if min_y >= 0.0 and ey < min_y:
            continue
        if use_corr:
            # deeper than i, or laterally clear of the xz removal corridor of i
            if not (ey >= deeper):
                ox = min(cx + cdx, ex + dx) - max(cx, ex)
                oz = min(cz + cdz, ez + dz) - max(cz, ez)
                if ox > 0.0 and oz > 0.0:
                    continue
        x1 = ex + dx
        y1 = ey + dy
        z1 = ez + dz
        # C1
        if chk[0] and (x1 > CL or y1 > CW or z1 > CH):
            rej[0] += 1
            continue
        # C2
        if chk[1]:
            hit = False
            for j in range(n):
                if (ex < Vx1[j] and x1 > Vx[j] and ey < Vy1[j] and y1 > Vy[j]
                        and ez < Vz1[j] and z1 > Vz[j]):
                    hit = True
                    break
            if hit:
                rej[1] += 1
                continue
        # C5
        if chk[4] and ez > 0.0:
            base = dx * dy
            if base <= 0.0:
                rej[4] += 1
                continue
            sup = 0.0
            for j in range(n):
                if abs(Vz1[j] - ez) < 1e-5:
                    ox = min(x1, Vx1[j]) - max(ex, Vx[j])
                    oy = min(y1, Vy1[j]) - max(ey, Vy[j])
                    if ox < 0.0:
                        ox = 0.0
                    if oy < 0.0:
                        oy = 0.0
                    sup += ox * oy
            if sup / base < 0.80:
                rej[4] += 1
                continue
        # C4
        if chk[3]:
            bad = False
            for j in range(n):
                ox = min(x1, Vx1[j]) - max(ex, Vx[j])
                oy = min(y1, Vy1[j]) - max(ey, Vy[j])
                if ox > 0.0 and oy > 0.0:
                    if Vfragile[j] and ez >= Vz1[j]:
                        bad = True
                        break
                    if b_fragile and Vz[j] >= z1:
                        bad = True
                        break
            if bad:
                rej[3] += 1
                continue
        # C3
        if chk[2]:
            borne = 0.0
            over = False
            for j in range(n):
                ox = min(x1, Vx1[j]) - max(ex, Vx[j])
                oy = min(y1, Vy1[j]) - max(ey, Vy[j])
                if ox > 0.0 and oy > 0.0:
                    if Vz[j] >= z1:
                        borne += Vmass[j]
                    if ez >= Vz1[j] and Vborne[j] + b_mass > Vcap[j]:
                        over = True
            if borne > b_cap or over:
                rej[2] += 1
                continue
        # C6
        if chk[5]:
            bad = False
            for j in range(n):
                ox = min(x1, Vx1[j]) - max(ex, Vx[j])
                oy = min(y1, Vy1[j]) - max(ey, Vy[j])
                oz = min(z1, Vz1[j]) - max(ez, Vz[j])
                xy = ox > 0.0 and oy > 0.0
                xz = ox > 0.0 and oz > 0.0
                if Vstop[j] > b_stop:
                    if (xy and Vz[j] >= z1) or (xz and Vy1[j] <= ey):
                        bad = True
                        break
                elif Vstop[j] < b_stop:
                    if (xy and ez >= Vz1[j]) or (xz and y1 <= Vy[j]):
                        bad = True
                        break
            if bad:
                rej[5] += 1
                continue
        return k
    return -1


_CHK_INDEX = {'C1': 0, 'C2': 1, 'C3': 2, 'C4': 3, 'C5': 4, 'C6': 5}
_CHK_NAMES = ('C1', 'C2', 'C3', 'C4', 'C5', 'C6')


# -- Feasibility of a candidate position (reference implementation) ------------
def _feasible_at(box_idx, r, pos, items, placements, orientations, container, check,
                 reject=None):
    """Would placing box_idx at pos (orientation r) satisfy the named constraints,
    for itself AND for every already-placed box it would affect?

    `reject`, if given, is a Counter that receives the FIRST failing constraint
    in evaluation order C1, C2, C5, C4, C3, C6."""
    CL, CW, CH = container['L'], container['W'], container['H']
    (x, y, z, dx, dy, dz) = pos

    def fail(c):
        if reject is not None:
            reject[c] += 1
        return False

    if 'C1' in check and (x + dx > CL or y + dy > CW or z + dz > CH):
        return fail('C1')

    if 'C2' in check:
        for j, (px, py, pz, pdx, pdy, pdz) in placements.items():
            if j != box_idx and overlaps(x, y, z, dx, dy, dz, px, py, pz, pdx, pdy, pdz):
                return fail('C2')

    trial = dict(placements)
    trial[box_idx] = pos
    trial_or = dict(orientations)
    trial_or[box_idx] = r

    if 'C5' in check and z > 0:
        if _support_ratio(box_idx, trial) < SUPPORT_THRESHOLD:
            return fail('C5')

    if 'C4' in check:
        box = items[box_idx]
        for j in trial:
            if j == box_idx:
                continue
            if items[j]['fragile'] == 1 and _is_above(j, box_idx, trial):
                return fail('C4')
            if box['fragile'] == 1 and _is_above(box_idx, j, trial):
                return fail('C4')

    if 'C3' in check:
        if _borne_mass(box_idx, items, trial) > _capacity(box_idx, items, trial, trial_or):
            return fail('C3')
        for j in trial:
            if j != box_idx and _is_above(j, box_idx, trial):
                if _borne_mass(j, items, trial) > _capacity(j, items, trial, trial_or):
                    return fail('C3')

    if 'C6' in check:
        s = items[box_idx]['stop']
        for j in trial:
            if j == box_idx:
                continue
            s_j = items[j]['stop']
            # candidate would be blocked by a placed later-stop box ...
            if s_j > s and (_is_above(box_idx, j, trial) or _blocks_extraction(box_idx, j, trial)):
                return fail('C6')
            # ... or would itself block a placed earlier-stop box
            if s > s_j and (_is_above(j, box_idx, trial) or _blocks_extraction(j, box_idx, trial)):
                return fail('C6')

    return True


def find_feasible_position(box_idx, items, placements, orientations, container,
                           check=('C1', 'C2', 'C3', 'C4', 'C5'), min_y=None,
                           eps=None, corridor=None, reject=None):
    """Rebuild extreme points from current placements, then return the first EP
    (in DBLF order) where box_idx satisfies the named constraints, trying each
    of its allowed_orientations.

    Returns ((x, y, z, dx, dy, dz), r) or None. The orientation is returned
    alongside the position because C3 depends on which face bears load.
    min_y, if given, requires y >= min_y (used by R4).
    corridor=(x_i, z_i, dx_i, dz_i, deeper) restricts candidates to those deeper
    than box i or laterally outside its xz removal corridor (R4).
    """
    if eps is None:
        eps = rebuild_extreme_points(placements, container)
    eps = np.asarray(eps, dtype=float)
    if eps.shape[0] == 0:
        return None
    box = items[box_idx]
    CL, CW, CH = float(container['L']), float(container['W']), float(container['H'])
    V = _PlacedView(items, placements, orientations)
    chk = np.array([c in check for c in _CHK_NAMES])
    if V.n == 0:
        Vx = Vy = Vz = Vx1 = Vy1 = Vz1 = Vmass = Vcap = Vborne = np.zeros(0)
        Vfragile = np.zeros(0, dtype=np.bool_)
        Vstop = np.zeros(0, dtype=np.int64)
    else:
        Vx, Vy, Vz, Vx1, Vy1, Vz1 = V.x, V.y, V.z, V.x1, V.y1, V.z1
        Vmass, Vfragile, Vstop, Vcap, Vborne = V.mass, V.fragile, V.stop.astype(np.int64), V.cap, V.borne
    my = -1.0 if min_y is None else float(min_y)
    if corridor is None:
        use_corr, cx, cz, cdx, cdz, deeper = False, 0.0, 0.0, 0.0, 0.0, 0.0
    else:
        use_corr = True
        cx, cz, cdx, cdz, deeper = (float(v) for v in corridor)
    rej = np.zeros(6, dtype=np.int64)

    for r in box['allowed_orientations']:
        dx, dy, dz = get_dims(box, r)
        dx, dy, dz = float(dx), float(dy), float(dz)
        b_cap = float(vertical_lbs(box, r)) * dx * dy
        k = _scan(eps, eps.shape[0], dx, dy, dz, CL, CW, CH,
                  Vx, Vy, Vz, Vx1, Vy1, Vz1, Vmass, Vfragile, Vstop, Vcap, Vborne, V.n,
                  float(box['mass']), box['fragile'] == 1, int(box['stop']), b_cap,
                  chk, my, use_corr, cx, cz, cdx, cdz, deeper, rej)
        if k >= 0:
            if reject is not None:
                for c in range(6):
                    if rej[c]:
                        reject[_CHK_NAMES[c]] += int(rej[c])
            ex, ey, ez = float(eps[k, 0]), float(eps[k, 1]), float(eps[k, 2])
            return (ex, ey, ez, dx, dy, dz), r
    if reject is not None:
        for c in range(6):
            if rej[c]:
                reject[_CHK_NAMES[c]] += int(rej[c])
    return None


# -- Relocate-or-defer primitive -----------------------------------------------
def _relocate_or_defer(ctx, j, unpacked, stats, tag, **kw):
    """Remove j, try to re-place it; on failure push it to the unpacked list."""
    ctx.remove(j)
    found = find_feasible_position(j, ctx.items, ctx.placements, ctx.orientations,
                                   ctx.container, reject=ctx.rejections[tag],
                                   eps=ctx.extreme_points(), **kw)
    if found is None:
        unpacked.append(j)
        stats['deferred_' + tag] += 1
    else:
        pos, r = found
        ctx.place(j, pos, r)
        stats['relocated_' + tag] += 1


# -- R1: fragility -------------------------------------------------------------
def repair_R1(ctx, unpacked, stats):
    changed = False
    for i in list(ctx.placements):
        if i not in ctx.placements or ctx.items[i]['fragile'] != 1:
            continue
        for j in list(ctx.above(i)):
            if j in ctx.placements:
                _relocate_or_defer(ctx, j, unpacked, stats, 'R1')
                changed = True
    return changed


# -- R2: weight ----------------------------------------------------------------
def repair_R2(ctx, unpacked, stats):
    changed = False
    for i in list(ctx.placements):
        if i not in ctx.placements:
            continue
        cap = _capacity(i, ctx.items, ctx.placements, ctx.orientations)
        above = sorted(ctx.above(i), key=lambda j: ctx.items[j]['mass'], reverse=True)
        borne = sum(ctx.items[j]['mass'] for j in above)
        for j in above:
            if borne <= cap:
                break
            if j in ctx.placements:
                borne -= ctx.items[j]['mass']
                _relocate_or_defer(ctx, j, unpacked, stats, 'R2')
                changed = True
    return changed


# -- R3: balance ---------------------------------------------------------------
def repair_R3(ctx, unpacked, stats):
    changed = False
    for i in list(ctx.placements):
        if i not in ctx.placements:
            continue
        (x_i, y_i, z_i, dx_i, dy_i, dz_i) = ctx.placements[i]
        if z_i == 0 or _support_ratio(i, ctx.placements) >= SUPPORT_THRESHOLD:
            continue
        ctx.remove(i)
        eps = ctx.extreme_points()

        # 1. translate in the (x, y) plane: same layer, nearest first
        same_layer = eps[eps[:, 2] == z_i]
        if same_layer.shape[0]:
            dist = np.hypot(same_layer[:, 0] - x_i, same_layer[:, 1] - y_i)
            same_layer = same_layer[np.argsort(dist, kind='stable')]
        found = find_feasible_position(i, ctx.items, ctx.placements, ctx.orientations,
                                       ctx.container, check=('C1', 'C2', 'C5'),
                                       eps=same_layer, reject=ctx.rejections['R3'])
        # 2. demote to a lower layer
        if found is None:
            lower = eps[eps[:, 2] < z_i]
            found = find_feasible_position(i, ctx.items, ctx.placements, ctx.orientations,
                                           ctx.container, check=('C1', 'C2', 'C5'),
                                           eps=lower, reject=ctx.rejections['R3'])
        if found is None:
            unpacked.append(i)
            stats['deferred_R3'] += 1
        else:
            pos, r = found
            ctx.place(i, pos, r)
            stats['relocated_R3'] += 1
        changed = True
    return changed


# -- R4: stop order ------------------------------------------------------------
def repair_R4(ctx, unpacked, stats):
    changed = False
    for i in list(ctx.placements):
        if i not in ctx.placements:
            continue
        blockers = sorted(ctx.blocking(i), key=lambda j: ctx.items[j]['stop'], reverse=True)
        if not blockers:
            continue
        (x_i, y_i, z_i, dx_i, dy_i, dz_i) = ctx.placements[i]
        corridor = (x_i, z_i, dx_i, dz_i, y_i + dy_i)

        for j in blockers:
            if j in ctx.placements:
                _relocate_or_defer(ctx, j, unpacked, stats, 'R4',
                                   check=R4_CHECK, corridor=corridor)
                changed = True
    return changed


# -- R5: fixpoint removal ------------------------------------------------------
def _violators(items, placements, orientations):
    out = set()
    members = list(placements)
    for i in members:
        above = [j for j in members if i != j and _is_above(i, j, placements)]
        if items[i]['fragile'] == 1 and above:
            out.add(i)
        if sum(items[j]['mass'] for j in above) > _capacity(i, items, placements, orientations):
            out.add(i)
        if _support_ratio(i, placements) < SUPPORT_THRESHOLD:
            out.add(i)
        s_i = items[i]['stop']
        for j in members:
            if i != j and items[j]['stop'] > s_i and (
                    j in above or _blocks_extraction(i, j, placements)):
                out.add(i)
                break
    return out


def repair_R5(ctx, unpacked, stats):
    """Remove every box still in violation, to a fixpoint: pulling a support
    can orphan the boxes above it, so one sweep is not enough."""
    while True:
        bad = _violators(ctx.items, ctx.placements, ctx.orientations)
        if not bad:
            return
        for i in bad:
            ctx.remove(i)
            unpacked.append(i)
            stats['removed_R5'] += 1


# -- Driver --------------------------------------------------------------------
def repair_arrangement(placements, orientations, unpacked, items, container):
    """Mutates placements / orientations / unpacked in place. Returns stats."""
    stats = {k: 0 for k in STAT_KEYS}
    ctx = RepairContext(items, placements, orientations, container)

    passes = 0
    for _ in range(R_MAX):
        passes += 1
        changed = False
        changed |= repair_R1(ctx, unpacked, stats)
        changed |= repair_R2(ctx, unpacked, stats)
        changed |= repair_R3(ctx, unpacked, stats)
        changed |= repair_R4(ctx, unpacked, stats)
        if not changed and not _violators(items, placements, orientations):
            break
    else:
        stats['rmax_hit'] = 1
    stats['passes_used'] = passes

    repair_R5(ctx, unpacked, stats)

    stats['rejections'] = {op: dict(c) for op, c in ctx.rejections.items()}

    csr, _ = evaluate_constraints(placements, items, orientations)
    if placements and csr != 100.0:
        raise AssertionError(
            f"repair left S(X_feas) = {csr:.4f}, expected 100.0: "
            f"repair checks have drifted from evaluate_constraints"
        )
    return stats
