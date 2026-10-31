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

Edge indicators (descriptive, added with repair step R4; see edge_fill.py). They
describe how tightly the boxes sit against each other and the walls across the
truck width (x faces) and along its length (y faces). Contact means a gap of
exactly 0 over a positive area; a wall counts as a neighbour.
  isolated_boxes        placed boxes with a gap > 0 on BOTH x faces
  one_side_boxes        placed boxes touching on exactly one x face
  lateral_gaps_fillable x-face gaps >= tau (a box of the smallest dimension fits)
  lateral_gaps_dunnage  x-face gaps in (0, tau): only dunnage can fill them
  side_contact_ratio    share of the x- and y-face area that touches a wall or box
Each x face is counted separately, so a gap between two boxes appears twice.

Fragile indicators (descriptive, added with repair step R5; see fragile_lift.py).
Nothing may rest on a fragile box (C4), so the column from its top face to the
roof is dead space. The dead volume of a fragile box is top_area x (H - top_z).
  fragile_placed           placed boxes with fragile == 1
  fragile_on_floor         of those, the ones with z == 0
  fragile_dead_volume_m3   sum of the dead volumes, in m^3
  fragile_dead_volume_pct  the same as a share of the container volume
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


CONTACT_TOL = 1e-6


def contact_areas(box, others, L, W):
    """Area (cm^2) of the x-, x+, y-, y+ faces of `box` that touches a wall or one
    of `others` (an (m, 6) array of placements, `box` itself excluded)."""
    x, y, z, dx, dy, dz = (float(v) for v in box)
    x1, y1, z1 = x + dx, y + dy, z + dz
    fx, fy = dy * dz, dx * dz
    c = [fx if x <= CONTACT_TOL else 0.0, fx if x1 >= L - CONTACT_TOL else 0.0,
         fy if y <= CONTACT_TOL else 0.0, fy if y1 >= W - CONTACT_TOL else 0.0]
    if len(others):
        ox, oy, oz, odx, ody, odz = others.T
        ox1, oy1, oz1 = ox + odx, oy + ody, oz + odz
        ovx = np.clip(np.minimum(x1, ox1) - np.maximum(x, ox), 0.0, None)
        ovy = np.clip(np.minimum(y1, oy1) - np.maximum(y, oy), 0.0, None)
        ovz = np.clip(np.minimum(z1, oz1) - np.maximum(z, oz), 0.0, None)
        c[0] += float((ovy * ovz)[np.abs(ox1 - x) <= CONTACT_TOL].sum())
        c[1] += float((ovy * ovz)[np.abs(ox - x1) <= CONTACT_TOL].sum())
        c[2] += float((ovx * ovz)[np.abs(oy1 - y) <= CONTACT_TOL].sum())
        c[3] += float((ovx * ovz)[np.abs(oy - y1) <= CONTACT_TOL].sum())
    return c


def side_contact(placements, container):
    """(contact area, total face area) summed over the x and y faces of all boxes."""
    if not placements:
        return 0.0, 0.0
    L, W = float(container['L']), float(container['W'])
    P = np.array([[float(v) for v in p] for p in placements.values()])
    touch = total = 0.0
    for k in range(len(P)):
        touch += float(sum(contact_areas(P[k], np.delete(P, k, axis=0), L, W)))
        total += float(2.0 * (P[k, 4] * P[k, 5] + P[k, 3] * P[k, 5]))
    return touch, total


def edge_indicators(placements, container, items):
    """Descriptive edge-tightness indicators for one arrangement (see module doc)."""
    tau = smallest_box_dimension(items)
    out = {"significant_threshold_cm": tau, "isolated_boxes": 0, "one_side_boxes": 0,
           "lateral_gaps_fillable": {"count": 0, "total_cm": 0.0},
           "lateral_gaps_dunnage": {"count": 0, "total_cm": 0.0},
           "side_contact_ratio": None}
    if not placements:
        return out
    for faces in face_gaps(placements, container).values():
        gx = (faces["x-"], faces["x+"])
        touching = sum(1 for g in gx if g <= 1e-9)
        out["isolated_boxes"] += int(touching == 0)
        out["one_side_boxes"] += int(touching == 1)
        for g in gx:
            if g >= tau - 1e-9:
                bucket = out["lateral_gaps_fillable"]
            elif g > 1e-9:
                bucket = out["lateral_gaps_dunnage"]
            else:
                continue
            bucket["count"] += 1
            bucket["total_cm"] = round(bucket["total_cm"] + g, 4)
    touch, total = side_contact(placements, container)
    out["side_contact_ratio"] = round(touch / total, 6) if total > 0 else None
    return out


def fragile_dead_volume(placements, container, items):
    """Dead volume (cm^3) above the placed fragile boxes: top_area x (H - top_z)."""
    H = float(container['H'])
    total = 0.0
    for k, p in placements.items():
        if items[int(k)]['fragile'] == 1:
            _, _, z, dx, dy, dz = (float(v) for v in p)
            total += dx * dy * max(0.0, H - (z + dz))
    return total


def fragile_indicators(placements, container, items):
    """Descriptive fragile-box indicators for one arrangement (see module doc)."""
    placed = [int(k) for k in placements if items[int(k)]['fragile'] == 1]
    on_floor = sum(1 for k in placed if float(placements[k][2]) <= 1e-9)
    vol = float(container['L']) * float(container['W']) * float(container['H'])
    dead = fragile_dead_volume(placements, container, items)
    return {"fragile_placed": len(placed), "fragile_on_floor": int(on_floor),
            "fragile_dead_volume_m3": round(dead / 1e6, 4),
            "fragile_dead_volume_pct": round(dead / vol * 100.0, 4) if vol > 0 else 0.0}


def layout_indicators(placements, container, items):
    return {"gap": gap_metrics(placements, container, items),
            "load_distribution": load_distribution(placements, container, items),
            "edge": edge_indicators(placements, container, items),
            "fragile": fragile_indicators(placements, container, items)}
