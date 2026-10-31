"""
test_load_order.py - Verification suite for REP's loading-sequence rule
(apply_load_order in optimizer/thesis_algorithms.py, RepairBasedHybrid(load_order=True)).

Checks:
1. The rule: stable sort of a sequence by (-stop, fragile); a permutation; the order
   inside each (stop, fragile) group is the wolf's order.
2. Wiring: every sequence REP hands to DBLF is decode_position's sequence sorted by that
   rule (groups keep the wolf's order, orientations untouched); with load_order=False it is
   decode_position's sequence unchanged; DGWO, MOGWO and SEQ never reorder.
3. Defaults: REP load_order=True; the other configurations carry no such switch.
4. Instance 581, REP, seed 42, quick preset: CSR 100 with the rule on and off.
5. Determinism: two runs give identical placements, orientations, SU and CSR.
6. Rule off reproduces the same run as before the rule existed (same search as a second
   off run; the off/on runs differ, so the rule really acts in the search).

Usage:
    python tools/test_load_order.py
"""
import sys
import json
import hashlib
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
sys.path[:0] = [str(_ROOT), str(_ROOT / 'optimizer')]

import numpy as np
import thesis_algorithms as ta
from thesis_algorithms import (apply_load_order, RepairBasedHybrid, StandaloneDGWO,
                               StandaloneMOGWO, SequentialHybrid)
from thesis_math import decode_position
from preprocessing.pipeline import load_augmented_instance

FAILS = []


def check(cond, msg):
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond:
        FAILS.append(msg)


def digest(best):
    blob = json.dumps({'p': {str(k): list(v) for k, v in sorted(best.placements.items())},
                       'o': {str(k): v for k, v in sorted(best.orientations.items())},
                       'su': best.su, 'csr': best.csr}, sort_keys=True)
    return hashlib.sha256(blob.encode()).hexdigest()


def run_capture(cls, inst, seed, **kw):
    """Run cls and capture (decoded sequence, sequence given to DBLF, decoded orientations,
    orientations given to DBLF) for every call to place_container_dblf."""
    seen = []
    real_decode, real_place = ta.decode_position, ta.place_container_dblf
    last = {}

    def decode(X, items, container=None):
        seq, ors = real_decode(X, items, container)
        last['seq'], last['ors'] = list(seq), dict(ors)
        return seq, ors

    def place(seq, items, ors, *a, **k):
        seen.append((last['seq'], list(seq), last['ors'], dict(ors)))
        return real_place(seq, items, ors, *a, **k)

    ta.decode_position, ta.place_container_dblf = decode, place
    try:
        best = cls(inst['boxes'], inst['container'], pop_size=4, max_iter=3, lambda_penalty=0.2,
                   enforce_support=True, enforce_fragility=True, seed=seed, **kw).run()
    finally:
        ta.decode_position, ta.place_container_dblf = real_decode, real_place
    return best, seen


def main():
    print("-- 1. The rule ------------------------------------------------------")
    items = [{'stop': s, 'fragile': f} for s, f in
             [(1, 0), (3, 1), (2, 0), (3, 0), (1, 1), (2, 1), (3, 0), (1, 0), (3, 1)]]
    seq = [8, 0, 3, 1, 6, 5, 4, 2, 7]
    out = apply_load_order(seq, items)
    check(sorted(out) == sorted(seq), "result is a permutation of the input")
    keys = [(-items[i]['stop'], items[i]['fragile']) for i in out]
    check(keys == sorted(keys), "sorted by (-stop, fragile): last stop first, fragile last in each stop")
    check(out == [3, 6, 8, 1, 2, 5, 0, 7, 4], f"expected order [3,6,8,1,2,5,0,7,4], got {out}")
    for key in set(keys):
        grp_in = [i for i in seq if (-items[i]['stop'], items[i]['fragile']) == key]
        grp_out = [i for i in out if (-items[i]['stop'], items[i]['fragile']) == key]
        check(grp_in == grp_out, f"group stop={-key[0]} fragile={key[1]} keeps the wolf's order")
    check(apply_load_order(seq, items) == apply_load_order(apply_load_order(seq, items), items),
          "idempotent")
    check(seq == [8, 0, 3, 1, 6, 5, 4, 2, 7], "input list is not modified")

    inst = load_augmented_instance({'data': {'raw_dir': str(_ROOT / 'data' / 'raw')}},
                                   instance_id=581, stop_seed=42, stop_count=3)
    boxes = inst['boxes']

    print("\n-- 2. Wiring: what DBLF receives -----------------------------------")
    _, seen = run_capture(RepairBasedHybrid, inst, 42, edge_fill=False, fragile_lift=False)
    check(len(seen) > 0, f"REP evaluated {len(seen)} wolves")
    ok_rule = all(g == apply_load_order(d, boxes) for d, g, _, _ in seen)
    ok_perm = all(sorted(g) == sorted(d) for d, g, _, _ in seen)
    ok_sort = all([(-boxes[i]['stop'], boxes[i]['fragile']) for i in g]
                  == sorted((-boxes[i]['stop'], boxes[i]['fragile']) for i in g) for _, g, _, _ in seen)
    ok_ors = all(o == g_o for _, _, o, g_o in seen)
    check(ok_rule, "sequence = decode_position's sequence, stable-sorted by (-stop, fragile)")
    check(ok_perm and ok_sort, "every sequence is a permutation, ordered last stop first / fragile last")
    check(ok_ors, "orientations are exactly decode_position's")
    check(any(d != g for d, g, _, _ in seen), "the rule changes at least one decoded sequence")

    _, seen = run_capture(RepairBasedHybrid, inst, 42, edge_fill=False, fragile_lift=False,
                          load_order=False)
    check(all(d == g and o == g_o for d, g, o, g_o in seen),
          "REP load_order=False: sequence and orientations are decode_position's, untouched")
    for cls in (StandaloneDGWO, StandaloneMOGWO, SequentialHybrid):
        _, seen = run_capture(cls, inst, 42)
        check(len(seen) > 0 and all(d == g for d, g, _, _ in seen),
              f"{cls.__name__}: sequence untouched")

    print("\n-- 3. Defaults -------------------------------------------------------")
    rep = RepairBasedHybrid(boxes, inst['container'], pop_size=2, max_iter=1, seed=1)
    check(rep.load_order is True, "RepairBasedHybrid.load_order defaults to True")
    check(all(c(boxes, inst['container'], pop_size=2, max_iter=1, seed=1).load_order is False
              for c in (StandaloneDGWO, StandaloneMOGWO, SequentialHybrid)),
          "DGWO / MOGWO / SEQ: load_order is False")
    try:
        StandaloneDGWO(boxes, inst['container'], load_order=True)
        check(False, "DGWO accepts no load_order switch")
    except TypeError:
        check(True, "DGWO accepts no load_order switch")

    print("\n-- 4./5./6. Instance 581, REP, seed 42, quick preset ------------------")
    runs = {}
    for lo in (False, True, True):
        best = RepairBasedHybrid(boxes, inst['container'], pop_size=10, max_iter=60,
                                 lambda_penalty=0.2, enforce_support=True, enforce_fragility=True,
                                 seed=42, load_order=lo).run()
        runs.setdefault(lo, []).append(best)
    off, (on1, on2) = runs[False][0], runs[True]
    check(off.csr == 100.0, f"rule off: CSR {off.csr:.2f} == 100")
    check(on1.csr == 100.0, f"rule on: CSR {on1.csr:.2f} == 100")
    check(digest(on1) == digest(on2), "rule on: two runs give identical placements, orientations, SU, CSR")
    check(digest(on1) != digest(off), "rule on differs from rule off (the rule acts in the search)")
    print(f"  placed off/on {len(off.placements)}/{len(on1.placements)}, "
          f"SU off/on {off.su*100:.2f}/{on1.su*100:.2f} %")

    print()
    if FAILS:
        print(f"{len(FAILS)} FAILED")
        sys.exit(1)
    print("all checks passed")


if __name__ == '__main__':
    main()
