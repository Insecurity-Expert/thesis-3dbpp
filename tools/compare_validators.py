"""Run the independent validator on every arrangement in a results file and
report per-constraint agreement with the optimizer's own evaluate_constraints.

Handles both experiments/baselines.py output and experiments/runner.py output
(single-instance or --sample form). The instance is reloaded through the
preprocessing pipeline with the SAME stop seed the run used, because stop
assignment depends on it.

    python tools/compare_validators.py experiments/results/baselines_i350.json
    python tools/compare_validators.py experiments/results/slide_i350_s1.json
"""
import sys
import json
import argparse
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT))
sys.path.insert(0, str(_ROOT / 'optimizer'))
sys.path.insert(0, str(_ROOT / 'tools'))

from preprocessing.pipeline import load_augmented_instance
from thesis_metrics import evaluate_constraints          # the evaluator under test
from validate_arrangement import validate                # the independent checker

KEYS = [('C3', 'C3_weight_pct'), ('C4', 'C4_fragility_pct'), ('C5', 'C5_balance_pct'),
        ('C6', 'C6_stop_order_pct'), ('all', 'total_compliant_pct')]


def arrangements_from(doc):
    """Yield (label, instance_id, stop_seed, placements, orientations)."""
    if 'results' in doc and isinstance(doc['results'], dict) and 'weight_descending' in doc['results']:
        inst, ss = doc['instance'], doc.get('stop_seed', 42)
        r = doc['results']
        yield 'weight-descending', inst, ss, r['weight_descending']['placements'], r['weight_descending']['orientations']
        yield 'volume-descending', inst, ss, r['volume_descending']['placements'], r['volume_descending']['orientations']
        for run in r['random']['runs']:
            yield f"random#{run['order_index']}", inst, ss, run['placements'], run['orientations']
        return
    blobs = doc['instances'] if 'instances' in doc else [doc]
    for b in blobs:
        for res in b['results']:
            if 'placements' not in res:
                continue
            yield f"{res['strategy']} seed={res['seed']}", b['instance'], b['seed'], res['placements'], res['orientations']


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('files', nargs='+')
    p.add_argument('--raw-dir', default=str(_ROOT / 'data' / 'raw'))
    p.add_argument('--tol', type=float, default=1e-6, help='percentage-point tolerance for agreement')
    a = p.parse_args()

    cache = {}
    n_arr = n_agree = 0
    disagreements = []
    print("%-24s %5s | %6s %6s %6s %6s %6s | %s" % ("arrangement", "n", "C3", "C4", "C5", "C6", "all", "independent C1/C2/orient + verdict"))
    for f in a.files:
        doc = json.load(open(f, encoding='utf-8'))
        for label, inst_id, stop_seed, pl, ors in arrangements_from(doc):
            key = (inst_id, stop_seed)
            if key not in cache:
                cache[key] = load_augmented_instance({'data': {'raw_dir': a.raw_dir}}, instance_id=inst_id, stop_seed=stop_seed)
            inst = cache[key]
            placements = {int(k): tuple(v) for k, v in pl.items()}
            orientations = {int(k): int(v) for k, v in ors.items()}
            ev = evaluate_constraints(placements, inst['boxes'], orientations)[1]
            iv = validate(inst['container'], inst['boxes'], placements, orientations)
            diffs = {k: (iv['pct'][k], ev[ek]) for k, ek in KEYS if abs(iv['pct'][k] - ev[ek]) > a.tol}
            geom_ok = iv['pct']['C1'] == 100.0 and iv['pct']['C2'] == 100.0 and iv['pct']['orient'] == 100.0
            n_arr += 1
            agree = not diffs and geom_ok
            n_agree += agree
            cells = " ".join("%6.2f" % iv['pct'][k] for k, _ in KEYS)
            verdict = ("AGREE" if not diffs else "DISAGREE " + json.dumps({k: [round(x, 3) for x in v] for k, v in diffs.items()}))
            geom = f"C1={iv['pct']['C1']:.0f} C2={iv['pct']['C2']:.0f} orient={iv['pct']['orient']:.0f}"
            print("%-24s %5d | %s | %s  %s" % (label, iv['n_placed'], cells, geom, verdict))
            if not agree:
                disagreements.append((f, label, diffs, iv['issues'][:12], geom))
    print(f"\n{n_agree}/{n_arr} arrangements: independent validator agrees with evaluate_constraints on C3-C6 and total, and C1/C2/orientation hold")
    for f, label, diffs, issues, geom in disagreements:
        print(f"\nDISAGREEMENT in {f} :: {label}  ({geom})")
        for k, (iv_v, ev_v) in diffs.items():
            print(f"   {k}: validator {iv_v:.4f}%  evaluator {ev_v:.4f}%")
        for line in issues:
            print("   -", line)
    sys.exit(0 if n_agree == n_arr else 2)


if __name__ == '__main__':
    main()
