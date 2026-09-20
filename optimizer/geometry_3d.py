"""
geometry_3d.py  -  Phase 2: 3-D Spatial Feasibility Engine
Pure geometry functions used by Wolf3D.
"""

import math
import random

# ── Orientation table ─────────────────────────────────────────────────────────
# Canonical convention: x = length, y = depth (y=0 is the door), z = height
# (z=0 is the floor, gravity along -z). Codes are 1-indexed and match the
# encoding documented in preprocessing/loader.py._allowed_orientations.
#
#   code | vertical dim | dx | dy | dz
#      1 |      h       |  l |  w |  h
#      2 |      h       |  w |  l |  h
#      3 |      w       |  l |  h |  w
#      4 |      w       |  h |  l |  w
#      5 |      l       |  w |  h |  l
#      6 |      l       |  h |  w |  l
ORIENT_FNS = {
    1: lambda l, w, h: (l, w, h),
    2: lambda l, w, h: (w, l, h),
    3: lambda l, w, h: (l, h, w),
    4: lambda l, w, h: (h, l, w),
    5: lambda l, w, h: (w, h, l),
    6: lambda l, w, h: (h, w, l),
}
ORIENT_CODES = (1, 2, 3, 4, 5, 6)
N_ORIENTATIONS = 6

# Which box dimension points along +z under each orientation code.
_VERTICAL_LBS_KEY = {1: 'lbs_h', 2: 'lbs_h',
                     3: 'lbs_w', 4: 'lbs_w',
                     5: 'lbs_l', 6: 'lbs_l'}

def _check_orientation(box, r):
    if r not in ORIENT_FNS:
        raise ValueError(f"orientation code {r!r} outside 1-6")
    if r not in box['allowed_orientations']:
        raise ValueError(
            f"orientation code {r} not in allowed_orientations "
            f"{box['allowed_orientations']}"
        )

def get_dims(box, r):
    """Return the box's (dx, dy, dz) extent under orientation code r (1-6)."""
    _check_orientation(box, r)
    return ORIENT_FNS[r](box['l'], box['w'], box['h'])

def vertical_lbs(box, r):
    """Load-bearing strength of whichever face points up under code r.

    This is a PRESSURE (kg/cm2) in the wtpack data, not a mass; callers must
    multiply by the top-face contact area before comparing against a load.
    """
    _check_orientation(box, r)
    return box[_VERTICAL_LBS_KEY[r]]

# ── AABB overlap ──────────────────────────────────────────────────────────────
def overlaps(ax, ay, az, adx, ady, adz, bx, by, bz, bdx, bdy, bdz):
    return (ax < bx+bdx and ax+adx > bx and
            ay < by+bdy and ay+ady > by and
            az < bz+bdz and az+adz > bz)

def can_place(x, y, z, dx, dy, dz, CL, CW, CH, placed):
    if x+dx > CL or y+dy > CW or z+dz > CH:
        return False
    for (px, py, pz, pdx, pdy, pdz) in placed:
        if overlaps(x, y, z, dx, dy, dz, px, py, pz, pdx, pdy, pdz):
            return False
    return True

# ── Constraint-aware placement (C5 and C4 only) ───────────────────────────────
# Only constraints that STAY satisfied as more boxes are added may be enforced
# at placement time. Support (C5) comes from boxes already placed and is never
# removed; a fragile-free column (C4) stays fragile-free. Load (C3) and stop
# order (C6) can both be broken by later placements, so they are left to the
# penalty and to repair.
SUPPORT_THRESHOLD = 0.80
_COPLANAR_TOL = 1e-5   # same tolerance as thesis_metrics' C5 evaluation

def _overlap_len(a0, a1, b0, b1):
    return max(0, min(a1, b1) - max(a0, b0))

def is_supported(x, y, z, dx, dy, placed):
    """C5 at placement: on the floor, or >= 80% of the base rests on top faces
    coplanar with the candidate's bottom face."""
    if z == 0:
        return True
    base = dx * dy
    if base <= 0:
        return False
    supported = 0.0
    for (px, py, pz, pdx, pdy, pdz) in placed:
        if abs((pz + pdz) - z) < _COPLANAR_TOL:
            supported += (_overlap_len(x, x + dx, px, px + pdx)
                          * _overlap_len(y, y + dy, py, py + pdy))
    return supported / base >= SUPPORT_THRESHOLD

def fragile_below(x, y, z, dx, dy, fragile_placed):
    """C4 at placement: True if any fragile box lies anywhere below the
    candidate within its xy footprint (not merely directly beneath)."""
    for (px, py, pz, pdx, pdy, pdz) in fragile_placed:
        if z >= pz + pdz:
            if (_overlap_len(x, x + dx, px, px + pdx) > 0
                    and _overlap_len(y, y + dy, py, py + pdy) > 0):
                return True
    return False

# ── Extreme Points ────────────────────────────────────────────────────────────
MAX_EPS = 200   # raised from 50 to prevent valid positions being dropped

# Deterministic stand-in for a wall-clock timeout: bounds total placement work
# per bin so results never depend on machine speed or load. Controlled variable.
MAX_PLACEMENT_ATTEMPTS = 20_000_000

def _update_eps(eps, placed, nx, ny, nz, ndx, ndy, ndz, CL, CW, CH):
    candidates = list(eps) + [
        (nx+ndx, ny,     nz),
        (nx,     ny+ndy, nz),
        (nx,     ny,     nz+ndz),
    ]
    result = []
    seen   = set()
    for (ex, ey, ez) in candidates:
        if (ex, ey, ez) in seen:
            continue
        seen.add((ex, ey, ez))
        if ex >= CL or ey >= CW or ez >= CH:
            continue
        blocked = any(
            px <= ex < px+pdx and py <= ey < py+pdy and pz <= ez < pz+pdz
            for (px, py, pz, pdx, pdy, pdz) in placed
        )
        if not blocked:
            result.append((ex, ey, ez))
    # Deepest-bottom-left: deepest first (largest y), then lowest (smallest z),
    # then leftmost (smallest x). Filling from the back wall toward the door
    # also serves C6, which wants early stops nearest y=0.
    result.sort(key=lambda ep: (-ep[1], ep[2], ep[0]))
    return result[:MAX_EPS]

# ── DBLF placement for ONE container ──────────────────────────────────────────
def place_container_dblf(item_sequence, items, orient_ids, container,
                         enforce_support=False, enforce_fragility=False):
    """Pack one container. Returns (placements, unplaced, orientations,
    attempts, budget_exhausted). Never opens a second container.

    Boxes are tried in the order given by `item_sequence`: that order is the
    search variable, so this routine must not re-sort it. Each placement is
    (x, y, z, dx, dy, dz); the orientation actually used is recorded in
    `orientations` so constraint checks can recover which face bears load.

    enforce_support   reject positions failing C5 (>= 80% base support)
    enforce_fragility reject positions with a fragile box anywhere below
    Two independent flags so the marginal effect of each is measurable.
    """
    CL, CW, CH = container['L'], container['W'], container['H']
    placed       = []
    fragile_placed = []
    eps          = [(0, 0, 0)]
    placements   = {}
    orientations = {}
    unplaced     = []

    attempts = 0
    budget_exhausted = False

    for idx_pos, item_idx in enumerate(item_sequence):
        # Hard work limit — remaining items go unplaced rather than hang
        if attempts > MAX_PLACEMENT_ATTEMPTS:
            budget_exhausted = True
            unplaced.extend(item_sequence[idx_pos:])
            break
        box = items[item_idx]
        r   = orient_ids[item_idx]

        placed_flag = False
        for r_try in (r, *[o for o in box['allowed_orientations'] if o != r]):
            dx, dy, dz = get_dims(box, r_try)
            for (ex, ey, ez) in eps:
                attempts += 1
                if not can_place(ex, ey, ez, dx, dy, dz, CL, CW, CH, placed):
                    continue
                if enforce_support and not is_supported(ex, ey, ez, dx, dy, placed):
                    continue
                if enforce_fragility and fragile_below(ex, ey, ez, dx, dy, fragile_placed):
                    continue
                placed.append((ex, ey, ez, dx, dy, dz))
                if box['fragile'] == 1:
                    fragile_placed.append((ex, ey, ez, dx, dy, dz))
                placements[item_idx]   = (ex, ey, ez, dx, dy, dz)
                orientations[item_idx] = r_try
                eps = _update_eps(eps, placed, ex, ey, ez, dx, dy, dz, CL, CW, CH)
                placed_flag = True
                break
            if placed_flag:
                break

        if not placed_flag:
            unplaced.append(item_idx)

    return placements, unplaced, orientations, attempts, budget_exhausted

# ── Legacy Phase-1 geometry (HDGWO / wolf_3d / BR JSON) ───────────────────────
# Frozen copy of the pre-Step-3 engine: 0-indexed orientations, (L,H,D) keys and
# the y-up convention. Retained only so the Phase-1 replication keeps running on
# BR JSON; the thesis pipeline must use the canonical z-up functions above.
ORIENT_FNS_LEGACY = [
    lambda L, H, D: (L, H, D),
    lambda L, H, D: (L, D, H),
    lambda L, H, D: (H, L, D),
    lambda L, H, D: (H, D, L),
    lambda L, H, D: (D, L, H),
    lambda L, H, D: (D, H, L),
]

def get_dims_legacy(item, orient_id):
    return ORIENT_FNS_LEGACY[orient_id](item['L'], item['H'], item['D'])

def can_place_legacy(x, y, z, l, h, d, CL, CH, CD, placed):
    if x+l > CL or y+h > CH or z+d > CD:
        return False
    for (px, py, pz, pl2, ph, pd) in placed:
        if overlaps(x, y, z, l, h, d, px, py, pz, pl2, ph, pd):
            return False
    return True

def _update_eps_legacy(eps, placed, nx, ny, nz, nl, nh, nd, CL, CH, CD):
    candidates = list(eps) + [
        (nx+nl, ny,    nz),
        (nx,    ny+nh, nz),
        (nx,    ny,    nz+nd),
    ]
    result = []
    seen   = set()
    for (ex, ey, ez) in candidates:
        if (ex, ey, ez) in seen:
            continue
        seen.add((ex, ey, ez))
        if ex >= CL or ey >= CH or ez >= CD:
            continue
        blocked = any(
            px <= ex < px+pl2 and py <= ey < py+ph and pz <= ez < pz+pd
            for (px, py, pz, pl2, ph, pd) in placed
        )
        if not blocked:
            result.append((ex, ey, ez))
    result.sort(key=lambda ep: (ep[2], ep[1], ep[0]))
    return result[:MAX_EPS]

def place_bin_dblf_legacy(item_indices, items, orient_ids, container, weight_capacity=None):
    CL, CH, CD = container['L'], container['H'], container['D']
    placed     = []
    eps        = [(0, 0, 0)]
    placements = {}
    overflow   = []
    total_wt   = 0.0

    sorted_items = sorted(
        item_indices,
        key=lambda i: items[i]['L'] * items[i]['H'] * items[i]['D'],
        reverse=True
    )

    attempts = 0

    for idx_pos, item_idx in enumerate(sorted_items):
        if attempts > MAX_PLACEMENT_ATTEMPTS:
            overflow.extend(sorted_items[idx_pos:])
            break
        item = items[item_idx]
        orient_id = orient_ids.get(item_idx, 0)
        l, h, d   = get_dims_legacy(item, orient_id)
        wt        = item.get('weight', 1)

        if weight_capacity is not None and total_wt + wt > weight_capacity:
            overflow.append(item_idx)
            continue

        placed_flag = False
        for alt_o in [orient_id] + [o for o in range(N_ORIENTATIONS) if o != orient_id]:
            al, ah, ad = get_dims_legacy(item, alt_o)
            for (ex, ey, ez) in eps:
                attempts += 1
                if can_place_legacy(ex, ey, ez, al, ah, ad, CL, CH, CD, placed):
                    placed.append((ex, ey, ez, al, ah, ad))
                    placements[item_idx] = (ex, ey, ez, al, ah, ad)
                    eps = _update_eps_legacy(eps, placed, ex, ey, ez, al, ah, ad, CL, CH, CD)
                    total_wt   += wt
                    placed_flag = True
                    break
            if placed_flag:
                break

        if not placed_flag:
            overflow.append(item_idx)

    return placements, overflow

# ── Weight helpers ────────────────────────────────────────────────────────────
def assign_weights(items, seed=42):
    rng = random.Random(seed)
    for item in items:
        item['weight'] = rng.randint(1, 20)

def compute_weight_capacity(items, container):
    total_wt  = sum(item.get('weight', 1) for item in items)
    vol_cap   = container['L'] * container['H'] * container['D']
    vol_items = sum(i['L'] * i['H'] * i['D'] for i in items)
    lb        = max(1, math.ceil(vol_items / vol_cap))
    return math.ceil(total_wt / lb)

def volumetric_dissipation(bin_placements, container):
    cap  = container['L'] * container['H'] * container['D']
    diss = 0.0
    for bp in bin_placements:
        used = sum(l*h*d for (_, _, _, l, h, d) in bp)
        util = used / cap if cap > 0 else 0.0
        diss += (1.0 - util) ** 2
    return diss