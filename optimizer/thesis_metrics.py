import math

from geometry_3d import vertical_lbs

# Physics that must come from the dataset. Nothing here is ever synthesised:
# the manuscript states LBS values are sourced natively from OR-Library wtpack.
REQUIRED_BOX_KEYS = ('l', 'w', 'h', 'mass', 'lbs_l', 'lbs_w', 'lbs_h',
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
    Canonical convention: x = length, y = depth (y=0 at the door), z = height.
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

def evaluate_constraints(placements, items, orientations):
    """
    Evaluates C3 (Weight/LBS), C4 (Fragility), C5 (Stability), C6 (Stop-Order)
    under the canonical convention (x=length, y=depth from the door, z=height).

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
