"""Quick-preset pilot of all four configurations at the rep-chapter3 working tree,
through experiments/study.py's own run_task (the same run row the study writes)."""
import sys, json
ROOT = str(__import__('pathlib').Path(__file__).resolve().parent.parent)
sys.path[:0] = [ROOT, ROOT + '/optimizer', ROOT + '/experiments', ROOT + '/tools']
import study

if __name__ == '__main__':
    out = open(sys.argv[1] if len(sys.argv) > 1 else 'pilot_chapter3_baseline.jsonl', 'w')
    for iid in (581, 413, 147, 392, 454):
        for seed in (3, 42):
            for cfg in ('DGWO', 'MOGWO', 'SEQ', 'REP'):
                task = {'configuration': cfg, 'instance_id': iid, 'seed': seed,
                        'pop_size': 10, 'max_iter': 60,
                        'lambdas': {'w': 0.2, 'f': 0.2, 'b': 0.2, 'a': 0.2},
                        'enforce_support': True, 'enforce_fragility': True,
                        'raw_dir': ROOT + '/data/raw', 'edge_fill': True, 'fragile_lift': True}
                r = study.run_task(task)
                for k in ('placements', 'orientations'):
                    r.pop(k, None)
                out.write(json.dumps(r) + '\n'); out.flush()
                print(cfg, iid, seed, r['placed'], r['su_pct'], r['csr_pct'], r['exec_time_ms'], flush=True)
