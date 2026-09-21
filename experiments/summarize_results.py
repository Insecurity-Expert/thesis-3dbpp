"""Rebuild experiments/results/summary_i350.json and print the markdown tables
used in docs/MOCK_DEFENSE_RESULTS.md from the result JSONs.

    python experiments/summarize_results.py            # print tables, write summary
    python experiments/summarize_results.py --old DIR  # also diff against an older results dir
"""
import argparse, json, statistics as st, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
R = ROOT / 'experiments' / 'results'
KEYS = ['su_pct', 'csr_pct', 'C3_weight_pct', 'C4_fragility_pct', 'C5_balance_pct', 'C6_stop_order_pct', 'placed', 'exec_time_ms']
CFGS = ['DGWO', 'MOGWO', 'SEQ', 'REP']


def load(p):
    return json.loads(Path(p).read_text(encoding='utf-8'))


def agg(vals):
    # population sd over seeds, as in the earlier tables
    return {'mean': st.mean(vals), 'sd': st.pstdev(vals) if len(vals) > 1 else 0.0, 'values': vals}


def by_cfg(files):
    out = {}
    for cfg in CFGS:
        rows = []
        for f in files:
            d = load(f)
            rows += [r for r in d['results'] if r['strategy'] == cfg]
        if rows:
            out[cfg] = {k: agg([r[k] for r in rows]) for k in KEYS}
            out[cfg]['seeds'] = [r['seed'] for r in rows]
    return out


def fmt(a, d=2):
    return f"{a['mean']:.{d}f} ± {a['sd']:.{d}f}" if len(a['values']) > 1 else f"{a['mean']:.{d}f}"


def build(results_dir):
    slide = by_cfg([results_dir / f'slide_i350_s{s}.json' for s in range(1, 6)])
    quick = by_cfg([results_dir / 'quick_i350_s42.json'])
    camp = by_cfg([results_dir / f'campaign_dgwo_i350_s{s}.json' for s in range(1, 6)])
    base = load(results_dir / 'baselines_i350.json')['results']
    return {'slide_pop10_iter300_seeds1to5': slide, 'quick_pop10_iter60_seed42': quick,
            'campaign_dgwo_pop30_iter300_seeds1to5': camp, 'baselines': {
                'weight_descending': {k: base['weight_descending'][k] for k in KEYS[:-1] + ['wall_ms']},
                'volume_descending': {k: base['volume_descending'][k] for k in KEYS[:-1] + ['wall_ms']},
                'random': base['random']['aggregate']}}


def slide_table(S, title, wall_note='wall s'):
    lines = [f"| row | SU % | CSR % | C3 | C4 | C5 | C6 | placed /129 | {wall_note} |", "|---|---|---|---|---|---|---|---|---|"]
    for cfg in CFGS:
        if cfg not in S: continue
        a = S[cfg]
        lines.append(f"| **{cfg}** | {fmt(a['su_pct'])} | {fmt(a['csr_pct'])} | {fmt(a['C3_weight_pct'])} | {fmt(a['C4_fragility_pct'])} | {fmt(a['C5_balance_pct'])} | {fmt(a['C6_stop_order_pct'])} | {fmt(a['placed'], 1)} | {a['exec_time_ms']['mean']/1000:.0f} ± {a['exec_time_ms']['sd']/1000:.0f} |")
    return "\n".join(lines)


def baseline_rows(B):
    w, v, r = B['weight_descending'], B['volume_descending'], B['random']
    row = lambda name, b, wall: f"| {name} | {b['su_pct']:.2f} | {b['csr_pct']:.2f} | {b['C3_weight_pct']:.2f} | {b['C4_fragility_pct']:.2f} | {b['C5_balance_pct']:.2f} | {b['C6_stop_order_pct']:.2f} | {b['placed']} | {wall} |"
    lines = [row('weight-descending', w, f"{w['wall_ms']/1000:.2f}"), row('volume-descending', v, f"{v['wall_ms']/1000:.2f}")]
    lines.append(f"| random (30 orders) | {r['su_pct']['mean']:.2f} ± {r['su_pct']['sd']:.2f} | {r['csr_pct']['mean']:.2f} ± {r['csr_pct']['sd']:.2f} | {r['C3_weight_pct']['mean']:.2f} | {r['C4_fragility_pct']['mean']:.2f} | {r['C5_balance_pct']['mean']:.2f} | {r['C6_stop_order_pct']['mean']:.2f} | {r['placed']['mean']:.1f} ± {r['placed']['sd']:.1f} | {r['wall_ms']['mean']/1000:.2f} |")
    return "\n".join(lines)


def verdict_table(S, B):
    w = B['weight_descending']
    lines = ["| configuration | SU | margin | CSR | margin |", "|---|---|---|---|---|"]
    for cfg in CFGS:
        a = S[cfg]; dsu = a['su_pct']['mean'] - w['su_pct']; dc = a['csr_pct']['mean'] - w['csr_pct']
        lines.append(f"| {cfg} | {'beats' if dsu > 0 else 'loses'} | {dsu:+.2f} pp | {'beats' if dc > 0 else 'loses'} | {dc:+.2f} pp |")
    return "\n".join(lines)


def diff(new, old, thresh=1.0):
    """Every mean that moved by more than `thresh` pp (or boxes / seconds)."""
    out = []
    for sec in ['slide_pop10_iter300_seeds1to5', 'quick_pop10_iter60_seed42', 'campaign_dgwo_pop30_iter300_seeds1to5']:
        for cfg in CFGS:
            if cfg not in new.get(sec, {}) or cfg not in old.get(sec, {}): continue
            for k in KEYS[:-1]:
                a, b = new[sec][cfg][k]['mean'], old[sec][cfg][k]['mean']
                if abs(a - b) > thresh: out.append((sec, cfg, k, b, a, a - b))
    for name in ['weight_descending', 'volume_descending']:
        for k in KEYS[:-2]:
            a, b = new['baselines'][name][k], old['baselines'][name][k]
            if abs(a - b) > thresh: out.append(('baselines', name, k, b, a, a - b))
    for k in KEYS[:-2]:
        a, b = new['baselines']['random'][k]['mean'], old['baselines']['random'][k]['mean']
        if abs(a - b) > thresh: out.append(('baselines', 'random', k, b, a, a - b))
    return out


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--old', help='older results directory to diff against')
    ap.add_argument('--no-write', action='store_true')
    a = ap.parse_args()
    summary = build(R)
    if not a.no_write:
        (R / 'summary_i350.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
    S, Q, C, B = summary['slide_pop10_iter300_seeds1to5'], summary['quick_pop10_iter60_seed42'], summary['campaign_dgwo_pop30_iter300_seeds1to5'], summary['baselines']
    print("## slide (pop 10 x 300, seeds 1-5)\n" + slide_table(S, 'slide') + "\n" + baseline_rows(B))
    print("\n## verdict vs weight-descending (SU %.2f / CSR %.2f)\n" % (B['weight_descending']['su_pct'], B['weight_descending']['csr_pct']) + verdict_table(S, B))
    print("\n## quick (pop 10 x 60, seed 42)\n" + slide_table(Q, 'quick'))
    print("\n## campaign DGWO (pop 30 x 300, seeds 1-5)\n" + slide_table(C, 'campaign'))
    if a.old:
        old = build(Path(a.old))
        print("\n## moved by > 1 pp vs", a.old)
        for sec, cfg, k, b, n, d in diff(summary, old):
            print(f"  {sec:40s} {cfg:18s} {k:18s} {b:8.2f} -> {n:8.2f}  ({d:+.2f})")
