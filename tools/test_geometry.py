"""Step 3 acceptance: hand-checkable geometry and constraint cases.

Canonical convention under test:
    x = length in [0, L)
    y = depth  in [0, W)   y = 0 IS the door face
    z = height in [0, H)   z = 0 is the floor, gravity along -z

Run:  python tools/test_geometry.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'optimizer'))

import numpy as np
from geometry_3d import (get_dims, vertical_lbs, place_container_dblf,
                         is_supported, fragile_below)
from thesis_math import decode_position
from thesis_metrics import evaluate_constraints, validate_items
from repair import repair_arrangement, find_feasible_position

CONTAINER = {'L': 100, 'W': 100, 'H': 100}

_passed = 0
_failed = []


def check(name, got, want):
    global _passed
    if got == want:
        _passed += 1
        print(f"  PASS  {name}")
    else:
        _failed.append(name)
        print(f"  FAIL  {name}: got {got!r}, want {want!r}")


def raises(name, fn, exc=ValueError):
    global _passed
    try:
        fn()
    except exc:
        _passed += 1
        print(f"  PASS  {name}")
    else:
        _failed.append(name)
        print(f"  FAIL  {name}: expected {exc.__name__}")


_box_counter = [0]

def box(l, w, h, mass=1.0, lbs=1.0, fragile=0, stop=1, allowed=None):
    """A box with every required physics field present."""
    _box_counter[0] += 1
    return {
        'id': _box_counter[0], 'type_id': _box_counter[0],
        'l': l, 'w': w, 'h': h,
        'mass': mass,
        'lbs_l': lbs, 'lbs_w': lbs, 'lbs_h': lbs,
        'allowed_orientations': allowed if allowed is not None else [1, 2, 3, 4, 5, 6],
        'fragile': fragile,
        'stop': stop,
    }


def evaluate(boxes, placements):
    """placements: {idx: (x, y, z, dx, dy, dz)}; all boxes in orientation 1."""
    validate_items(boxes)
    orientations = {i: 1 for i in placements}
    return evaluate_constraints(placements, boxes, orientations)[1]


# ── get_dims: the documented table, code by code ──────────────────────────────
print("\n[get_dims] l=2, w=3, h=5 -> (dx, dy, dz)")
b = box(2, 3, 5)
check("code 1 (h vertical)", get_dims(b, 1), (2, 3, 5))
check("code 2 (h vertical)", get_dims(b, 2), (3, 2, 5))
check("code 3 (w vertical)", get_dims(b, 3), (2, 5, 3))
check("code 4 (w vertical)", get_dims(b, 4), (5, 2, 3))
check("code 5 (l vertical)", get_dims(b, 5), (3, 5, 2))
check("code 6 (l vertical)", get_dims(b, 6), (5, 3, 2))
raises("code 0 raises", lambda: get_dims(b, 0))
raises("code 7 raises", lambda: get_dims(b, 7))
raises("disallowed code raises", lambda: get_dims(box(2, 3, 5, allowed=[1]), 2))

print("\n[vertical_lbs] which face bears the load")
b2 = box(2, 3, 5)
b2['lbs_l'], b2['lbs_w'], b2['lbs_h'] = 0.10, 0.20, 0.30
check("code 1 -> lbs_h", vertical_lbs(b2, 1), 0.30)
check("code 2 -> lbs_h", vertical_lbs(b2, 2), 0.30)
check("code 3 -> lbs_w", vertical_lbs(b2, 3), 0.20)
check("code 4 -> lbs_w", vertical_lbs(b2, 4), 0.20)
check("code 5 -> lbs_l", vertical_lbs(b2, 5), 0.10)
check("code 6 -> lbs_l", vertical_lbs(b2, 6), 0.10)

# ── C5: the axis bug this step exists to fix ──────────────────────────────────
print("\n[C5 stability] floor is z == 0, NOT y == 0")
# On the floor but far from the door, and off-origin in x: must pass.
d = evaluate([box(10, 10, 10)], {0: (50, 90, 0, 10, 10, 10)})
check("z=0 at x=50,y=90 passes C5", d['C5_balance_pct'], 100.0)

# At the door (y=0) but floating at z=40 with nothing under it: must FAIL.
# Under the old y-vertical code this passed, because y==0 read as "on the floor".
d = evaluate([box(10, 10, 10)], {0: (0, 0, 40, 10, 10, 10)})
check("y=0 floating at z=40 fails C5", d['C5_balance_pct'], 0.0)

# Fully supported by a box directly beneath -> passes.
boxes = [box(10, 10, 10), box(10, 10, 10)]
d = evaluate(boxes, {0: (0, 0, 0, 10, 10, 10),
                     1: (0, 0, 10, 10, 10, 10)})
check("fully supported stack passes C5", d['C5_balance_pct'], 100.0)

# Only 25% overlap -> below the 80% threshold -> upper box fails.
boxes = [box(10, 10, 10), box(10, 10, 10)]
d = evaluate(boxes, {0: (0, 0, 0, 10, 10, 10),
                     1: (5, 5, 10, 10, 10, 10)})
check("25% support fails C5 (1 of 2 boxes ok)", d['C5_balance_pct'], 50.0)

# ── C4: fragility ─────────────────────────────────────────────────────────────
print("\n[C4 fragility] nothing may rest on a fragile box")
boxes = [box(10, 10, 10, fragile=1), box(10, 10, 10)]
d = evaluate(boxes, {0: (0, 0, 0, 10, 10, 10),
                     1: (0, 0, 10, 10, 10, 10)})
check("box above fragile violates C4", d['C4_fragility_pct'], 50.0)

# Beside, not above -> no violation.
boxes = [box(10, 10, 10, fragile=1), box(10, 10, 10)]
d = evaluate(boxes, {0: (0, 0, 0, 10, 10, 10),
                     1: (20, 0, 0, 10, 10, 10)})
check("box beside fragile passes C4", d['C4_fragility_pct'], 100.0)

# ── C3: load is a pressure, so capacity = lbs * top-face area ─────────────────
print("\n[C3 load-bearing] capacity = vertical_lbs * dx * dy")
# Bottom box: 10x10 top face = 100 cm2, lbs 1.0 -> capacity 100 kg. Load 50 kg.
boxes = [box(10, 10, 10, lbs=1.0), box(10, 10, 10, mass=50.0)]
d = evaluate(boxes, {0: (0, 0, 0, 10, 10, 10),
                     1: (0, 0, 10, 10, 10, 10)})
check("50kg on capacity-100kg passes C3", d['C3_weight_pct'], 100.0)

# Same geometry, 150 kg on top -> exceeds 100 kg capacity.
boxes = [box(10, 10, 10, lbs=1.0), box(10, 10, 10, mass=150.0)]
d = evaluate(boxes, {0: (0, 0, 0, 10, 10, 10),
                     1: (0, 0, 10, 10, 10, 10)})
check("150kg on capacity-100kg fails C3", d['C3_weight_pct'], 50.0)

# Realistic wtpack magnitudes: lbs 0.03365 * 100 cm2 = 3.365 kg capacity.
# A raw mass-vs-raw-LBS comparison would call this feasible; it is not.
boxes = [box(10, 10, 10, lbs=0.03365), box(10, 10, 10, mass=246.24)]
d = evaluate(boxes, {0: (0, 0, 0, 10, 10, 10),
                     1: (0, 0, 10, 10, 10, 10)})
check("246kg on wtpack-scale lbs fails C3", d['C3_weight_pct'], 50.0)

# ── C6: accessibility along the -y unloading corridor ─────────────────────────
print("\n[C6 accessibility] later stops must not block earlier ones")
# stop-2 box sits between the stop-1 box and the door (y=0) -> violation.
boxes = [box(10, 10, 10, stop=1), box(10, 10, 10, stop=2)]
d = evaluate(boxes, {0: (0, 20, 0, 10, 10, 10),
                     1: (0, 0, 0, 10, 10, 10)})
check("stop-2 doorward of stop-1 violates C6", d['C6_stop_order_pct'], 50.0)

# Reverse the stops: the doorward box is unloaded first -> fine.
boxes = [box(10, 10, 10, stop=2), box(10, 10, 10, stop=1)]
d = evaluate(boxes, {0: (0, 20, 0, 10, 10, 10),
                     1: (0, 0, 0, 10, 10, 10)})
check("stop-1 doorward of stop-2 passes C6", d['C6_stop_order_pct'], 100.0)

# A later stop stacked on top also blocks extraction.
boxes = [box(10, 10, 10, stop=1), box(10, 10, 10, stop=2)]
d = evaluate(boxes, {0: (0, 0, 0, 10, 10, 10),
                     1: (0, 0, 10, 10, 10, 10)})
check("stop-2 above stop-1 violates C6", d['C6_stop_order_pct'], 50.0)

# No xz overlap -> different lane, no obstruction.
boxes = [box(10, 10, 10, stop=1), box(10, 10, 10, stop=2)]
d = evaluate(boxes, {0: (0, 20, 0, 10, 10, 10),
                     1: (50, 0, 0, 10, 10, 10)})
check("stop-2 in another lane passes C6", d['C6_stop_order_pct'], 100.0)

# ── Part B: the genome is live ────────────────────────────────────────────────
print("\n[encoding] 2n random-key genome drives sequence and orientation")

_pb = [box(10, 10, 10, allowed=[1, 2]) for _ in range(4)]
_c = {'L': 100, 'W': 100, 'H': 100}

raises("wrong genome length raises",
       lambda: decode_position(np.zeros(4 * len(_pb)), _pb, _c))

# Ascending keys -> identity order; descending keys -> reversed order.
g_asc = np.concatenate([np.array([0.1, 0.2, 0.3, 0.4]), np.zeros(4)])
g_desc = np.concatenate([np.array([0.4, 0.3, 0.2, 0.1]), np.zeros(4)])
check("ascending keys -> identity sequence", decode_position(g_asc, _pb, _c)[0], [0, 1, 2, 3])
check("descending keys -> reversed sequence", decode_position(g_desc, _pb, _c)[0], [3, 2, 1, 0])

# Identical orientation genes, different keys -> different packings.
# Boxes are sized so they cannot all fit; order then decides who gets in.
_tight = [box(60, 60, 60, allowed=[1]), box(60, 60, 60, allowed=[1]),
          box(40, 40, 40, allowed=[1])]
_tc = {'L': 100, 'W': 100, 'H': 100}
o_same = np.zeros(3)
p_a, _, _, _, _ = place_container_dblf(
    decode_position(np.concatenate([np.array([0.1, 0.2, 0.3]), o_same]), _tight, _tc)[0],
    _tight, {i: 1 for i in range(3)}, _tc)
p_b, _, _, _, _ = place_container_dblf(
    decode_position(np.concatenate([np.array([0.3, 0.2, 0.1]), o_same]), _tight, _tc)[0],
    _tight, {i: 1 for i in range(3)}, _tc)
check("different keys, same orientations -> different packing", p_a != p_b, True)

# Sanity: a volume-descending sequence still packs sensibly without the old sort.
_mix = [box(20, 20, 20, allowed=[1]), box(80, 80, 80, allowed=[1]),
        box(50, 50, 50, allowed=[1])]
by_vol = sorted(range(3), key=lambda i: _mix[i]['l'] * _mix[i]['w'] * _mix[i]['h'],
                reverse=True)
pl, un, _, _, _ = place_container_dblf(by_vol, _mix, {i: 1 for i in range(3)}, _tc)
check("volume-descending sequence still packs", len(pl) >= 2, True)
check("volume-descending places the largest box", 1 in pl, True)

# DBLF must honour the given order, not re-sort it: feeding the big box last
# means the small ones take the deep corner first.
pl_rev, _, _, _, _ = place_container_dblf(list(reversed(by_vol)), _mix,
                                          {i: 1 for i in range(3)}, _tc)
check("sequence order changes the result (no internal re-sort)", pl != pl_rev, True)

# -- Part B (Step 5): relocate-then-defer repair ------------------------------
print("")
print("[repair] relocation is attempted before deferral")
_rc = {'L': 100, 'W': 100, 'H': 100}

# A box resting on a fragile box, with plenty of free floor: must be RELOCATED.
_b = [box(10, 10, 10, fragile=1, lbs=10.0), box(10, 10, 10, lbs=10.0)]
_pl = {0: (0, 0, 0, 10, 10, 10), 1: (0, 0, 10, 10, 10, 10)}
_or = {0: 1, 1: 1}
_un = []
st = repair_arrangement(_pl, _or, _un, _b, _rc)
check("R1 relocates rather than defers when space exists", st['relocated_R1'], 1)
check("R1 deferred nothing", st['deferred_R1'], 0)
check("both boxes still placed", len(_pl), 2)
check("relocated box now on the floor", _pl[1][2], 0)
check("post-repair S == 100", evaluate_constraints(_pl, _b, _or)[0], 100.0)

# Same violation in a container with NO free floor: must be DEFERRED.
_b2 = [box(100, 100, 10, fragile=1, lbs=10.0), box(10, 10, 10, lbs=10.0)]
_pl2 = {0: (0, 0, 0, 100, 100, 10), 1: (0, 0, 10, 10, 10, 10)}
_or2 = {0: 1, 1: 1}
_un2 = []
st2 = repair_arrangement(_pl2, _or2, _un2, _b2, _rc)
check("R1 defers when no feasible position exists", st2['deferred_R1'], 1)
check("deferred box lands in the unpacked list", _un2, [1])
check("fragile base box survives", 0 in _pl2, True)

# Overloaded stack: capacity 10 kg, two boxes above -> heaviest is moved first.
_b3 = [box(10, 10, 10, lbs=0.10), box(10, 10, 10, mass=8.0, lbs=10.0),
       box(10, 10, 10, mass=8.5, lbs=10.0)]
_pl3 = {0: (0, 0, 0, 10, 10, 10), 1: (0, 0, 10, 10, 10, 10), 2: (0, 0, 20, 10, 10, 10)}
_or3 = {0: 1, 1: 1, 2: 1}
_un3 = []
st3 = repair_arrangement(_pl3, _or3, _un3, _b3, _rc)
check("R2 acted on the overloaded stack", st3['relocated_R2'] + st3['deferred_R2'] >= 1, True)
check("heaviest box (2) no longer above box 0",
      2 not in _pl3 or _pl3[2][2] == 0 or _pl3[2][0] >= 10 or _pl3[2][1] >= 10, True)
check("post-repair S == 100 (overload)", evaluate_constraints(_pl3, _b3, _or3)[0], 100.0)

# find_feasible_position honours min_y (R4 uses it to push blockers deeper).
# A box spanning y in [0,60) creates an EP at y=60; min_y=50 must skip (0,0,0).
_b5 = [box(10, 60, 10), box(10, 10, 10)]
found = find_feasible_position(1, _b5, {0: (0, 0, 0, 10, 60, 10)}, {0: 1}, _rc, min_y=50)
check("min_y respected", found is not None and found[0][1] >= 50, True)
found0 = find_feasible_position(1, _b5, {0: (0, 0, 0, 10, 60, 10)}, {0: 1}, _rc)
check("without min_y the deepest EP (0,60,0) wins DBLF order", found0[0][:3], (0, 60, 0))

# -- Step 5.5 Part C: constraint-aware placement -------------------------------
print("")
print("[placement] C5 and C4 enforced at decode time")
_pc = {'L': 100, 'W': 100, 'H': 100}
_placed = [(0, 0, 0, 10, 10, 10)]           # one 10x10x10 box on the floor
check("floor is always supported", is_supported(50, 50, 0, 10, 10, []), True)
check("fully on top of a box -> supported", is_supported(0, 0, 10, 10, 10, _placed), True)
check("25% overhang (5,0) -> 50% support -> rejected", is_supported(5, 0, 10, 10, 10, _placed), False)
check("2 units overhang -> 80% support -> accepted", is_supported(2, 0, 10, 10, 10, _placed), True)
check("3 units overhang -> 70% support -> rejected", is_supported(3, 0, 10, 10, 10, _placed), False)
check("floating with nothing coplanar -> rejected", is_supported(0, 0, 50, 10, 10, _placed), False)

_frag = [(0, 0, 0, 10, 10, 10)]
check("directly above a fragile box -> rejected", fragile_below(0, 0, 10, 10, 10, _frag), True)
check("high above a fragile box (z=50) -> still rejected", fragile_below(0, 0, 50, 10, 10, _frag), True)
check("beside a fragile box -> allowed", fragile_below(20, 0, 0, 10, 10, _frag), False)
check("footprint grazing the edge (x=10) -> allowed", fragile_below(10, 0, 10, 10, 10, _frag), False)

# End-to-end: with enforce_fragility, DBLF must not stack on the fragile box
_eb = [box(10, 10, 10, fragile=1), box(10, 10, 10)]
pl, un, ors, _, _ = place_container_dblf([0, 1], _eb, {0: 1, 1: 1}, _pc,
                                         enforce_fragility=True)
d = evaluate_constraints(pl, _eb, ors)[1]
check("enforce_fragility -> C4 = 100 on a 2-box instance", d['C4_fragility_pct'], 100.0)
check("both boxes still placed (second went beside)", len(pl), 2)

# End-to-end: enforce_support must yield C5 = 100 by construction
_sb = [box(10, 10, 10) for _ in range(6)]
pl, un, ors, _, _ = place_container_dblf(list(range(6)), _sb, {i: 1 for i in range(6)}, _pc,
                                         enforce_support=True)
d = evaluate_constraints(pl, _sb, ors)[1]
check("enforce_support -> C5 = 100 by construction", d['C5_balance_pct'], 100.0)


# ── validate_items: refuses to invent physics ─────────────────────────────────
print("\n[validate_items] fabrication is impossible, not merely discouraged")
raises("missing mass raises", lambda: validate_items([{
    'l': 1, 'w': 1, 'h': 1, 'lbs_l': 1, 'lbs_w': 1, 'lbs_h': 1,
    'allowed_orientations': [1], 'fragile': 0, 'stop': 1}]))
raises("empty allowed_orientations raises",
       lambda: validate_items([box(1, 1, 1, allowed=[])]))

print(f"\n{'='*58}")
if _failed:
    print(f"FAILED {len(_failed)} / {_passed + len(_failed)}: {_failed}")
    sys.exit(1)
print(f"PASS - all {_passed} geometry/constraint checks")
