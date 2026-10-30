"""
test_fragile_lift.py - Verification suite for repair step R5 (optimizer/fragile_lift.py).

Checks:
1. Hand-built lift: a fragile box on the floor, a stack beside it that can carry
   it, and an unpacked heavy box that only fits on the floor. R5 puts the fragile
   box on the stack and the heavy box on the floor; SU rises, dead volume falls.
2. Refused move: the only higher position breaks C3 (stack too weak) or C6 (stop
   order). R5 leaves the arrangement as it was; each case has a control that
   proves the lift happens without that defect.
3. No cargo dropped: a move that raises SU only by losing the fragile box is refused.
4. Orientation: a box restricted to lying flat is never stood on end; the same box
   allowed to stand on end is.
5. Determinism: two runs give identical placements.
6. Instance 581, REP, seeds 3 and 42, quick preset, R5 off vs. on: CSR stays 100,
   placed and SU do not go down, dead volume does not go up.

Usage:
    python tools/test_fragile_lift.py
"""
import sys
import time
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
sys.path[:0] = [str(_ROOT), str(_ROOT / 'optimizer'), str(_ROOT / 'tools')]

from fragile_lift import repair_R5_fragile_lift
from layout_metrics import fragile_indicators
from thesis_metrics import evaluate_constraints, space_utilization
from geometry_3d import get_dims

FAILS = []


def check(cond, msg):
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond:
        FAILS.append(msg)


def box(l, w, h, mass=10.0, lbs=1.0, fragile=0, stop=1, orient=(1,)):
    return {'id': 'T', 'type_id': 0, 'l': float(l), 'w': float(w), 'h': float(h),
            'mass': float(mass), 'lbs_l': lbs, 'lbs_w': lbs, 'lbs_h': lbs,
            'fragile': fragile, 'stop': stop, 'allowed_orientations': list(orient)}


def run_r5(container, items, placed, unpacked):
    """placed: {idx: (x, y, z)}; every box in orientation 1."""
    pl = {i: [*xyz, *get_dims(items[i], 1)] for i, xyz in placed.items()}
    orr = {i: 1 for i in placed}
    csr, _ = evaluate_constraints(pl, items, orr)
    assert csr == 100.0, "test arrangement must start feasible"
    before = {i: list(p) for i, p in pl.items()}
    un = list(unpacked)
    stats = repair_R5_fragile_lift(pl, orr, un, items, container)
    return pl, orr, un, stats, before


def dead(pl, container, items):
    return fragile_indicators(pl, container, items)['fragile_dead_volume_m3']


def main():
    print("-- 1. Hand-built lift ------------------------------------------------")
    cont = {'L': 60.0, 'W': 30.0, 'H': 60.0}
    # 0: fragile cube on the floor. 1: sturdy-enough cube beside it (carries 18 kg).
    # 2: 50-kg cube, left out: too heavy for box 1's top (C3), nothing may rest on 0 (C4).
    items = [box(30, 30, 30, mass=10, fragile=1), box(30, 30, 30, lbs=0.02), box(30, 30, 30, mass=50)]
    pl, orr, un, st, b0 = run_r5(cont, items, {0: (0, 0, 0), 1: (30, 0, 0)}, [2])
    check(pl[0][2] == 30.0, f"fragile box 0 lifted onto a stack (top at the roof): {pl[0][:3]}")
    check(2 in pl and pl[2][:3] == [0.0, 0.0, 0.0], f"heavy box 2 placed on the freed floor: {pl.get(2, None) and pl[2][:3]}")
    check(un == [], "box 2 removed from the unpacked list")
    check(space_utilization(pl, cont) > space_utilization(b0, cont), "SU rose")
    check(dead(pl, cont, items) < dead(b0, cont, items), "dead volume fell")
    check(evaluate_constraints(pl, items, orr)[0] == 100.0, "CSR 100")
    check(st['moves_accepted'] == 1 and st['boxes_added'] == [2] and st['fragile_lifted'][0]['item'] == 0,
          "stats: one move, box 2 added, box 0 lifted")
    check(st['after']['dead_volume_pct'] < st['before']['dead_volume_pct'] and st['after']['placed'] == 3,
          "stats: before / after")

    print("\n-- 2. Refused moves --------------------------------------------------")
    # control: nothing left out, the lift alone shrinks the dead volume
    items = [box(30, 30, 30, mass=10, fragile=1), box(30, 30, 30, lbs=0.02)]
    pl, _, _, st, _ = run_r5(cont, items, {0: (0, 0, 0), 1: (30, 0, 0)}, [])
    check(pl[0][:3] == [30.0, 0.0, 30.0], "control: the fragile box is lifted when the stack can carry it")
    # C3: the stack bears 4.5 kg, the fragile box weighs 10
    items = [box(30, 30, 30, mass=10, fragile=1), box(30, 30, 30, lbs=0.005)]
    pl, _, _, st, b0 = run_r5(cont, items, {0: (0, 0, 0), 1: (30, 0, 0)}, [])
    check(pl == b0 and st['moves_accepted'] == 0, "C3: stack too weak, arrangement unchanged")
    check(st['rejections'].get('C3', 0) > 0, f"C3 rejections counted: {st['rejections']}")
    # C6: a stop-2 box on a stop-1 box would block it
    items = [box(30, 30, 30, mass=10, fragile=1, stop=2), box(30, 30, 30, lbs=0.02, stop=1)]
    pl, _, _, st, b0 = run_r5(cont, items, {0: (0, 0, 0), 1: (30, 0, 0)}, [])
    check(pl == b0 and st['moves_accepted'] == 0, "C6: stop order forbids it, arrangement unchanged")
    check(st['rejections'].get('C6', 0) > 0, f"C6 rejections counted: {st['rejections']}")

    print("\n-- 3. No cargo dropped -------------------------------------------------")
    one = {'L': 30.0, 'W': 30.0, 'H': 30.0}
    items = [box(30, 30, 20, mass=10, fragile=1), box(30, 30, 30, mass=50)]
    pl, _, un, st, b0 = run_r5(one, items, {0: (0, 0, 0)}, [1])
    check(pl == b0 and un == [1] and 0 in pl, "box 1 would replace box 0 (more SU): refused")
    check(st['move_rejections'].get('dropped_cargo') == 1 and st['moves_accepted'] == 0,
          f"counted as dropped_cargo: {st['move_rejections']}")

    print("\n-- 4. Orientation -----------------------------------------------------")
    tall = {'L': 30.0, 'W': 30.0, 'H': 60.0}
    for allowed, expect_end in (((1,), False), ((1, 5), True)):
        items = [box(30, 10, 10, fragile=1, orient=allowed)]
        pl, orr, _, st, _ = run_r5(tall, items, {0: (0, 0, 0)}, [])
        check(all(r in allowed for r in orr.values()), f"allowed {allowed}: orientation used {orr[0]}")
        check((orr[0] != 1) == expect_end,
              f"allowed {allowed}: {'stood on end' if expect_end else 'left flat'}, dz = {pl[0][5]}")
    check(dead(pl, tall, items) < 0.015, "control: standing on end cut the dead volume")

    print("\n-- 5. Determinism ---------------------------------------------------")
    items = [box(30, 30, 30, mass=10, fragile=1), box(30, 30, 30, lbs=0.02), box(30, 30, 30, mass=50)]
    a = run_r5(cont, items, {0: (0, 0, 0), 1: (30, 0, 0)}, [2])[0]
    b = run_r5(cont, items, {0: (0, 0, 0), 1: (30, 0, 0)}, [2])[0]
    check(a == b, "two runs, identical placements")

    print("\n-- 6. Instance 581, REP, quick preset, R5 off vs. on -----------------")
    from preprocessing.pipeline import load_augmented_instance
    from thesis_algorithms import RepairBasedHybrid
    inst = load_augmented_instance({'data': {'raw_dir': str(_ROOT / 'data' / 'raw')}},
                                   instance_id=581, stop_seed=42, stop_count=3)
    for seed in (3, 42):
        rows = {}
        for on in (False, True):
            t0 = time.perf_counter()
            opt = RepairBasedHybrid(inst['boxes'], inst['container'], pop_size=10, max_iter=60,
                                    enforce_support=True, enforce_fragility=True, seed=seed,
                                    fragile_lift=on)
            best = opt.run()
            f = fragile_indicators(best.placements, inst['container'], inst['boxes'])
            rows[on] = (best, f, opt)
            print(f"  seed {seed:2d} R5 {'on ' if on else 'off'}: placed {len(best.placements)}  SU {best.su * 100:.2f}  "
                  f"CSR {best.csr:.2f}  fragile on floor {f['fragile_on_floor']}  "
                  f"dead {f['fragile_dead_volume_pct']:.2f} %  ({time.perf_counter() - t0:.1f} s)")
        (b0, f0, _), (b1, f1, o1) = rows[False], rows[True]
        check(b1.csr == 100.0, f"seed {seed}: CSR 100 with R5")
        check(len(b1.placements) >= len(b0.placements) and b1.su >= b0.su - 1e-12,
              f"seed {seed}: placed and SU do not go down")
        check(f1['fragile_dead_volume_pct'] <= f0['fragile_dead_volume_pct'] + 1e-9,
              f"seed {seed}: dead volume does not go up")
        check(o1.fragile_lift_stats['moves_tried'] > 0, f"seed {seed}: R5 stats recorded "
              f"({o1.fragile_lift_stats['moves_accepted']}/{o1.fragile_lift_stats['moves_tried']} moves, "
              f"{o1.fragile_lift_stats['time_ms']} ms)")

    print()
    if FAILS:
        print(f"FAIL ({len(FAILS)} failures)")
        sys.exit(1)
    print("PASS - tools/test_fragile_lift.py: all tests succeeded!")


if __name__ == '__main__':
    main()
