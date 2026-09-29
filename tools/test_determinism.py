"""
Determinism verifier. Runs a given configuration twice on the same instance + seed.
Asserts that the SHA-256 hash of (placements, SU, CSR) is identical, 
verifying that the outcome is perfectly deterministic, even if ET (execution time) 
and PM (peak memory) vary.
"""
import sys
import json
import hashlib
import argparse
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT))

from experiments.runner import run_one
from preprocessing.pipeline import load_augmented_instance

def run_and_hash(args):
    inst = load_augmented_instance(
        {'data': {'raw_dir': str(_ROOT / 'data' / 'raw')}},
        instance_id=args.instance,
        stop_seed=args.stop_seed,
        stop_count=args.stop_count,
    )
    
    lambdas = {'w': 0.2, 'f': 0.2, 'b': 0.2, 'a': 0.2}
    res = run_one(args.strategy, inst['boxes'], inst['container'], args.seed,
                  args.pop_size, args.max_iter, lambdas,
                  enforce_support=True, enforce_fragility=True)
                  
    # Extract deterministic fields only
    det_data = {
        'placements': res['placements'],
        'orientations': res['orientations'],
        'su_pct': res['su_pct'],
        'csr_pct': res['csr_pct'],
        'C3_weight_pct': res['C3_weight_pct'],
        'C4_fragility_pct': res['C4_fragility_pct'],
        'C5_balance_pct': res['C5_balance_pct'],
        'C6_stop_order_pct': res['C6_stop_order_pct'],
    }
    
    # Excluded: exec_time_ms, cpu_time_ms, peak_mem_mb, repair_stats
    h = hashlib.sha256(json.dumps(det_data, sort_keys=True).encode('utf-8')).hexdigest()
    return h, det_data, res['exec_time_ms'], res['peak_mem_mb']

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--instance', type=int, default=1)
    p.add_argument('--strategy', default='SEQ')
    p.add_argument('--seed', type=int, default=42)
    p.add_argument('--stop-seed', type=int, default=42)
    p.add_argument('--stop-count', type=int, default=3)
    p.add_argument('--pop-size', type=int, default=10)
    p.add_argument('--max-iter', type=int, default=20)
    args = p.parse_args()

    print(f"Running {args.strategy} on instance {args.instance}, seed {args.seed}...")
    hash1, data1, et1, pm1 = run_and_hash(args)
    print(f"Run 1: Hash = {hash1}, ET = {et1} ms, PM = {pm1} MB")

    print(f"Running again to verify determinism...")
    hash2, data2, et2, pm2 = run_and_hash(args)
    print(f"Run 2: Hash = {hash2}, ET = {et2} ms, PM = {pm2} MB")

    if hash1 == hash2:
        print("SUCCESS: Both runs produced identical arrangements, SU, and CSR.")
        if et1 != et2 or pm1 != pm2:
            print(f"As expected, non-deterministic metrics varied (ET: {et1} vs {et2}, PM: {pm1} vs {pm2}).")
        sys.exit(0)
    else:
        print("ERROR: Runs produced different deterministic outputs!")
        sys.exit(1)

if __name__ == '__main__':
    main()