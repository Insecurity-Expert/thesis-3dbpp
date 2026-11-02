"""
test_c3_tie.py - C3 at an exact tie (a box carrying exactly its capacity).

The thesis study v2 stopped on REP, instance 209, seed 13: box 58 (lbs 0.16673
kg/cm2 x 100 x 70 cm = 1167.11 kg) carried seven boxes weighing exactly 1167.11 kg.
C3 allows that (load <= capacity), and so did the repair kernel, the reference
evaluator and tools/validate_arrangement.py, but the compiled evaluator summed the
masses in a loop to 1167.1100000000001 and the repair's final assertion fired.

Checks, on a hand-built stack with those exact masses:
1. The strict comparison (c3_tol=0.0) still shows the rounding (documents the bug).
2. evaluate_constraints and evaluate_constraints_reference report 100 with the
   default tolerance, and per_box_constraints flags nothing.
3. The independent validator agrees.
4. A real overload (one gram over) is still a C3 violation on every path.

Usage:
    python tools/test_c3_tie.py
"""
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
sys.path[:0] = [str(_ROOT), str(_ROOT / 'optimizer'), str(_ROOT / 'tools')]

from thesis_metrics import (evaluate_constraints, evaluate_constraints_reference,
                            per_box_constraints, C3_TOL)
from validate_arrangement import validate

FAILS = []
MASSES = [183.45, 273.59, 47.04, 47.04, 273.59, 183.45, 158.95]   # the seven boxes above box 58


def check(cond, msg):
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond:
        FAILS.append(msg)


def box(i, mass, lbs_h):
    return {'id': i, 'type_id': 0, 'l': 100.0, 'w': 70.0, 'h': 10.0, 'mass': mass,
            'lbs_l': lbs_h, 'lbs_w': lbs_h, 'lbs_h': lbs_h,
            'allowed_orientations': [1], 'fragile': 0, 'stop': 1}


def stack(top_masses):
    """Box 0 (lbs 0.16673, so 1167.11 kg capacity) with the others stacked on it."""
    items = [box(0, 300.0, 0.16673)] + [box(k + 1, m, 10.0) for k, m in enumerate(top_masses)]
    placements = {k: (0.0, 0.0, 10.0 * k, 100.0, 70.0, 10.0) for k in range(len(items))}
    orientations = {k: 1 for k in range(len(items))}
    return items, placements, orientations


def main():
    container = {'L': 233.0, 'W': 587.0, 'H': 220.0}

    print("-- exact tie: 1167.11 kg on a 1167.11 kg box --------------------------")
    items, P, O = stack(MASSES)
    naive = 0.0
    for m in MASSES:
        naive += m
    check(naive > 0.16673 * 100.0 * 70.0, f"the loop sum rounds above the capacity ({naive!r})")
    check(evaluate_constraints(P, items, O, c3_tol=0.0)[0] < 100.0,
          "strict comparison (c3_tol=0.0) flags the tie: the old behaviour")
    check(evaluate_constraints(P, items, O)[0] == 100.0, f"evaluate_constraints: 100 (C3_TOL = {C3_TOL})")
    check(evaluate_constraints_reference(P, items, O)[0] == 100.0, "evaluate_constraints_reference: 100")
    check(all(r['C3'] for r in per_box_constraints(P, items, O).values()), "per_box_constraints: no C3 flag")
    check(validate(container, items, P, O)['pct']['C3'] == 100.0, "independent validator: C3 100")

    print("\n-- real overload: one gram over -------------------------------------")
    items, P, O = stack(MASSES[:-1] + [MASSES[-1] + 0.001])
    check(evaluate_constraints(P, items, O)[0] < 100.0, "evaluate_constraints flags it")
    check(evaluate_constraints_reference(P, items, O)[0] < 100.0, "evaluate_constraints_reference flags it")
    check(not per_box_constraints(P, items, O)[0]['C3'], "per_box_constraints flags box 0")
    check(validate(container, items, P, O)['pct']['C3'] < 100.0, "independent validator flags it")

    print()
    if FAILS:
        print(f"FAIL ({len(FAILS)} failures)")
        sys.exit(1)
    print("PASS - tools/test_c3_tie.py: all tests succeeded!")


if __name__ == '__main__':
    main()
