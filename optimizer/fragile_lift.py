"""
R5 fragile lift (Repair-Based hybrid only): move fragile boxes up onto the tops
of stacks and give the floor they free to boxes the search left out.

Why. Nothing may rest on a fragile box (C4), so the column from its top face to
the roof is dead space. REP often leaves fragile boxes on the floor lying flat,
which locks up about a third of the truck (docs/R5_FRAGILE_LIFT.md). The boxes
it leaves out are heavy and need the floor, so neither the per-wolf
re-insertion nor R4 can add them: the floor is taken by the fragile boxes.

When. Once, on the arrangement REP returns, never per wolf, and BEFORE R4: R5
changes which boxes are where and R4 then tidies the result. The search, the
archive, the leader selection and the RNG are untouched; R5 draws nothing from
the RNG and every sort key is total, so the same input gives the same output.

Dead volume. top_area x (H - top_z) of a placed fragile box; the arrangement's
dead volume is the sum over its placed fragile boxes (layout_metrics).

The move, per fragile box f, starting with the largest dead volume (ties by
index), for up to PASSES passes or until a pass accepts nothing:
  1. save the state and remove f (this cannot create a violation: nothing rests
     on a fragile box and removing a box only relieves C6 blocking);
  2. fill: try the unpacked non-fragile boxes, heaviest first (ties: larger
     volume, then index), at the extreme points plus the corners of the space f
     freed; keep the feasible position with the lowest z, then the most side
     contact, then DBLF order;
  3. re-place f, and then the unpacked fragile boxes, at the feasible position
     (any allowed orientation) with the smallest dead volume, then the most
     side contact, then DBLF order. That is usually on top of a stack and, where
     allowed, standing on end;
  4. accept only if every box placed before is still placed (no cargo dropped
     to make room), evaluate_constraints is still 100 %, and (SU, -dead volume)
     is strictly better; otherwise restore the saved state.
Feasibility is the R2 kernel (C1-C6 in both directions), so a moved or added
box can neither violate a constraint nor create one for a box already placed.
Only allowed_orientations are used.

The arrangement is feasible by construction: S(X_feas) == 100 is asserted at
the end, as in repair.py and edge_fill.py.
"""
import time
from collections import Counter

import numpy as np

from geometry_3d import get_dims
from layout_metrics import (contact_areas, edge_indicators, fragile_dead_volume,
                            fragile_indicators)
from repair import R2_CHECK, rebuild_extreme_points, feasible_candidates
from thesis_metrics import evaluate_constraints

PASSES = 3
EPS = 1e-6


def _volume(items, j):
    b = items[j]
    return b['l'] * b['w'] * b['h']


def _array(placements):
    if not placements:
        return np.zeros((0, 6))
    return np.array([[float(v) for v in p] for p in placements.values()])


def _packed(placements):
    return sum(p[3] * p[4] * p[5] for p in placements.values())


def _snapshot(placements, container, items):
    vol = float(container['L']) * float(container['W']) * float(container['H'])
    fr = fragile_indicators(placements, container, items)
    edge = edge_indicators(placements, container, items)
    return {'placed': len(placements),
            'su_pct': round(_packed(placements) / vol * 100.0, 4),
            'fragile_on_floor': fr['fragile_on_floor'],
            'dead_volume_m3': fr['fragile_dead_volume_m3'],
            'dead_volume_pct': fr['fragile_dead_volume_pct'],
            'isolated_boxes': edge['isolated_boxes'],
            'one_side_boxes': edge['one_side_boxes']}


def _best_position(j, ctx_eps, extra, placements, orientations, items, container, rej, key_fn):
    """Best feasible (pos, r, key) for box j over its allowed orientations, or None.
    ctx_eps: (k, 3) extreme points; extra(dims) -> (m, 3) more corners or None;
    key_fn(pos, dims, contact, rank) -> sort key (smaller is better)."""
    L, W, H = (float(container[k]) for k in ('L', 'W', 'H'))
    P = _array(placements)
    best = None
    for rank, r in enumerate(items[j]['allowed_orientations']):
        dims = tuple(float(v) for v in get_dims(items[j], r))
        C = np.asarray(ctx_eps, dtype=float).reshape(-1, 3)
        more = extra(dims) if extra is not None else None
        if more is not None and len(more):
            C = np.vstack([C, more])
        C = C[(C[:, 0] >= 0) & (C[:, 1] >= 0) & (C[:, 2] >= 0) &
              (C[:, 0] + dims[0] <= L + EPS) & (C[:, 1] + dims[1] <= W + EPS) &
              (C[:, 2] + dims[2] <= H + EPS)]
        if len(C) == 0:
            continue
        C = np.unique(C, axis=0)
        for k in feasible_candidates(j, r, C, items, placements, orientations, container,
                                     check=R2_CHECK, reject=rej):
            x, y, z = (float(v) for v in C[k])
            contact = sum(contact_areas((x, y, z) + dims, P, L, W))
            key = key_fn((x, y, z), dims, contact, rank)
            if best is None or key < best[2]:
                best = ((x, y, z) + dims, r, key)
    return best


def _try_move(f, placements, orientations, unpacked, items, container, stats):
    """One lift attempt for fragile box f. Returns True if the move was kept."""
    H = float(container['H'])
    saved = ({k: list(v) for k, v in placements.items()}, dict(orientations), list(unpacked))
    before_ids = set(placements)
    su0 = _packed(placements)
    dead0 = fragile_dead_volume(placements, container, items)
    old = list(placements[f])
    old_r = orientations[f]
    stats['moves_tried'] += 1
    rej = Counter()

    del placements[f]
    orientations.pop(f, None)
    fx, fy, fz, fdx, fdy, _ = old

    def freed(dims):
        dx, dy, dz = dims
        xs = {fx, fx + fdx - dx}
        ys = {fy, fy + fdy - dy}
        return np.array([(x, y, fz) for x in sorted(xs) for y in sorted(ys)], dtype=float)

    # 2. fill the freed space with the heaviest unpacked non-fragile boxes
    fill = sorted((j for j in unpacked if j not in placements and items[j]['fragile'] != 1),
                  key=lambda j: (-float(items[j]['mass']), -_volume(items, j), j))
    added = []
    for j in fill:
        eps = rebuild_extreme_points(placements, container)
        got = _best_position(
            j, eps, freed, placements, orientations, items, container, rej,
            lambda pos, dims, c, rank: (pos[2], -round(c, 4), -pos[1], pos[0], rank))
        if got is not None:
            placements[j], orientations[j] = list(got[0]), got[1]
            added.append(j)

    # 3. re-place f, then the unpacked fragile boxes, with the least dead volume
    def lowest_dead(pos, dims, c, rank):
        return (round(dims[0] * dims[1] * (H - pos[2] - dims[2]), 4),
                -round(c, 4), -pos[1], pos[2], pos[0], rank)

    pending = [f] + sorted((j for j in unpacked if j not in placements and items[j]['fragile'] == 1),
                           key=lambda j: (-float(items[j]['mass']), -_volume(items, j), j))
    for j in pending:
        eps = rebuild_extreme_points(placements, container)
        got = _best_position(j, eps, None, placements, orientations, items, container, rej,
                             lowest_dead)
        if got is not None:
            placements[j], orientations[j] = list(got[0]), got[1]
            if j != f:
                added.append(j)

    for c, n in rej.items():
        stats['rejections'][c] = stats['rejections'].get(c, 0) + n

    # 4. accept only an improvement that drops no cargo and keeps every rule
    reason = None
    if not before_ids <= set(placements):
        reason = 'dropped_cargo'
    else:
        csr, _ = evaluate_constraints(placements, items, orientations)
        if csr != 100.0:
            reason = 'constraints'
        else:
            su1 = _packed(placements)
            dead1 = fragile_dead_volume(placements, container, items)
            better = su1 > su0 + 1e-6 or (abs(su1 - su0) <= 1e-6 and dead1 < dead0 - 1e-6)
            if not better:
                reason = 'not_better'
    if reason is not None:
        placements.clear()
        placements.update(saved[0])
        orientations.clear()
        orientations.update(saved[1])
        unpacked[:] = saved[2]
        stats['move_rejections'][reason] = stats['move_rejections'].get(reason, 0) + 1
        return False

    unpacked[:] = [b for b in unpacked if b not in placements]
    stats['moves_accepted'] += 1
    stats['boxes_added'] += added
    new = placements[f]
    if orientations[f] != old_r or any(abs(a - b) > EPS for a, b in zip(new, old)):
        dead = lambda p: round(p[3] * p[4] * (H - p[2] - p[5]) / 1e6, 4)
        stats['fragile_lifted'].append({'item': f, 'old_z': old[2], 'new_z': new[2],
                                        'old_top_z': old[2] + old[5], 'new_top_z': new[2] + new[5],
                                        'stood_on_end': orientations[f] != old_r,
                                        'dead_m3': [dead(old), dead(new)]})
    return True


def repair_R5_fragile_lift(placements, orientations, unpacked, items, container):
    """Mutates placements / orientations / unpacked in place. Returns stats.
    The input must already be feasible (it is REP's repaired final arrangement)."""
    t0 = time.perf_counter()
    stats = {'before': _snapshot(placements, container, items),
             'moves_tried': 0, 'moves_accepted': 0, 'passes': 0,
             'boxes_added': [], 'fragile_lifted': [],
             'rejections': {}, 'move_rejections': {}}
    H = float(container['H'])
    for _ in range(PASSES):
        stats['passes'] += 1
        order = sorted((k for k in placements if items[k]['fragile'] == 1),
                       key=lambda k: (-placements[k][3] * placements[k][4]
                                      * (H - placements[k][2] - placements[k][5]), k))
        accepted = False
        for f in order:
            if f not in placements:
                continue
            if H - placements[f][2] - placements[f][5] <= EPS:
                continue                       # nothing locked above it
            accepted |= _try_move(f, placements, orientations, unpacked, items, container, stats)
        if not accepted:
            break
    if placements:
        csr, _ = evaluate_constraints(placements, items, orientations)
        if csr != 100.0:
            raise AssertionError(
                f"R5 left S(X_feas) = {csr:.4f}, expected 100.0: "
                f"fragile-lift checks have drifted from evaluate_constraints")
    stats['after'] = _snapshot(placements, container, items)
    stats['time_ms'] = round((time.perf_counter() - t0) * 1000.0, 1)
    return stats
