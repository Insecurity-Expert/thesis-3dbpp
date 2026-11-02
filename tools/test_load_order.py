"""
test_load_order.py - The shared decoder's loading order (optimizer/thesis_math.py,
decode_position; Chapter 3 decoder description and Appendix 2, step D1).

Checks:
1. The rule: decode_position returns a permutation ordered by descending stop, then
   fragile last within a stop, then ascending random key inside each (stop, fragile)
   group; the keys still decide the order inside a group.
2. Wiring: for all four configurations, every sequence handed to DBLF is exactly
   decode_position's (no configuration reorders it any further).
3. No configuration takes a load_order switch any more (REP included).
4. Determinism: REP on instance 581, quick preset, seed 42, twice: identical result,
   placed-box CSR 100.

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
from thesis_algorithms import RepairBasedHybrid, StandaloneDGWO, StandaloneMOGWO, SequentialHybrid
from thesis_math import decode_position
from preprocessing.pipeline import load_augmented_instance

FAILS = []
CLASSES = (StandaloneDGWO, StandaloneMOGWO, SequentialHybrid, RepairBasedHybrid)


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
    """Run cls and capture (decoded sequence, sequence given to DBLF, decoded
    orientations, orientations given to DBLF) for every DBLF call."""
    seen, last = [], {}
    real_decode, real_place = ta.decode_position, ta.place_container_dblf

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
    print("-- 1. The rule (decode_position) --------------------------------------")
    sf = [(1, 0), (3, 1), (2, 0), (3, 0), (1, 1), (2, 1), (3, 0), (1, 0), (3, 1)]
    items = [{'stop': s, 'fragile': f, 'allowed_orientations': [1]} for s, f in sf]
    n = len(items)
    keys = np.array([0.9, 0.1, 0.5, 0.3, 0.2, 0.7, 0.8, 0.4, 0.6])  # key order: 1,4,3,7,2,8,5,6,0
    seq, _ = decode_position(np.concatenate([keys, np.zeros(n)]), items)
    check(sorted(seq) == list(range(n)), "result is a permutation")
    grp = [(-items[i]['stop'], items[i]['fragile']) for i in seq]
    check(grp == sorted(grp), "ordered last stop first, fragile last within each stop")
    for g in set(grp):
        members = [i for i in seq if (-items[i]['stop'], items[i]['fragile']) == g]
        check([keys[i] for i in members] == sorted(keys[i] for i in members),
              f"group stop={-g[0]} fragile={g[1]}: ascending key order")
    check(seq == [3, 6, 1, 8, 2, 5, 7, 0, 4], f"expected [3,6,1,8,2,5,7,0,4], got {seq}")
    rev = np.concatenate([1.0 - keys, np.zeros(n)])
    seq2, _ = decode_position(rev, items)
    check(seq2 != seq and [(-items[i]['stop'], items[i]['fragile']) for i in seq2] == grp,
          "other keys reorder boxes inside groups only")

    inst = load_augmented_instance({'data': {'raw_dir': str(_ROOT / 'data' / 'raw')}},
                                   instance_id=581, stop_seed=42, stop_count=3)
    boxes = inst['boxes']

    print("\n-- 2. Wiring: every configuration hands DBLF the decoder's sequence ----")
    for cls in CLASSES:
        kw = {'edge_fill': False, 'fragile_lift': False} if cls is RepairBasedHybrid else {}
        _, seen = run_capture(cls, inst, 42, **kw)
        ok = len(seen) > 0 and all(d == g and o == go for d, g, o, go in seen)
        ok_order = all([(-boxes[i]['stop'], boxes[i]['fragile']) for i in g]
                       == sorted((-boxes[i]['stop'], boxes[i]['fragile']) for i in g) for _, g, _, _ in seen)
        check(ok and ok_order, f"{cls.__name__}: {len(seen)} sequences, all stop-first / fragile-last, untouched")

    print("\n-- 3. No load_order switch ---------------------------------------------")
    for cls in CLASSES:
        try:
            cls(boxes, inst['container'], pop_size=2, max_iter=1, seed=1, load_order=True)
            check(False, f"{cls.__name__} rejects load_order")
        except TypeError:
            check(True, f"{cls.__name__} rejects load_order")

    print("\n-- 4. Instance 581, REP, seed 42, quick preset, twice --------------------")
    a, b = [RepairBasedHybrid(boxes, inst['container'], pop_size=10, max_iter=60, lambda_penalty=0.2,
                              enforce_support=True, enforce_fragility=True, seed=42).run() for _ in range(2)]
    check(a.csr == 100.0, f"CSR {a.csr:.2f} == 100")
    check(digest(a) == digest(b), "identical placements, orientations, SU, CSR")
    print(f"  placed {len(a.placements)}, SU {a.su*100:.2f} %")

    print()
    if FAILS:
        print(f"{len(FAILS)} FAILED")
        sys.exit(1)
    print("all checks passed")


if __name__ == '__main__':
    main()
