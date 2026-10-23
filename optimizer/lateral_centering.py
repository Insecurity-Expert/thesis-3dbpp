"""
lateral_centering.py - Post-processing lateral balancing pass.

Decoupled post-placement optimization: shifts rigid vertical support clusters
laterally along the width axis (x) to minimize the Chapter 3 descriptive
indicator M-7 (lateral left-right mass imbalance), while mathematically
preserving all constraints C1-C6 (C1 boundary, C2 non-overlap, C3 load-bearing,
C4 fragility, C5 base support >= 80%, C6 stop-order extraction).
"""

from collections import defaultdict
import numpy as np

from layout_metrics import load_distribution
from thesis_metrics import evaluate_constraints


def _overlap(a0, a1, b0, b1):
    return max(0.0, min(a1, b1) - max(a0, b0))


def build_support_clusters(placements):
    """
    Partitions placed boxes into rigid vertical support clusters.
    Two boxes i and j belong to the same cluster if one supports the other
    with positive coplanar contact area. All boxes in a cluster move by the
    exact same delta_x, guaranteeing that intra-cluster support ratios (C5),
    relative load-bearing (C3), and fragility clearance (C4) remain unchanged.
    """
    ids = sorted(placements.keys(), key=lambda k: int(k))
    adj = defaultdict(set)
    for i in ids:
        xi, yi, zi, dxi, dyi, dzi = placements[i]
        for j in ids:
            if i >= j:
                continue
            xj, yj, zj, dxj, dyj, dzj = placements[j]
            # Check if j rests on top of i
            if abs((zi + dzi) - zj) < 1e-5:
                if _overlap(xi, xi + dxi, xj, xj + dxj) > 0 and _overlap(yi, yi + dyi, yj, yj + dyj) > 0:
                    adj[i].add(j)
                    adj[j].add(i)
            # Check if i rests on top of j
            elif abs((zj + dzj) - zi) < 1e-5:
                if _overlap(xi, xi + dxi, xj, xj + dxj) > 0 and _overlap(yi, yi + dyi, yj, yj + dyj) > 0:
                    adj[i].add(j)
                    adj[j].add(i)

    visited = set()
    clusters = []
    for i in ids:
        if i not in visited:
            comp = []
            queue = [i]
            visited.add(i)
            while queue:
                curr = queue.pop(0)
                comp.append(curr)
                for neighbor in adj[curr]:
                    if neighbor not in visited:
                        visited.add(neighbor)
                        queue.append(neighbor)
            clusters.append(comp)

    return clusters


def compute_cluster_slack(cluster, placements, container, all_ids):
    """
    Computes exact [d_min, d_max] interval that a cluster can translate along x
    without colliding with container walls (C1) or overlapping any box outside
    the cluster (C2).
    """
    L = float(container['L'])
    d_min = -1e9
    d_max = 1e9

    for i in cluster:
        xi, yi, zi, dxi, dyi, dzi = placements[i]
        # C1 container walls
        d_min = max(d_min, -xi)
        d_max = min(d_max, L - (xi + dxi))

        # C2 obstacle avoidance with boxes outside this cluster
        for j in all_ids:
            if j in cluster:
                continue
            xj, yj, zj, dxj, dyj, dzj = placements[j]
            if _overlap(yi, yi + dyi, yj, yj + dyj) > 0 and _overlap(zi, zi + dzi, zj, zj + dzj) > 0:
                if xj >= xi + dxi - 1e-5:       # j is to the right
                    d_max = min(d_max, xj - (xi + dxi))
                elif xj + dxj <= xi + 1e-5:     # j is to the left
                    d_min = max(d_min, (xj + dxj) - xi)

    if d_min > d_max:
        return 0.0, 0.0
    return d_min, d_max


def center_arrangement(placements, container, items, orientations, max_passes=5):
    """
    Applies post-processing lateral centering to an existing arrangement.

    Returns:
        dict with:
            'placements': dict of {item_idx: [x, y, z, dx, dy, dz]},
            'm7_before': M-7 dict before centering,
            'm7_after': M-7 dict after centering,
            'improved': True if imbalance was reduced,
            'clusters_count': number of rigid support clusters,
            'shifts': dict of {item_idx: delta_x}
    """
    L = float(container['L'])
    mid = L / 2.0
    ids = sorted(placements.keys(), key=lambda k: int(k))
    if not ids:
        empty_m7 = load_distribution({}, container, items)
        return {
            'placements': {},
            'm7_before': empty_m7,
            'm7_after': empty_m7,
            'improved': False,
            'clusters_count': 0,
            'shifts': {},
        }

    # Record baseline state
    curr_P = {i: list(placements[i]) for i in ids}
    m7_before = load_distribution(curr_P, container, items)
    base_csr, base_detail = evaluate_constraints(curr_P, items, orientations)

    clusters = build_support_clusters(curr_P)

    # Sort clusters by total mass descending (shift heavy stacks first)
    clusters.sort(key=lambda c: sum(float(items[i]['mass']) for i in c), reverse=True)

    def calc_center_dist(pl):
        return sum(float(items[i]['mass']) * abs(pl[i][0] + pl[i][3] / 2.0 - mid) for i in ids)

    best_P = {i: list(curr_P[i]) for i in ids}
    best_ld = dict(m7_before)
    best_imb = best_ld['lr_mass_imbalance_pct']
    best_dist = calc_center_dist(best_P)

    def try_shift(cluster, delta_x):
        if abs(delta_x) < 1e-4:
            return None
        cand_P = {i: list(curr_P[i]) for i in ids}
        for i in cluster:
            cand_P[i][0] += delta_x

        # Enforce C1 boundary
        for i in cluster:
            x, _, _, dx, _, _ = cand_P[i]
            if x < -1e-6 or x + dx > L + 1e-6:
                return None

        # Verify C1-C6 full constraint compliance
        cand_csr, _ = evaluate_constraints(cand_P, items, orientations)
        if cand_csr < base_csr:
            return None

        return cand_P

    improved = False
    for _ in range(max_passes):
        pass_improved = False
        for cluster in clusters:
            d_min, d_max = compute_cluster_slack(cluster, curr_P, container, ids)
            if d_max - d_min < 1e-4:
                continue

            # Current mass balance
            curr_ld = load_distribution(curr_P, container, items)
            left_heavier = curr_ld['left_mass'] > curr_ld['right_mass']

            c_min_x = min(curr_P[i][0] for i in cluster)
            c_max_x = max(curr_P[i][0] + curr_P[i][3] for i in cluster)
            c_cx = (c_min_x + c_max_x) / 2.0

            target_center_delta = np.clip(mid - c_cx, d_min, d_max)

            # Generate candidate displacement steps within [d_min, d_max]
            candidate_deltas = [target_center_delta]
            if left_heavier and d_max > 0:
                # Try shifts towards right
                for step in np.linspace(d_max, 1.0, 15):
                    candidate_deltas.append(step)
            elif not left_heavier and d_min < 0:
                # Try shifts towards left
                for step in np.linspace(d_min, -1.0, 15):
                    candidate_deltas.append(step)

            # Also try midpoint of slack
            if d_max > 0 and d_min < 0:
                candidate_deltas.append((d_max + d_min) / 2.0)

            # Test candidates
            best_candidate = None
            best_cand_imb = best_imb
            best_cand_dist = best_dist

            for delta in candidate_deltas:
                cand_P = try_shift(cluster, delta)
                if cand_P is not None:
                    cand_ld = load_distribution(cand_P, container, items)
                    cand_imb = cand_ld['lr_mass_imbalance_pct']
                    cand_dist = calc_center_dist(cand_P)

                    is_better = (cand_imb < best_cand_imb - 1e-4) or (
                        abs(cand_imb - best_cand_imb) <= 1e-4 and cand_dist < best_cand_dist - 1e-2
                    )

                    if is_better:
                        best_cand_imb = cand_imb
                        best_cand_dist = cand_dist
                        best_candidate = cand_P

            if best_candidate is not None:
                best_P = best_candidate
                curr_P = best_candidate
                best_imb = best_cand_imb
                best_dist = best_cand_dist
                pass_improved = True
                improved = True

        if not pass_improved:
            break

    m7_after = load_distribution(best_P, container, items)
    shifts = {i: round(best_P[i][0] - placements[i][0], 2) for i in ids}

    return {
        'placements': best_P,
        'm7_before': m7_before,
        'm7_after': m7_after,
        'improved': improved,
        'clusters_count': len(clusters),
        'shifts': shifts,
    }
