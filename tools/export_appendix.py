"""
Export Appendix 1 data sheet.
Outputs a CSV containing the main study rows, GREEDY rows, and Random Order aggregate rows.
"""
import sys
import json
import csv
from pathlib import Path

def main():
    if len(sys.argv) < 3:
        print("Usage: python tools/export_appendix.py <study.json> <output.csv>")
        sys.exit(1)
        
    study = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
    runs = study.get('runs', [])
    
    # Also load greedy and random
    for base_file in ['experiments/results/greedy_baseline.json', 'experiments/results/random_baseline.json']:
        p = Path(base_file)
        if p.exists():
            data = json.loads(p.read_text(encoding='utf-8'))
            for inst in data.get('instances', []):
                for res in inst.get('results', []):
                    # add instance_id and n_items to res to match study format
                    res['instance_id'] = inst.get('instance')
                    res['n_items'] = inst.get('n_items')
                    if 'configuration' not in res and 'strategy' in res:
                        res['configuration'] = res['strategy']
                    runs.append(res)
    
    out_file = sys.argv[2]
    with open(out_file, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow([
            'Configuration', 'InstanceID', 'Seed', 'SU_pct', 'CSR_pct',
            'Placed', 'N_items', 'ET_ms', 'PM_MB', 'C3_pct', 'C4_pct', 'C5_pct', 'C6_pct'
        ])
        
        for r in runs:
            writer.writerow([
                r['configuration'],
                r.get('instance_id', ''),
                r.get('seed', ''),
                f"{r.get('su_pct', 0):.2f}",
                f"{r.get('csr_pct', 0):.2f}",
                r.get('placed', 0),
                r.get('n_items', 0),
                f"{r.get('exec_time_ms', 0):.1f}",
                f"{r.get('peak_mem_mb', 0):.2f}",
                f"{r.get('C3_pct', 0):.2f}",
                f"{r.get('C4_pct', 0):.2f}",
                f"{r.get('C5_pct', 0):.2f}",
                f"{r.get('C6_pct', 0):.2f}"
            ])
            
    print(f"Exported Appendix 1 data sheet to {out_file} ({len(runs)} rows).")

if __name__ == '__main__':
    main()
