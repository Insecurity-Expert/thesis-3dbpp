import math

import numpy as np
from numba import njit

from geometry_3d import vertical_lbs

# Physics that must come from the dataset. Nothing here is ever synthesised:
# the manuscript states LBS values are sourced natively from OR-Library wtpack.
REQUIRED_BOX_KEYS = ('id', 'type_id', 'l', 'w', 'h', 'mass', 'lbs_l', 'lbs_w', 'lbs_h',
                     'allowed_orientations', 'fragile', 'stop')

def validate_items(items):
    """Fail loudly if any box lacks real physics. Never fabricate."""
    for i, box in enumerate(items):
        missing = [k for k in REQUIRED_BOX_KEYS if k not in box]
        if missing:
            raise ValueError(f"box {i} missing required keys: {missing}")
        if not box['allowed_orientations']:
            raise ValueError(f"box {i} has no allowed orientations")

def _overlap(a0, a1, b0, b1):
    return max(0, min(a1, b1) - max(a0, b0))

def _is_above(i, j, placements):
    """
    Returns True if box j rests above box i.
    Canonical convention: x = across the truck, y = depth from the rear door
    (y=0 at the door, toward the cab), z = height.
    j is above i if z_j >= z_i + dz_i AND their xy footprints overlap.
    """
    (x_i, y_i, z_i, dx_i, dy_i, dz_i) = placements[i]
    (x_j, y_j, z_j, dx_j, dy_j, dz_j) = placements[j]

    if z_j >= z_i + dz_i:
        ox = _overlap(x_i, x_i + dx_i, x_j, x_j + dx_j)
        oy = _overlap(y_i, y_i + dy_i, y_j, y_j + dy_j)
        if ox > 0 and oy > 0:
            return True
    return False

def _blocks_extraction(i, j, placements):
    """
    Returns True if box j sits between box i and the door.

    The removal corridor runs along -y with the container opening at the y=0
    face, so j obstructs i when j lies entirely doorward of i (y_j + dy_j <= y_i)
    and their xz projections overlap.
    """
    (x_i, y_i, z_i, dx_i, dy_i, dz_i) = placements[i]
    (x_j, y_j, z_j, dx_j, dy_j, dz_j) = placements[j]

    if y_j + dy_j <= y_i:
        ox = _overlap(x_i, x_i + dx_i, x_j, x_j + dx_j)
        oz = _overlap(z_i, z_i + dz_i, z_j, z_j + dz_j)
        if ox > 0 and oz > 0:
            return True
    return False

def space_utilization(placements, container):
    """OF-1: packed volume as a fraction of the ONE container's volume.

    Returns a ratio in [0, 1]; unplaced boxes simply do not contribute.
    """
    V_c = container['L'] * container['W'] * container['H']
    if V_c <= 0:
        return 0.0
    packed = sum(dx * dy * dz for (_, _, _, dx, dy, dz) in placements.values())
    return packed / V_c

def evaluate_constraints_reference(placements, items, orientations):
    """
    Evaluates C3 (Weight/LBS), C4 (Fragility), C5 (Stability), C6 (Stop-Order)
    under the canonical convention (x=across the truck, y=depth from the rear door, z=height).

    `orientations` maps item index -> orientation code, so C3 can charge the
    load against whichever face is actually bearing it.

    Returns S(X) and detail dictionary.
    """
    total = len(placements)
    if total == 0:
        return 0.0, {
            "C3_weight_pct": 0.0,
            "C4_fragility_pct": 0.0,
            "C5_balance_pct": 0.0,
            "C6_stop_order_pct": 0.0,
            "total_compliant_pct": 0.0,
            "C3_weight_rate": 0.0,
            "C4_fragility_rate": 0.0,
            "C5_balance_rate": 0.0,
            "C6_stop_order_rate": 0.0,
        }

    # Single container: every placed box is a candidate neighbour
    members = list(placements)

    c3_ok = 0
    c4_ok = 0
    c5_ok = 0
    c6_ok = 0
    all_ok = 0

    for i in members:
        (x_i, y_i, z_i, dx_i, dy_i, dz_i) = placements[i]
        top_area = dx_i * dy_i

        # Gather boxes above i
        boxes_above = [j for j in members if i != j and _is_above(i, j, placements)]

        # C3: Load-bearing capacity.
        # LBS is a pressure (kg/cm2), so the allowance is lbs * contact area.
        borne_mass = sum(items[j]['mass'] for j in boxes_above)
        capacity = vertical_lbs(items[i], orientations[i]) * top_area
        is_c3_ok = borne_mass <= capacity

        # C4: Fragility — nothing may rest on a fragile box
        is_c4_ok = not (items[i]['fragile'] == 1 and len(boxes_above) > 0)

        # C5: Stability (80% base support); z = 0 is the floor
        if z_i == 0:
            is_c5_ok = True
        else:
            supported_area = 0.0
            for j in members:
                if i != j:
                    (x_j, y_j, z_j, dx_j, dy_j, dz_j) = placements[j]
                    if abs((z_j + dz_j) - z_i) < 1e-5:  # j is directly under i
                        ox = _overlap(x_i, x_i + dx_i, x_j, x_j + dx_j)
                        oy = _overlap(y_i, y_i + dy_i, y_j, y_j + dy_j)
                        supported_area += ox * oy
            is_c5_ok = (supported_area / top_area) >= 0.80 if top_area > 0 else False

        # C6: Stop-order accessibility. A later-stop box must not sit above i
        # nor between i and the door.
        is_c6_ok = True
        s_i = items[i]['stop']
        above_set = set(boxes_above)
        for j in members:
            if i == j or items[j]['stop'] <= s_i:
                continue
            if j in above_set or _blocks_extraction(i, j, placements):
                is_c6_ok = False
                break

        # Tally
        if is_c3_ok: c3_ok += 1
        if is_c4_ok: c4_ok += 1
        if is_c5_ok: c5_ok += 1
        if is_c6_ok: c6_ok += 1
        if is_c3_ok and is_c4_ok and is_c5_ok and is_c6_ok:
            all_ok += 1

    detail = {
        # M-2a..M-2d, reported as compliance percentages
        "C3_weight_pct": (c3_ok / total) * 100.0,
        "C4_fragility_pct": (c4_ok / total) * 100.0,
        "C5_balance_pct": (c5_ok / total) * 100.0,
        "C6_stop_order_pct": (c6_ok / total) * 100.0,
        "total_compliant_pct": (all_ok / total) * 100.0,
        # PEN-1 violation rates V_k in [0, 1], consumed by the scalar fitness
        "C3_weight_rate": (total - c3_ok) / total,
        "C4_fragility_rate": (total - c4_ok) / total,
        "C5_balance_rate": (total - c5_ok) / total,
        "C6_stop_order_rate": (total - c6_ok) / total,
    }

    return detail["total_compliant_pct"], detail

def robustness(su_values):
    n = len(su_values)
    if n < 2:
        return 0.0
    mean = sum(su_values) / n
    var = sum((v - mean) ** 2 for v in su_values) / (n - 1)
    return math.sqrt(var)


# ── Compiled evaluator (Step 6) ───────────────────────────────────────────────
# evaluate_constraints_reference above is the specification and is what the
# geometry tests exercise. This is a transcription of it into a compiled loop;
# tools/test_geometry.py asserts the two agree on random arrangements.

@njit(cache=True)
def _constraint_counts(P, mass, fragile, stop, cap, n):
    """P rows are (x, y, z, dx, dy, dz). Returns (c3, c4, c5, c6, all) counts."""
    c3_ok = 0
    c4_ok = 0
    c5_ok = 0
    c6_ok = 0
    all_ok = 0
    above = np.zeros(n, dtype=np.bool_)
    for i in range(n):
        xi = P[i, 0]; yi = P[i, 1]; zi = P[i, 2]
        dxi = P[i, 3]; dyi = P[i, 4]; dzi = P[i, 5]
        top_area = dxi * dyi
        borne = 0.0
        n_above = 0
        supported = 0.0
        for j in range(n):
            above[j] = False
            if i == j:
                continue
            xj = P[j, 0]; yj = P[j, 1]; zj = P[j, 2]
            dxj = P[j, 3]; dyj = P[j, 4]; dzj = P[j, 5]
            ox = min(xi + dxi, xj + dxj) - max(xi, xj)
            oy = min(yi + dyi, yj + dyj) - max(yi, yj)
            # _is_above(i, j): j rests above i
            if zj >= zi + dzi and ox > 0.0 and oy > 0.0:
                above[j] = True
                n_above += 1
                borne += mass[j]
            # C5 support contribution: j directly under i
            if zi != 0.0 and abs((zj + dzj) - zi) < 1e-5:
                if ox < 0.0:
                    ox = 0.0
                if oy < 0.0:
                    oy = 0.0
                supported += ox * oy
        is_c3 = borne <= cap[i]
        is_c4 = not (fragile[i] and n_above > 0)
        if zi == 0.0:
            is_c5 = True
        elif top_area > 0.0:
            is_c5 = (supported / top_area) >= 0.80
        else:
            is_c5 = False
        is_c6 = True
        for j in range(n):
            if i == j or stop[j] <= stop[i]:
                continue
            if above[j]:
                is_c6 = False
                break
            # _blocks_extraction(i, j): j doorward of i with xz overlap
            xj = P[j, 0]; zj = P[j, 2]; dxj = P[j, 3]; dzj = P[j, 5]
            if P[j, 1] + P[j, 4] <= yi:
                ox = min(xi + dxi, xj + dxj) - max(xi, xj)
                oz = min(zi + dzi, zj + dzj) - max(zi, zj)
                if ox > 0.0 and oz > 0.0:
                    is_c6 = False
                    break
        if is_c3:
            c3_ok += 1
        if is_c4:
            c4_ok += 1
        if is_c5:
            c5_ok += 1
        if is_c6:
            c6_ok += 1
        if is_c3 and is_c4 and is_c5 and is_c6:
            all_ok += 1
    return c3_ok, c4_ok, c5_ok, c6_ok, all_ok


def evaluate_constraints(placements, items, orientations):
    """Fast path with the same contract as evaluate_constraints_reference."""
    total = len(placements)
    if total == 0:
        return evaluate_constraints_reference(placements, items, orientations)
    idx = list(placements)
    P = np.array([placements[i] for i in idx], dtype=np.float64)
    mass = np.array([items[i]['mass'] for i in idx], dtype=np.float64)
    fragile = np.array([items[i]['fragile'] == 1 for i in idx])
    stop = np.array([items[i]['stop'] for i in idx], dtype=np.int64)
    cap = np.array([vertical_lbs(items[i], orientations[i]) for i in idx], dtype=np.float64) * P[:, 3] * P[:, 4]
    c3_ok, c4_ok, c5_ok, c6_ok, all_ok = _constraint_counts(P, mass, fragile, stop, cap, total)
    detail = {
        "C3_weight_pct": (c3_ok / total) * 100.0,
        "C4_fragility_pct": (c4_ok / total) * 100.0,
        "C5_balance_pct": (c5_ok / total) * 100.0,
        "C6_stop_order_pct": (c6_ok / total) * 100.0,
        "total_compliant_pct": (all_ok / total) * 100.0,
        "C3_weight_rate": (total - c3_ok) / total,
        "C4_fragility_rate": (total - c4_ok) / total,
        "C5_balance_rate": (total - c5_ok) / total,
        "C6_stop_order_rate": (total - c6_ok) / total,
    }
    return detail["total_compliant_pct"], detail
