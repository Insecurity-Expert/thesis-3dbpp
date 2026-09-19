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

from geometry_3d import get_dims, vertical_lbs, overlaps
from thesis_metrics import (_is_above, _blocks_extraction, _overlap,
                            evaluate_constraints)

R_MAX = 3
SUPPORT_THRESHOLD = 0.80

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

    def invalidate(self):
        self._above = None
        self._blocking = None

    def above(self, i):
        if self._above is None:
            self._above = {}
            members = list(self.placements)
            for a in members:
                self._above[a] = [b for b in members
                                  if a != b and _is_above(a, b, self.placements)]
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
    """Extreme points from scratch, DBLF-ordered (deepest, lowest, leftmost)."""
    CL, CW, CH = container['L'], container['W'], container['H']
    placed = list(placements.values())
    cands = {(0, 0, 0)}
    for (x, y, z, dx, dy, dz) in placed:
        cands.add((x + dx, y, z))
        cands.add((x, y + dy, z))
        cands.add((x, y, z + dz))
    eps = []
    for (ex, ey, ez) in cands:
        if ex >= CL or ey >= CW or ez >= CH:
            continue
        inside = any(px <= ex < px + pdx and py <= ey < py + pdy and pz <= ez < pz + pdz
                     for (px, py, pz, pdx, pdy, pdz) in placed)
        if not inside:
            eps.append((ex, ey, ez))
    eps.sort(key=lambda ep: (-ep[1], ep[2], ep[0]))
    return eps


# -- Feasibility of a candidate position ---------------------------------------
def _feasible_at(box_idx, r, pos, items, placements, orientations, container, check):
    """Would placing box_idx at pos (orientation r) satisfy the named constraints,
    for itself AND for every already-placed box it would affect?"""
    CL, CW, CH = container['L'], container['W'], container['H']
    (x, y, z, dx, dy, dz) = pos

    if 'C1' in check and (x + dx > CL or y + dy > CW or z + dz > CH):
        return False

    if 'C2' in check:
        for j, (px, py, pz, pdx, pdy, pdz) in placements.items():
            if j != box_idx and overlaps(x, y, z, dx, dy, dz, px, py, pz, pdx, pdy, pdz):
                return False

    trial = dict(placements)
    trial[box_idx] = pos
    trial_or = dict(orientations)
    trial_or[box_idx] = r

    if 'C5' in check and z > 0:
        if _support_ratio(box_idx, trial) < SUPPORT_THRESHOLD:
            return False

    if 'C4' in check:
        box = items[box_idx]
        for j in trial:
            if j == box_idx:
                continue
            if items[j]['fragile'] == 1 and _is_above(j, box_idx, trial):
                return False
            if box['fragile'] == 1 and _is_above(box_idx, j, trial):
                return False

    if 'C3' in check:
        if _borne_mass(box_idx, items, trial) > _capacity(box_idx, items, trial, trial_or):
            return False
        for j in trial:
            if j != box_idx and _is_above(j, box_idx, trial):
                if _borne_mass(j, items, trial) > _capacity(j, items, trial, trial_or):
                    return False

    if 'C6' in check:
        s = items[box_idx]['stop']
        for j in trial:
            if j == box_idx:
                continue
            s_j = items[j]['stop']
            if s_j > s and (_is_above(box_idx, j, trial) or _blocks_extraction(box_idx, j, trial)):
                return False
            if s > s_j and (_is_above(j, box_idx, trial) or _blocks_extraction(j, box_idx, trial)):
                return False

    return True


def find_feasible_position(box_idx, items, placements, orientations, container,
                           check=('C1', 'C2', 'C3', 'C4', 'C5'), min_y=None,
                           eps=None, extra_filter=None):
    """Rebuild extreme points from current placements, then return the first EP
    (in DBLF order) where box_idx satisfies the named constraints, trying each
    of its allowed_orientations.

    Returns ((x, y, z, dx, dy, dz), r) or None. The orientation is returned
    alongside the position because C3 depends on which face bears load.
    min_y, if given, requires y >= min_y (used by R4).
    extra_filter(ep, dims) -> bool can further restrict candidates.
    """
    if eps is None:
        eps = rebuild_extreme_points(placements, container)
    box = items[box_idx]
    for r in box['allowed_orientations']:
        dx, dy, dz = get_dims(box, r)
        for (ex, ey, ez) in eps:
            if min_y is not None and ey < min_y:
                continue
            if extra_filter is not None and not extra_filter((ex, ey, ez), (dx, dy, dz)):
                continue
            pos = (ex, ey, ez, dx, dy, dz)
            if _feasible_at(box_idx, r, pos, items, placements, orientations, container, check):
                return pos, r
    return None


# -- Relocate-or-defer primitive -----------------------------------------------
def _relocate_or_defer(ctx, j, unpacked, stats, tag, **kw):
    """Remove j, try to re-place it; on failure push it to the unpacked list."""
    ctx.remove(j)
    found = find_feasible_position(j, ctx.items, ctx.placements, ctx.orientations,
                                   ctx.container, **kw)
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
        eps = rebuild_extreme_points(ctx.placements, ctx.container)

        # 1. translate in the (x, y) plane: same layer, nearest first
        same_layer = sorted((ep for ep in eps if ep[2] == z_i),
                            key=lambda ep: math.hypot(ep[0] - x_i, ep[1] - y_i))
        found = find_feasible_position(i, ctx.items, ctx.placements, ctx.orientations,
                                       ctx.container, check=('C1', 'C2', 'C5'),
                                       eps=same_layer)
        # 2. demote to a lower layer
        if found is None:
            lower = [ep for ep in eps if ep[2] < z_i]
            found = find_feasible_position(i, ctx.items, ctx.placements, ctx.orientations,
                                           ctx.container, check=('C1', 'C2', 'C5'),
                                           eps=lower)
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
        deeper = y_i + dy_i

        def outside_corridor(ep, dims, x_i=x_i, z_i=z_i, dx_i=dx_i, dz_i=dz_i, deeper=deeper):
            # deeper than i, or laterally clear of the xz removal corridor of i
            ex, ey, ez = ep
            ddx, ddy, ddz = dims
            if ey >= deeper:
                return True
            ox = _overlap(x_i, x_i + dx_i, ex, ex + ddx)
            oz = _overlap(z_i, z_i + dz_i, ez, ez + ddz)
            return not (ox > 0 and oz > 0)

        for j in blockers:
            if j in ctx.placements:
                _relocate_or_defer(ctx, j, unpacked, stats, 'R4',
                                   check=('C1', 'C2', 'C3', 'C4', 'C5'),
                                   extra_filter=outside_corridor)
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

    csr, _ = evaluate_constraints(placements, items, orientations)
    if placements and csr != 100.0:
        raise AssertionError(
            f"repair left S(X_feas) = {csr:.4f}, expected 100.0: "
            f"repair checks have drifted from evaluate_constraints"
        )
    return stats
