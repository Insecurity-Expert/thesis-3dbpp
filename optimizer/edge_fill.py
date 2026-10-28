"""
R4 edge filling (Repair-Based hybrid only): close the sideways gaps in REP's
final arrangement so boxes sit against each other and the walls.

Why. In a hard turn or brake a box that touches nothing across the truck width
(an "island") or touches the wall on one side only can slide or tip. The
diagnosis on REP's arrangements is that this comes from too little cargo across
the width, not from lateral centering: the boxes the search left out would fit
in the large sideways gaps, but the per-wolf re-insertion takes the FIRST
feasible extreme point (deepest-lowest-leftmost) and has no notion of contact.

When. Once, on the arrangement REP returns, never per wolf: the search, the
archive and the leader selection are untouched and R4 draws nothing from the RNG
(the per-wolf cost of any step inside repair_arrangement is population x
iterations; R4 here is a few seconds in total).

Step A, re-insertion by side contact. Each unpacked box, largest volume first
(ties by index), is tried at the extreme points plus extra points flush against
both sides of every sideways gap >= tau (the smallest box dimension in the
instance), and slid flush to the nearest wall or box in x. Every feasible
position is kept (C1-C6 in both directions, the same kernel as R2 re-insertion)
and scored by side-contact area: the area of its x and y faces that touches a
wall or a box with zero gap. A placement is accepted only if it touches on at
least two of x-, x+, y-, y+ (walls count) and on at least one x face, so R4 never
creates a new island. Ties go to the placement that lowers the left-right mass
imbalance (M-7), then to DBLF order.

Step B, light compaction. Rigid vertical stacks (lateral_centering) are moved
across the width into contact with the nearer wall or stack when that increases
total side contact and C1-C6 still hold at 100 %; a move that breaks a
constraint (typically C6, which the stack-internal rigidity does not cover) is
undone. Step A then runs once more, because compaction can open new gaps.

What is left over. Sideways gaps below tau cannot hold a box; they are reported
as dunnage by layout_metrics.edge_indicators, not filled.

The arrangement is feasible by construction: S(X_feas) == 100 is asserted at the
end, as in repair.py, so any drift between these checks and evaluate_constraints
fails loudly.
"""
import time
from collections import Counter

import numpy as np

from geometry_3d import get_dims
from layout_metrics import (face_gaps, smallest_box_dimension, contact_areas,
                            side_contact, edge_indicators)
from lateral_centering import build_support_clusters, compute_cluster_slack
from repair import R2_CHECK, rebuild_extreme_points, feasible_candidates
from thesis_metrics import evaluate_constraints

MIN_SIDES = 2              # a placed box must touch on at least this many of x-, x+, y-, y+
REQUIRE_X_CONTACT = True   # ... and on at least one x face (the panel's concern is sideways sliding)
COMPACTION_PASSES = 5
EPS = 1e-6


def _volume(items, j):
    b = items[j]
    return b['l'] * b['w'] * b['h']


def _array(placements):
    if not placements:
        return np.zeros((0, 6))
    return np.array([[float(v) for v in p] for p in placements.values()])


# -- Step A: candidate points ---------------------------------------------------
def _gap_anchors(placements, container, tau):
    """Anchors flush against both sides of every x-face gap >= tau:
    (kind, x_plane, y, z, dy_i), kind 'L' = the new box's x- face goes on x_plane,
    'R' = its x+ face does (so its x depends on the orientation)."""
    out = []
    for i, faces in face_gaps(placements, container).items():
        xi, yi, zi, dxi, dyi, _ = (float(v) for v in placements[i])
        g = faces['x+']
        if g >= tau - 1e-9:
            out += [('L', xi + dxi, yi, zi, dyi), ('R', xi + dxi + g, yi, zi, dyi)]
        g = faces['x-']
        if g >= tau - 1e-9:
            out += [('R', xi, yi, zi, dyi), ('L', xi - g, yi, zi, dyi)]
    return out


def _candidates(eps, anchors, dims, P, container):
    """Corner positions for a box of size dims: extreme points, gap points, and
    each of them slid in x flush to the nearest wall or box on either side."""
    dx, dy, dz = dims
    L, W, H = (float(container[k]) for k in ('L', 'W', 'H'))
    rows = [np.asarray(eps, dtype=float).reshape(-1, 3)]
    pts = []
    for kind, xp, y, z, dyi in anchors:
        x = xp if kind == 'L' else xp - dx
        pts.append((x, y, z))
        pts.append((x, y + dyi - dy, z))
    if pts:
        rows.append(np.array(pts, dtype=float))
    C = np.vstack(rows)
    C = C[(C[:, 0] >= 0) & (C[:, 1] >= 0) & (C[:, 2] >= 0) &
          (C[:, 0] + dx <= L + EPS) & (C[:, 1] + dy <= W + EPS) & (C[:, 2] + dz <= H + EPS)]
    if len(C) == 0:
        return C
    if len(P):
        px, py, pz, pdx, pdy, pdz = P.T
        px1 = px + pdx
        x, y, z = C[:, 0:1], C[:, 1:2], C[:, 2:3]
        side = ((np.minimum(y + dy, py + pdy) - np.maximum(y, py) > 0) &
                (np.minimum(z + dz, pz + pdz) - np.maximum(z, pz) > 0))
        left = np.where(side & (px1 <= x + EPS), px1, 0.0).max(axis=1)
        right = np.where(side & (px >= x + dx - EPS), px - dx, L - dx).min(axis=1)
        C = np.vstack([C, np.column_stack([left, C[:, 1], C[:, 2]]),
                       np.column_stack([right, C[:, 1], C[:, 2]])])
        C = C[(C[:, 0] >= 0) & (C[:, 0] + dx <= L + EPS)]
    return np.unique(C, axis=0)


# -- Step A: re-insertion by side contact ---------------------------------------
def _fill_pass(placements, orientations, unpacked, items, container, tau, stats):
    L, W = float(container['L']), float(container['W'])
    order = sorted((j for j in unpacked if j not in placements),
                   key=lambda j: (-_volume(items, j), j))
    placed_now = 0
    for j in order:
        P = _array(placements)
        eps = rebuild_extreme_points(placements, container)
        anchors = _gap_anchors(placements, container, tau)
        mass = {'left': 0.0, 'right': 0.0}
        for k, p in placements.items():
            mass['left' if p[0] + p[3] / 2.0 < L / 2.0 else 'right'] += float(items[k]['mass'])
        rej = Counter()
        best, best_key, n_feasible = None, None, 0
        for rank, r in enumerate(items[j]['allowed_orientations']):
            dims = tuple(float(v) for v in get_dims(items[j], r))
            C = _candidates(eps, anchors, dims, P, container)
            for k in feasible_candidates(j, r, C, items, placements, orientations, container,
                                         check=R2_CHECK, reject=rej):
                n_feasible += 1
                x, y, z = (float(v) for v in C[k])
                c = contact_areas((x, y, z) + dims, P, L, W)
                sides = sum(1 for a in c if a > EPS)
                if sides < MIN_SIDES or (REQUIRE_X_CONTACT and c[0] <= EPS and c[1] <= EPS):
                    rej['contact'] += 1
                    continue
                m = dict(mass)
                m['left' if x + dims[0] / 2.0 < L / 2.0 else 'right'] += float(items[j]['mass'])
                imb = abs(m['left'] - m['right']) / (m['left'] + m['right'])
                key = (-round(sum(c), 4), round(imb, 6), -y, z, x, rank)
                if best_key is None or key < best_key:
                    best, best_key = ((x, y, z) + dims, r), key
        outcome = {'item': j, 'placed': best is not None, 'feasible_positions': n_feasible,
                   'rejections': dict(rej)}
        if best is not None:
            placements[j], orientations[j] = list(best[0]), best[1]
            outcome['side_contact_cm2'] = -best_key[0]
            placed_now += 1
        stats['boxes'].append(outcome)
        for c, n in rej.items():
            stats['rejections'][c] = stats['rejections'].get(c, 0) + n
    unpacked[:] = [b for b in unpacked if b not in placements]
    return placed_now


# -- Step B: light compaction -----------------------------------------------------
def _compact(placements, orientations, items, container, stats):
    moved_any = False
    for _ in range(COMPACTION_PASSES):
        stats['compaction']['passes'] += 1
        ids = sorted(placements, key=int)
        gaps = face_gaps(placements, container)
        clusters = build_support_clusters(placements)
        clusters.sort(key=lambda c: (-max(max(gaps[i]['x-'], gaps[i]['x+']) for i in c), min(c)))
        moved = False
        for cl in clusters:
            d_min, d_max = compute_cluster_slack(cl, placements, container, ids)
            base = side_contact(placements, container)[0]
            trials = []
            for d in (d_min, d_max):
                if abs(d) <= EPS:
                    continue
                trial = {i: list(placements[i]) for i in placements}
                for i in cl:
                    trial[i][0] += d
                gain = side_contact(trial, container)[0] - base
                if gain > EPS:
                    trials.append((-gain, abs(d), d, trial))
            trials.sort(key=lambda t: t[:3])
            for neg_gain, _, d, trial in trials:
                csr, _ = evaluate_constraints(trial, items, orientations)
                if csr < 100.0:
                    stats['compaction']['undone'] += 1
                    continue
                for i in cl:
                    placements[i] = trial[i]
                stats['compaction']['moves'] += 1
                stats['compaction']['gain_cm2'] = round(stats['compaction']['gain_cm2'] - neg_gain, 4)
                moved = moved_any = True
                break
        if not moved:
            break
    return moved_any


# -- Driver -----------------------------------------------------------------------
def _snapshot(placements, container, items):
    touch, total = side_contact(placements, container)
    return {'placed': len(placements),
            'side_contact_ratio': round(touch / total, 6) if total > 0 else None,
            **{k: v for k, v in edge_indicators(placements, container, items).items()
               if k in ('isolated_boxes', 'one_side_boxes', 'lateral_gaps_fillable',
                        'lateral_gaps_dunnage')}}


def repair_R4_edge_fill(placements, orientations, unpacked, items, container,
                        compaction=True):
    """Mutates placements / orientations / unpacked in place. Returns stats.
    The input must already be feasible (it is REP's repaired final arrangement)."""
    t0 = time.perf_counter()
    stats = {'before': _snapshot(placements, container, items),
             'placed_A': 0, 'placed_A2': 0, 'boxes': [], 'rejections': {},
             'compaction': {'passes': 0, 'moves': 0, 'undone': 0, 'gain_cm2': 0.0}}
    if placements:
        tau = smallest_box_dimension(items)
        stats['placed_A'] = _fill_pass(placements, orientations, unpacked, items, container,
                                       tau, stats)
        if compaction and _compact(placements, orientations, items, container, stats):
            stats['placed_A2'] = _fill_pass(placements, orientations, unpacked, items,
                                            container, tau, stats)
        csr, _ = evaluate_constraints(placements, items, orientations)
        if csr != 100.0:
            raise AssertionError(
                f"R4 left S(X_feas) = {csr:.4f}, expected 100.0: "
                f"edge-fill checks have drifted from evaluate_constraints")
    stats['after'] = _snapshot(placements, container, items)
    stats['time_ms'] = round((time.perf_counter() - t0) * 1000.0, 1)
    return stats
