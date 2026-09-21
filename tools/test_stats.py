"""Acceptance checks for experiments/stats.py (the Chapter 3 statistical treatment).

    python tools/test_stats.py

Clearly different groups -> significant; identical groups -> not; a measure
constant across all configurations -> "not testable"; a group constant within
itself -> Shapiro-Wilk not applicable and Kruskal-Wallis is used; the composite
score matches a hand-computed two-instance toy; one instance skips the SP3
Friedman and the composite; concurrent timing refuses SP3; no NaN anywhere.
"""
import sys
import json
import math
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT / 'experiments'))

import numpy as np
from stats import analyse, holm, PRIMARY_COMPLIANCE, CONFIGS

FAILS = []


def check(cond, msg):
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond:
        FAILS.append(msg)


def make_study(per_run, instances, seeds, mode='serial'):
    """per_run(cfg, inst, seed) -> dict(su, csr, c3..c6, placed, n, et, pm)."""
    runs = []
    for inst in instances:
        for s in seeds:
            for c in CONFIGS:
                d = per_run(c, inst, s)
                runs.append({'configuration': c, 'instance_id': inst, 'seed': s,
                             'n_items': d.get('n', 100), 'placed': d.get('placed', 100),
                             'su_pct': d['su'], 'csr_pct': d.get('csr', 100.0),
                             'C3_pct': d.get('c3', 100.0), 'C4_pct': d.get('c4', 100.0),
                             'C5_pct': d.get('c5', 100.0), 'C6_pct': d.get('c6', 100.0),
                             'exec_time_ms': d.get('et', 1000.0), 'peak_mem_mb': d.get('pm', 100.0)})
    return {'stackr_study': 1, 'mode': mode, 'timing_valid': mode == 'serial', 'seeds': list(seeds),
            'preset': {'name': 'quick', 'pop_size': 10, 'max_iter': 60},
            'seq_budget_split': {'dgwo_iters': 30, 'mogwo_iters': 30},
            'enforce_support': True, 'enforce_fragility': True, 'commit': 'test',
            'instances': [{'instance_id': i, 'br_class': f'BR{(i % 7) + 1}', 'n_types': 3, 'n_boxes': 100} for i in instances],
            'runs': runs}


def no_nan(obj, path='stats'):
    if isinstance(obj, float):
        return [] if not (math.isnan(obj) or math.isinf(obj)) else [path]
    if isinstance(obj, dict):
        return sum((no_nan(v, f'{path}.{k}') for k, v in obj.items()), [])
    if isinstance(obj, list):
        return sum((no_nan(v, f'{path}[{i}]') for i, v in enumerate(obj)), [])
    return []


def main():
    rng = np.random.default_rng(7)
    seeds = list(range(1, 21))

    # ── 1. clearly different groups -> significant, outperformance found ──────
    print("1. clearly different groups")
    base = {'DGWO': 60, 'MOGWO': 50, 'SEQ': 55, 'REP': 40}
    st = analyse(make_study(lambda c, i, s: {'su': base[c] + rng.normal(0, 1.0),
                                             'csr': {'DGWO': 40, 'MOGWO': 60, 'SEQ': 70, 'REP': 100}[c] + (0 if c == 'REP' else rng.normal(0, 2)),
                                             'c6': {'DGWO': 40, 'MOGWO': 60, 'SEQ': 70, 'REP': 100}[c] + (0 if c == 'REP' else rng.normal(0, 2)),
                                             'et': {'DGWO': 1000, 'MOGWO': 2000, 'SEQ': 1500, 'REP': 4000}[c] + rng.normal(0, 50),
                                             'pm': 100 + rng.normal(0, 1)},
                            [350], seeds))
    sp1 = st['SP1']['comparison']
    check(sp1['omnibus']['testable'] and sp1['omnibus']['significant'], f"SP1 omnibus significant ({sp1['omnibus']['test']} p={sp1['omnibus']['p']})")
    pair = next(p for p in sp1['pairs'] if {p['a'], p['b']} == {'DGWO', 'REP'})
    check(pair['outperforms'] == 'DGWO', f"DGWO outperforms REP on SU: {pair['verdict']}")
    check(pair['effect']['value'] is not None and abs(pair['effect']['value']) >= 0.5, "effect size above the practical threshold")
    check(st['SP2']['h0_rejected'], f"SP2 H0 rejected: {st['SP2']['decision']}")
    csr = st['SP2']['primary']['per_measure']['CSR']
    check(csr['omnibus']['test'] == 'Kruskal-Wallis', "REP CSR constant within group -> non-normal -> Kruskal-Wallis")
    check(csr['normality']['REP']['applicable'] is False, "Shapiro-Wilk not applicable for the constant REP group")
    c4 = st['SP2']['primary']['per_measure']['C4']
    check(c4['omnibus']['testable'] is False and 'no variance' in c4['omnibus']['reason'] and 'decoder' in c4['omnibus']['reason'],
          f"C4 constant across all -> {c4['omnibus']['reason']}")
    check(c4['omnibus']['p_holm'] is None and st['SP2']['primary']['holm_family_size'] == 2,
          "untestable measures (C3, C4, C5 constant) are excluded from the Holm family: m = 2 (CSR, C6)")
    check(st['SP3']['available'] and st['SP3']['per_metric']['ET']['omnibus']['significant_holm'], "SP3 ET differs (Holm-corrected)")
    check(st['SP3']['friedman']['ET']['testable'] is False, "one instance -> SP3 Friedman skipped: " + st['SP3']['friedman']['ET']['reason'])
    check(st['composite']['available'] is False and '2 instances' in st['composite']['reason'], "one instance -> composite skipped")
    check(st['outcome']['pattern'] in 'ABCD', f"outcome pattern {st['outcome']['pattern']}: {st['outcome']['description']}")
    check(not no_nan(st), "no NaN / inf in the output")
    check(len(sp1['pairs']) == 6, "six pairwise comparisons")
    for p in sp1['pairs']:
        check(p['p'] is not None and p['effect']['value'] is not None, f"pair {p['a']}-{p['b']} reports p and effect")

    # ── 2. identical groups -> not significant ────────────────────────────────
    print("2. identical groups")
    vals = rng.normal(50, 2, size=len(seeds))
    st = analyse(make_study(lambda c, i, s: {'su': float(vals[s - 1]), 'csr': float(vals[s - 1]),
                                             'et': 1000 + float(vals[s - 1])}, [350], seeds))
    sp1 = st['SP1']['comparison']
    check(sp1['omnibus']['testable'] and not sp1['omnibus']['significant'], f"SP1 not significant (p={sp1['omnibus']['p']})")
    check(all(p['outperforms'] is None and p['verdict'] == 'no significant difference' for p in sp1['pairs']), "no pair outperforms")
    check(not st['SP2']['h0_rejected'], f"SP2: {st['SP2']['decision']}")
    check(st['outcome']['pattern'] == 'C', f"outcome C (neither hybrid outperforms): {st['outcome']['pattern']}")

    # ── 3. constant across all configurations -> not testable ────────────────
    print("3. constant everywhere")
    st = analyse(make_study(lambda c, i, s: {'su': 50.0, 'csr': 100.0, 'et': 1000.0, 'pm': 100.0}, [350], seeds))
    check(st['SP1']['comparison']['omnibus']['testable'] is False, "SU constant -> " + st['SP1']['comparison']['omnibus']['reason'])
    check(not st['SP2']['h0_rejected'] and 'not testable' in st['SP2']['decision'], "SP2: " + st['SP2']['decision'])
    check(st['SP3']['per_metric']['ET']['omnibus']['testable'] is False, "ET constant -> not testable")
    check(not no_nan(st), "no NaN with everything constant")

    # ── 4. compliance over all boxes = rate x placed / n ─────────────────────
    print("4. two compliance definitions")
    st = analyse(make_study(lambda c, i, s: {'su': 50 + rng.normal(), 'csr': 100.0, 'placed': 80 if c == 'REP' else 100, 'n': 100},
                            [350], seeds))
    d = st['descriptives']['CSR']
    check(d['placed']['REP']['mean'] == 100.0 and abs(d['all_boxes']['REP']['mean'] - 80.0) < 1e-9,
          f"REP CSR placed=100, all_boxes={d['all_boxes']['REP']['mean']}")
    check(st['primary_compliance'] == PRIMARY_COMPLIANCE == 'all_boxes', "primary definition is all boxes")
    check(st['SP2']['by_definition']['placed']['per_measure']['CSR']['omnibus']['testable'] is False, "over placed boxes: constant -> not testable")
    check(st['SP2']['by_definition']['all_boxes']['per_measure']['CSR']['omnibus']['testable'] is True, "over all boxes: testable")

    # ── 5. composite: hand-computed two-instance toy ─────────────────────────
    print("5. composite hand-computed")
    toy_su = {'DGWO': [60, 62], 'MOGWO': [50, 50], 'SEQ': [55, 57], 'REP': [40, 44]}
    toy_csr = {'DGWO': 40, 'MOGWO': 60, 'SEQ': 70, 'REP': 100}
    toy_et = {'DGWO': 10, 'MOGWO': 20, 'SEQ': 30, 'REP': 40}
    st = analyse(make_study(lambda c, i, s: {'su': toy_su[c][s - 1], 'csr': toy_csr[c], 'et': toy_et[c], 'pm': 5.0},
                            [1, 2], [1, 2]))
    # SU~ = [1, 8/19, 14/19, 0]; CSR~ = [0, 1/3, 1/2, 1]; 1-CC~ = [1, 2/3, 1/3, 0]; 1-Rob~ = [1/2, 1, 1/2, 0]
    expected = {'DGWO': 0.25 * (1 + 0 + 1 + 0.5), 'MOGWO': 0.25 * (8 / 19 + 1 / 3 + 2 / 3 + 1),
                'SEQ': 0.25 * (14 / 19 + 0.5 + 1 / 3 + 0.5), 'REP': 0.25 * (0 + 1 + 0 + 0)}
    cs = st['composite']
    check(cs['available'], "composite available with 2 instances, serial")
    for c, e in expected.items():
        got = cs['per_instance'][0]['per_configuration'][c]['CS']
        check(abs(got - e) < 1e-5, f"CS({c}, instance 1) = {got} (hand: {e:.5f})")
    check(abs(cs['mean_cs']['DGWO'] - expected['DGWO']) < 1e-5, "mean CS over identical instances equals the per-instance value")
    check(cs['ranking'][0] == 'DGWO' and cs['ranking'][-1] == 'REP', f"ranking {cs['ranking']}")
    fr = cs['friedman']
    check(fr['testable'] and abs(fr['statistic'] - 6.0) < 1e-6 and not fr['significant'],
          f"Friedman chi2={fr['statistic']} (hand: 6.0, 2 identical blocks) p={fr['p']} -> not significant")
    check(cs['recommendation'] is None and cs['recommendation_note'], "no recommendation when Friedman is not significant")
    check(st['SP3']['friedman']['ET']['testable'], "SP3 Friedman runs with >= 2 instances")
    # eight identical blocks -> chi2 = 24 -> significant -> recommendation = best mean CS
    st8 = analyse(make_study(lambda c, i, s: {'su': toy_su[c][s - 1], 'csr': toy_csr[c], 'et': toy_et[c], 'pm': 5.0},
                             list(range(1, 9)), [1, 2]))
    fr8 = st8['composite']['friedman']
    check(fr8['significant'] and abs(fr8['statistic'] - 24.0) < 1e-6, f"8 blocks: chi2={fr8['statistic']} p={fr8['p']} significant")
    check(st8['composite']['recommendation'] and st8['composite']['recommendation']['configuration'] == 'DGWO',
          f"recommendation: {st8['composite']['recommendation']}")
    check('posthoc' in fr8 and fr8['posthoc']['test'] == 'Nemenyi', "Nemenyi post-hoc after a significant Friedman")

    # ── 6. concurrent timing refuses SP3 and the composite ───────────────────
    print("6. concurrent timing")
    st = analyse(make_study(lambda c, i, s: {'su': toy_su[c][s - 1], 'csr': toy_csr[c], 'et': toy_et[c]},
                            [1, 2], [1, 2], mode='parallel'))
    check(st['SP3']['available'] is False and 'concurrent' in st['SP3']['reason'], "SP3 refused: " + st['SP3']['reason'])
    check(st['composite']['available'] is False and 'concurrent' in st['composite']['reason'], "composite refused: " + st['composite']['reason'])
    check(st['SP1']['comparison']['omnibus']['testable'], "SP1 still runs on concurrent data")

    # ── 7. Holm-Bonferroni on a known vector ─────────────────────────────────
    print("7. Holm")
    adj, m = holm([0.01, 0.04, 0.03, None, 0.20])
    check(m == 4, "None excluded from the family")
    check([round(x, 4) if x is not None else None for x in adj] == [0.04, 0.09, 0.09, None, 0.2], f"adjusted = {adj}")

    # ── 8. outcome patterns ──────────────────────────────────────────────────
    print("8. outcome patterns")
    st = analyse(make_study(lambda c, i, s: {'su': {'DGWO': 40, 'MOGWO': 42, 'SEQ': 60, 'REP': 62}[c] + rng.normal(0, 1),
                                             'csr': {'DGWO': 40, 'MOGWO': 42, 'SEQ': 80, 'REP': 82}[c] + rng.normal(0, 1)}, [350], seeds))
    check(st['outcome']['pattern'] == 'A', f"both hybrids beat both baselines -> A (got {st['outcome']['pattern']})")
    st = analyse(make_study(lambda c, i, s: {'su': {'DGWO': 40, 'MOGWO': 42, 'SEQ': 60, 'REP': 41}[c] + rng.normal(0, 1),
                                             'csr': {'DGWO': 40, 'MOGWO': 42, 'SEQ': 80, 'REP': 41}[c] + rng.normal(0, 1)}, [350], seeds))
    check(st['outcome']['pattern'] == 'B', f"one hybrid beats both baselines -> B (got {st['outcome']['pattern']})")
    st = analyse(make_study(lambda c, i, s: {'su': {'DGWO': 60, 'MOGWO': 42, 'SEQ': 41, 'REP': 40}[c] + rng.normal(0, 1),
                                             'csr': {'DGWO': 40, 'MOGWO': 42, 'SEQ': 80, 'REP': 82}[c] + rng.normal(0, 1)}, [350], seeds))
    check(st['outcome']['pattern'] == 'D', f"hybrids win CSR, lose SU -> D (got {st['outcome']['pattern']})")

    print()
    if FAILS:
        print(f"FAIL ({len(FAILS)}):")
        for f in FAILS:
            print("  -", f)
        return 1
    print("PASS - tools/test_stats.py")
    return 0


if __name__ == '__main__':
    sys.exit(main())
