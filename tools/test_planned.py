"""Acceptance checks for the D2(b) planned family (experiments/planned.py) and
the M-6 / M-7 layout indicators (optimizer/layout_metrics.py).

    python tools/test_planned.py
"""
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
sys.path[:0] = [str(_ROOT / 'experiments'), str(_ROOT / 'optimizer'), str(_ROOT / 'tools')]

import numpy as np
from stats import analyse
from test_stats import make_study, no_nan
from layout_metrics import face_gaps, gap_metrics, load_distribution

FAILS = []


def check(cond, msg):
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond:
        FAILS.append(msg)


def main():
    rng = np.random.default_rng(3)
    inst, seeds = list(range(1, 31)), [1, 2, 3]
    # REP: clearly higher CSR, same SU as SEQ, slower; C6 constant 100 everywhere.
    su = {'DGWO': 70, 'MOGWO': 70, 'SEQ': 72, 'REP': 72}
    csr = {'DGWO': 60, 'MOGWO': 61, 'SEQ': 62, 'REP': 90}
    st = analyse(make_study(lambda c, i, s: {'su': su[c] + rng.normal(0, 1), 'csr': csr[c] + rng.normal(0, 2),
                                            'c3': 95 + rng.normal(0, 1), 'c6': 100.0,
                                            'et': (3000 if c == 'REP' else 1000) + rng.normal(0, 50),
                                            'pm': 100 + rng.normal(0, 1)}, inst, seeds))
    pf = st['planned_family']
    comps = {(c['measure'], c['other']): c for c in pf['comparisons']}
    check(pf['planned_size'] == 18, "18 planned comparisons (6 measures x 3)")
    check(all(c['reference'] == 'REP' for c in pf['comparisons']), "REP is the reference in every comparison")
    check(not any({c['other']} & {'REP'} for c in pf['comparisons']), "no comparison among non-REP configurations")
    check(all(not comps[('C6', o)]['testable'] for o in ('DGWO', 'MOGWO', 'SEQ')), "constant C6 -> untestable, leaves family")
    check(pf['holm_family_size'] == 15, "Holm family = 15 testable of 18")
    check(all(comps[('CSR', o)]['outperforms'] == 'REP' for o in ('DGWO', 'MOGWO', 'SEQ')), "REP outperforms all on CSR")
    check(comps[('SU', 'SEQ')]['outperforms'] is None, "REP vs SEQ on equal SU: no outperformance")
    check(comps[('SU', 'DGWO')]['outperforms'] == 'REP', "REP outperforms DGWO on SU")
    check(comps[('ET', 'DGWO')]['outperforms'] == 'DGWO', "lower ET favours DGWO")
    check('confound_note' in comps[('SU', 'SEQ')] and 'confound_note' not in comps[('SU', 'DGWO')],
          "schedule confound attached to REP vs SEQ only")
    check(pf['decisions']['SP4']['h0_rejected_for'] and all('SEQ' in x for x in pf['decisions']['SP4']['h0_rejected_for']),
          "SP4 decided from REP vs SEQ comparisons")
    check(pf['outcome']['pattern'] == 'B', f"outcome B when REP wins some primary comparisons and loses none (got {pf['outcome']['pattern']})")
    check(no_nan(pf) == [], "no NaN in the planned family")

    par = analyse(make_study(lambda c, i, s: {'su': su[c] + rng.normal(0, 1)}, inst, seeds, mode='parallel'))
    check(all(not c['testable'] for c in par['planned_family']['comparisons'] if c['measure'] in ('ET', 'PM')),
          "parallel timing -> ET / PM comparisons untestable")

    # ── layout indicators on a hand-checked toy ──────────────────────────────
    cont = {'L': 100.0, 'W': 200.0, 'H': 90.0}
    items = [{'l': 10, 'w': 10, 'h': 10, 'mass': 30.0}, {'l': 10, 'w': 10, 'h': 10, 'mass': 10.0}]
    pl = {0: [0, 0, 0, 10, 10, 10], 1: [20, 0, 0, 10, 10, 10]}
    g = face_gaps(pl, cont)
    check(g[0]['x+'] == 10 and g[1]['x-'] == 10, "gap between two boxes 10 cm apart in x")
    check(g[0]['x-'] == 0 and g[0]['y-'] == 0 and g[0]['z-'] == 0, "touching walls / floor -> 0")
    check(g[1]['x+'] == 70 and g[0]['z+'] == 80 and g[0]['y+'] == 190, "gaps to the far walls and roof")
    gm = gap_metrics(pl, cont, items)
    check(gm['max_gap_cm'] == 190 and gm['significant_threshold_cm'] == 10, "max gap and threshold")
    check(gm['significant_gaps'] == 7, f"significant gaps counted (>= smallest dimension), got {gm['significant_gaps']}")
    ld = load_distribution(pl, cont, items)
    check(ld['left_count'] == 2 and ld['right_count'] == 0 and ld['lr_mass_imbalance_pct'] == 100.0, "both boxes in the left half")
    check(ld['lower_count'] == 2 and ld['lower_mass'] == 40.0, "both boxes in the lower band")
    check(gap_metrics({}, cont, items)['max_gap_cm'] is None and load_distribution({}, cont, items)['lr_mass_imbalance_pct'] == 0.0,
          "empty arrangement handled")

    print()
    if FAILS:
        print(f"FAIL ({len(FAILS)})"); sys.exit(1)
    print("PASS - tools/test_planned.py")


if __name__ == '__main__':
    main()
