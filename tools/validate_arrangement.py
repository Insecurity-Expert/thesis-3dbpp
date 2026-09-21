"""Independent physical validator for a finished container arrangement.

Written from the Chapter 3 constraint definitions. It deliberately imports
NOTHING from optimizer/ (thesis_metrics, geometry_3d, repair): a checker that
shares code with the evaluator can only agree with itself.

Convention (Chapter 3): x = length in [0, L), y = depth in [0, W) with the
door at y = 0, z = height in [0, H) with the floor at z = 0.

Orientation codes (preprocessing/loader.py, the documented encoding):
    1: h vertical, l along x, w along y      -> (dx, dy, dz) = (l, w, h), LBS = lbs_h
    2: h vertical, w along x, l along y      -> (w, l, h),                 lbs_h
    3: w vertical, l along x, h along y      -> (l, h, w),                 lbs_w
    4: w vertical, h along x, l along y      -> (h, l, w),                 lbs_w
    5: l vertical, w along x, h along y      -> (w, h, l),                 lbs_l
    6: l vertical, h along x, w along y      -> (h, w, l),                 lbs_l

Input JSON (one arrangement):
    { "container": {"L","W","H"},
      "boxes":     [ {id, l, w, h, mass, lbs_l, lbs_w, lbs_h, fragile, stop, allowed_orientations}, ... ],
      "placements": { "<box index>": [x, y, z, dx, dy, dz], ... },
      "orientations": { "<box index>": code, ... } }

Usage:
    python tools/validate_arrangement.py arrangement.json [--verbose]
"""
import json
import sys
import argparse

TOL = 1e-5
SUPPORT = 0.80

DIMS = {
    1: lambda l, w, h: (l, w, h),
    2: lambda l, w, h: (w, l, h),
    3: lambda l, w, h: (l, h, w),
    4: lambda l, w, h: (h, l, w),
    5: lambda l, w, h: (w, h, l),
    6: lambda l, w, h: (h, w, l),
}
VERTICAL_LBS = {1: 'lbs_h', 2: 'lbs_h', 3: 'lbs_w', 4: 'lbs_w', 5: 'lbs_l', 6: 'lbs_l'}


def _ov(a0, a1, b0, b1):
    """Overlap length of [a0,a1) and [b0,b1); 0 when they merely touch."""
    return max(0.0, min(a1, b1) - max(a0, b0))


def validate(container, boxes, placements, orientations, verbose=False):
    L, W, H = float(container['L']), float(container['W']), float(container['H'])
    ids = sorted(placements)
    P = {i: tuple(float(v) for v in placements[i]) for i in ids}
    n = len(ids)

    per_box = {i: {} for i in ids}
    issues = []

    # -- geometry consistency: dims must be the box turned by its orientation code
    for i in ids:
        b = boxes[i]
        r = int(orientations[i])
        if r not in DIMS or r not in b['allowed_orientations']:
            per_box[i]['orient'] = False
            issues.append(f"box {i}: orientation {r} not allowed {b['allowed_orientations']}")
            continue
        ex = DIMS[r](float(b['l']), float(b['w']), float(b['h']))
        got = P[i][3:6]
        ok = all(abs(a - c) < TOL for a, c in zip(ex, got))
        per_box[i]['orient'] = ok
        if not ok:
            issues.append(f"box {i}: dims {got} != orientation {r} of (l,w,h)=({b['l']},{b['w']},{b['h']}) -> {ex}")

    # -- C1: inside the container
    for i in ids:
        x, y, z, dx, dy, dz = P[i]
        ok = (x >= -TOL and y >= -TOL and z >= -TOL and
              x + dx <= L + TOL and y + dy <= W + TOL and z + dz <= H + TOL)
        per_box[i]['C1'] = ok
        if not ok:
            issues.append(f"C1 box {i}: {P[i]} outside {L}x{W}x{H}")

    # -- C2: pairwise non-overlap (touching faces are fine)
    for i in ids:
        per_box[i]['C2'] = True
    for a in range(n):
        i = ids[a]
        xi, yi, zi, dxi, dyi, dzi = P[i]
        for b_ in range(a + 1, n):
            j = ids[b_]
            xj, yj, zj, dxj, dyj, dzj = P[j]
            if (_ov(xi, xi + dxi, xj, xj + dxj) > TOL and
                    _ov(yi, yi + dyi, yj, yj + dyj) > TOL and
                    _ov(zi, zi + dzi, zj, zj + dzj) > TOL):
                per_box[i]['C2'] = per_box[j]['C2'] = False
                issues.append(f"C2 boxes {i} and {j} overlap")

    # -- helpers on the arrangement
    def above(i):
        """Boxes anywhere above i within i's xy footprint."""
        xi, yi, zi, dxi, dyi, dzi = P[i]
        out = []
        for j in ids:
            if j == i:
                continue
            xj, yj, zj, dxj, dyj, dzj = P[j]
            if zj >= zi + dzi - TOL and _ov(xi, xi + dxi, xj, xj + dxj) > 0 and _ov(yi, yi + dyi, yj, yj + dyj) > 0:
                out.append(j)
        return out

    def doorward_blockers(i):
        """Boxes entirely between i and the door (y=0) whose xz projection overlaps i's."""
        xi, yi, zi, dxi, dyi, dzi = P[i]
        out = []
        for j in ids:
            if j == i:
                continue
            xj, yj, zj, dxj, dyj, dzj = P[j]
            if yj + dyj <= yi + TOL and _ov(xi, xi + dxi, xj, xj + dxj) > 0 and _ov(zi, zi + dzi, zj, zj + dzj) > 0:
                out.append(j)
        return out

    # -- C3, C4, C5, C6 per box
    for i in ids:
        b = boxes[i]
        x, y, z, dx, dy, dz = P[i]
        ab = above(i)

        # C3: load on the top face vs the vertical face's LBS (a pressure) x area
        r = int(orientations[i])
        cap = float(b[VERTICAL_LBS.get(r, 'lbs_h')]) * dx * dy
        load = sum(float(boxes[j]['mass']) for j in ab)
        per_box[i]['C3'] = load <= cap + TOL
        if not per_box[i]['C3']:
            issues.append(f"C3 box {i}: load {load:.3f} > capacity {cap:.3f} (lbs {b[VERTICAL_LBS.get(r,'lbs_h')]} x {dx}x{dy}) from {ab}")

        # C4: nothing anywhere above a fragile box
        per_box[i]['C4'] = not (int(b['fragile']) == 1 and len(ab) > 0)
        if not per_box[i]['C4']:
            issues.append(f"C4 fragile box {i} has {ab} above it")

        # C5: on the floor, or >= 80% of the base rests on coplanar top faces
        if abs(z) < TOL:
            per_box[i]['C5'] = True
        else:
            area = 0.0
            for j in ids:
                if j == i:
                    continue
                xj, yj, zj, dxj, dyj, dzj = P[j]
                if abs((zj + dzj) - z) < TOL:
                    area += _ov(x, x + dx, xj, xj + dxj) * _ov(y, y + dy, yj, yj + dyj)
            ratio = area / (dx * dy) if dx * dy > 0 else 0.0
            per_box[i]['C5'] = ratio >= SUPPORT - 1e-12
            if not per_box[i]['C5']:
                issues.append(f"C5 box {i}: support {ratio:.3f} < {SUPPORT}")

        # C6: no later-stop box above i, or between i and the door
        s = int(b['stop'])
        later_above = [j for j in ab if int(boxes[j]['stop']) > s]
        later_door = [j for j in doorward_blockers(i) if int(boxes[j]['stop']) > s]
        per_box[i]['C6'] = not (later_above or later_door)
        if not per_box[i]['C6']:
            issues.append(f"C6 box {i} (stop {s}): later-stop above {later_above}, doorward {later_door}")

    keys = ('C1', 'C2', 'C3', 'C4', 'C5', 'C6')
    pct = {k: (100.0 * sum(per_box[i][k] for i in ids) / n if n else 0.0) for k in keys}
    pct['all'] = 100.0 * sum(all(per_box[i][k] for k in keys) for i in ids) / n if n else 0.0
    pct['orient'] = 100.0 * sum(per_box[i].get('orient', False) for i in ids) / n if n else 0.0
    return {'n_placed': n, 'pct': pct, 'issues': issues, 'per_box': per_box if verbose else None}


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('arrangement')
    p.add_argument('--verbose', action='store_true')
    a = p.parse_args()
    d = json.load(open(a.arrangement, encoding='utf-8'))
    placements = {int(k): v for k, v in d['placements'].items()}
    orientations = {int(k): v for k, v in d['orientations'].items()}
    res = validate(d['container'], d['boxes'], placements, orientations, verbose=a.verbose)
    print(json.dumps({k: v for k, v in res.items() if k != 'per_box'}, indent=1))
    sys.exit(0 if res['pct']['all'] == 100.0 else 1)


if __name__ == '__main__':
    main()
