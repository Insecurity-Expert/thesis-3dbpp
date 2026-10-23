"""
test_centering.py - Verification suite for post-processing lateral balancing.

Checks:
1. Empty and single-box corner cases.
2. Multi-box REP arrangements from experiments/results/slide_i350_s*.json.
3. Strict preservation of CSR (100.0%) and all constraints C1-C6.
4. Independent validator agreement (validate_arrangement.py).
5. Exact preservation of space utilization (M-1) and placed box count.
6. Reduction of Chapter 3 M-7 lateral left-right mass imbalance.

Usage:
    python tools/test_centering.py
"""

import sys
import json
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
sys.path[:0] = [str(_ROOT), str(_ROOT / 'optimizer'), str(_ROOT / 'tools'), str(_ROOT / 'preprocessing')]

from lateral_centering import center_arrangement, build_support_clusters
from layout_metrics import load_distribution
from thesis_metrics import evaluate_constraints, space_utilization
from validate_arrangement import validate
from pipeline import load_augmented_instance

FAILS = []


def check(cond, msg):
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond:
        FAILS.append(msg)


def main():
    print("-- Testing Corner Cases -------------------------------------------")
    cont = {'L': 233.0, 'W': 587.0, 'H': 220.0}
    empty_res = center_arrangement({}, cont, [], {})
    check(empty_res['placements'] == {}, "Empty placement handled safely")

    # Single box placed against left wall -> centered to container centerline
    toy_box = {'id': 'Toy-1', 'l': 50.0, 'w': 50.0, 'h': 50.0, 'mass': 100.0,
               'lbs_l': 1.0, 'lbs_w': 1.0, 'lbs_h': 1.0, 'fragile': 0, 'stop': 1,
               'allowed_orientations': [1]}
    toy_placements = {0: [0.0, 0.0, 0.0, 50.0, 50.0, 50.0]}
    toy_orientations = {0: 1}
    toy_res = center_arrangement(toy_placements, cont, [toy_box], toy_orientations)
    expected_x = (233.0 - 50.0) / 2.0
    check(abs(toy_res['placements'][0][0] - expected_x) < 1e-4, f"Single box centered to {expected_x} cm")

    # Two boxes placed against left wall -> balanced across left and right
    toy_boxes = [
        {'id': 'B1', 'l': 40.0, 'w': 40.0, 'h': 40.0, 'mass': 50.0, 'lbs_l': 1.0, 'lbs_w': 1.0, 'lbs_h': 1.0, 'fragile': 0, 'stop': 1, 'allowed_orientations': [1]},
        {'id': 'B2', 'l': 40.0, 'w': 40.0, 'h': 40.0, 'mass': 50.0, 'lbs_l': 1.0, 'lbs_w': 1.0, 'lbs_h': 1.0, 'fragile': 0, 'stop': 1, 'allowed_orientations': [1]},
    ]
    two_pl = {0: [0.0, 0.0, 0.0, 40.0, 40.0, 40.0], 1: [40.0, 0.0, 0.0, 40.0, 40.0, 40.0]}
    two_or = {0: 1, 1: 1}
    two_res = center_arrangement(two_pl, cont, toy_boxes, two_or)
    check(two_res['m7_before']['lr_mass_imbalance_pct'] == 100.0, "Two boxes before: 100% imbalance")
    check(two_res['m7_after']['lr_mass_imbalance_pct'] == 0.0, "Two boxes after: 0.0% imbalance")

    print("\n-- Testing Stored Thesis REP Arrangements (Instance 350) ---------")
    inst = load_augmented_instance({'data': {'raw_dir': str(_ROOT / 'data' / 'raw')}}, 350, stop_seed=42)
    container = inst['container']
    boxes = inst['boxes']

    results_dir = _ROOT / 'experiments' / 'results'
    for seed in range(1, 6):
        run_file = results_dir / f"slide_i350_s{seed}.json"
        if not run_file.exists():
            continue
        data = json.loads(run_file.read_text(encoding="utf-8"))
        rep = next(r for r in data['results'] if r['strategy'] == 'REP')
        placements = {int(k): list(v) for k, v in rep['placements'].items()}

        # Reconstruct orientations
        orientations = {}
        for i, p in placements.items():
            b = boxes[i]
            for code in (1, 2, 3, 4, 5, 6):
                if code in b['allowed_orientations']:
                    from geometry_3d import get_dims
                    if get_dims(b, code) == (p[3], p[4], p[5]):
                        orientations[i] = code
                        break

        # Space utilization and CSR before
        su_before = space_utilization(placements, container)
        csr_before, _ = evaluate_constraints(placements, boxes, orientations)

        # Run lateral centering
        res = center_arrangement(placements, container, boxes, orientations)
        centered_P = res['placements']

        su_after = space_utilization(centered_P, container)
        csr_after, detail_after = evaluate_constraints(centered_P, boxes, orientations)
        val = validate(container, boxes, centered_P, orientations)

        imb_before = res['m7_before']['lr_mass_imbalance_pct']
        imb_after = res['m7_after']['lr_mass_imbalance_pct']

        check(len(centered_P) == len(placements), f"Seed {seed}: box count preserved ({len(centered_P)})")
        check(abs(su_after - su_before) < 1e-6, f"Seed {seed}: Space utilization exactly preserved ({su_after*100:.2f}%)")
        check(csr_after == 100.0, f"Seed {seed}: CSR remains 100.0% (was {csr_before}%)")
        check(len(val['issues']) == 0, f"Seed {seed}: Independent validator 0 issues")
        check(imb_after <= imb_before + 1e-4, f"Seed {seed}: Imbalance reduced or preserved: {imb_before:.2f}% -> {imb_after:.2f}%")

    print()
    if FAILS:
        print(f"FAIL ({len(FAILS)} failures)")
        sys.exit(1)
    print("PASS - tools/test_centering.py: all tests succeeded!")
    sys.exit(0)


if __name__ == '__main__':
    main()
