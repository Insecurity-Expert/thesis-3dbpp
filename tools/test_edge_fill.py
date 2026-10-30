"""
test_edge_fill.py - Verification suite for repair step R4 (optimizer/edge_fill.py).

Checks:
1. A rejected box that fits a known sideways gap is placed flush against both
   sides, and the side-contact score goes up.
2. A rejected box whose only feasible position touches a single side is refused
   (the two-side rule); the same box with a two-side position is placed.
3. A position that would break C3, C4, C5 or C6 is never accepted, and each case
   has a control that proves the box WOULD have been placed without that defect.
4. Compaction moves a stack into contact and keeps CSR at 100 %; a move that
   would break C6 is undone.
5. R4 is deterministic: two runs on the same input give identical placements.
6. Instance 581, REP, seed 42, quick preset, R4 off vs. on: CSR stays 100 and
   the number of isolated boxes does not increase.

Usage:
    python tools/test_edge_fill.py
"""
import sys
import time
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
sys.path[:0] = [str(_ROOT), str(_ROOT / 'optimizer'), str(_ROOT / 'tools')]

from edge_fill import repair_R4_edge_fill
from layout_metrics import edge_indicators, side_contact
from thesis_metrics import evaluate_constraints
from geometry_3d import get_dims

FAILS = []


def check(cond, msg):
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond:
        FAILS.append(msg)


def box(l, w, h, mass=10.0, lbs=1.0, fragile=0, stop=1):
    return {'id': 'T', 'type_id': 0, 'l': float(l), 'w': float(w), 'h': float(h),
            'mass': float(mass), 'lbs_l': lbs, 'lbs_w': lbs, 'lbs_h': lbs,
            'fragile': fragile, 'stop': stop, 'allowed_orientations': [1]}


def run_r4(container, items, placed, unpacked, compaction=True):
    """placed: {idx: (x, y, z)}; every box in orientation 1."""
    pl = {i: [*xyz, *get_dims(items[i], 1)] for i, xyz in placed.items()}
    orr = {i: 1 for i in placed}
    csr, _ = evaluate_constraints(pl, items, orr)
    assert csr == 100.0, "test arrangement must start feasible"
    un = list(unpacked)
    stats = repair_R4_edge_fill(pl, orr, un, items, container, compaction=compaction)
    return pl, un, stats


def main():
    print("-- 1. Re-insertion into a known sideways gap -----------------------")
    tunnel = {'L': 100.0, 'W': 30.0, 'H': 30.0}
    items = [box(30, 30, 30), box(30, 30, 30), box(40, 30, 30)]
    pl0 = {0: [0.0, 0.0, 0.0, 30.0, 30.0, 30.0], 1: [70.0, 0.0, 0.0, 30.0, 30.0, 30.0]}
    pl, un, st = run_r4(tunnel, items, {0: (0, 0, 0), 1: (70, 0, 0)}, [2])
    check(2 in pl and pl[2][:3] == [30.0, 0.0, 0.0], f"box 2 placed flush in the gap at {pl.get(2)}")
    check(un == [], "box 2 removed from the unpacked list")
    check(side_contact(pl, tunnel)[0] > side_contact(pl0, tunnel)[0], "side-contact area went up")
    e_before, e_after = edge_indicators(pl0, tunnel, items), edge_indicators(pl, tunnel, items)
    check(e_before['one_side_boxes'] == 2 and e_after['one_side_boxes'] == 0
          and e_after['isolated_boxes'] == 0, "one-side boxes 2 -> 0, no isolated box")
    check(st['placed_A'] == 1 and st['boxes'][0]['placed'], "outcome recorded for the box")

    print("\n-- 2. Two-side rule ------------------------------------------------")
    grid = {'L': 90.0, 'W': 90.0, 'H': 60.0}

    def layer(strong, lbs_weak=0.001, fragile=(), stops=None, narrow=None):
        """3x3 floor layer of 30-cm cubes (index 3*row + col, col along x) and a
        rejected cube 9. Only the boxes in `strong` can bear it."""
        its, placed = [], {}
        for k in range(9):
            r, c = divmod(k, 3)
            w = 20 if (narrow == k) else 30
            its.append(box(w, 30, 30, lbs=1.0 if k in strong else lbs_weak,
                           fragile=1 if k in fragile else 0, stop=(stops or {}).get(k, 1)))
            placed[k] = (c * 30, r * 30, 0)
        its.append(box(30, 30, 30, stop=(stops or {}).get(9, 1)))
        return its, placed

    its, placed = layer(strong={1})            # only the edge-centre box (x=30, y=0) bears load
    pl, un, st = run_r4(grid, its, placed, [9])
    check(9 in un and 9 not in pl, "box whose only position touches one side (y- wall) is refused")
    check(evaluate_constraints(pl, its, {i: 1 for i in pl})[0] == 100.0, "CSR still 100")
    its, placed = layer(strong={0})            # corner box: wall x- and wall y-
    pl, un, st = run_r4(grid, its, placed, [9])
    check(9 in pl and pl[9][:3] == [0.0, 0.0, 30.0], f"control: two-side position at the corner is placed {pl.get(9)}")

    print("\n-- 3. C3 / C4 / C5 / C6 are never broken -----------------------------")
    cases = [
        ("C3", dict(strong=set()), dict(strong={0})),
        ("C4", dict(strong={0}, fragile={0}), dict(strong={0})),
        ("C5", dict(strong={0}, narrow=0), dict(strong={0})),
        ("C6", dict(strong={0}, stops={9: 2}), dict(strong={0})),
    ]
    for name, bad, good in cases:
        its, placed = layer(**good)
        pl, un, _ = run_r4(grid, its, placed, [9])
        check(9 in pl, f"{name} control: placed when the {name} defect is absent")
        its, placed = layer(**bad)
        pl, un, _ = run_r4(grid, its, placed, [9])
        csr = evaluate_constraints(pl, its, {i: 1 for i in pl})[0]
        check(9 in un and 9 not in pl and csr == 100.0,
              f"{name}: box refused although the corner touches two walls (CSR {csr})")

    print("\n-- 4. Compaction ----------------------------------------------------")
    its = [box(30, 30, 30), box(30, 30, 30)]
    pl, un, st = run_r4({'L': 100.0, 'W': 30.0, 'H': 60.0}, its, {0: (10, 0, 0), 1: (10, 0, 30)}, [])
    check(pl[0][0] == 0.0 and pl[1][0] == 0.0, f"stack moved rigidly to the wall: x = {pl[0][0]}, {pl[1][0]}")
    check(st['compaction']['moves'] == 1 and evaluate_constraints(pl, its, {0: 1, 1: 1})[0] == 100.0,
          "one move, CSR 100")
    # Y (stop 2) sliding left would stand between X (stop 1, deeper) and the door: C6.
    its = [box(30, 30, 30, stop=1), box(30, 30, 30, stop=2)]
    pl, un, st = run_r4({'L': 100.0, 'W': 60.0, 'H': 30.0}, its, {0: (0, 30, 0), 1: (40, 0, 0)}, [])
    csr = evaluate_constraints(pl, its, {0: 1, 1: 1})[0]
    check(st['compaction']['undone'] >= 1, f"C6-breaking move was undone ({st['compaction']['undone']}x)")
    check(csr == 100.0 and pl[1][0] != 0.0, f"CSR 100, box 1 not moved under box 0: x = {pl[1][0]}")

    print("\n-- 5. Determinism ---------------------------------------------------")
    its, placed = layer(strong={0, 1, 2})
    a, _, _ = run_r4(grid, its, placed, [9])
    b, _, _ = run_r4(grid, its, placed, [9])
    check(a == b, "two runs, identical placements")

    print("\n-- 6. Instance 581, REP, seed 42, quick preset ----------------------")
    from preprocessing.pipeline import load_augmented_instance
    from thesis_algorithms import RepairBasedHybrid
    inst = load_augmented_instance({'data': {'raw_dir': str(_ROOT / 'data' / 'raw')}},
                                   instance_id=581, stop_seed=42, stop_count=3)
    rows = {}
    for on in (False, True):
        t0 = time.perf_counter()
        opt = RepairBasedHybrid(inst['boxes'], inst['container'], pop_size=10, max_iter=60,
                                enforce_support=True, enforce_fragility=True, seed=42, edge_fill=on, fragile_lift=False)
        best = opt.run()
        e = edge_indicators(best.placements, inst['container'], inst['boxes'])
        rows[on] = (best, e, opt, time.perf_counter() - t0)
        print(f"  R4 {'on ' if on else 'off'}: placed {len(best.placements)}  SU {best.su * 100:.2f}  CSR {best.csr:.2f}  "
              f"isolated {e['isolated_boxes']}  one-side {e['one_side_boxes']}  "
              f"fillable {e['lateral_gaps_fillable']['count']}  dunnage {e['lateral_gaps_dunnage']['count']}  "
              f"contact {e['side_contact_ratio']:.4f}  ({rows[on][3]:.1f} s)")
    (b0, e0, _, _), (b1, e1, o1, _) = rows[False], rows[True]
    check(b1.csr == 100.0, "CSR 100 with R4")
    check(e1['isolated_boxes'] <= e0['isolated_boxes'], "isolated boxes do not increase")
    check(len(b1.placements) >= len(b0.placements), "placed boxes do not decrease")
    check(o1.edge_fill_stats['before']['isolated_boxes'] == e0['isolated_boxes'],
          "the search is unchanged: R4's input is the R4-off arrangement")
    runs = []
    for _ in range(2):
        pp = {k: list(v) for k, v in b0.placements.items()}
        repair_R4_edge_fill(pp, dict(b0.orientations), list(b0.unplaced), inst['boxes'], inst['container'])
        runs.append(pp)
    p1, p2 = runs
    check(p1 == p2, "instance 581: two R4 runs give identical placements")

    print()
    if FAILS:
        print(f"FAIL ({len(FAILS)} failures)")
        sys.exit(1)
    print("PASS - tools/test_edge_fill.py: all tests succeeded!")


if __name__ == '__main__':
    main()
