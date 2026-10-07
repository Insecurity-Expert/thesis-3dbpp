"""Acceptance checks for experiments/stats.py (the Chapter 3 statistical treatment,
repeated-measures design: instances are the subjects).

    python tools/test_stats.py

Clearly different configurations -> significant, with the parametric route
(RM-ANOVA, paired t, d_z) when the within-instance differences are normal and
the rank-based route (Friedman, Wilcoxon, r = (W+ - W-) / (W+ + W-)) when they
are not; identical configurations -> not significant; a measure constant
across configurations -> "not testable"; one instance -> nothing testable and
no outcome pattern; RM-ANOVA, Mauchly and Greenhouse-Geisser against
hand-checked values; SP3 Friedman within each BR class with Holm across ET and
PM; the composite score against a hand-computed toy; concurrent timing refuses
SP3; the UI's fields (descriptives, omnibus on both definitions, SP3
profiles) are present; no NaN anywhere.
"""
import sys
import math
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT / 'experiments'))

import numpy as np
from scipy import stats as sps
from stats import (analyse, holm, rm_anova, mauchly, gg_epsilon, rank_biserial_paired, d_z,
                   apply_verdicts, PRIMARY_COMPLIANCE, CONFIGS, SP2_FAMILY)

FAILS = []


def check(cond, msg):
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond:
        FAILS.append(msg)


def make_study(per_run, instances, seeds, mode='serial', classes=None):
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
    cls = classes or (lambda i: f'BR{(i % 7) + 1}')
    return {'stackr_study': 1, 'mode': mode, 'timing_valid': mode == 'serial', 'seeds': list(seeds),
            'preset': {'name': 'quick', 'pop_size': 10, 'max_iter': 60},
            'seq_budget_split': {'dgwo_iters': 30, 'mogwo_iters': 30},
            'enforce_support': True, 'enforce_fragility': True, 'commit': 'test',
            'instances': [{'instance_id': i, 'br_class': cls(i), 'n_types': 3, 'n_boxes': 100} for i in instances],
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
    instances = list(range(1, 13))           # 12 subjects
    seeds = [1, 2, 3]

    # ── 1. clearly different, normal differences -> RM-ANOVA route ───────────
    print("1. clearly different configurations, normal differences")
    inst_eff = {i: rng.normal(0, 5) for i in instances}
    base = {'DGWO': 60, 'MOGWO': 50, 'SEQ': 55, 'REP': 40}
    noise = {(c, i, s): rng.normal(0, 1.0) for c in CONFIGS for i in instances for s in seeds}
    st = analyse(make_study(lambda c, i, s: {'su': base[c] + inst_eff[i] + noise[(c, i, s)],
                                             'csr': {'DGWO': 40, 'MOGWO': 60, 'SEQ': 70, 'REP': 90}[c] + inst_eff[i] + noise[(c, i, s)],
                                             'et': {'DGWO': 1000, 'MOGWO': 2000, 'SEQ': 1500, 'REP': 4000}[c] + 50 * noise[(c, i, s)]},
                            instances, seeds))
    sp1 = st['SP1']['comparison']
    o = sp1['omnibus']
    check(o['testable'] and o['significant'], f"SP1 omnibus significant ({o.get('test')} p={o.get('p')})")
    check(sp1['all_normal'] and o['test'] == 'repeated-measures ANOVA', f"normal differences -> RM-ANOVA (got {o.get('test')})")
    check(sp1['normality']['basis'].startswith('within-instance differences') and len(sp1['normality']['pairs']) == 6,
          "Shapiro-Wilk on the six pairwise within-instance differences")
    check('sphericity' in o and o['sphericity']['test'] == 'Mauchly' and o['epsilon_gg'] is not None,
          f"Mauchly reported (W={o['sphericity']['W']}, p={o['sphericity']['p']}), GG epsilon {o['epsilon_gg']}")
    check(sp1['posthoc_test'].startswith('paired t-test') and sp1['effect_size'] == 'd_z', "post-hoc paired t with d_z")
    pair = next(p for p in sp1['pairs'] if {p['a'], p['b']} == {'DGWO', 'REP'})
    check(pair['outperforms'] == 'DGWO', f"DGWO outperforms REP on SU: {pair['verdict']}")
    check(pair['effect']['value'] is not None and abs(pair['effect']['value']) >= 0.5, "d_z above the practical threshold")
    check(st['SP2']['h0_rejected'], f"SP2 H0 rejected: {st['SP2']['decision']}")
    c4 = st['SP2']['primary']['per_measure']['C4']
    check(c4.get('descriptive_only') and c4['omnibus']['testable'] is False
          and c4['omnibus']['reason'] == 'decoder-enforced; all-box value = share placed',
          f"C4 descriptive, not tested -> {c4['omnibus']['reason']}")
    hf = st['hypothesis_family']
    tested = [t['measure'] for t in hf['tests'] if t['testable']]
    check(tested == ['SU', 'CSR', 'ET'] and hf['holm_family_size'] == 3 and st['SP2']['primary']['holm_family_size'] == 3,
          f"untestable members (C3, C6, PM constant) excluded from the six-test Holm family (tested {tested})")
    check(not no_nan(st), "no NaN / inf in the output")
    for p in sp1['pairs']:
        check(p['p'] is not None and p['p_raw'] is not None and p['effect']['value'] is not None,
              f"pair {p['a']}-{p['b']} reports raw and Holm p and an effect")

    # ── 2. non-normal differences -> Friedman route ──────────────────────────
    print("2. non-normal differences")
    skew = {(c, i): (rng.exponential(8) if c == 'SEQ' else rng.normal(0, 0.3)) for c in CONFIGS for i in instances}
    skew[('SEQ', 1)] = 60.0           # one extreme instance makes the SEQ differences clearly non-normal
    st = analyse(make_study(lambda c, i, s: {'su': base[c] + inst_eff[i] + skew[(c, i)]}, instances, seeds))
    sp1 = st['SP1']['comparison']
    check(not sp1['all_normal'] and sp1['omnibus']['test'] == 'Friedman', f"non-normal -> Friedman (got {sp1['omnibus']['test']})")
    check(sp1['omnibus']['effect_size'] == "Kendall's W", "Friedman reports Kendall's W")
    check(sp1['posthoc_test'].startswith('Wilcoxon') and sp1['effect_size'] == 'matched-pairs rank-biserial r',
          "post-hoc Wilcoxon with the matched-pairs rank-biserial r")
    pr = next(p for p in sp1['pairs'] if {p['a'], p['b']} == {'DGWO', 'REP'})
    check(abs(pr['effect']['value']) == 1.0, f"DGWO above REP on every instance -> |r| = 1 (got {pr['effect']['value']})")

    # ── 3. identical configurations -> not significant ───────────────────────
    print("3. identical configurations")
    vals = {(i, s): rng.normal(50, 2) for i in instances for s in seeds}
    tiny = {(c, i): rng.normal(0, 0.01) for c in CONFIGS for i in instances}
    st = analyse(make_study(lambda c, i, s: {'su': vals[(i, s)] + tiny[(c, i)], 'csr': vals[(i, s)] + tiny[(c, i)]},
                            instances, seeds))
    sp1 = st['SP1']['comparison']
    check(sp1['omnibus']['testable'] and not sp1['omnibus']['significant'], f"SP1 not significant (p={sp1['omnibus']['p']})")
    check(all(p['outperforms'] is None for p in sp1['pairs']), "no pair outperforms")
    check(not st['SP2']['h0_rejected'], f"SP2: {st['SP2']['decision']}")
    check(st['outcome']['pattern'] == 'C', f"outcome C (neither hybrid outperforms): {st['outcome']['pattern']}")

    # ── 4. constant across configurations -> not testable ───────────────────
    print("4. constant everywhere")
    st = analyse(make_study(lambda c, i, s: {'su': 50.0, 'csr': 100.0, 'et': 1000.0, 'pm': 100.0}, instances, seeds))
    check(st['SP1']['comparison']['omnibus']['testable'] is False, "SU constant -> " + st['SP1']['comparison']['omnibus']['reason'])
    check(not st['SP2']['h0_rejected'] and 'not testable' in st['SP2']['decision'], "SP2: " + st['SP2']['decision'])
    check(st['outcome']['pattern'] is None and 'not determinable' in st['outcome']['description'],
          "outcome not determinable when SU cannot be tested")
    check(not no_nan(st), "no NaN with everything constant")

    # ── 5. one instance -> descriptive only ──────────────────────────────────
    print("5. one instance")
    st = analyse(make_study(lambda c, i, s: {'su': base[c] + rng.normal(0, 1), 'csr': 50 + rng.normal(0, 1)},
                            [350], list(range(1, 21))))
    o = st['SP1']['comparison']['omnibus']
    check(o['testable'] is False and '2 instances' in o['reason'], "SP1: " + o['reason'])
    check(not st['SP2']['h0_rejected'] and '2 instances' in st['SP2']['decision'], "SP2: " + st['SP2']['decision'])
    check(st['outcome']['pattern'] is None, "no outcome pattern from one instance: " + st['outcome']['description'])
    check(st['composite']['available'] is False and '2 instances' in st['composite']['reason'], "composite skipped")
    check(st['descriptives']['SU']['DGWO']['n'] == 20 and abs(st['descriptives']['SU']['DGWO']['mean'] - 60) < 1.5,
          "descriptives still reported over the 20 runs")
    check(st['robustness']['DGWO']['sd_su'] is not None, "robustness (run-to-run sd) still reported")

    # ── 6. the formulas ──────────────────────────────────────────────────────
    print("6. formulas")
    # RM-ANOVA on a hand-checkable matrix (3 subjects x 3 conditions):
    #   grand mean 5; SS_total = 28; SS_cond = 3 * ((3-5)^2 + 0 + (7-5)^2) = 24;
    #   subject means 13/3, 5, 17/3 -> SS_subj = 3 * (4/9 + 0 + 4/9) = 8/3;
    #   SS_err = 28 - 24 - 8/3 = 4/3, df = (2, 4) -> F = (24/2) / ((4/3)/4) = 36
    mat = np.array([[2.0, 4.0, 7.0], [3.0, 5.0, 7.0], [4.0, 6.0, 7.0]])
    r = rm_anova(mat)
    check(abs(r['statistic'] - 36.0) < 1e-6 and r['df_uncorrected'] == [2, 4], f"F = {r['statistic']} (hand: 36), df = {r['df_uncorrected']}")
    check(abs(r['effect_value'] - 24.0 / (24.0 + 4.0 / 3.0)) < 1e-5, f"partial eta squared = {r['effect_value']} (hand: 24 / (24 + 4/3))")
    check(mauchly(mat)['computable'] is True, "Mauchly computable with N = k")
    check(mauchly(mat[:2])['computable'] is False and r['correction'] in (None, 'Greenhouse-Geisser'),
          "Mauchly not computable with N < k")
    # spherical data (compound symmetry, equal variances of differences) -> epsilon 1
    sph = np.array([[0, 1, 2], [1, 2, 0], [2, 0, 1], [0, 2, 1], [1, 0, 2], [2, 1, 0]], dtype=float)
    check(abs(gg_epsilon(sph) - 1.0) < 1e-9, f"GG epsilon = 1 under sphericity (got {gg_epsilon(sph)})")
    check(1 / 2 - 1e-9 <= gg_epsilon(mat) <= 1 + 1e-9, "GG epsilon within [1/(k-1), 1]")
    # r = (W+ - W-) / (W+ + W-): diffs 1, 2, -3, 4 -> ranks 1, 2, 3, 4 -> W+ = 7, W- = 3 -> r = 0.4
    check(abs(rank_biserial_paired(np.array([1.0, 2.0, -3.0, 4.0])) - 0.4) < 1e-12, "rank-biserial r = 0.4 (hand)")
    check(rank_biserial_paired(np.array([0.0, 2.0, 5.0])) == 1.0, "zero differences dropped; all positive -> r = 1")
    check(abs(d_z(np.array([1.0, 2.0, 3.0])) - 2.0) < 1e-12, "d_z = mean / sd = 2 / 1 = 2")

    # ── 7. SP3: Friedman within each BR class, Holm across ET and PM ─────────
    print("7. SP3 per class")
    cls = lambda i: 'BR1' if i <= 4 else ('BR2' if i <= 8 else 'BR3')
    et_base = {'DGWO': 1000, 'MOGWO': 2000, 'SEQ': 1500, 'REP': 4000}
    st = analyse(make_study(lambda c, i, s: {'su': base[c] + rng.normal(), 'et': et_base[c] * (1 + i / 10) + rng.normal(0, 10),
                                             'pm': 100 + rng.normal(0, 1)},
                            list(range(1, 13)) + [20], seeds, classes=lambda i: 'BR4' if i == 20 else cls(i)))
    s3 = st['SP3']
    check(s3['available'] and len(s3['profiles']) == 4, "one SP3 profile per BR class")
    br1 = next(p for p in s3['profiles'] if p['br_class'] == 'BR1')
    check(br1['friedman']['ET']['omnibus']['test'] == 'Friedman' and br1['friedman']['ET']['omnibus']['significant'],
          f"BR1 ET: Friedman significant (p={br1['friedman']['ET']['omnibus']['p']})")
    check(br1['friedman']['ET']['omnibus']['holm_family_size'] == 2 and br1['friedman']['ET']['omnibus']['p_holm'] is not None,
          "Holm across ET and PM within the class")
    check(br1['friedman']['ET']['mean_rank']['DGWO'] == 1.0 and br1['friedman']['ET']['mean_rank']['REP'] == 4.0,
          "mean rank: DGWO fastest (1), REP slowest (4)")
    check(br1['per_configuration']['REP']['ET']['mean'] > br1['per_configuration']['DGWO']['ET']['mean'],
          "per-class descriptives for the profile chart")
    sp3_pairs = [(p, m, pr) for p in s3['profiles'] for m in ('ET', 'PM') for pr in p['friedman'][m].get('pairs', [])]
    check(sp3_pairs and all(pr['omnibus_gate'] == 'Holm-corrected omnibus test' for _, _, pr in sp3_pairs),
          "SP3 pairs record the Holm gate")
    check(all(not pr['significant'] or p['friedman'][m]['omnibus']['significant_holm'] for p, m, pr in sp3_pairs),
          "every significant SP3 pair has a significant Holm-corrected per-class result")
    br4 = next(p for p in s3['profiles'] if p['br_class'] == 'BR4')
    check(br4['testable'] is False and '2 instances' in br4['friedman']['ET']['omnibus']['reason'],
          "a class with one instance is not testable")
    check(s3['n_classes_testable'] == 3 and s3['note'], f"note: {s3['note']}")

    # ── 8. two compliance definitions ───────────────────────────────────────
    print("8. two compliance definitions")
    st = analyse(make_study(lambda c, i, s: {'su': 50 + rng.normal(), 'csr': 100.0,
                                             'placed': (80 if c == 'REP' else 100) + (i % 3), 'n': 103},
                            instances, seeds))
    d = st['descriptives']['CSR']
    check(d['placed']['REP']['mean'] == 100.0 and d['all_boxes']['REP']['mean'] < 100.0,
          f"REP CSR placed=100, all_boxes={d['all_boxes']['REP']['mean']}")
    check(st['primary_compliance'] == PRIMARY_COMPLIANCE == 'all_boxes', "primary definition is all boxes")
    placed = st['SP2']['by_definition']['placed']['per_measure']['CSR']
    check(placed['descriptive_only'] and placed['omnibus']['testable'] is False and 'descriptive' in placed['omnibus']['reason'],
          "over placed boxes: descriptive only, with an omnibus stub the UI can read")
    check(st['SP2']['by_definition']['all_boxes']['per_measure']['CSR']['omnibus']['testable'] is True, "over all boxes: tested")

    # ── 9. composite: hand-computed two-instance toy ─────────────────────────
    print("9. composite hand-computed")
    toy_su = {'DGWO': [60, 62], 'MOGWO': [50, 50], 'SEQ': [55, 57], 'REP': [40, 44]}
    toy_csr = {'DGWO': 40, 'MOGWO': 60, 'SEQ': 70, 'REP': 100}
    toy_et = {'DGWO': 10, 'MOGWO': 20, 'SEQ': 30, 'REP': 40}
    st = analyse(make_study(lambda c, i, s: {'su': toy_su[c][s - 1], 'csr': toy_csr[c], 'et': toy_et[c], 'pm': 5.0},
                            [1, 2], [1, 2]))
    expected = {'DGWO': 0.25 * (1 + 0 + 1 + 0.5), 'MOGWO': 0.25 * (8 / 19 + 1 / 3 + 2 / 3 + 1),
                'SEQ': 0.25 * (14 / 19 + 0.5 + 1 / 3 + 0.5), 'REP': 0.25 * (0 + 1 + 0 + 0)}
    cs = st['composite']
    check(cs['available'], "composite available with 2 instances, serial")
    for c, e in expected.items():
        got = cs['per_instance'][0]['per_configuration'][c]['CS']
        check(abs(got - e) < 1e-5, f"CS({c}, instance 1) = {got} (hand: {e:.5f})")
    fr = cs['friedman']
    check(fr['testable'] and abs(fr['statistic'] - 6.0) < 1e-6 and not fr['significant'],
          f"Friedman chi2={fr['statistic']} (hand: 6.0, 2 identical blocks) -> not significant")
    check(cs['recommendation'] is None and cs['recommendation_note'].startswith('no configuration distinguished'),
          "no configuration distinguished when Friedman is not significant")
    check(cs['title'] == 'Supplementary composite ranking (Chapter 3)' and cs['distinguished'] is False, "composite labelled supplementary")
    st8 = analyse(make_study(lambda c, i, s: {'su': toy_su[c][s - 1], 'csr': toy_csr[c], 'et': toy_et[c], 'pm': 5.0},
                             list(range(1, 9)), [1, 2]))
    fr8 = st8['composite']['friedman']
    check(fr8['significant'] and abs(fr8['statistic'] - 24.0) < 1e-6, f"8 blocks: chi2={fr8['statistic']} significant")
    check(st8['composite']['recommendation']['configuration'] == 'DGWO' and st8['composite']['distinguished'],
          "top of the ranking = best mean CS, reported when Friedman is significant")
    check(fr8['posthoc']['test'] == 'Nemenyi', "Nemenyi post-hoc after a significant Friedman")

    # ── 10. concurrent timing refuses SP3 and the composite ──────────────────
    print("10. concurrent timing")
    st = analyse(make_study(lambda c, i, s: {'su': toy_su[c][s - 1] + i, 'csr': toy_csr[c], 'et': toy_et[c]},
                            [1, 2, 3], [1, 2], mode='parallel'))
    check(st['SP3']['available'] is False and 'concurrent' in st['SP3']['reason'], "SP3 refused: " + st['SP3']['reason'])
    check(st['composite']['available'] is False and 'concurrent' in st['composite']['reason'], "composite refused")
    check(st['SP1']['comparison']['omnibus']['testable'], "SP1 still runs on concurrent data")
    check(st['timing']['valid'] is False and 'INVALID' in st['timing']['label']
          and set(st['timing']['affects']) >= {'descriptives.ET', 'descriptives.PM', 'composite', 'SP3'},
          "concurrent timing flagged invalid for ET, PM, SP3 and the composite")
    st_s = analyse(make_study(lambda c, i, s: {'su': toy_su[c][s - 1] + i, 'csr': toy_csr[c], 'et': toy_et[c]},
                              [1, 2, 3], [1, 2]))
    check(st_s['timing']['valid'] is True and st_s['timing']['label'] is None, "serial timing flagged valid")

    # ── 11. Holm-Bonferroni on a known vector ────────────────────────────────
    print("11. Holm")
    adj, m = holm([0.01, 0.04, 0.03, None, 0.20])
    check(m == 4, "None excluded from the family")
    check([round(x, 4) if x is not None else None for x in adj] == [0.04, 0.09, 0.09, None, 0.2], f"adjusted = {adj}")

    # ── 12a. SP2 in the six-test family, C4 / C5 descriptive, Holm-gated verdicts
    print("12a. SP2 family and Holm gating")
    st = analyse(make_study(lambda c, i, s: {'su': 50 + inst_eff[i] + rng.normal(0, 1),
                                             'csr': {'DGWO': 40, 'MOGWO': 50, 'SEQ': 60, 'REP': 90}[c] + inst_eff[i] + rng.normal(0, 1),
                                             'c3': {'DGWO': 70, 'MOGWO': 75, 'SEQ': 80, 'REP': 95}[c] + rng.normal(0, 1),
                                             'c6': {'DGWO': 50, 'MOGWO': 55, 'SEQ': 52, 'REP': 98}[c] + rng.normal(0, 1),
                                             'placed': {'DGWO': 90, 'MOGWO': 88, 'SEQ': 91, 'REP': 40}[c] + (i % 3), 'n': 100},
                            instances, seeds))
    prim = st['SP2']['primary']
    check(tuple(st['SP2']['holm_family']) == SP2_FAMILY == ('CSR', 'C3', 'C6'), f"SP2 measures in the family = {st['SP2']['holm_family']}")
    check(prim['holm_family_size'] == 4 and st['hypothesis_family']['holm_family_size'] == 4,
          f"one Holm family: SU, CSR, C3, C6 vary, ET and PM constant -> size 4 (got {prim['holm_family_size']})")
    for m in ('C4', 'C5'):
        pm = prim['per_measure'][m]
        check(pm['descriptive_only'] and pm['equals_share_placed'] and 'holm_family_size' not in pm['omnibus'],
              f"{m}: descriptive, equal to the share placed, outside the family")
        check(set(prim['significant_measures']) <= set(SP2_FAMILY), "only family members can reject H0")
    gated = all(not pr['significant'] or prim['per_measure'][m]['omnibus']['significant_holm']
                for m in SP2_FAMILY for pr in prim['per_measure'][m]['pairs'])
    check(gated, "every significant SP2 pair has a significant Holm-corrected omnibus test")
    check(all(pr['omnibus_gate'] == 'Holm-corrected omnibus test' for m in SP2_FAMILY for pr in prim['per_measure'][m]['pairs']),
          "SP2 pairs record the Holm gate")
    # apply_verdicts on a fabricated comparison: post-hoc significant and
    # practical, but the gating omnibus result is not significant.
    fake = {'measure': 'CSR', 'pairs': [{'a': 'DGWO', 'b': 'REP', 'posthoc_significant': True, 'favours': 'REP', 'higher': 'REP',
                                         'effect': {'name': 'd_z', 'value': -1.2, 'magnitude': 'large', 'practical': True}}]}
    apply_verdicts(fake, False, 'Holm-corrected omnibus test')
    fp = fake['pairs'][0]
    check(fp['significant'] is False and fp['outperforms'] is None and 'Holm-corrected omnibus test not significant' in fp['verdict'],
          f"gate not passed -> no verdict ({fp['verdict']})")
    apply_verdicts(fake, True, 'Holm-corrected omnibus test')
    check(fp['outperforms'] == 'REP' and fp['verdict'] == 'Repair-based significantly higher than DGWO on constraint satisfaction rate (|d_z| = 1.20, large)',
          f"gate passed -> neutral verdict text ({fp['verdict']})")
    check(all('outperforms' not in pr['verdict'] for pr in st['SP1']['comparison']['pairs']), "no 'outperforms' in verdict text")

    # ── 12. outcome patterns ─────────────────────────────────────────────────
    print("12. outcome patterns")
    def pattern(su, csr):
        e = {(c, i, s): rng.normal(0, 1) for c in CONFIGS for i in instances for s in seeds}
        return analyse(make_study(lambda c, i, s: {'su': su[c] + inst_eff[i] + e[(c, i, s)],
                                                   'csr': csr[c] + inst_eff[i] + e[(c, i, s)]}, instances, seeds))['outcome']['pattern']
    got = pattern({'DGWO': 40, 'MOGWO': 42, 'SEQ': 60, 'REP': 62}, {'DGWO': 40, 'MOGWO': 42, 'SEQ': 80, 'REP': 82})
    check(got == 'A', f"both hybrids beat both baselines -> A (got {got})")
    got = pattern({'DGWO': 40, 'MOGWO': 42, 'SEQ': 60, 'REP': 41}, {'DGWO': 40, 'MOGWO': 42, 'SEQ': 80, 'REP': 41})
    check(got == 'B', f"one hybrid beats both baselines -> B (got {got})")
    got = pattern({'DGWO': 60, 'MOGWO': 42, 'SEQ': 41, 'REP': 40}, {'DGWO': 40, 'MOGWO': 42, 'SEQ': 80, 'REP': 82})
    check(got == 'D', f"hybrids win CSR, lose SU -> D (got {got})")

    # ── 13. supplementary: one-tailed vs the Weight-Sorted Greedy, Random Order ──
    print("13. supplementary vs greedy (one-tailed) and Random Order")
    insts13 = [1, 2, 3, 4, 5, 6]
    # all-box CSR = csr x placed / n; placed = n here, so all-box = csr
    lift = {'DGWO': [5.0, 6.0, 4.0, 7.0, 5.5, 6.5], 'MOGWO': [1.0, -2.0, 0.5, -1.0, 0.0, -0.5],
            'SEQ': [0.2, 0.1, -0.1, 0.3, 0.0, 0.1], 'REP': [-3.0, -4.0, -2.0, -5.0, -3.5, -4.5]}
    greedy13 = {i: 30.0 + i for i in insts13}
    study13 = make_study(lambda c, i, s: {'su': 50.0, 'csr': greedy13[i] + lift[c][i - 1]}, insts13, [1, 2])
    study13['baselines'] = {'n_random': 3, 'timing_valid': True, 'timing_note': 'serial', 'per_instance': [
        {'instance_id': i,
         'weight_sorted': {'csr_all_pct': greedy13[i], 'su_pct': 60.0, 'exec_time_ms': 2.0, 'placed': 90},
         'random_order': [{'csr_all_pct': 20.0 + k, 'su_pct': 40.0 + k, 'exec_time_ms': 3.0, 'placed': 80}
                          for k in range(3)]} for i in insts13]}
    sp = analyse(study13)['supplementary']
    vg = sp['vs_greedy']['per_configuration']
    check(sp['available'] and sp['separate_from'] == 'SP1-SP3', "supplementary block present, separate from SP1-SP3")
    diff = np.array(lift['DGWO'])
    t = sps.ttest_1samp(diff, 0.0, alternative='greater')
    check(vg['DGWO']['test'].startswith('paired t-test') and math.isclose(vg['DGWO']['p_raw'], t.pvalue, rel_tol=1e-5)
          and vg['DGWO']['p_raw'] < 1e-3, f"DGWO one-tailed paired t p={vg['DGWO']['p_raw']} matches scipy")
    check(math.isclose(vg['DGWO']['effect']['value'], d_z(diff), rel_tol=1e-5) and vg['DGWO']['significant'],
          "DGWO d_z and significant after Holm")
    check(not vg['REP']['significant'] and vg['REP']['p_raw'] > 0.9,
          f"one-tailed: REP below the greedy is not significant (p={vg['REP']['p_raw']})")
    check(not vg['MOGWO']['significant'] and not vg['SEQ']['significant'], "no lift -> not significant")
    adj, fam = holm([vg[c]['p_raw'] for c in CONFIGS])
    check(sp['vs_greedy']['holm_family_size'] == 4 and all(math.isclose(vg[c]['p'], a, rel_tol=1e-5) for c, a in zip(CONFIGS, adj)),
          "Holm across the four configurations only")
    check(sp['vs_greedy']['definition'] == PRIMARY_COMPLIANCE and sp['vs_greedy']['measure'] == 'CSR',
          "tested on CSR over all boxes")
    ro = sp['random_order']
    check(ro['descriptive_only'] and abs(ro['measures']['CSR_all_boxes']['mean'] - 21.0) < 1e-9
          and abs(ro['measures']['SU']['mean'] - 41.0) < 1e-9 and ro['measures']['ET']['n'] == 18,
          "Random Order: descriptives only, pooled over draws x instances")
    st13 = analyse(make_study(lambda c, i, s: {'su': 50.0}, insts13, [1, 2]))
    check(st13['supplementary']['available'] is False, "no baselines in the file -> supplementary unavailable")
    check(not no_nan(analyse(study13)), "no NaN anywhere with the supplementary block")

    # ── 14. the six-test hypothesis family (manuscript) ──────────────────────
    print("14. six-test Holm family: SU; CSR, C3, C6; ET, PM (all instances)")
    insts14 = list(range(1, 13))
    st = analyse(make_study(lambda c, i, s: {
        'su': base[c] + inst_eff[i] + rng.normal(0, 1),
        'csr': {'DGWO': 40, 'MOGWO': 50, 'SEQ': 60, 'REP': 90}[c] + rng.normal(0, 1),
        'c3': 80 + rng.normal(0, 1), 'c6': 60 + rng.normal(0, 1),
        'et': {'DGWO': 1000, 'MOGWO': 1100, 'SEQ': 1050, 'REP': 5000}[c] * (1 + i / 20) + rng.normal(0, 5),
        'pm': 150 + rng.normal(0, 0.5)}, insts14, seeds, classes=cls))
    hf = st['hypothesis_family']
    check(hf['members'] == ['SU', 'CSR', 'C3', 'C6', 'ET', 'PM'] and hf['holm_family_size'] == 6,
          f"six members, all testable -> Holm across 6 (got {hf['holm_family_size']})")
    raw = [t['p'] for t in hf['tests']]
    adj, fam = holm(raw)
    check(fam == 6 and all(math.isclose(t['p_holm'], a, rel_tol=1e-5, abs_tol=1e-12) for t, a in zip(hf['tests'], adj)),
          "p_holm = Holm across the six raw omnibus p-values")
    sig = [t['measure'] for t in hf['tests'] if t['significant_holm']]
    check(hf['h0_rejected'] == bool(sig) and set(hf['significant_measures']) == set(sig)
          and {'SU', 'CSR', 'ET'} <= set(sig), f"H0 rejected iff any Holm-corrected test is significant ({sig})")
    s3 = st['SP3']
    check(set(s3['all_instances']) == {'ET', 'PM'} and s3['all_instances']['ET']['n_instances'] == 12,
          "SP3: ET and PM tested across all 12 instances")
    check(s3['profiles_exploratory'] and all(p['exploratory'] for p in s3['profiles']),
          "per-BR-class Friedman tests marked exploratory")
    check(all(p['friedman'][m]['omnibus'].get('holm_family_size', 0) <= 2 for p in s3['profiles'] for m in ('ET', 'PM')),
          "per-class tests are not in the six-test family")
    gated = all(not pr['significant'] or t_cmp['omnibus']['significant_holm']
                for t_cmp in [st['SP1']['comparison'], s3['all_instances']['ET'], s3['all_instances']['PM']]
                + [st['SP2']['primary']['per_measure'][m] for m in SP2_FAMILY] for pr in t_cmp['pairs'])
    check(gated, "every significant pair (all six measures) has a significant Holm-corrected omnibus test")
    check(st['SP3']['h0_rejected'] == any(t['significant_holm'] for t in hf['tests'] if t['sp'] == 'SP3')
          and st['SP1']['decision'].startswith('H0'), "per-SP decisions follow the same family")
    stp = analyse(make_study(lambda c, i, s: {'su': base[c] + inst_eff[i] + rng.normal(0, 1),
                                              'et': 1000 + 100 * CONFIGS.index(c) + rng.normal(0, 5)},
                             insts14, seeds, mode='parallel', classes=cls))
    tp = {t['measure']: t for t in stp['hypothesis_family']['tests']}
    check(not tp['ET']['testable'] and 'concurrent' in tp['ET']['reason'] and stp['hypothesis_family']['holm_family_size'] == 1,
          "parallel study: ET and PM leave the family (concurrent timing); only SU is tested here")
    check(not no_nan(st) and not no_nan(stp), "no NaN in the family output")

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
