"""
Export Appendix 1 data sheet.
Outputs a CSV containing the main study rows plus, when the study file has
them (experiments/baselines.py), one Weight-Sorted Greedy row and the Random
Order draws per instance. Timing_valid is "no" for every GWO row of a parallel
study: those runs shared the CPU, so their ET and PM are not comparable. The
baselines always ran serially.
"""
import sys
import json
import csv
from pathlib import Path


def layout_cells(r, n, num):
    placed = r.get('placed') or 0
    lay = r.get('layout') or {}
    g, ld = lay.get('gap') or {}, lay.get('load_distribution') or {}
    return [n - placed if n else '', num((n - placed) / n * 100.0 if n else None, '.2f'),
            num(g.get('mean_gap_cm'), '.2f'), num(g.get('max_gap_cm'), '.2f'), g.get('significant_gaps', ''),
            num(ld.get('lr_mass_imbalance_pct'), '.2f'),
            ld.get('left_count', ''), ld.get('right_count', ''),
            num(ld.get('left_mass'), '.2f'), num(ld.get('right_mass'), '.2f'),
            ld.get('lower_count', ''), ld.get('middle_count', ''), ld.get('upper_count', ''),
            num(ld.get('lower_mass'), '.2f'), num(ld.get('middle_mass'), '.2f'), num(ld.get('upper_mass'), '.2f')]


def main():
    if len(sys.argv) < 3:
        print("Usage: python tools/export_appendix.py <study.json> <output.csv>")
        sys.exit(1)

    study = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
    timing_valid = study.get('timing_valid', study.get('mode') == 'serial')
    rows = []
    for r in study.get('runs', []):
        rows.append(dict(r, _timing_valid=timing_valid))

    base = study.get('baselines') or {}
    for inst in base.get('per_instance', []):
        g = inst['weight_sorted']
        rows.append({'configuration': 'GREEDY', 'instance_id': inst['instance_id'], 'seed': '',
                     'su_pct': g['su_pct'], 'csr_pct': g['csr_pct'], 'placed': g['placed'],
                     'n_items': g['n_items'], 'exec_time_ms': g['exec_time_ms'], 'peak_mem_mb': None,
                     'C3_pct': g['C3_weight_pct'], 'C4_pct': g['C4_fragility_pct'],
                     'C5_pct': g['C5_balance_pct'], 'C6_pct': g['C6_stop_order_pct'],
                     '_timing_valid': base.get('timing_valid', True)})
        for d in inst['random_order']:
            rows.append({'configuration': 'RANDOM', 'instance_id': inst['instance_id'], 'seed': d['draw'],
                         'su_pct': d['su_pct'], 'csr_pct': d['csr_pct'], 'placed': d['placed'],
                         'n_items': d['n_items'], 'exec_time_ms': d['exec_time_ms'], 'peak_mem_mb': None,
                         'C3_pct': d['C3_weight_pct'], 'C4_pct': d['C4_fragility_pct'],
                         'C5_pct': d['C5_balance_pct'], 'C6_pct': d['C6_stop_order_pct'],
                         '_timing_valid': base.get('timing_valid', True)})

    def num(v, fmt):
        return '' if v is None else format(v, fmt)

    out_file = sys.argv[2]
    with open(out_file, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow([
            'Configuration', 'InstanceID', 'Seed', 'SU_pct', 'CSR_pct', 'CSR_all_pct',
            'Placed', 'N_items', 'ET_ms', 'PM_MB', 'Timing_valid', 'C3_pct', 'C4_pct', 'C5_pct', 'C6_pct',
            # Scope: boxes left unloaded; M-6 gap; M-7 load distribution (blank when the run has none)
            'Unloaded', 'Unloaded_pct', 'Mean_gap_cm', 'Max_gap_cm', 'Significant_gaps',
            'LR_mass_imbalance_pct', 'Left_count', 'Right_count', 'Left_mass', 'Right_mass',
            'Lower_count', 'Middle_count', 'Upper_count', 'Lower_mass', 'Middle_mass', 'Upper_mass'
        ])
        for r in rows:
            n = r.get('n_items') or 0
            writer.writerow([
                r['configuration'],
                r.get('instance_id', ''),
                r.get('seed', ''),
                num(r.get('su_pct'), '.2f'),
                num(r.get('csr_pct'), '.2f'),
                num(r['csr_pct'] * r['placed'] / n if n else None, '.2f'),
                r.get('placed', 0),
                n,
                num(r.get('exec_time_ms'), '.1f'),
                num(r.get('peak_mem_mb'), '.2f'),
                'yes' if r['_timing_valid'] else 'no (parallel runs)',
                num(r.get('C3_pct'), '.2f'),
                num(r.get('C4_pct'), '.2f'),
                num(r.get('C5_pct'), '.2f'),
                num(r.get('C6_pct'), '.2f'),
                *layout_cells(r, n, num),
            ])

    print(f"Exported Appendix 1 data sheet to {out_file} ({len(rows)} rows).")


if __name__ == '__main__':
    main()
