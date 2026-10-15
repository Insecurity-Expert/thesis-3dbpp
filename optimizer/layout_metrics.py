"""Chapter 3 supporting descriptive indicators M-6 (gap) and M-7 (load distribution).

Both are computed from the box dimensions and positions of one arrangement only.
They are descriptive: they are NOT compared measures and do not enter the
hypothesis family. The tool (T-06 to T-08) and the manuscript must use these
exact definitions, so both call this module.

Axes (pipeline convention): x across the truck, extent container['L'] (233 cm);
y along the length, extent container['W'] (587 cm); z height, extent
container['H'] (220 cm). A placement is (x, y, z, dx, dy, dz), its corner with
the smallest x, y and z. Neither indicator depends on where y = 0 is, so they
are unchanged by the D1 origin change.

M-6 Gap. For each placed box i and each of its six faces, the face gap is the
distance in cm from that face to the nearest box face or container wall that
lies beyond it and overlaps the face in the other two axes with positive area
(0 when they touch). Per run: mean face gap, largest face gap, and the number
of significant face gaps, a face gap being significant when it is >= the
smallest box dimension in the instance (all boxes, placed or not).

M-7 Load distribution. Width split at x = L/2: a box goes to the left half when
its centre x < L/2, otherwise right. Per half: box count and total mass;
left-right mass imbalance = |m_left - m_right| / (m_left + m_right) x 100
(0 when nothing is loaded). Height split into three equal bands by centre z:
lower [0, H/3), middle [H/3, 2H/3), upper [2H/3, H]. Per band: count and mass.
"""
import numpy as np

# Face directions: (axis, sign). axis 0 = x, 1 = y, 2 = z.
FACES = ((0, -1), (0, +1), (1, -1), (1, +1), (2, -1), (2, +1))
FACE_NAMES = ("x-", "x+", "y-", "y+", "z-", "z+")
BANDS = ("lower", "middle", "upper")


def _ov(a0, a1, b0, b1):
    return max(0.0, min(a1, b1) - max(a0, b0))


def smallest_box_dimension(items):
    return float(min(min(b['l'], b['w'], b['h']) for b in items))


def face_gaps(placements, container):
    """{box_id: {face_name: gap_cm}} for every placed box."""
    ext = (float(container['L']), float(container['W']), float(container['H']))
    ids = sorted(placements, key=lambda k: int(k))
    P = {i: [float(v) for v in placements[i]] for i in ids}
    out = {}
    for i in ids:
        lo = P[i][:3]
        hi = [P[i][a] + P[i][3 + a] for a in range(3)]
        gaps = {}
        for (ax, sgn), name in zip(FACES, FACE_NAMES):
            o1, o2 = [a for a in range(3) if a != ax]
            best = (ext[ax] - hi[ax]) if sgn > 0 else lo[ax]          # the wall
            for j in ids:
                if j == i:
                    continue
                q = P[j]
                qlo = q[:3]
                qhi = [q[a] + q[3 + a] for a in range(3)]
                if _ov(lo[o1], hi[o1], qlo[o1], qhi[o1]) <= 0 or _ov(lo[o2], hi[o2], qlo[o2], qhi[o2]) <= 0:
                    continue
                d = qlo[ax] - hi[ax] if sgn > 0 else lo[ax] - qhi[ax]
                if d >= -1e-9 and d < best:                             # beyond the face
                    best = max(0.0, d)
            gaps[name] = max(0.0, best)
        out[i] = gaps
    return out


def gap_metrics(placements, container, items):
    """M-6 per run."""
    thr = smallest_box_dimension(items)
    if not placements:
        return {"mean_gap_cm": None, "max_gap_cm": None, "significant_gaps": 0,
                "significant_threshold_cm": thr, "n_faces": 0}
    vals = [g for faces in face_gaps(placements, container).values() for g in faces.values()]
    return {"mean_gap_cm": round(float(np.mean(vals)), 4),
            "max_gap_cm": round(float(np.max(vals)), 4),
            "significant_gaps": int(sum(1 for g in vals if g >= thr - 1e-9)),
            "significant_threshold_cm": thr,
            "n_faces": len(vals)}


def load_distribution(placements, container, items):
    """M-7 per run."""
    L, H = float(container['L']), float(container['H'])
    # Placement keys are indexes into `items` (as in thesis_metrics.evaluate_constraints).
    half = {"left": [0, 0.0], "right": [0, 0.0]}
    band = {b: [0, 0.0] for b in BANDS}
    for k, p in placements.items():
        k = int(k)
        m = float(items[k]['mass'])
        x, _, z, dx, _, dz = (float(v) for v in p)
        side = "left" if x + dx / 2.0 < L / 2.0 else "right"
        half[side][0] += 1
        half[side][1] += m
        cz = z + dz / 2.0
        b = "lower" if cz < H / 3.0 else ("middle" if cz < 2.0 * H / 3.0 else "upper")
        band[b][0] += 1
        band[b][1] += m
    tot = half["left"][1] + half["right"][1]
    imb = abs(half["left"][1] - half["right"][1]) / tot * 100.0 if tot > 0 else 0.0
    return {"left_count": half["left"][0], "left_mass": round(half["left"][1], 4),
            "right_count": half["right"][0], "right_mass": round(half["right"][1], 4),
            "lr_mass_imbalance_pct": round(imb, 4),
            **{f"{b}_count": band[b][0] for b in BANDS},
            **{f"{b}_mass": round(band[b][1], 4) for b in BANDS}}


def layout_indicators(placements, container, items):
    return {"gap": gap_metrics(placements, container, items),
            "load_distribution": load_distribution(placements, container, items)}
