"""Step 2 acceptance: same seed -> identical, different seed -> different."""
import sys, json, hashlib
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT))
sys.path.insert(0, str(_ROOT / 'optimizer'))

from thesis_algorithms import StandaloneDGWO

def run(items, container, seed):
    opt = StandaloneDGWO(items, container, pop_size=10, max_iter=20, seed=seed)
    best = opt.run()
    return hashlib.sha256(json.dumps({
        'placed': len(best.placements),
        'su': round(best.su, 9),
        'csr': round(best.csr, 9),
        'placements': sorted((k, [round(v, 6) for v in vals])
                             for k, vals in best.placements.items()),
    }, sort_keys=True, default=str).encode()).hexdigest()

def main(items, container):
    a1, a2 = run(items, container, 42), run(items, container, 42)
    b      = run(items, container, 1337)
    print(f"seed 42  run 1: {a1[:16]}")
    print(f"seed 42  run 2: {a2[:16]}")
    print(f"seed 1337:      {b[:16]}")
    assert a1 == a2, "FAIL: same seed produced different output"
    assert a1 != b,  "FAIL: different seeds produced identical output (seed is inert)"
    print("PASS - runs are reproducible and seed-controlled")

if __name__ == '__main__':
    import argparse
    from preprocessing.pipeline import load_augmented_instance

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('instance_id', nargs='?', type=int, default=350,
                        help='wtpack instance id (default 350: first BR1 instance in the seed-42 sample)')
    parser.add_argument('--raw-dir', default=str(_ROOT / 'data' / 'raw'),
                        help='Directory holding wtpack*.txt')
    args = parser.parse_args()

    inst = load_augmented_instance({'data': {'raw_dir': args.raw_dir}},
                                   instance_id=args.instance_id)
    main(inst['boxes'], inst['container'])